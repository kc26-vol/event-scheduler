import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { restore } from "../lib/backup";
import { snapshot } from "../lib/db";
import { scheduler, request, loginFixture } from "./scheduler-fixture";

async function setup(t: TestContext) {
  const env = { ...(await scheduler(t)), DEVELOPMENT_ROLE_SWITCH: "1" };
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT INTO rooms(id,name,capacity) VALUES(1,'Hall',50)"),
    db.prepare(
      "INSERT INTO staffs(id,name,role) VALUES(1,'First helper','session'),(2,'Second helper','session')",
    ),
    db.prepare(
      "INSERT INTO login_accounts(email,role,staff_id) VALUES('admin@example.test','admin',NULL),('crew@example.test','staff',1)",
    ),
    db.prepare(
      "INSERT INTO sessions(id,title,speaker,start_time,end_time,room_id,required_staff) VALUES " +
        "(1,'Opening','','2026-08-01T10:00','2026-08-01T11:00',1,1)," +
        "(2,'Closing','','2026-08-01T13:00','2026-08-01T14:00',1,1)," +
        "(3,'Briefing','','2026-08-01T09:00','2026-08-01T09:30',1,-1)," +
        "(4,'Break','','2026-08-01T12:00','2026-08-01T12:15',1,0)",
    ),
    db.prepare(
      "INSERT INTO staff_preferred_sessions(staff_id,session_id,priority) VALUES(1,1,1)",
    ),
  ]);
  const adminCookie = await loginFixture(db, "admin@example.test");
  const staffCookie = await loginFixture(db, "crew@example.test");
  const admin = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, adminCookie);
  const staff = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, staffCookie);
  return { env, admin, staff, adminCookie };
}

const restrictions = "/api/staffs/1/blocked-sessions";

test("session exclusions override a preference in manual, fill-only and replacement assignments", async (t) => {
  const { env, admin } = await setup(t);
  const set = (sessionIds: number[]) =>
    admin(restrictions, "PUT", { sessionIds });
  const assigned = () =>
    env.DB.prepare(
      "SELECT staff_id FROM assignments WHERE session_id=1",
    ).first<number>("staff_id");
  assert.equal((await set([1])).status, 204);
  assert.equal(
    (
      await admin("/api/sessions/1/required-staff", "PATCH", {
        required_staff: -1,
      })
    ).status,
    409,
  );
  for (const invalid of [[1, 999], [3], [4]]) {
    assert.equal((await set(invalid)).status, 400);
    assert.deepEqual(await (await admin(restrictions)).json(), {
      sessionIds: [1],
    });
  }
  const manual = await admin("/api/assignments", "POST", {
    staff_id: 1,
    session_id: 1,
  });
  assert.equal(manual.status, 409);
  assert.equal(await assigned(), null);
  const closing = await admin("/api/assignments", "POST", {
    staff_id: 1,
    session_id: 2,
  });
  assert.equal(closing.status, 201);
  const { id } = (await closing.json()) as { id: number };
  const moved = await admin("/api/assignments/" + id, "PUT", { session_id: 1 });
  assert.equal(moved.status, 409);
  assert.equal((await set([1, 2])).status, 409);
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [1],
  });
  assert.equal(
    await env.DB.prepare("SELECT session_id FROM assignments WHERE id=?")
      .bind(id)
      .first("session_id"),
    2,
  );
  for (const fill_only of [true, false]) {
    const allocated = await admin("/api/assignments/auto-assign", "POST", {
      session_ids: [1],
      fill_only,
    });
    assert.equal(allocated.status, 200);
    assert.equal(await assigned(), 2);
  }
  assert.equal((await set([])).status, 204);
  const unblocked = await admin("/api/assignments/auto-assign", "POST", {
    session_ids: [1],
  });
  assert.equal(unblocked.status, 200);
  assert.equal(await assigned(), 1);
});

test("a simultaneous assignment and exclusion cannot both be saved", async (t) => {
  const { env, admin } = await setup(t);
  const [assignment, exclusion] = await Promise.all([
    admin("/api/assignments", "POST", { session_id: 1, staff_id: 1 }),
    admin(restrictions, "PUT", { sessionIds: [1] }),
  ]);
  assert.deepEqual(
    [assignment.status, exclusion.status],
    assignment.ok ? [201, 409] : [409, 204],
  );
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: exclusion.ok ? [1] : [],
  });
  assert.equal(
    await env.DB.prepare(
      "SELECT count(*) AS n FROM assignments WHERE session_id=1 AND staff_id=1",
    ).first("n"),
    assignment.ok ? 1 : 0,
  );
});

test("an older exclusion form cannot overwrite newer choices and set order does not matter", async (t) => {
  const { admin } = await setup(t);
  const save = (previousSessionIds: number[], sessionIds: number[]) =>
    admin(restrictions, "PUT", { previousSessionIds, sessionIds });
  assert.equal((await save([], [1, 2])).status, 204);
  assert.equal((await save([], [2])).status, 409);
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [1, 2],
  });
  assert.equal((await save([2, 1], [1])).status, 204);
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [1],
  });
});

test("only administrators can manage or see per-person exclusions, including in staff preview and offline data", async (t) => {
  const { env, admin, staff, adminCookie } = await setup(t);
  const staffPayloads = async () => {
    const payloads = [];
    for (const path of [
      "/api/workspace",
      "/api/offline",
      "/api/staffs/1",
      "/api/assignments/staff-schedule",
    ]) {
      const response = await staff(path);
      assert.equal(response.status, 200, path);
      payloads.push(await response.json());
    }
    return payloads;
  };
  const initialViews = await staffPayloads();
  assert.equal(
    (await admin(restrictions, "PUT", { sessionIds: [1] })).status,
    204,
  );
  assert.deepEqual(await staffPayloads(), initialViews);
  assert.equal((await request(env, restrictions)).status, 401);
  const preview = await admin("/auth/development-view", "POST", {
    role: "staff",
  });
  assert.equal(preview.status, 204);
  const viewCookie = preview.headers
    .getSetCookie()
    .find((c) => c.startsWith("es_staff_view="));
  assert.ok(viewCookie);
  const inPreview = (path: string, method = "GET", body?: unknown) =>
    request(
      env,
      path,
      method,
      body,
      adminCookie + "; " + viewCookie.split(";")[0],
    );
  for (const call of [staff, inPreview]) {
    for (const path of [restrictions, "/api/staffs/2/blocked-sessions"]) {
      assert.equal((await call(path)).status, 403);
      assert.equal((await call(path, "PUT", { sessionIds: [] })).status, 403);
    }
  }
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [1],
  });
});

test("event backups restore per-person exclusions and still accept legacy archives", async (t) => {
  const { env, admin } = await setup(t);
  assert.equal(
    (await admin(restrictions, "PUT", { sessionIds: [1] })).status,
    204,
  );
  const exported = await admin("/api/export/backup");
  assert.equal(exported.status, 200);
  const archive = new File([await exported.arrayBuffer()], "event.zip");
  assert.equal(
    (await admin(restrictions, "PUT", { sessionIds: [] })).status,
    204,
  );
  await restore(env, archive, (await snapshot(env.DB)).version);
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [1],
  });

  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const data = JSON.parse(strFromU8(files["data.json"]));
  data.assignments.push({ session_id: 1, staff_id: 1 });
  files["data.json"] = strToU8(JSON.stringify(data));
  const contradictoryArchive = new File(
    [new Uint8Array(zipSync(files)).buffer],
    "conflicting-assignment.zip",
  );
  const before = await snapshot(env.DB);
  await assert.rejects(() =>
    restore(env, contradictoryArchive, before.version),
  );
  assert.deepEqual(await snapshot(env.DB), before);

  const legacy = zipSync({
    "data.json": strToU8(
      JSON.stringify({
        version: 4,
        rooms: [{ id: 1, name: "Hall", capacity: 50 }],
        sessions: [
          {
            id: 1,
            title: "Opening",
            speaker: "",
            room_id: 1,
            start_time: "2026-08-01T10:00",
            end_time: "2026-08-01T11:00",
          },
        ],
        staffs: [{ id: 1, name: "First helper", role: "session" }],
      }),
    ),
  });
  await restore(
    env,
    new File([new Uint8Array(legacy).buffer], "legacy.zip"),
    (await snapshot(env.DB)).version,
  );
  assert.deepEqual(await (await admin(restrictions)).json(), {
    sessionIds: [],
  });
  assert.equal(
    (await admin("/api/assignments", "POST", { staff_id: 1, session_id: 1 }))
      .status,
    201,
  );
});
