import {
  createHmac,
  createHash,
  randomBytes,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto";
import { check, putSetting, HttpError, type Bindings } from "./db";

const days = 7 * 24 * 3600;
const cookie = "cs_session";
const digest = (v: string) => createHash("sha256").update(v).digest();
export const equal = (a: string, b: string) =>
  timingSafeEqual(digest(a), digest(b));
export function hash(password: string, salt = randomBytes(16)) {
  return (
    salt.toString("base64") +
    "$" +
    pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("base64")
  );
}
export function verify(password: string, stored: string) {
  if (!stored || !password) return false;
  if (!stored.includes("$")) return equal(password, stored);
  return equal(
    hash(password, Buffer.from(stored.split("$")[0], "base64")),
    stored,
  );
}
function signature(env: Bindings, payload: string) {
  check(env.SESSION_SECRET, "SESSION_SECRET is missing", 503);
  return createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
}
export function signedIn(request: Request, env: Bindings) {
  const raw = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookie + "="))
    ?.slice(cookie.length + 1);
  if (!raw) return false;
  const [expiry, nonce, sig] = raw.split(".");
  return (
    Number(expiry) > Date.now() / 1000 &&
    !!sig &&
    equal(sig, signature(env, expiry + "." + nonce))
  );
}
export async function setting(db: D1Database, key: string) {
  return (
    (await db
      .prepare("SELECT value FROM app_settings WHERE key=?")
      .bind(key)
      .first<string>("value")) ?? ""
  );
}
export async function auth(req: Request, env: Bindings, action: string) {
  const db = env.DB;
  if (action === "logout" && req.method === "GET")
    return new Response(null, {
      status: 302,
      headers: {
        location: "/login.html",
        "Set-Cookie":
          cookie + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
        "Clear-Site-Data": '"cache", "cookies", "storage"',
      },
    });
  check(req.method === "POST", "Method not allowed", 405);
  const body = (await req.json()) as Record<string, string>;
  if (action === "setup") {
    check(!(await setting(db, "setup_completed")), "設定済みです", 403);
    check(
      env.SETUP_TOKEN && equal(String(body.setup_token ?? ""), env.SETUP_TOKEN),
      "セットアップトークンが必要です",
      403,
    );
    check(
      typeof body.login_password === "string" &&
        body.login_password &&
        typeof body.admin_password === "string" &&
        body.admin_password,
      "パスワードを入力してください",
    );
    await db.batch([
      db.prepare("INSERT INTO app_settings VALUES('setup_completed','1')"),
      putSetting(db, "login_password", hash(body.login_password)),
      putSetting(db, "reset_password", hash(body.admin_password)),
      putSetting(db, "app_title", body.app_title || "Event Scheduler"),
      putSetting(db, "timezone", body.timezone || "Asia/Tokyo"),
      db.prepare(
        "INSERT INTO rooms(name,capacity,floor) SELECT '全体',0,0 WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE name='全体')",
      ),
      db.prepare(
        "INSERT OR IGNORE INTO categories(key,label,color,\"order\") VALUES ('reception','受付案内','#388e3c',1),('social','懇親会','#7b1fa2',2)",
      ),
      db.prepare(
        "INSERT INTO session_groups(label,\"order\") SELECT 'セッション',1 WHERE NOT EXISTS (SELECT 1 FROM session_groups)",
      ),
    ]);
    return Response.json({ status: "ok" });
  }
  check(action === "verify", "Not found", 404);
  check(
    (await setting(db, "setup_completed")) === "1",
    "初期設定が必要です",
    403,
  );
  const ip = req.headers.get("cf-connecting-ip") || "local",
    now = Math.floor(Date.now() / 1000);
  const [, attempt, counted] = await db.batch([
    db
      .prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
      .bind(now - 600),
    db
      .prepare("INSERT INTO login_attempts(ip,attempted_at) VALUES (?,?)")
      .bind(ip, now),
    db
      .prepare(
        "SELECT count(*) FILTER(WHERE attempted_at>=?) AS recent, sum(failed) AS failures FROM login_attempts WHERE ip=?",
      )
      .bind(now - 60, ip),
  ]);
  const counts = counted.results[0] as { recent: number; failures: number };
  check(
    Number(counts.recent) <= 5 && Number(counts.failures) <= 10,
    "しばらくしてから再試行してください",
    429,
  );
  const pwd = String(body.password ?? "");
  const ok = env.APP_PASSWORD
    ? equal(pwd, env.APP_PASSWORD)
    : verify(pwd, await setting(db, "login_password"));
  if (!ok) throw new HttpError(401, "パスワードが正しくありません");
  await db
    .prepare("UPDATE login_attempts SET failed=0 WHERE ip=? AND rowid<=?")
    .bind(ip, attempt.meta.last_row_id)
    .run();
  const data = now + days + "." + randomBytes(16).toString("hex");
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Set-Cookie":
          cookie +
          "=" +
          data +
          "." +
          signature(env, data) +
          "; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=" +
          days,
        "Cache-Control": "no-store",
      },
    },
  );
}
