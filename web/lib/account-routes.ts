import { check, HttpError, type Bindings } from "./db";
import {
  type Account,
  EventInitializationError,
  cookie,
  currentEnrollment,
  digest,
  emailAddress,
  now,
  completeIdentity,
  sessionHeaders,
  setCookie,
  token,
} from "./accounts";
import {
  lineAuthorize,
  LineProviderError,
  type LineCheck,
  oauthError,
  verifyGoogle,
  verifyLine,
} from "./providers";
import type { LineReason } from "./line-feedback";

const json = (value: unknown, status = 200, headers = new Headers()) => {
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { status, headers });
};
function origin(env: Bindings) {
  check(env.APP_ORIGIN, "APP_ORIGIN が未設定です", 503);
  const base = new URL(env.APP_ORIGIN);
  check(
    base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)),
    "公開 URL を確認してください",
    503,
  );
  return base.origin;
}
async function body(req: Request) {
  check(
    req.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "JSON が必要です",
    415,
  );
  const value = await req.json();
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "入力が正しくありません",
  );
  return value as Record<string, unknown>;
}
async function sendInvitation(env: Bindings, email: string) {
  check(
    env.MAILER && env.AUTH_EMAIL_FROM,
    "登録メールが設定されていません",
    503,
  );
  const raw = token(),
    stamp = now(),
    hash = digest(raw),
    base = origin(env);
  const result = await env.DB.prepare(
    `INSERT INTO login_links(token_hash,account_id,sent_at,expires_at)
    SELECT ?,a.id,?,? FROM login_accounts a WHERE a.email=? AND a.active=1
    AND NOT EXISTS(SELECT 1 FROM login_identities i WHERE i.account_id=a.id)
    ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,sent_at=excluded.sent_at,expires_at=excluded.expires_at
    WHERE login_links.sent_at<=?`,
  )
    .bind(hash, stamp, stamp + 1200, email, stamp - 90)
    .run();
  if (!result.meta.changes) return;
  try {
    await env.MAILER.send({
      from: env.AUTH_EMAIL_FROM,
      to: email,
      subject: "イベントスタッフの初回登録",
      text:
        "以下のリンクを20分以内に開き、登録を確認してください。\n\n" +
        base +
        "/register#token=" +
        raw +
        "\n\n心当たりがない場合は、このメールを破棄してください。",
    });
  } catch (error) {
    await env.DB.prepare("DELETE FROM login_links WHERE token_hash=?")
      .bind(hash)
      .run();
    throw error;
  }
}
async function requestLink(
  req: Request,
  env: Bindings,
  email: string,
  ctx?: Pick<ExecutionContext, "waitUntil">,
) {
  const stamp = now(),
    ip =
      "registration:" + digest(req.headers.get("cf-connecting-ip") || "local");
  // Bound both stored rate-limit entries and email sends. Return the same result for all addresses.
  const [, count] = await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at<?").bind(
      stamp - 3600,
    ),
    env.DB.prepare(
      `INSERT INTO login_attempts(ip,attempted_at,failed) SELECT ?,?,0 WHERE
      (SELECT COUNT(*) FROM login_attempts WHERE ip=? AND attempted_at>?) < 30`,
    ).bind(ip, stamp, ip, stamp - 3600),
  ]);
  if (count.meta.changes) {
    const work = sendInvitation(env, email).catch(() =>
      console.error("Registration email delivery failed"),
    );
    if (ctx) ctx.waitUntil(work);
    else await work;
  }
  return json({ status: "accepted" }, 202);
}
async function redeem(env: Bindings, data: Record<string, unknown>) {
  check(
    typeof data.token === "string" && /^[a-f0-9]{64}$/.test(data.token),
    "登録リンクを確認してください",
    400,
  );
  const hash = digest(data.token),
    raw = token(),
    stamp = now();
  const [issued] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO login_sessions SELECT ?,a.id,'enroll',? FROM login_links l
      JOIN login_accounts a ON a.id=l.account_id WHERE l.token_hash=? AND l.expires_at>? AND a.active=1
      AND NOT EXISTS(SELECT 1 FROM login_identities i WHERE i.account_id=a.id)`,
    ).bind(digest(raw), stamp + 1200, hash, stamp),
    env.DB.prepare("DELETE FROM login_links WHERE token_hash=?").bind(hash),
    env.DB.prepare(
      `DELETE FROM login_sessions WHERE purpose='enroll' AND token_hash<>? AND account_id IN
      (SELECT account_id FROM login_sessions WHERE token_hash=?)`,
    ).bind(digest(raw), digest(raw)),
  ]);
  check(issued.meta.changes === 1, "登録リンクは無効か期限切れです", 410);
  return json({ status: "ok" }, 200, sessionHeaders(raw, "enroll"));
}
export async function accountRoute(
  req: Request,
  env: Bindings,
  action: string,
  ctx?: Pick<ExecutionContext, "waitUntil">,
) {
  const db = env.DB;
  if (action === "logout" && ["GET", "POST"].includes(req.method)) {
    await db
      .prepare("DELETE FROM login_sessions WHERE token_hash=?")
      .bind(digest(cookie(req, "es_session")))
      .run();
    const headers = new Headers({
      location: "/login",
      "Cache-Control": "no-store",
      "Clear-Site-Data": '"cache", "cookies", "storage"',
    });
    for (const name of ["es_session", "es_offline", "es_line", "cs_session"])
      setCookie(headers, name, "", 0);
    return new Response(null, { status: 303, headers });
  }
  if (action === "line-callback" && req.method === "GET") {
    const params = new URL(req.url).searchParams;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    setCookie(headers, "es_line", "", 0);
    let destination = "/login";
    let stage = "consume_state";
    function failure(
      reason: LineReason,
      providerStatus?: number,
      providerError?: string,
      checkName?: LineCheck,
    ) {
      // This event is safe to query in Workers Logs. Callback URLs and provider payloads contain credentials.
      console.warn("LINE callback failed", {
        reason,
        stage,
        ...(providerStatus && { providerStatus }),
        ...(providerError && { providerError }),
        ...(checkName && { check: checkName }),
      });
      headers.set("Location", destination + "?error=" + reason);
      return new Response(null, { status: 303, headers });
    }
    try {
      const state = params.get("state"),
        browser = cookie(req, "es_line");
      if (!state || !browser) {
        stage = state ? "browser_cookie_missing" : "state_missing";
        return failure("line-state");
      }
      const row = await db
        .prepare(
          `DELETE FROM login_oauth WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,enrollment_hash`,
        )
        .bind(digest(state), digest(browser), now())
        .first<{ nonce: string; enrollment_hash: string | null }>();
      if (!row) return failure("line-state");
      if (row.enrollment_hash) {
        stage = "enrollment_cookie";
        if (row.enrollment_hash !== digest(cookie(req, "es_session")))
          return failure("line-enrollment");
        stage = "enrollment_session";
        if (!(await currentEnrollment(req, env)))
          return failure("line-enrollment");
        destination = "/link-account";
      }
      stage = "authorization";
      const code = params.get("code"),
        providerError = oauthError(params.get("error"));
      if (providerError === "access_denied")
        return failure("line-denied", undefined, providerError);
      if (!code || params.has("error"))
        return failure("line-code", undefined, providerError);

      stage = "provider";
      const subject = await verifyLine(
        env,
        origin(env) + "/auth/line-callback",
        code,
        row.nonce,
      );
      stage = "complete_identity";
      let session;
      try {
        session = await completeIdentity(
          db,
          "line",
          subject,
          row.enrollment_hash,
        );
      } catch (error) {
        if (error instanceof EventInitializationError) {
          destination = "/login"; // The identity link has already committed.
          return failure("line-initialize");
        }
        if (error instanceof HttpError && error.status === 403)
          return failure("line-account");
        if (error instanceof HttpError && error.status === 409) {
          if (await currentEnrollment(req, env))
            return failure("line-conflict");
          destination = "/login";
          return failure("line-enrollment");
        }
        throw error;
      }
      for (const value of session.getSetCookie())
        headers.append("Set-Cookie", value);
      headers.set("Location", "/");
    } catch (error) {
      if (error instanceof LineProviderError)
        return failure(
          error.reason,
          error.providerStatus,
          error.providerError,
          error.checkName,
        );
      return failure("line-internal");
    }
    return new Response(null, { status: 303, headers });
  }
  check(req.method === "POST", "Method not allowed", 405);
  if (action === "line-start") {
    const enroll = await currentEnrollment(req, env);
    const state = token(),
      browser = token(),
      nonce = token(),
      stamp = now();
    const url = lineAuthorize(
      env,
      origin(env) + "/auth/line-callback",
      state,
      nonce,
    );
    await db.batch([
      db.prepare("DELETE FROM login_oauth WHERE expires_at<=?").bind(stamp),
      db
        .prepare("INSERT INTO login_oauth VALUES (?,?,?,?,?)")
        .bind(
          digest(state),
          digest(browser),
          nonce,
          enroll ? digest(cookie(req, "es_session")) : null,
          stamp + 600,
        ),
    ]);
    const headers = new Headers();
    setCookie(headers, "es_line", browser, 600);
    return json({ url }, 200, headers);
  }
  const data = await body(req);
  if (action === "register")
    return requestLink(req, env, emailAddress(data.email), ctx);
  if (action === "redeem") return redeem(env, data);
  if (action === "google") {
    const enroll = await currentEnrollment(req, env);
    const subject = await verifyGoogle(env, String(data.token || ""));
    return json(
      { status: "ok" },
      200,
      await completeIdentity(
        db,
        "google",
        subject,
        enroll ? digest(cookie(req, "es_session")) : null,
      ),
    );
  }
  throw new HttpError(404, "Not found");
}

function role(value: unknown) {
  check(value === "staff" || value === "admin", "権限を確認してください");
  return value;
}
function staffID(value: unknown) {
  check(
    value === null ||
      (typeof value === "number" && Number.isSafeInteger(value) && value > 0),
    "スタッフを確認してください",
  );
  return value;
}
export async function directoryRoute(
  req: Request,
  env: Bindings,
  actor: Account,
  parts: string[],
) {
  check(actor.role === "admin", "管理者権限が必要です", 403);
  const db = env.DB;
  const sessionHash = digest(cookie(req, "es_session"));
  // Check authorization in the same write that grants or revokes access.
  const adminSession = `EXISTS(SELECT 1 FROM login_sessions s JOIN login_accounts acting ON acting.id=s.account_id
    WHERE s.token_hash=? AND s.purpose='login' AND s.expires_at>unixepoch() AND acting.id=? AND acting.active=1 AND acting.role='admin')`;
  if (!parts.length && req.method === "GET") {
    const list = await db
      .prepare(
        `SELECT a.*, EXISTS(SELECT 1 FROM login_identities i WHERE i.account_id=a.id) AS registered
      FROM login_accounts a ORDER BY a.email`,
      )
      .all();
    return json(list.results);
  }
  try {
    if (!parts.length && req.method === "POST") {
      const data = await body(req);
      const added = await db
        .prepare(
          `INSERT INTO login_accounts(email,role,staff_id) SELECT ?,?,? WHERE ${adminSession}`,
        )
        .bind(
          emailAddress(data.email),
          role(data.role),
          staffID(data.staff_id ?? null),
          sessionHash,
          actor.id,
        )
        .run();
      check(added.meta.changes === 1, "管理者権限が必要です", 403);
      return json({ id: added.meta.last_row_id }, 201);
    }
    check(
      parts.length === 1 && /^\d+$/.test(parts[0]) && req.method === "PATCH",
      "Not found",
      404,
    );
    const id = Number(parts[0]),
      data = await body(req),
      update: string[] = [],
      values: (string | number | null)[] = [];
    if ("role" in data) {
      update.push("role=?");
      values.push(role(data.role));
    }
    if ("active" in data) {
      check(typeof data.active === "boolean", "状態を確認してください");
      update.push("active=?");
      values.push(Number(data.active));
    }
    if ("staff_id" in data) {
      update.push("staff_id=?");
      values.push(staffID(data.staff_id));
    }
    check(update.length, "更新項目がありません");
    // A single UPDATE guards simultaneous demotions. Keep a linked, active admin when one exists.
    const reducesAdmin = data.active === false || data.role === "staff";
    const [authorized, before, changed] = await db.batch([
      db.prepare(`SELECT 1 WHERE ${adminSession}`).bind(sessionHash, actor.id),
      db.prepare("SELECT id FROM login_accounts WHERE id=?").bind(id),
      db
        .prepare(
          `UPDATE login_accounts SET ${update.join(",")} WHERE id=? AND ${adminSession} AND
       (?=0 OR active=0 OR role<>'admin' OR EXISTS(SELECT 1 FROM login_accounts a JOIN login_identities i ON i.account_id=a.id
         WHERE a.role='admin' AND a.active=1 AND a.id<>?))`,
        )
        .bind(...values, id, sessionHash, actor.id, Number(reducesAdmin), id),
      db
        .prepare(
          "DELETE FROM login_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM login_accounts WHERE id=? AND active=0)",
        )
        .bind(id, id),
      db
        .prepare(
          "DELETE FROM login_links WHERE account_id=? AND EXISTS(SELECT 1 FROM login_accounts WHERE id=? AND active=0)",
        )
        .bind(id, id),
    ]);
    check(authorized.results.length, "管理者権限が必要です", 403);
    check(before.results.length, "Not found", 404);
    check(
      changed.meta.changes === 1,
      "最後の登録済み管理者を解除できません",
      409,
    );
    return json({ status: "ok" });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (String(e).includes("UNIQUE constraint"))
      throw new HttpError(
        409,
        "このメールまたはスタッフは既に登録されています",
      );
    if (String(e).includes("FOREIGN KEY constraint"))
      throw new HttpError(400, "スタッフを確認してください");
    throw e;
  }
}
