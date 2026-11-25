import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { Staff, StaffPreferredSession } from "../lib/types";
import type { ShiftPreferences } from "../lib/shift-preferences";
import { scheduler, loginFixture, request } from "./scheduler-fixture";

const staffPath = "/api/shift-preferences";
const windowPath = "/api/preference-window";
const open = {
  opensAt: "2000-01-01T00:00:00.000Z",
  closesAt: "2999-01-01T00:00:00.000Z",
};

async function fixture(t: TestContext) {
  const env = await scheduler(t);
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT INTO rooms(id,name,capacity) VALUES(1,'Test room',30)"),
    db.prepare("INSERT INTO staffs(id,name) VALUES(1,'Alice'),(2,'Bob')"),
    db.prepare(`INSERT INTO sessions(id,title,speaker,start_time,end_time,room_id,category,required_staff)
      VALUES(1,'Morning','', '09:00','10:00',1,'general',1),
            (2,'Afternoon','', '13:00','14:00',1,'general',2),
            (3,'Whole day','', '09:00','17:00',1,'overall',1),
            (4,'Break','', '12:00','13:00',1,'general',0),
            (5,'All hands','', '17:00','18:00',1,'overall',-1)`),
    db.prepare(`INSERT INTO login_accounts(email,role,staff_id) VALUES
      ('admin@example.test','admin',NULL),('alice@example.test','staff',1),
      ('bob@example.test','staff',2),('unlinked@example.test','staff',NULL)`),
  ]);
  const [admin, alice, bob, unlinked] = await Promise.all(
    ["admin", "alice", "bob", "unlinked"].map((name) =>
      loginFixture(db, name + "@example.test"),
    ),
  );
  const setWindow = (body: unknown, cookie = admin) =>
    request(env, windowPath, "PUT", body, cookie);
  async function read(cookie: string): Promise<ShiftPreferences> {
    const response = await request(env, staffPath, "GET", undefined, cookie);
    assert.equal(response.status, 200);
    return response.json();
  }
  const save = (cookie: string, body: unknown) =>
    request(env, staffPath, "PUT", body, cookie);
  return { env, db, admin, alice, bob, unlinked, setWindow, read, save };
}

test("only an admin may configure a valid submission period; saved choices remain readable outside it", async (t) => {
  const { env, db, admin, alice, unlinked, setWindow, read, save } =
    await fixture(t);
  assert.equal((await request(env, staffPath)).status, 401);
  assert.equal((await request(env, staffPath, "PUT", {})).status, 401);
  assert.equal(
    (await request(env, windowPath, "GET", undefined, alice)).status,
    403,
  );
  assert.equal((await setWindow(open, alice)).status, 403);
  assert.deepEqual(
    await (await request(env, windowPath, "GET", undefined, admin)).json(),
    {
      opensAt: null,
      closesAt: null,
      status: "unconfigured",
    },
  );
  const initial = await read(alice);
  assert.equal(initial.status, "unconfigured");
  assert.equal(
    (await save(alice, { version: initial.version, sessionIds: [1] })).status,
    409,
  );
  for (const bad of [
    null,
    { opensAt: open.closesAt, closesAt: open.opensAt },
    { ...open, opensAt: "2000-02-31T00:00:00Z" },
    { ...open, closesAt: "2999-01-01T00:00:00" },
    { ...open, opensAt: open.closesAt },
  ]) {
    assert.equal((await setWindow(bad)).status, 400);
  }
  assert.equal(
    (
      await setWindow({
        opensAt: "2998-01-01T00:00:00Z",
        closesAt: open.closesAt,
      })
    ).status,
    200,
  );
  const upcoming = await read(alice);
  assert.equal(upcoming.status, "upcoming");
  assert.equal(
    (await save(alice, { version: upcoming.version, sessionIds: [1] })).status,
    409,
  );
  assert.deepEqual(await (await setWindow(open)).json(), {
    ...open,
    status: "open",
  });
  const noStaff = await read(unlinked);
  assert.equal(noStaff.staffId, null);
  assert.equal(
    (await save(unlinked, { version: noStaff.version, sessionIds: [1] }))
      .status,
    403,
  );
  const ready = await read(alice);
  assert.equal(
    (await save(alice, { version: ready.version, sessionIds: [1] })).status,
    204,
  );
  const afterSave = await read(alice);
  assert.deepEqual(afterSave.sessionIds, [1]);
  await db
    .prepare(
      `UPDATE app_settings SET value=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE key='shift_preferences_close_at'`,
    )
    .run();
  const closed = await read(alice);
  assert.equal(closed.status, "closed");
  assert.deepEqual(closed.sessionIds, [1]);
  assert.equal(
    (await save(alice, { version: afterSave.version, sessionIds: [] })).status,
    409,
  );
  assert.equal(
    (await save(alice, { version: closed.version, sessionIds: [] })).status,
    409,
  );
  assert.deepEqual((await read(alice)).sessionIds, [1]);
  assert.equal((await setWindow(open)).status, 200);
  assert.equal(
    (
      await save(alice, {
        version: (await read(alice)).version,
        sessionIds: [],
      })
    ).status,
    204,
  );
  assert.deepEqual((await read(alice)).sessionIds, []);
});

test("users choose assignable sessions for themselves while preserving unaffected priority and row IDs", async (t) => {
  const { db, alice, bob, setWindow, read, save } = await fixture(t);
  await db
    .prepare(
      `INSERT INTO staff_preferred_sessions(id,staff_id,session_id,priority)
    VALUES(80,1,1,3),(81,2,2,2)`,
    )
    .run();
  await setWindow(open);
  const initial = await read(alice);
  assert.equal(initial.staffId, 1);
  assert.deepEqual(initial.sessionIds, [1]);
  for (const sessionIds of [
    null,
    [0],
    [-1],
    [2.5],
    ["1"],
    [1, 1],
    [999],
    [1, 4],
    [1, 5],
  ]) {
    assert.equal(
      (await save(alice, { version: initial.version, sessionIds })).status,
      400,
    );
  }
  assert.equal(
    (
      await save(alice, {
        staffId: 2,
        version: initial.version,
        sessionIds: [1, 2],
      })
    ).status,
    400,
  );
  assert.equal(
    (await save(bob, { version: initial.version, sessionIds: [] })).status,
    409,
  );
  assert.deepEqual((await read(bob)).sessionIds, [2]);
  assert.equal(
    (await save(alice, { version: initial.version, sessionIds: [2, 1, 3] }))
      .status,
    204,
  );
  assert.equal(
    (await save(alice, { version: initial.version, sessionIds: [] })).status,
    409,
  );
  assert.deepEqual(
    (
      await db
        .prepare(
          `SELECT session_id,priority FROM staff_preferred_sessions WHERE staff_id=1 ORDER BY session_id`,
        )
        .all()
    ).results,
    [
      { session_id: 1, priority: 3 },
      { session_id: 2, priority: 1 },
      { session_id: 3, priority: 1 },
    ],
  );
  assert.equal(
    await db
      .prepare(
        "SELECT id FROM staff_preferred_sessions WHERE staff_id=1 AND session_id=1",
      )
      .first("id"),
    80,
  );
  // An administrator can change a session's staffing needs after an earlier selection.
  await db.prepare("UPDATE sessions SET required_staff=0 WHERE id=1").run();
  assert.equal(
    (
      await save(alice, {
        version: (await read(alice)).version,
        sessionIds: [1],
      })
    ).status,
    204,
  );
  assert.deepEqual((await read(bob)).sessionIds, [2]);
});

test("simultaneous submissions by different people succeed; concurrent edits to the same choices conflict", async (t) => {
  const { alice, bob, setWindow, read, save } = await fixture(t);
  await setWindow(open);
  const [first, second] = await Promise.all([read(alice), read(bob)]);
  assert.deepEqual(
    (
      await Promise.all([
        save(alice, { version: first.version, sessionIds: [1] }),
        save(bob, { version: second.version, sessionIds: [2] }),
      ])
    ).map((r) => r.status),
    [204, 204],
  );
  const { version } = await read(alice);
  const attempts = await Promise.all([
    save(alice, { version, sessionIds: [2] }),
    save(alice, { version, sessionIds: [] }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [204, 409]);
  assert.deepEqual(
    (await read(alice)).sessionIds,
    attempts[0].status === 204 ? [2] : [],
  );
  assert.deepEqual((await read(bob)).sessionIds, [2]);
});

test("if the deadline is reached during a save, D1 rolls back additions, removals and the revision together", async (t) => {
  const { db, alice, setWindow, read, save } = await fixture(t);
  await setWindow(open);
  await db
    .prepare(
      "INSERT INTO staff_preferred_sessions(staff_id,session_id,priority) VALUES(1,1,3)",
    )
    .run();
  const before = await read(alice);
  const revision = () =>
    db
      .prepare("SELECT version FROM scheduler_revision WHERE id=1")
      .first("version");
  const initialRevision = await revision();
  // Set the end of the window to the database clock between the mutation and the commit guard.
  await db
    .prepare(
      `CREATE TRIGGER close_during_save AFTER INSERT ON staff_preferred_sessions
    BEGIN UPDATE app_settings SET value=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE key='shift_preferences_close_at'; END`,
    )
    .run();
  assert.equal(
    (await save(alice, { version: before.version, sessionIds: [2] })).status,
    409,
  );
  assert.deepEqual(await read(alice), before);
  assert.equal(await revision(), initialRevision);
});

test("the same window governs the admin preference editor and profile replacement, independently of profile-only edits", async (t) => {
  const { env, admin, alice, setWindow, read } = await fixture(t);
  const profile = "/api/staffs/1";
  const child = profile + "/preferred-sessions";
  const post = (session: number) =>
    request(env, child, "POST", { session_id: session, priority: 2 }, admin);
  const remove = (id: number) =>
    request(env, child + "/" + id, "DELETE", undefined, admin);
  const edit = (body: unknown) => request(env, profile, "PUT", body, admin);
  // Preserve the existing admin-only workflow for events without a configured period.
  const original = await post(1);
  assert.equal(original.status, 201);
  const firstId = (await original.json<StaffPreferredSession>()).id;
  assert.equal((await remove(firstId)).status, 204);
  assert.equal((await setWindow(open)).status, 200);
  assert.equal((await post(2)).status, 201);
  assert.equal(
    (await edit({ preferred_sessions: [{ session_id: 1, priority: 3 }] }))
      .status,
    200,
  );
  const snapshot = await (
    await request(env, profile, "GET", undefined, admin)
  ).json<Staff>();
  const savedId = snapshot.preferred_sessions[0].id;
  assert.deepEqual((await read(alice)).sessionIds, [1]);
  for (const period of [
    { opensAt: "2998-01-01T00:00:00Z", closesAt: open.closesAt },
    { opensAt: open.opensAt, closesAt: "2001-01-01T00:00:00Z" },
  ]) {
    assert.equal((await setWindow(period)).status, 200);
    assert.equal((await post(2)).status, 409);
    assert.equal((await remove(savedId)).status, 409);
    assert.equal(
      (await edit({ name: "Blocked change", preferred_sessions: [] })).status,
      409,
    );
    const kept = await (
      await request(env, profile, "GET", undefined, admin)
    ).json<Staff>();
    assert.equal(kept.name, "Alice");
    assert.deepEqual(kept.preferred_sessions, snapshot.preferred_sessions);
  }
  assert.equal((await edit({ name: "Updated name" })).status, 200);
  const result = await (
    await request(env, profile, "GET", undefined, admin)
  ).json<Staff>();
  assert.equal(result.name, "Updated name");
  assert.deepEqual(result.preferred_sessions, snapshot.preferred_sessions);
});
