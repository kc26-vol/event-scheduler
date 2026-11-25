import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { handle } from "../lib/api";
import { snapshot } from "../lib/db";
import { loginFixture, origin, request, scheduler } from "./scheduler-fixture";

const time = (hhmm: string) => "2026-08-01T" + hhmm;
const session = (
  title: string,
  start: string,
  end: string,
  room_id = 2,
  required_staff = 1,
) => ({
  title,
  speaker: "",
  start_time: time(start),
  end_time: time(end),
  room_id,
  required_staff,
});

async function setup(t: TestContext) {
  const env = await scheduler(t);
  const db = env.DB;
  await db.batch([
    db.prepare(
      "INSERT INTO rooms(id,name,capacity) VALUES(1,'Main',80),(2,'Side',20)",
    ),
    db.prepare("INSERT INTO staffs(id,name,role) VALUES(1,'Helper','session')"),
    db.prepare(
      "INSERT INTO login_accounts(email,role) VALUES('manager@example.test','admin')",
    ),
    db.prepare(
      "INSERT INTO app_settings(key,value) VALUES('allow_overlap','1')",
    ),
  ]);
  const cookie = await loginFixture(db, "manager@example.test");
  const admin = (path: string, method = "GET", body?: unknown) =>
    request(env, path, method, body, cookie);
  const create = async (body: ReturnType<typeof session>) => {
    const response = await admin("/api/sessions", "POST", body);
    assert.equal(response.status, 201);
    return ((await response.json()) as { id: number }).id;
  };
  const allHands = await create(session("Briefing", "10:00", "11:00", 1, -1));
  const before = await create(session("Registration", "09:00", "10:00"));
  const after = await create(session("Door duty", "11:00", "12:00"));
  const assign = (session_id: number) =>
    admin("/api/assignments", "POST", { staff_id: 1, session_id });
  return { env, cookie, admin, create, assign, allHands, before, after };
}

test("manual assignments and moves must respect all-hands times, even with overlap enabled", async (t) => {
  const { env, admin, create, assign, before, after } = await setup(t);
  const during = await create(session("Other room setup", "10:30", "11:30"));
  assert.equal((await assign(before)).status, 201);
  const later = await assign(after);
  assert.equal(later.status, 201);
  const { id } = (await later.json()) as { id: number };
  const previous = await snapshot(env.DB);
  assert.equal((await assign(during)).status, 409);
  assert.equal(
    (await admin("/api/assignments/" + id, "PUT", { session_id: during }))
      .status,
    409,
  );
  assert.deepEqual(await snapshot(env.DB), previous);
});

test("creating, moving or converting an all-hands event cannot overlap an existing individual assignment", async (t) => {
  const { env, admin, create, assign, allHands, after } = await setup(t);
  assert.equal((await assign(after)).status, 201);
  const convertible = await create(session("Planning", "11:05", "11:30"));
  const previous = await snapshot(env.DB);
  const edits = [
    ["/api/sessions", "POST", session("New briefing", "11:45", "12:45", 1, -1)],
    [
      "/api/sessions/" + convertible + "/required-staff",
      "PATCH",
      { required_staff: -1 },
    ],
    [
      "/api/sessions/" + allHands + "/move",
      "PATCH",
      { start_time: time("10:30"), end_time: time("11:30"), room_id: 1 },
    ],
    ["/api/sessions/" + allHands, "PUT", { end_time: time("11:01") }],
    [
      "/api/sessions/" + after + "/move",
      "PATCH",
      { start_time: time("10:59"), end_time: time("12:00"), room_id: 2 },
    ],
    ["/api/sessions/" + after, "PUT", { start_time: time("10:59") }],
  ] as const;
  for (const [path, method, body] of edits) {
    assert.equal(
      (await admin(path, method, body)).status,
      409,
      method + " " + path,
    );
    assert.deepEqual(await snapshot(env.DB), previous, path);
  }
  const following = await admin(
    "/api/sessions",
    "POST",
    session("Debrief", "12:00", "12:15", 1, -1),
  );
  assert.equal(following.status, 201);
});

test("restoring an archive with an assignment during an all-hands event preserves the active event", async (t) => {
  const { env, cookie, admin, assign, after } = await setup(t);
  assert.equal((await assign(after)).status, 201);
  const previous = await snapshot(env.DB);
  const archive = await admin("/api/export/backup");
  assert.equal(archive.status, 200);
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const data = JSON.parse(strFromU8(files["data.json"]));
  const assignedSession = data.sessions.find(
    (s: { id: number }) => s.id === after,
  );
  assignedSession.start_time = time("10:59");
  files["data.json"] = strToU8(JSON.stringify(data));
  const body = new FormData();
  body.set(
    "file",
    new File([new Uint8Array(zipSync(files)).buffer], "conflict.zip"),
  );
  const response = await handle(
    new Request(origin + "/api/export/restore", {
      method: "POST",
      headers: { cookie, origin },
      body,
    }),
    env,
    ["api", "export", "restore"],
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await snapshot(env.DB), previous);
});
