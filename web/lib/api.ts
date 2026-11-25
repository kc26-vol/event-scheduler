import { auth, signedIn, setting, verify, hash, equal } from "./auth";
import {
  check,
  HttpError,
  snapshot,
  write,
  tables,
  settings,
  putSetting,
  view,
  type Bindings,
} from "./db";
import { resources, readonlySettings, bodyOf } from "./resources";
import { publishing } from "./publish";
import {
  backup,
  binary,
  restore,
  createArchive,
  backupConfig,
  nextBackup,
} from "./backup";

export async function handle(req: Request, env: Bindings, path: string[]) {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.get("origin");
      const url = new URL(req.url);
      // NextURL normalizes loopback IPs to localhost. Host retains the incoming authority.
      const host = req.headers.get("host");
      check(
        !origin ||
          origin === url.origin ||
          (host && origin === url.protocol + "//" + host),
        "Origin mismatch",
        403,
      );
    }
    const [prefix, area, ...parts] = path,
      route = parts.join("/");
    if (prefix === "public" && area === "api")
      return await publishing(req, env, parts, true);
    if (env.GEOIP_ENABLED === "1")
      check(req.headers.get("cf-ipcountry") === "JP", "Access restricted", 403);
    if (prefix === "auth" && !parts.length) return await auth(req, env, area);
    if (
      prefix === "api" &&
      area === "health" &&
      !route &&
      req.method === "GET"
    ) {
      await env.DB.prepare(
        "SELECT version FROM scheduler_revision WHERE id=1",
      ).first();
      return Response.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    check(signedIn(req, env), "ログインが必要です", 401);
    if (prefix === "uploads" && !route && req.method === "GET") {
      check(/^[\w.-]+\.(png|gif|jpe?g|webp)$/i.test(area), "Not found", 404);
      const object = await env.STORAGE.get("uploads/" + area);
      check(object, "Not found", 404);
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ||
            "image/" + area.split(".").pop()?.replace("jpg", "jpeg"),
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    check(prefix === "api", "Not found", 404);
    if (area === "workspace" && !route && req.method === "GET")
      return Response.json(view((await snapshot(env.DB)).rows), {
        headers: { "Cache-Control": "private, no-store" },
      });
    if (area === "public-api") return await publishing(req, env, parts);
    const db = env.DB,
      ok = () => Response.json({ status: "ok" });
    if (area === "settings" || area === "export" || area === "backup") {
      const { rows, version } = await snapshot(db),
        config = settings(rows.app_settings);
      if (
        req.method === "POST" &&
        ((area === "settings" && route === "change-password") ||
          (area === "export" && ["reset-password", "reset"].includes(route)))
      ) {
        const b = await bodyOf(req),
          login = area === "settings",
          key = login ? "login_password" : "reset_password",
          bound = login ? env.APP_PASSWORD : env.RESET_PASSWORD;
        const pwd = String(b.current_password ?? b.password ?? "");
        check(
          bound ? equal(pwd, bound) : verify(pwd, config[key] || ""),
          "パスワードが正しくありません",
          403,
        );
        if (route === "reset")
          await write(db, version, [
            ...tables
              .filter((t) => t !== "app_settings")
              .reverse()
              .map((t) => db.prepare("DELETE FROM " + t)),
            db.prepare("DELETE FROM app_settings WHERE key='app_title'"),
          ]);
        else {
          check(!bound, "Worker secret で管理されています");
          check(
            b.new_password && typeof b.new_password === "string",
            "新しいパスワードが必要です",
          );
          await write(db, version, [putSetting(db, key, hash(b.new_password))]);
        }
        return ok();
      }
      if (area === "settings" && !route) {
        if (req.method === "GET")
          return Response.json(
            Object.fromEntries(
              Object.entries(readonlySettings).map(([k, v]) => [
                k,
                config[k] ?? v,
              ]),
            ),
          );
        check(req.method === "PUT", "Method not allowed", 405);
        const b = (await req.json()) as Record<string, string>;
        if (b.timezone) new Intl.DateTimeFormat("ja", { timeZone: b.timezone });
        await write(
          db,
          version,
          Object.keys(readonlySettings)
            .filter((k) => b[k] != null)
            .map((k) => putSetting(db, k, String(b[k]))),
        );
        return ok();
      }
      if (area === "export") {
        if (route === "excel" && req.method === "GET")
          return await (await import("./excel")).excel(env, view(rows));
        if (route === "backup" && req.method === "GET")
          return binary(
            await backup(env, rows),
            "application/zip",
            "backup.zip",
          );
        if (route === "restore" && req.method === "POST")
          return Response.json(
            await restore(
              env,
              (await req.formData()).get("file") as File,
              version,
            ),
          );
      }
      if (area === "backup" && parts[0] === "auto") {
        const c = backupConfig(config);
        if (route === "auto/settings" && req.method === "GET")
          return Response.json(c);
        if (route === "auto/settings" && req.method === "PUT") {
          const b = (await req.json()) as Record<string, string>;
          check(
            ["daily", "interval"].includes(b.schedule_type) &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(b.daily_time),
            "時刻を確認してください",
          );
          const updates = {
            enabled: b.enabled ? "1" : "0",
            schedule_type: b.schedule_type,
            daily_time: b.daily_time,
            retention_count: Math.max(1, Number(b.retention_count) || 28),
            interval_minutes: Math.max(10, Number(b.interval_minutes) || 720),
          };
          await write(
            db,
            version,
            Object.entries(updates).map(([k, v]) =>
              putSetting(db, "autobackup_" + k, String(v)),
            ),
          );
          return ok();
        }
        if (route === "auto/run" && req.method === "POST")
          return Response.json(await createArchive(env, "manual"));
        const history = (
          await db
            .prepare(
              "SELECT id,created_at,size_bytes,trigger,object_key FROM archives WHERE kind='backup' ORDER BY created_at DESC",
            )
            .all<{
              id: string;
              object_key: string;
              created_at: string;
              trigger: string;
            }>()
        ).results;
        if (route === "auto/history" && req.method === "GET")
          return Response.json(
            history.map((h) => ({
              ...h,
              filename: h.object_key.split("/").pop(),
              status: "ok",
            })),
          );
        if (route === "auto/status" && req.method === "GET")
          return Response.json({
            enabled: c.enabled,
            running: c.enabled,
            last_run: history[0]?.created_at ?? null,
            last_status: config.autobackup_error
              ? "error"
              : history.length
                ? "ok"
                : null,
            next_run: nextBackup(
              config,
              history.find((h) => h.trigger === "auto")?.created_at,
            ),
            error: config.autobackup_error || null,
          });
        if (parts[1] === "history") {
          const h = history.find((h) => h.id === parts[2]);
          check(h, "Not found", 404);
          if (parts.length === 3 && req.method === "DELETE") {
            await db
              .prepare("DELETE FROM archives WHERE id=? AND kind='backup'")
              .bind(h.id)
              .run();
            await env.STORAGE.delete(h.object_key);
            return ok();
          }
          if (
            parts.length === 4 &&
            parts[3] === "download" &&
            req.method === "GET"
          ) {
            const object = await env.STORAGE.get(h.object_key);
            check(object, "Not found", 404);
            return new Response(object.body, {
              headers: {
                "Content-Type": "application/zip",
                "Content-Disposition":
                  'attachment; filename="' +
                  h.object_key.split("/").pop() +
                  '"',
              },
            });
          }
        }
      }
      throw new HttpError(404, "Not found");
    }
    return await resources(req, env, [area, ...parts]);
  } catch (e) {
    if (e instanceof HttpError)
      return Response.json({ detail: e.message }, { status: e.status });
    if (
      e instanceof SyntaxError ||
      e instanceof RangeError ||
      (e as Error).message === "invalid backup ZIP"
    )
      return Response.json(
        { detail: "入力形式が正しくありません" },
        { status: 400 },
      );
    console.error(
      "Scheduler request failed",
      req.method,
      new URL(req.url).pathname,
      (e as Error).name,
    );
    return Response.json(
      { detail: "処理を完了できませんでした" },
      { status: 500 },
    );
  }
}
