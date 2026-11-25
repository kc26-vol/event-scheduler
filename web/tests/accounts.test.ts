import test from "node:test";
import assert from "node:assert/strict";
import { seedLocalAdmin } from "../scripts/seed-admin.mjs";
import { scheduler, request, loginFixture } from "./scheduler-fixture";

function cookies(previous: string, response: Response) {
  const fields = new Map(
    previous
      ? previous.split("; ").map((value) => {
          const [name, token] = value.split("=");
          return [name, token] as const;
        })
      : [],
  );
  for (const header of response.headers.getSetCookie()) {
    const [name, value] = header.split(";")[0].split("=");
    if (value) fields.set(name, value);
    else fields.delete(name);
  }
  return [...fields].map(([name, value]) => name + "=" + value).join("; ");
}

test("only an invited email can enroll once and link a provider, then sign in using that identity", async (t) => {
  const origin = "https://scheduler.test";
  const outbox: { to: string; text: string }[] = [];
  const env = {
    ...(await scheduler(t)),
    AUTH_EMAIL_FROM: "registration@example.org",
    LINE_CHANNEL_ID: "12345",
    LINE_CHANNEL_SECRET: "test-secret",
    MAILER: {
      async send(message: { to: string; text: string }) {
        outbox.push(message);
        return { messageId: "local-mail" };
      },
    },
  };
  const rootEmail = "admin@example.test";
  const retiredSetup = await request(env, "/auth/bootstrap", "POST", {
    email: "unexpected@example.test",
  });
  assert.equal(retiredSetup.status, 404);
  assert.equal(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM login_accounts").first(
      "total",
    ),
    0,
  );
  await seedLocalAdmin(env.DB, rootEmail);
  // A later deployment with a changed seed must never add another administrator.
  await seedLocalAdmin(env.DB, "unexpected@example.test");
  assert.equal(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM login_accounts").first(
      "total",
    ),
    1,
  );
  const register = (email: string) =>
    request(env, "/auth/register", "POST", { email });
  const unknown = await register("unlisted@example.test");
  const invited = await register(rootEmail);
  assert.equal(unknown.status, 202);
  assert.equal(invited.status, 202);
  const generic = await unknown.json();
  assert.deepEqual(await invited.json(), generic);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, rootEmail);
  const link = new URL(outbox[0].text.match(/https:\/\/[^\s<>]+/)![0]);
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, "/register");
  assert.equal(link.search, "");
  const token = new URLSearchParams(link.hash.slice(1)).get("token");
  assert.ok(token);
  const redeem = () => request(env, "/auth/redeem", "POST", { token });
  const simultaneous = await Promise.all([redeem(), redeem()]);
  assert.equal(simultaneous.filter((r) => r.ok).length, 1);
  const pending = cookies(
    "",
    simultaneous.find((r) => r.ok)!,
  );
  assert.equal((await redeem()).ok, false);
  for (const path of ["/api/workspace", "/api/accounts"])
    assert.equal(
      (await request(env, path, "GET", undefined, pending)).status,
      401,
    );

  let lineSubject = "first-line-user";
  let nonce = "";
  const realFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.line.me/oauth2/v2.1/token")
        return Response.json({ id_token: "test-id-token" });
      if (url === "https://api.line.me/oauth2/v2.1/verify")
        return Response.json({
          iss: "https://access.line.me",
          aud: env.LINE_CHANNEL_ID,
          nonce,
          exp: Math.floor(Date.now() / 1000) + 300,
          sub: lineSubject,
        });
      return realFetch(input, init);
    },
  );
  async function line(cookie: string) {
    const start = await request(env, "/auth/line-start", "POST", {}, cookie);
    assert.ok(start.ok, await start.clone().text());
    const authorize = new URL(((await start.json()) as { url: string }).url);
    nonce = authorize.searchParams.get("nonce")!;
    assert.ok(nonce);
    const callback = new URL(authorize.searchParams.get("redirect_uri")!);
    callback.searchParams.set("code", "issued-code");
    callback.searchParams.set("state", authorize.searchParams.get("state")!);
    const stateCookie = cookies(cookie, start);
    const finish = await request(
      env,
      callback.href,
      "GET",
      undefined,
      stateCookie,
    );
    return {
      finish,
      cookie: cookies(stateCookie, finish),
      callback: callback.href,
      stateCookie,
    };
  }
  const linked = await line(pending);
  assert.ok(
    linked.finish.status >= 200 && linked.finish.status < 400,
    await linked.finish.clone().text(),
  );
  assert.equal(
    (await request(env, "/api/accounts", "GET", undefined, linked.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request(env, "/api/workspace", "GET", undefined, pending)).status,
    401,
  );
  const repeat = await register(rootEmail);
  assert.equal(repeat.status, 202);
  assert.deepEqual(await repeat.json(), generic);
  assert.equal(outbox.length, 1);
  const replay = await request(
    env,
    linked.callback,
    "GET",
    undefined,
    linked.stateCookie,
  );
  assert.equal(
    (await request(env, "/api/accounts", "GET", undefined, cookies("", replay)))
      .status,
    401,
  );
  await request(env, "/auth/logout", "GET", undefined, linked.cookie);
  assert.equal(
    (await request(env, "/api/workspace", "GET", undefined, linked.cookie))
      .status,
    401,
  );
  const returned = await line("");
  assert.equal(
    (await request(env, "/api/accounts", "GET", undefined, returned.cookie))
      .status,
    200,
  );
  // A second invited mailbox cannot take the first person's linked LINE identity.
  const secondEmail = "other@example.test";
  assert.equal(
    (
      await request(
        env,
        "/api/accounts",
        "POST",
        { email: secondEmail, role: "staff" },
        returned.cookie,
      )
    ).status,
    201,
  );
  assert.equal((await register(secondEmail)).status, 202);
  assert.equal(outbox.length, 2);
  const secondLink = new URL(outbox[1].text.match(/https:\/\/[^\s<>]+/)![0]);
  const secondToken = new URLSearchParams(secondLink.hash.slice(1)).get(
    "token",
  );
  const secondEnroll = await request(env, "/auth/redeem", "POST", {
    token: secondToken,
  });
  assert.ok(secondEnroll.ok);
  const secondCookie = cookies("", secondEnroll);
  const duplicateIdentity = await line(secondCookie);
  assert.equal(
    (
      await request(
        env,
        "/api/workspace",
        "GET",
        undefined,
        duplicateIdentity.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM login_identities",
    ).first("total"),
    1,
  );
  lineSubject = "unlinked-line-user";
  const unlinked = await line("");
  assert.equal(
    (await request(env, "/api/workspace", "GET", undefined, unlinked.cookie))
      .status,
    401,
  );
  assert.equal(
    duplicateIdentity.finish.headers.get("location"),
    "/link-account?error=provider",
  );
  const retry = await line(duplicateIdentity.cookie);
  assert.equal(retry.finish.headers.get("location"), "/");
  assert.equal(
    (await request(env, "/api/workspace", "GET", undefined, retry.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request(env, "/api/accounts", "GET", undefined, retry.cookie))
      .status,
    403,
  );
});

test("only admins can manage the email directory or access administration routes", async (t) => {
  const env = await scheduler(t);
  const email = "first@example.test";
  await seedLocalAdmin(env.DB, email);
  const adminCookie = await loginFixture(env.DB, email);
  const admin = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, adminCookie);
  const invite = (email: string, role: string) =>
    admin("/api/accounts", "POST", { email, role });
  assert.equal((await invite("crew@example.test", "staff")).status, 201);
  assert.equal((await invite("CREW@example.test", "admin")).status, 409);
  assert.equal((await invite("second@example.test", "admin")).status, 201);
  const staffCookie = await loginFixture(env.DB, "crew@example.test");
  const staff = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, staffCookie);
  const directory = (await (await admin("/api/accounts")).json()) as {
    id: number;
    email: string;
    role: string;
  }[];
  const crew = directory.find((row) => row.email === "crew@example.test")!;
  assert.equal(crew.role, "staff");
  assert.equal(
    directory.find((row) => row.email === "second@example.test")?.role,
    "admin",
  );
  for (const path of [
    "/api/accounts",
    "/api/settings",
    "/api/export/backup",
    "/api/export/excel",
    "/api/backup/auto/history",
    "/api/public-api/settings",
  ])
    assert.equal((await staff(path)).status, 403, path);
  for (const [path, method, body] of [
    ["/api/accounts", "POST", { email: "another@example.test", role: "admin" }],
    ["/api/accounts/" + crew.id, "PATCH", { role: "admin" }],
    ["/api/rooms", "POST", { name: "Room", capacity: 2 }],
    ["/api/assignments/auto-assign", "POST", {}],
  ] as const)
    assert.equal((await staff(path, method, body)).status, 403, path);
  // Other staff's private fields must stay private in nested responses as well as lists.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO rooms(id,name,capacity) VALUES(801,'Hall',30)"),
    env.DB.prepare(
      "INSERT INTO staffs(id,name,emergency_contact) VALUES(802,'Other Crew','private-contact-123')",
    ),
    env.DB.prepare(
      "INSERT INTO sessions(id,title,speaker,start_time,end_time,room_id,notes) VALUES(803,'Opening','Speaker','2026-08-01T10:00','2026-08-01T11:00',801,'private-session-note')",
    ),
    env.DB.prepare(
      "INSERT INTO assignments(staff_id,session_id) VALUES(802,803)",
    ),
    env.DB.prepare(
      "INSERT INTO staff_availabilities(staff_id,start_time,end_time) VALUES(802,'2031-04-22T17:21','2031-04-22T18:02')",
    ),
    env.DB.prepare(
      "INSERT INTO staff_preferred_sessions(staff_id,session_id,priority) VALUES(802,803,98765)",
    ),
  ]);
  const sensitive =
    /private-contact-123|private-session-note|2031-04-22T17:21|98765/;
  assert.match(
    await (await admin("/api/workspace")).text(),
    /private-contact-123/,
  );
  for (const path of [
    "/api/workspace",
    "/api/offline",
    "/api/staffs",
    "/api/assignments/schedule",
    "/api/assignments/staff-schedule",
  ]) {
    const response = await staff(path);
    assert.equal(response.status, 200, path);
    const payload = await response.text();
    assert.match(payload, /Other Crew/, path);
    assert.doesNotMatch(payload, sensitive, path);
  }
  assert.doesNotMatch(await (await admin("/api/offline")).text(), sensitive);
  assert.equal(
    (await admin("/api/accounts/" + crew.id, "PATCH", { active: false }))
      .status,
    200,
  );
  assert.equal((await staff("/api/workspace")).status, 401);
});

test("Google links the verified identity after email redemption and signs it in again", async (t) => {
  const email = "google-admin@example.test",
    subject = "google-account-89",
    uid = "firebase-local-account";
  const project = "test-project",
    key = "test-api-key",
    now = Math.floor(Date.now() / 1000);
  let mail = "";
  const env = {
    ...(await scheduler(t)),
    FIREBASE_PROJECT_ID: project,
    FIREBASE_API_KEY: key,
    AUTH_EMAIL_FROM: "register@example.test",
    MAILER: {
      async send(message: { text: string }) {
        mail = message.text;
      },
    },
  };
  await seedLocalAdmin(env.DB, email);
  assert.equal(
    (await request(env, "/auth/register", "POST", { email })).status,
    202,
  );
  const url = new URL(mail.match(/https:\/\/[^\s<>]+/)![0]);
  const code = new URLSearchParams(url.hash.slice(1)).get("token");
  const redeemed = await request(env, "/auth/redeem", "POST", { token: code });
  assert.equal(redeemed.status, 200);
  const enrollment = cookies("", redeemed);
  const token =
    "header." +
    Buffer.from(
      JSON.stringify({
        sub: uid,
        aud: project,
        iss: "https://securetoken.google.com/" + project,
        auth_time: now,
        iat: now,
        exp: now + 3600,
        firebase: {
          sign_in_provider: "google.com",
          identities: { "google.com": [subject] },
        },
      }),
    ).toString("base64url") +
    ".fixture";
  const realFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) !==
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + key
      )
        return realFetch(input, init);
      if (JSON.parse(String(init?.body)).idToken !== token)
        return Response.json({}, { status: 400 });
      return Response.json({
        users: [
          {
            localId: uid,
            providerUserInfo: [{ providerId: "google.com", rawId: subject }],
          },
        ],
      });
    },
  );
  const signIn = (credential: string, cookie = "") =>
    request(env, "/auth/google", "POST", { token: credential }, cookie);
  const denied = await signIn("invalid-token", enrollment);
  assert.equal(denied.status, 401);
  const linked = await signIn(token, enrollment);
  assert.equal(linked.status, 200);
  const session = cookies("", linked);
  assert.equal(
    (await request(env, "/api/accounts", "GET", undefined, session)).status,
    200,
  );
  await request(env, "/auth/logout", "GET", undefined, session);
  const returning = await signIn(token);
  assert.equal(returning.status, 200);
  assert.equal(
    (
      await request(
        env,
        "/api/accounts",
        "GET",
        undefined,
        cookies("", returning),
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (
      await env.DB.prepare(
        "SELECT provider,subject FROM login_identities",
      ).all()
    ).results,
    [{ provider: "google", subject }],
  );
});
