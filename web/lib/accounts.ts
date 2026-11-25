import { createHash, randomBytes } from "node:crypto";
import { check, HttpError, type Bindings } from "./db";

export type Account = {
  id: number;
  email: string;
  role: "admin" | "staff";
  staff_id: number | null;
};
export const now = () => Math.floor(Date.now() / 1000);
export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function cookie(req: Request, name: string) {
  return (
    (req.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(
  headers: Headers,
  name: string,
  value: string,
  age: number,
  readable = false,
) {
  headers.append(
    "Set-Cookie",
    name +
      "=" +
      value +
      "; Path=/; SameSite=Lax; Secure; Max-Age=" +
      age +
      (readable ? "" : "; HttpOnly"),
  );
}
export function sessionHeaders(raw: string, purpose: "login" | "enroll") {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const life = purpose === "login" ? 7 * 86400 : 1200;
  setCookie(headers, "es_session", raw, life);
  setCookie(
    headers,
    "es_offline",
    purpose === "login" ? digest("offline:" + raw) : "",
    purpose === "login" ? life : 0,
    true,
  );
  return headers;
}
export function emailAddress(input: unknown) {
  check(typeof input === "string", "メールアドレスを入力してください");
  const email = input.trim().toLowerCase();
  check(
    email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email),
    "メールアドレスを確認してください",
  );
  return email;
}
async function session(
  req: Request,
  env: Bindings,
  purpose: "login" | "enroll",
) {
  const raw = cookie(req, "es_session");
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  return env.DB.prepare(
    `SELECT a.id,a.email,a.role,a.staff_id FROM login_sessions s
    JOIN login_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.purpose=?
    AND s.expires_at>? AND a.active=1`,
  )
    .bind(digest(raw), purpose, now())
    .first<Account>();
}
export const staffViewCookie = "es_staff_view";
export const staffViewMarker = (req: Request) =>
  digest("staff-view:" + cookie(req, "es_session"));

export async function currentAccount(req: Request, env: Bindings) {
  const account = await session(req, env, "login");
  if (!account) return null;
  const canSwitchView =
    env.DEVELOPMENT_ROLE_SWITCH === "1" && account.role === "admin";
  const staffView =
    canSwitchView && cookie(req, staffViewCookie) === staffViewMarker(req);
  return {
    ...account,
    role: staffView ? ("staff" as const) : account.role,
    canSwitchView,
  };
}
export const currentEnrollment = (req: Request, env: Bindings) =>
  session(req, env, "enroll");

export class EventInitializationError extends HttpError {
  constructor() {
    super(503, "イベントの準備を完了できませんでした");
  }
}
// The enrollment identity insert and the conversion into a normal login commit together.
// Second submissions cannot claim an already linked account or move an identity to another person.
export async function completeIdentity(
  db: D1Database,
  provider: string,
  subject: string,
  enrollment: string | null,
) {
  const raw = token(),
    stamp = now();
  const writes: D1PreparedStatement[] = [
    db.prepare("DELETE FROM login_sessions WHERE expires_at<=?").bind(stamp),
  ];
  if (enrollment) {
    writes.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO login_identities(provider,subject,account_id)
      SELECT ?,?,a.id FROM login_sessions s JOIN login_accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.purpose='enroll' AND s.expires_at>? AND a.active=1`,
        )
        .bind(provider, subject, enrollment, stamp),
    );
    // Gate the session on the affected insert, including the case in which this provider is owned elsewhere.
    writes.push(
      db
        .prepare(
          `INSERT INTO login_sessions SELECT ?,account_id,'login',?
      FROM login_identities WHERE provider=? AND subject=? AND changes()=1`,
        )
        .bind(digest(raw), stamp + 7 * 86400, provider, subject),
    );
    writes.push(
      db
        .prepare(
          `DELETE FROM login_sessions WHERE purpose='enroll' AND account_id IN
      (SELECT account_id FROM login_sessions WHERE token_hash=?)`,
        )
        .bind(digest(raw)),
    );
    writes.push(
      db
        .prepare(
          `DELETE FROM login_links WHERE account_id IN
      (SELECT account_id FROM login_sessions WHERE token_hash=?)`,
        )
        .bind(digest(raw)),
    );
  } else {
    writes.push(
      db
        .prepare(
          `INSERT INTO login_sessions SELECT ?,a.id,'login',? FROM login_identities i
      JOIN login_accounts a ON a.id=i.account_id WHERE i.provider=? AND i.subject=? AND a.active=1`,
        )
        .bind(digest(raw), stamp + 7 * 86400, provider, subject),
    );
  }
  const res = await db.batch(writes);
  check(
    res[enrollment ? 2 : 1].meta.changes === 1,
    enrollment
      ? "このアカウントは連携できません。登録をやり直してください"
      : "未登録、または利用できないアカウントです",
    enrollment ? 409 : 403,
  );
  try {
    await initializeNewEvent(db, digest(raw));
  } catch {
    throw new EventInitializationError();
  }
  return sessionHeaders(raw, "login");
}

// Seed only a new event on the first administrator login. Keeping the initial database empty
// until then allows a full legacy SQLite import before anyone signs in.
async function initializeNewEvent(db: D1Database, sessionHash: string) {
  const needed = await db
    .prepare(
      `SELECT 1 FROM login_sessions s JOIN login_accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND a.role='admin' AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key='setup_completed')`,
    )
    .bind(sessionHash)
    .first();
  if (!needed) return;
  // The transient marker is visible only inside this transaction; a simultaneous login skips the seed.
  const fresh =
    "EXISTS(SELECT 1 FROM app_settings WHERE key='setup_completed' AND value=?)";
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO app_settings(key,value) SELECT 'setup_completed',? WHERE
      NOT EXISTS(SELECT 1 FROM rooms) AND NOT EXISTS(SELECT 1 FROM sessions) AND NOT EXISTS(SELECT 1 FROM staffs)
      AND NOT EXISTS(SELECT 1 FROM categories) AND NOT EXISTS(SELECT 1 FROM session_groups)
      AND NOT EXISTS(SELECT 1 FROM venue_maps) AND NOT EXISTS(SELECT 1 FROM app_settings)`,
      )
      .bind(sessionHash),
    db
      .prepare(
        `INSERT INTO rooms(name,capacity,floor) SELECT '全体',0,0 WHERE ${fresh}`,
      )
      .bind(sessionHash),
    db
      .prepare(
        `INSERT INTO session_groups(label,"order") SELECT 'セッション',1 WHERE ${fresh}`,
      )
      .bind(sessionHash),
    db
      .prepare(
        `INSERT INTO categories(key,label,color,"order") SELECT 'reception','受付案内','#388e3c',1 WHERE ${fresh}`,
      )
      .bind(sessionHash),
    db
      .prepare(
        `INSERT INTO categories(key,label,color,"order") SELECT 'social','懇親会','#7b1fa2',2 WHERE ${fresh}`,
      )
      .bind(sessionHash),
    db
      .prepare(
        "UPDATE app_settings SET value='1' WHERE key='setup_completed' AND value=?",
      )
      .bind(sessionHash),
  ]);
}
