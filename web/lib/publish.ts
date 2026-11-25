import {
  check,
  settings,
  snapshot,
  putSetting,
  view,
  write,
  type Bindings,
} from "./db";
import { equal } from "./auth";

export async function publishing(
  req: Request,
  env: Bindings,
  path: string[],
  publicRead = false,
) {
  const db = env.DB;
  const current = publicRead ? undefined : await snapshot(db);
  const cfg = settings(
    current?.rows.app_settings ??
      (
        await db
          .prepare(
            "SELECT key,value FROM app_settings WHERE key LIKE 'public_api_%' OR key='app_title'",
          )
          .all<{ key: string; value: string }>()
      ).results,
  );
  const active = cfg.public_api_active_snapshot || "",
    key = cfg.public_api_key || "";
  const base = new URL(req.url),
    origin = req.headers.get("Origin") || "";
  const allowed = (cfg.public_api_cors_origins || "*")
    .split(",")
    .map((s) => s.trim());
  const cors: Record<string, string> = {
    "Cache-Control": "private, no-store",
    Vary: "Origin, X-API-Key",
  };
  if (allowed.includes("*") || allowed.includes(origin))
    cors["Access-Control-Allow-Origin"] = allowed.includes("*") ? "*" : origin;
  const json = (v: unknown) => Response.json(v, { headers: cors });
  if (publicRead) {
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "X-API-Key, Content-Type",
        },
      });
    check(
      req.method === "GET" && cfg.public_api_enabled === "1" && key,
      "Public API disabled",
      404,
    );
    check(
      equal(
        key,
        base.searchParams.get("key") || req.headers.get("X-API-Key") || "",
      ),
      "Invalid API key",
      401,
    );
    const meta = await db
      .prepare(
        "SELECT id,created_at,object_key FROM archives WHERE kind='snapshot' AND id=?",
      )
      .bind(active)
      .first<{ id: string; created_at: string; object_key: string }>();
    if (path.join("/") === "schedule/check")
      return json({
        snapshot_id: meta?.id ?? null,
        published_at: meta?.created_at ?? null,
      });
    check(meta, "No published schedule", 404);
    const object = await env.STORAGE.get(meta.object_key);
    check(object, "Snapshot not found", 404);
    const data = await object.json<{ sessions: Record<string, any>[] }>();
    const photos = new Set<string>();
    for (const s of data.sessions)
      for (const entry of [s, ...s.lt_talks]) {
        const name = entry.speaker_photo?.split("/").pop();
        entry.speaker_photo_url = name
          ? base.origin +
            "/public/api/photo/" +
            encodeURIComponent(name) +
            "?key=" +
            encodeURIComponent(key)
          : "";
        if (name) photos.add(name);
      }
    if (path.join("/") === "schedule") return json(data);
    check(
      path.length === 2 && path[0] === "photo" && photos.has(path[1]),
      "Not found",
      404,
    );
    const photo = await env.STORAGE.get("uploads/" + path[1]);
    check(photo, "Photo not found", 404);
    return new Response(photo.body, {
      headers: {
        ...cors,
        "Content-Type":
          photo.httpMetadata?.contentType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const { rows, version } = current!;
  const route = path.join("/");
  const show = (c: Record<string, string>) => ({
    enabled: c.public_api_enabled === "1",
    key: c.public_api_key || "",
    key_masked: c.public_api_key
      ? c.public_api_key.slice(0, 4) + "…" + c.public_api_key.slice(-4)
      : "",
    cors_origins: c.public_api_cors_origins || "*",
    active_snapshot: c.public_api_active_snapshot || "",
    webhook_url: c.public_api_webhook_url || "",
    github_dispatch_url: c.public_api_github_dispatch_url || "",
    github_token_set: !!c.public_api_github_token,
  });
  if (req.method === "GET" && route === "settings") return json(show(cfg));
  if (req.method === "PUT" && route === "settings") {
    const b = (await req.json()) as Record<string, string>;
    const updates: Record<string, string> = {
      public_api_enabled: b.enabled ? "1" : "0",
      public_api_cors_origins: b.cors_origins || "*",
      public_api_webhook_url: b.webhook_url || "",
      public_api_github_dispatch_url: b.github_dispatch_url || "",
    };
    if (b.github_token) updates.public_api_github_token = b.github_token;
    if (b.enabled && !key)
      updates.public_api_key = crypto.randomUUID().replaceAll("-", "");
    await write(
      db,
      version,
      Object.entries(updates).map(([k, v]) => putSetting(db, k, v)),
    );
    return json(show({ ...cfg, ...updates }));
  }
  if (req.method === "POST" && route === "settings/regenerate-key") {
    const next = crypto.randomUUID().replaceAll("-", "");
    await write(db, version, [putSetting(db, "public_api_key", next)]);
    return json({
      key: next,
      key_masked: next.slice(0, 4) + "…" + next.slice(-4),
    });
  }
  if (req.method === "POST" && route === "settings/clear-github-token") {
    await write(db, version, [putSetting(db, "public_api_github_token", "")]);
    return json({ status: "ok" });
  }
  if (req.method === "GET" && route === "history") {
    const items = await db
      .prepare(
        "SELECT id,created_at AS published_at,session_count FROM archives WHERE kind='snapshot' ORDER BY created_at DESC",
      )
      .all();
    return json(items.results.map((r) => ({ ...r, active: r.id === active })));
  }
  if (req.method === "POST" && route === "publish") {
    const d = view(rows),
      id = crypto.randomUUID(),
      published_at = new Date().toISOString(),
      objectKey = "public_snapshots/" + id + ".json";
    const sessions = d.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      speaker: s.speaker,
      speaker_kana: s.speaker_kana,
      speaker_org: s.speaker_org,
      speaker_title: s.speaker_title,
      speaker_profile: s.speaker_profile,
      speaker_photo: s.speaker_photo,
      start_time: s.start_time,
      end_time: s.end_time,
      room_id: s.room_id,
      room_name: s.room?.name || "",
      category: s.category,
      group_id: s.group_id,
      lt_talks: s.lt_talks,
    }));
    const payload = {
      snapshot_id: id,
      published_at,
      session_count: sessions.length,
    };
    const data = JSON.stringify({
      ...payload,
      event_title: cfg.app_title || "Event Scheduler",
      groups: d.groups,
      rooms: d.rooms.filter((r) => r.name !== "全体"),
      categories: d.categories,
      sessions,
    });
    await env.STORAGE.put(objectKey, data);
    await write(db, version, [
      db
        .prepare(
          "INSERT INTO archives(id,kind,created_at,object_key,size_bytes,session_count) VALUES (?,'snapshot',?,?,?,?)",
        )
        .bind(
          id,
          published_at,
          objectKey,
          new TextEncoder().encode(data).length,
          sessions.length,
        ),
      putSetting(db, "public_api_active_snapshot", id),
    ]);
    const webhook: Record<string, unknown> = {};
    async function notify(
      name: string,
      url: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) {
      try {
        const target = new URL(url);
        check(target.protocol === "https:", "HTTPS is required");
        if (name === "github_dispatch")
          check(
            target.hostname === "api.github.com",
            "Invalid GitHub API host",
          );
        const res = await fetch(target, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "event-scheduler",
            ...headers,
          },
          body: JSON.stringify(body),
        });
        webhook[name] = { success: res.ok, status: res.status };
      } catch {
        webhook[name] = { success: false };
      }
    }
    if (cfg.public_api_webhook_url)
      await notify("webhook", cfg.public_api_webhook_url, {
        event: "schedule_published",
        ...payload,
      });
    if (cfg.public_api_github_dispatch_url && cfg.public_api_github_token)
      await notify(
        "github_dispatch",
        cfg.public_api_github_dispatch_url,
        {
          ref: "main",
          inputs: {
            schedule_url: base.origin + "/public/api/schedule?key=" + key,
          },
        },
        { Authorization: "Bearer " + cfg.public_api_github_token },
      );
    return json({ status: "ok", ...payload, webhook });
  }
  check(
    path.length === 2 &&
      ((path[0] === "history" && req.method === "DELETE") ||
        (path[0] === "activate" && req.method === "POST")),
    "Not found",
    404,
  );
  const row = await db
    .prepare("SELECT object_key FROM archives WHERE id=? AND kind='snapshot'")
    .bind(path[1])
    .first<string>("object_key");
  check(row, "Not found", 404);
  if (path[0] === "activate")
    await write(db, version, [
      putSetting(db, "public_api_active_snapshot", path[1]),
    ]);
  else {
    check(active !== path[1], "公開中です");
    await write(db, version, [
      db.prepare("DELETE FROM archives WHERE id=?").bind(path[1]),
    ]);
    await env.STORAGE.delete(row);
  }
  return json({ status: "ok" });
}
