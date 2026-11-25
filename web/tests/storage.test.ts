import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../lib/api";
import { write, snapshot } from "../lib/db";
import { scheduler, request, loginFixture } from "./scheduler-fixture";
import { seedLocalAdmin } from "../scripts/seed-admin.mjs";
import { backup, restore } from "../lib/backup";
import { zipSync, strToU8 } from "fflate";

test("authenticated D1 lifecycle, scheduling boundaries, atomic restore and private snapshots", async (t) => {
  const env = await scheduler(t);
  const email = "admin@example.test";
  assert.equal((await request(env, "api/workspace")).status, 401);
  await seedLocalAdmin(env.DB, email);
  const cookie = await loginFixture(env.DB, email);
  const call = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, cookie);
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
