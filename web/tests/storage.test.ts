import test, { type TestContext } from "node:test";
import { hash } from "../lib/auth";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { handle } from "../lib/api";
import { write, snapshot, type Bindings } from "../lib/db";
import { backup, restore } from "../lib/backup";
import { zipSync, strToU8 } from "fflate";

async function freshDatabase(t: TestContext) {
  const platform = await getPlatformProxy<Bindings>({
    configPath: "wrangler.json",
    persist: false,
    remoteBindings: false,
  });
  t.after(() => platform.dispose());
  const env = { ...platform.env };
  env.SESSION_SECRET = "local-test-secret";
  env.APP_PASSWORD = "test-login";
  env.RESET_PASSWORD = "test-admin";
  for (const f of readdirSync("migrations").sort()) {
    const statements = readFileSync("migrations/" + f, "utf8")
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
  return env;
}

test("authenticated D1 lifecycle, scheduling boundaries, atomic restore and private snapshots", async (t) => {
  const env = await freshDatabase(t);
  let cookie = "";
  async function call(path: string, method = "GET", body?: unknown) {
    return handle(
      new Request("https://scheduler.test/" + path, {
        method,
        headers: { cookie, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      path.split("/"),
    );
  }
  assert.equal((await call("api/workspace")).status, 401);
  assert.equal((await call("auth/setup", "POST", {})).status, 404);
  const credentials = { password: env.APP_PASSWORD };
  const reset = env.RESET_PASSWORD;
  delete env.RESET_PASSWORD;
  assert.equal((await call("auth/verify", "POST", credentials)).status, 503);
  env.RESET_PASSWORD = reset;
  assert.equal(
    (await call("auth/verify", "POST", { password: "wrong" })).status,
    401,
  );
  assert.equal((await snapshot(env.DB)).rows.rooms.length, 0);
  assert.equal((await snapshot(env.DB)).rows.app_settings.length, 0);
  const [login, retry] = await Promise.all([
    call("auth/verify", "POST", credentials),
    call("auth/verify", "POST", credentials),
  ]);
  assert.equal(login.status, 200);
  assert.equal(retry.status, 200);
  const initial = (await snapshot(env.DB)).rows;
  assert.deepEqual(
    initial.rooms.map((row) => row.name),
    ["全体"],
  );
  assert.equal(initial.session_groups.length, 1);
  assert.deepEqual(initial.categories.map((row) => row.key).sort(), [
    "reception",
    "social",
  ]);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  const room = (await (
    await call("api/rooms", "POST", { name: "Hall", capacity: 100 })
  ).json()) as { id: number };
  const first = {
    title: "Opening",
    speaker: "Speaker",
    start_time: "2026-08-01T10:00",
    end_time: "2026-08-01T11:00",
    room_id: room.id,
  };
  for (const change of [
    {},
    { title: "Parallel" },
    {
      title: "Day two",
      start_time: "2026-08-02T10:00",
      end_time: "2026-08-02T11:00",
    },
  ])
    assert.equal(
      (await call("api/sessions", "POST", { ...first, ...change })).status,
      201,
    );
  assert.equal(
    (
      await call("api/staffs", "POST", {
        name: "A",
        role: ["session"],
        max_hours: 1,
        experience_count: 1,
        skills: ["general"],
      })
    ).status,
    201,
  );
  assert.equal(
    (await call("api/assignments/auto-assign", "POST", {})).status,
    400,
  );
  for (const d of ["2026-08-02", "2026-08-01"]) {
    const r = await call("api/assignments/auto-assign", "POST", {
      target_date: d,
    });
    assert.equal(r.status, 200);
    assert.equal(
      ((await r.json()) as { assigned_slots: number }).assigned_slots,
      1,
    );
  }
  assert.equal(
    (
      await call("api/sessions/1/required-staff", "PATCH", {
        required_staff: 1,
        room_id: 42,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("api/sessions/1/lt-talks", "PUT", [
        { title: "Talk", speaker: "LT representative", is_representative: 1 },
      ])
    ).status,
    200,
  );
  const snap = await snapshot(env.DB);
  assert.equal(
    snap.rows.sessions.find((s) => s.id === 1)?.speaker,
    "LT representative",
  );
  assert.equal(snap.rows.assignments.length, 2);
  await write(env.DB, snap.version, []);
  await assert.rejects(
    () => write(env.DB, snap.version, [env.DB.prepare("DELETE FROM sessions")]),
    /再読み込み/,
  );
  const archive = await backup(env, snap.rows);
  const bad = zipSync({
    "data.json": strToU8(
      JSON.stringify({
        rooms: [],
        sessions: [
          {
            id: 1,
            title: "bad",
            speaker: "",
            room_id: 999,
            start_time: first.start_time,
            end_time: first.end_time,
          },
        ],
        staffs: [],
      }),
    ),
  });
  await assert.rejects(() =>
    restore(
      env,
      new File([new Uint8Array(bad).buffer], "bad.zip"),
      snap.version + 1,
    ),
  );
  assert.equal((await snapshot(env.DB)).rows.sessions.length, 3);
  await restore(
    env,
    new File([new Uint8Array(archive).buffer], "good.zip"),
    snap.version + 1,
  );
  assert.equal((await snapshot(env.DB)).rows.assignments.length, 2);
  const config = await call("api/public-api/settings", "PUT", {
    enabled: true,
    cors_origins: "https://event.test",
  });
  const key = ((await config.json()) as { key: string }).key;
  assert.equal((await call("api/public-api/publish", "POST", {})).status, 200);
  assert.equal((await call("public/api/schedule")).status, 401);
  const published = await handle(
    new Request("https://scheduler.test/public/api/schedule", {
      headers: { "X-API-Key": key },
    }),
    env,
    ["public", "api", "schedule"],
  );
  assert.equal(published.status, 200);
  assert.doesNotMatch(
    await published.text(),
    /emergency_contact|login_password/,
  );
});

test("imported settings and rows survive the first login", async (t) => {
  const env = await freshDatabase(t);
  const verify = (password: string) =>
    handle(
      new Request("https://scheduler.test/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }),
      env,
      ["auth", "verify"],
    );
  await env.DB.prepare(
    "INSERT INTO rooms(id,name,capacity) VALUES(42,'Existing',50)",
  ).run();
  assert.equal((await verify(env.APP_PASSWORD!)).status, 200);
  let rows = (await snapshot(env.DB)).rows;
  assert.deepEqual(
    rows.rooms.map((r) => r.id),
    [42],
  );
  assert.equal(rows.categories.length, 0);
  assert.equal(rows.app_settings.length, 0);
  const stored = hash("legacy-login");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO app_settings(key,value) VALUES('setup_completed','1')",
    ),
    env.DB.prepare(
      "INSERT INTO app_settings(key,value) VALUES('login_password',?)",
    ).bind(stored),
    env.DB.prepare(
      "INSERT INTO app_settings(key,value) VALUES('reset_password',?)",
    ).bind(hash("legacy-reset")),
  ]);
  assert.equal((await verify("legacy-login")).status, 401);
  delete (env as Bindings).APP_PASSWORD;
  delete (env as Bindings).RESET_PASSWORD;
  assert.equal((await verify("legacy-login")).status, 200);
  rows = (await snapshot(env.DB)).rows;
  assert.equal(
    rows.app_settings.find((r) => r.key === "login_password")?.value,
    stored,
  );
  assert.deepEqual(
    rows.rooms.map((r) => r.id),
    [42],
  );
});
