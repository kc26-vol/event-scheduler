import { cookie, digest, type Account } from "./accounts";
import { check, HttpError, putSetting, type Bindings } from "./db";

export interface PreferenceWindow {
  opensAt: string | null;
  closesAt: string | null;
  status: "unconfigured" | "upcoming" | "open" | "closed";
  serverNow: string;
}

export interface ShiftPreferences extends PreferenceWindow {
  sessionIds: number[];
  staffId: number | null;
  version: string;
}

const openKey = "shift_preferences_open_at";
const closeKey = "shift_preferences_close_at";
const windowBounds = `SELECT
  (SELECT value FROM app_settings WHERE key='${openKey}') AS opensAt,
  (SELECT value FROM app_settings WHERE key='${closeKey}') AS closesAt`;
const windowQuery = `SELECT opensAt, closesAt, serverNow, CASE
  WHEN opensAt IS NULL OR closesAt IS NULL THEN 'unconfigured'
  WHEN serverNow < opensAt THEN 'upcoming'
  WHEN serverNow < closesAt THEN 'open'
  ELSE 'closed' END AS status FROM (${windowBounds}),
  (SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS serverNow)`;

export async function getPreferenceWindow(db: D1Database) {
  return (await db.prepare(windowQuery).first<PreferenceWindow>())!;
}

// Failing scheduler_revision's CHECK rolls back the whole D1 batch, including a
// save that started before the deadline. Legacy admin edits may predate a window.
export function preferenceWindowGuard(
  db: D1Database,
  allowUnconfigured = false,
) {
  return db.prepare(`UPDATE scheduler_revision SET version=-1 WHERE id=1
    AND NOT EXISTS (SELECT 1 FROM (${windowQuery})
      WHERE status='open' ${allowUnconfigured ? "OR (opensAt IS NULL AND closesAt IS NULL)" : ""})`);
}

const liveLogin = `FROM login_sessions s JOIN login_accounts a ON a.id=s.account_id
  WHERE s.token_hash=? AND s.purpose='login' AND s.expires_at>unixepoch()
  AND a.active=1 AND a.id=?`;
const choices = `SELECT json_group_array(json_array(id,session_id,priority) ORDER BY id)
  FROM staff_preferred_sessions WHERE staff_id=?`;
const conflict =
  "受付期間または希望が更新されました。再読み込みしてご確認ください。";

function utc(value: unknown) {
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),
    "日時を確認してください",
  );
  const date = new Date(value);
  check(
    Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 19) === value.slice(0, 19),
    "日時を確認してください",
  );
  return date.toISOString();
}

async function jsonObject(req: Request) {
  check(
    req.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "JSON が必要です",
    415,
  );
  const body: unknown = await req.json();
  check(
    typeof body === "object" && body !== null && !Array.isArray(body),
    "入力が正しくありません",
  );
  return body as Record<string, unknown>;
}

export async function preferenceRoute(
  req: Request,
  env: Bindings,
  account: Account,
  area: "shift-preferences" | "preference-window",
) {
  const db = env.DB,
    hash = digest(cookie(req, "es_session"));
  if (area === "preference-window") {
    check(account.role === "admin", "管理者権限が必要です", 403);
    if (req.method === "GET")
      return Response.json(await getPreferenceWindow(db));
    check(req.method === "PUT", "Method not allowed", 405);
    const input = await jsonObject(req);
    const opensAt = utc(input.opensAt),
      closesAt = utc(input.closesAt);
    check(opensAt < closesAt, "締切は開始日時より後に設定してください");
    const { previousOpensAt, previousClosesAt } = input;
    check(
      (previousOpensAt === null || typeof previousOpensAt === "string") &&
        (previousClosesAt === null || typeof previousClosesAt === "string"),
      "編集前の受付期間が必要です。再読み込みしてください。",
    );
    await guardedBatch(db, [
      db
        .prepare(
          `UPDATE scheduler_revision SET version=CASE
        WHEN EXISTS (SELECT 1 ${liveLogin} AND a.role='admin')
        AND EXISTS (SELECT 1 FROM (${windowBounds}) WHERE opensAt IS ? AND closesAt IS ?)
        THEN version+1 ELSE -1 END WHERE id=1`,
        )
        .bind(hash, account.id, previousOpensAt, previousClosesAt),
      putSetting(db, openKey, opensAt),
      putSetting(db, closeKey, closesAt),
    ]);
    return Response.json(await getPreferenceWindow(db));
  }

  check(
    req.method === "GET" || req.method === "PUT",
    "Method not allowed",
    405,
  );
  const { staff_id: staffId } = account;
  const state = await db
    .prepare(
      `SELECT w.*, (${choices}) AS selections FROM (${windowQuery}) w
    WHERE EXISTS (SELECT 1 ${liveLogin} AND a.staff_id IS ?)`,
    )
    .bind(staffId, hash, account.id, staffId)
    .first<PreferenceWindow & { selections: string }>();
  check(state, "アカウントの状態が変わりました。再読み込みしてください", 409);
  const { selections, ...window } = state;
  const version = digest(
    JSON.stringify([
      account.id,
      staffId,
      window.opensAt,
      window.closesAt,
      selections,
    ]),
  );
  if (req.method === "GET") {
    const saved: [number, number, number | null][] = JSON.parse(selections);
    return Response.json({
      ...window,
      staffId,
      version,
      sessionIds: [...new Set(saved.map(([, id]) => id))],
    } satisfies ShiftPreferences);
  }

  check(
    staffId !== null,
    "管理者にスタッフ情報との紐付けを依頼してください",
    403,
  );
  check(window.status === "open", "希望の受付期間外です", 409);
  const input = await jsonObject(req);
  check(
    Object.keys(input).every(
      (key) => key === "version" || key === "sessionIds",
    ),
    "入力項目を確認してください",
  );
  check(
    typeof input.version === "string",
    "再読み込みしてから保存してください",
  );
  check(input.version === version, conflict, 409);
  const ids = input.sessionIds;
  check(
    Array.isArray(ids) &&
      ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
      new Set(ids).size === ids.length,
    "セッションの選択を確認してください",
  );
  const selected = JSON.stringify(ids);
  // Keep an existing selection if a session's staffing requirement changed since it was saved.
  const invalidSelection = `SELECT 1 FROM json_each(?) pick WHERE NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.id=pick.value AND s.required_staff>0
  ) AND NOT EXISTS (SELECT 1 FROM staff_preferred_sessions p WHERE p.staff_id=? AND p.session_id=pick.value)`;
  check(
    !(await db.prepare(invalidSelection).bind(selected, staffId).first()),
    "選択できないセッションがあります",
  );

  // Compare this staff member's previous choices at commit time. Other staff
  // can submit concurrently without invalidating the version from this form.
  await guardedBatch(db, [
    db
      .prepare(
        `UPDATE scheduler_revision SET version=CASE WHEN
      EXISTS (SELECT 1 ${liveLogin} AND a.staff_id=?) AND (${choices})=?
      AND EXISTS (SELECT 1 FROM (${windowBounds}) WHERE opensAt=? AND closesAt=?)
      AND NOT EXISTS (${invalidSelection})
      THEN version+1 ELSE -1 END WHERE id=1`,
      )
      .bind(
        hash,
        account.id,
        staffId,
        staffId,
        selections,
        window.opensAt,
        window.closesAt,
        selected,
        staffId,
      ),
    db
      .prepare(
        `DELETE FROM staff_preferred_sessions WHERE staff_id=?
      AND session_id NOT IN (SELECT value FROM json_each(?))`,
      )
      .bind(staffId, selected),
    db
      .prepare(
        `INSERT INTO staff_preferred_sessions(staff_id,session_id,priority)
      SELECT ?, pick.value, 1 FROM json_each(?) pick WHERE NOT EXISTS (
      SELECT 1 FROM staff_preferred_sessions p WHERE p.staff_id=? AND p.session_id=pick.value)`,
      )
      .bind(staffId, selected, staffId),
    preferenceWindowGuard(db),
  ]);
  return new Response(null, { status: 204 });
}

async function guardedBatch(db: D1Database, statements: D1PreparedStatement[]) {
  try {
    await db.batch(statements);
  } catch (error) {
    if (
      (String(error) + String((error as Error).cause)).includes("version >= 0")
    )
      throw new HttpError(409, conflict);
    throw error;
  }
}
