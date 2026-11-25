import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  check,
  snapshot,
  view,
  tables,
  insert,
  write,
  settings,
  putSetting,
  type Bindings,
  type Rows,
  type Row,
  type Table,
} from "./db";
import { fields } from "./resources";

const safeImage = /^uploads\/[\w.-]+\.(jpg|jpeg|gif|webp|png)$/i;
const maxBytes = 32 * 1024 * 1024;
const filename = (id: string) => "backup_" + id + ".zip";
export function binary(data: Uint8Array, type: string, name: string) {
  return new Response(new Uint8Array(data).buffer, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": 'attachment; filename="' + name + '"',
      "Cache-Control": "no-store",
    },
  });
}
export async function backup(env: Bindings, rows: Rows) {
  const d = view(rows);
  const data = {
    version: 4,
    exported_at: new Date().toISOString(),
    rooms: d.rooms,
    venue_maps: d.maps,
    categories: d.categories,
    session_groups: d.groups,
    sessions: d.sessions.map(({ room, ...s }) => s),
    assignments: d.assignments,
    settings: rows.app_settings,
    staffs: d.staffs.map((s) => ({
      ...s,
      role: s.role.join(","),
      skills: s.skills.map((v) => v.skill),
      preferred_sessions: s.preferred_sessions.map(({ session, ...p }) => p),
    })),
  };
  const files: Record<string, Uint8Array> = {
    "data.json": strToU8(JSON.stringify(data)),
  };
  const references = new Set(
    [
      ...rows.staffs.map((r) => r.photo),
      ...rows.venue_maps.map((r) => r.image),
      ...rows.sessions.map((r) => r.speaker_photo),
      ...rows.lt_talks.map((r) => r.speaker_photo),
    ].filter(Boolean),
  );
  let size = files["data.json"].length;
  for (const path of references) {
    const key = String(path).replace(/^\//, "");
    check(safeImage.test(key), "不正な画像パス");
    const obj = await env.STORAGE.get(key);
    check(obj, "画像が見つかりません: " + key);
    size += obj.size;
    check(size <= maxBytes, "バックアップ容量が上限を超えています", 413);
    files[key] = new Uint8Array(await obj.arrayBuffer());
  }
  return zipSync(files, { level: 1 });
}
export async function restore(env: Bindings, file: File, revision: number) {
  check(
    file instanceof File && file.size <= maxBytes,
    "ZIP のサイズを確認してください",
    413,
  );
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (e) => {
        if (e.name !== "data.json" && !safeImage.test(e.name)) return false;
        total += e.originalSize;
        check(total <= maxBytes, "展開サイズが大きすぎます", 413);
        return true;
      },
    });
  } catch {
    throw new Error("invalid backup ZIP");
  }
  check(files["data.json"], "data.json が見つかりません");
  const data = JSON.parse(strFromU8(files["data.json"]));
  check(
    Array.isArray(data.rooms) &&
      Array.isArray(data.sessions) &&
      Array.isArray(data.staffs),
    "バックアップ形式が不正です",
  );
  const uploads = new Map(
    Object.keys(files)
      .filter((k) => k !== "data.json")
      .map((k) => [
        "/" + k,
        "/uploads/" + crypto.randomUUID() + "." + k.split(".").pop(),
      ]),
  );
  const db = env.DB;
  const changes = tables
    .filter((t) => t !== "app_settings")
    .reverse()
    .map((t) => db.prepare("DELETE FROM " + t));
  const retained = ["reset_password", "login_password", "setup_completed"];
  changes.push(
    db.prepare(
      "DELETE FROM app_settings WHERE key NOT IN ('reset_password','login_password','setup_completed')",
    ),
  );
  const add = (table: Table, r: Record<string, any>, parent: Row = {}) => {
    const row = fields(table, r);
    if (r.id != null) {
      check(Number.isSafeInteger(r.id) && r.id > 0, "不正な ID");
      row.id = r.id;
    }
    for (const k of ["image", "photo", "speaker_photo"])
      if (row[k]) {
        const key = uploads.get(String(row[k]));
        check(key, "画像がZIPに含まれていません");
        row[k] = key;
      }
    changes.push(insert(db, table, { ...row, ...parent }));
  };
  for (const t of [
    "rooms",
    "categories",
    "venue_maps",
    "session_groups",
  ] as const)
    for (const r of data[t] ?? []) add(t, r);
  for (const s of data.sessions) {
    add("sessions", s);
    for (const t of s.lt_talks ?? []) add("lt_talks", t, { session_id: s.id });
  }
  for (const s of data.staffs) {
    add("staffs", s);
    for (const skill of s.skills ?? [])
      add(
        "staff_skills_v2",
        { skill: skill.skill ?? skill },
        { staff_id: s.id },
      );
    for (const a of s.availabilities ?? [])
      add("staff_availabilities", a, { staff_id: s.id });
    for (const p of s.preferred_sessions ?? [])
      add("staff_preferred_sessions", p, { staff_id: s.id });
  }
  for (const a of data.assignments ?? []) add("assignments", a);
  for (const s of data.settings ?? [])
    if (
      !retained.includes(s.key) &&
      !s.key.startsWith("autobackup_last") &&
      s.key !== "public_api_active_snapshot"
    )
      changes.push(putSetting(db, s.key, String(s.value)));
  for (const [original, key] of uploads)
    await env.STORAGE.put(
      key.slice(1),
      new Uint8Array(files[original.slice(1)]).buffer,
    );
  // Old objects can still be referenced by published snapshots. Only switch rows once all new objects exist.
  await write(db, revision, changes);
  return {
    status: "ok",
    rooms: data.rooms.length,
    sessions: data.sessions.length,
    staffs: data.staffs.length,
    assignments: data.assignments?.length ?? 0,
  };
}
export function backupConfig(config: Record<string, string>) {
  return {
    enabled: config.autobackup_enabled === "1",
    schedule_type: config.autobackup_schedule_type || "interval",
    daily_time: config.autobackup_daily_time || "03:00",
    interval_minutes: Number(config.autobackup_interval_minutes || 720),
    retention_count: Number(config.autobackup_retention_count || 28),
  };
}
export async function createArchive(
  env: Bindings,
  trigger: "auto" | "manual",
  instant = new Date(),
) {
  const { rows } = await snapshot(env.DB),
    cfg = settings(rows.app_settings),
    c = backupConfig(cfg);
  const latest = await env.DB.prepare(
    "SELECT created_at FROM archives WHERE kind='backup' AND trigger='auto' ORDER BY created_at DESC LIMIT 1",
  ).first<string>("created_at");
  let id = crypto.randomUUID() as string;
  if (trigger === "auto") {
    if (!c.enabled) return;
    if (c.schedule_type === "daily") {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: cfg.timezone || "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(instant)
          .map((p) => [p.type, p.value]),
      );
      if (parts.hour + ":" + parts.minute < c.daily_time) return;
      id = "daily-" + parts.year + parts.month + parts.day;
    } else {
      if (
        latest &&
        instant.getTime() - Date.parse(latest) < c.interval_minutes * 60000
      )
        return;
      id =
        "interval-" +
        Math.floor(instant.getTime() / (c.interval_minutes * 60000));
    }
    if (
      await env.DB.prepare("SELECT id FROM archives WHERE id=?")
        .bind(id)
        .first()
    )
      return;
  }
  const bytes = await backup(env, rows),
    key = "backups/" + filename(id),
    created = instant.toISOString();
  await env.STORAGE.put(key, bytes);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO archives(id,kind,created_at,object_key,size_bytes,trigger) VALUES (?,'backup',?,?,?,?)",
  )
    .bind(id, created, key, bytes.length, trigger)
    .run();
  const stale = await env.DB.prepare(
    "SELECT id,object_key FROM archives WHERE kind='backup' ORDER BY created_at DESC LIMIT -1 OFFSET ?",
  )
    .bind(Math.max(1, c.retention_count))
    .all<{ id: string; object_key: string }>();
  for (const item of stale.results) {
    await env.DB.prepare("DELETE FROM archives WHERE id=?").bind(item.id).run();
    await env.STORAGE.delete(item.object_key);
  }
  return {
    id,
    filename: filename(id),
    created_at: created,
    size_bytes: bytes.length,
    trigger,
    status: "ok",
  };
}
