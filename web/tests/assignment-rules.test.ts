import assert from "node:assert/strict";
import test from "node:test";
import { plan } from "../lib/assign";
import { tables, view, type Row, type Rows } from "../lib/db";

const date = "2030-05-10";
const options = { target_date: date };
const at = (time: string) => date + "T" + time;
function session(id: number, start: string, end: string, changes: Row = {}) {
  return {
    id,
    title: "Session " + id,
    start_time: at(start),
    end_time: at(end),
    required_staff: 1,
    room_id: 1,
    category: "session",
    ...changes,
  };
}
function staff(id: number, changes: Row = {}) {
  return { id, role: "session", max_hours: 8, experience_count: 0, ...changes };
}
function assignment(session_id: number, staff_id: number) {
  return { id: session_id, session_id, staff_id, role: "session" };
}
function schedule(sessions: Row[], staffs: Row[], rest: Partial<Rows> = {}) {
  const rows = Object.fromEntries(tables.map((t) => [t, [] as Row[]])) as Rows;
  return view({ ...rows, sessions, staffs, ...rest });
}

test("replacement retains manual assignments on skipped sessions and respects their conflicts", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00", { category: "overall" }),
      session(2, "09:15", "09:45", { required_staff: 0 }),
      session(3, "13:00", "14:00", { required_staff: -1 }),
      session(4, "09:30", "10:30"),
    ],
    [staff(1), staff(2)],
    {
      assignments: [assignment(1, 1), assignment(2, 2), assignment(3, 1)],
    },
  );
  const result = plan(data, {}, options);
  assert.deepEqual(result.remove, [4]);
  assert.deepEqual(result.added, []);
  assert.equal(result.report.skipped_sessions, 3);
  assert.equal(result.report.understaffed[0].session_id, 4);

  const skipped = plan(data, {}, { session_ids: [1, 2, 3] });
  assert.deepEqual(skipped.remove, []);
  assert.equal(skipped.report.target_date, date);
  assert.equal(skipped.report.required_slots, 0);
});

test("fill-only keeps existing staff, fills each opening once, and is idempotent", () => {
  const data = schedule(
    [session(1, "09:00", "10:00", { required_staff: 2 })],
    [staff(1), staff(2), staff(3)],
    {
      assignments: [assignment(1, 2)],
    },
  );
  const fill = { ...options, fill_only: true };
  const result = plan(data, {}, fill);
  assert.deepEqual(result.remove, []);
  assert.deepEqual(
    result.added.map((a) => a.staff_id),
    [1],
  );
  data.assignments.push({ ...result.added[0], id: 2 });
  assert.deepEqual(plan(data, {}, fill).added, []);
});

test("ranking honors the highest-priority eligible preference, including linked roles", () => {
  const data = schedule(
    [session(1, "09:00", "10:00", { category: "desk" })],
    [staff(1), staff(2, { role: "desk" }), staff(3, { role: "runner" })],
    {
      categories: [{ id: 1, key: "desk" }],
      staff_preferred_sessions: [
        { staff_id: 1, session_id: 1, priority: 1 },
        { staff_id: 2, session_id: 1, priority: 3 },
        { staff_id: 3, session_id: 1, priority: 1 },
      ],
    },
  );
  const config = { category_role_links: JSON.stringify({ desk: ["runner"] }) };
  assert.equal(plan(data, config, options).added[0].staff_id, 3);
  const blocked = new Map([[3, new Set([1])]]);
  assert.equal(plan(data, config, options, blocked).added[0].staff_id, 2);
});

test("availability must cover the whole shift and day limits reset on a new day", () => {
  const data = schedule(
    [
      session(1, "10:00", "11:00"),
      session(2, "11:00", "11:30"),
      session(3, "10:00", "11:00", {
        start_time: "2030-05-09T10:00",
        end_time: "2030-05-09T11:00",
      }),
    ],
    [staff(1), staff(2, { max_hours: 1 })],
    {
      assignments: [assignment(3, 2)],
      staff_availabilities: [
        { staff_id: 1, start_time: at("10:00"), end_time: at("10:59") },
        { staff_id: 2, start_time: at("10:00"), end_time: at("11:30") },
      ],
    },
  );
  const result = plan(data, {}, options);
  assert.deepEqual(result.remove, [1, 2]);
  assert.deepEqual(result.added, [
    { session_id: 1, staff_id: 2, role: "session" },
  ]);
  assert.equal(result.report.understaffed[0].session_id, 2);
});

test("legacy lower-ranked preferences retain priority over unrequested shifts", () => {
  const data = schedule(
    [session(1, "09:00", "10:00")],
    [staff(1), staff(2), staff(3)],
    {
      staff_preferred_sessions: [
        { staff_id: 2, session_id: 1, priority: 7 },
        { staff_id: 3, session_id: 1, priority: 6 },
      ],
    },
  );
  assert.equal(plan(data, {}, options).added[0].staff_id, 3);
});

test("a shift ending exactly at the daily cap still fits after partial-hour shifts", () => {
  const data = schedule(
    [
      session(1, "09:00", "09:30"),
      session(2, "09:30", "10:05"),
      session(3, "10:05", "10:25"),
      session(4, "10:25", "11:00"),
      session(5, "11:00", "11:01"),
    ],
    [staff(1, { max_hours: 2 })],
  );
  const result = plan(data, {}, options);
  assert.deepEqual(
    result.added.map((a) => a.session_id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    result.report.understaffed.map((s) => s.session_id),
    [5],
  );
});

test("room changes need the full travel buffer even when the saved setting is invalid", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00"),
      session(2, "09:50", "10:00", { room_id: 2 }),
      session(3, "10:09", "10:10", { room_id: 2 }),
      session(4, "10:10", "11:00", { room_id: 2 }),
      session(5, "11:00", "11:30", { room_id: 2 }),
    ],
    [staff(1)],
    { assignments: [assignment(1, 1)] },
  );
  const targets = { session_ids: [2, 3, 4, 5] };
  for (const value of ["10", "invalid", ""]) {
    const result = plan(data, { travel_buffer_minutes: value }, targets);
    assert.deepEqual(
      result.added.map((a) => a.session_id),
      [4, 5],
      value,
    );
  }
  const fiveMinutes = plan(data, { travel_buffer_minutes: "5" }, targets);
  assert.deepEqual(
    fiveMinutes.added.map((a) => a.session_id),
    [3, 4, 5],
  );
});

test("experience-balancing swaps respect exclusions in both directions", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00", { required_staff: 2 }),
      session(2, "09:00", "10:00", { required_staff: 2 }),
    ],
    [
      staff(1, { experience_count: 1 }),
      staff(2, { experience_count: 1 }),
      staff(3),
      staff(4),
    ],
  );
  const teams = (blocked: Map<number, Set<number>>) =>
    plan(data, {}, options, blocked).added.map((a) => a.staff_id);
  assert.deepEqual(teams(new Map()), [3, 2, 1, 4]);
  assert.deepEqual(
    teams(
      new Map([
        [1, new Set([2])],
        [2, new Set([2])],
      ]),
    ),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    teams(
      new Map([
        [3, new Set([1])],
        [4, new Set([1])],
      ]),
    ),
    [1, 2, 3, 4],
  );
});

test("a newly planned general duty can be refilled to release the only qualified specialist", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00"),
      session(2, "09:15", "10:15", { category: "desk" }),
    ],
    [staff(1, { role: "session,desk" }), staff(2)],
    {
      categories: [{ id: 1, key: "desk" }],
    },
  );
  const fill = { ...options, fill_only: true };
  const result = plan(data, {}, fill);
  assert.deepEqual(result.report.understaffed, []);
  assert.deepEqual(result.added, [
    { session_id: 1, staff_id: 2, role: "session" },
    { session_id: 2, staff_id: 1, role: "desk" },
  ]);
  const noReplacement = plan(data, {}, fill, new Map([[2, new Set([1])]]));
  assert.equal(noReplacement.report.understaffed.length, 1);
  assert.deepEqual(
    noReplacement.added.map((a) => a.staff_id),
    [1],
  );

  data.assignments = [assignment(1, 1)];
  const manual = plan(data, {}, fill);
  assert.deepEqual(manual.added, []);
  assert.equal(manual.report.understaffed[0].session_id, 2);
});

test("a novice cannot replace their own mentor during the training session", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00", { required_staff: 2 }),
      session(2, "09:00", "10:00", { required_staff: 2 }),
    ],
    [staff(1, { experience_count: 1 }), staff(2), staff(3), staff(4)],
    {
      staff_preferred_sessions: [1, 2, 3, 4].map((id) => ({
        staff_id: id,
        session_id: id <= 2 ? 1 : 2,
        priority: 1,
      })),
    },
  );
  assert.deepEqual(
    plan(data, {}, options).added.map((a) => a.staff_id),
    [1, 2, 3, 4],
  );
});

test("all-hands reserves every staff member, with exact boundaries and no room-change buffer", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00", { required_staff: -1 }),
      session(2, "08:45", "09:00", { room_id: 2 }),
      session(3, "09:59", "10:15", { room_id: 2 }),
      session(4, "10:00", "10:15", { room_id: 2 }),
    ],
    [staff(1, { max_hours: 1 }), staff(2, { max_hours: 1 })],
    {
      assignments: [assignment(1, 1)],
    },
  );
  for (const fill_only of [false, true]) {
    const result = plan(data, {}, { session_ids: [2, 3, 4], fill_only });
    assert.deepEqual(
      result.report.understaffed.map((s) => s.session_id),
      [3],
    );
    assert.deepEqual(
      result.added.map((a) => a.session_id),
      [2, 4],
    );
  }
});

test("a retained individual duty overlapping all-hands must be explicitly resolved", () => {
  const data = schedule(
    [
      session(1, "09:00", "10:00", { required_staff: -1 }),
      session(2, "09:30", "11:00"),
      session(3, "12:00", "13:00"),
    ],
    [staff(1)],
    { assignments: [assignment(2, 1)] },
  );
  for (const opts of [{ ...options, fill_only: true }, { session_ids: [3] }]) {
    assert.throws(() => plan(data, {}, opts), { status: 409 });
  }
  const rebuilt = plan(data, {}, options);
  assert.deepEqual(rebuilt.remove, [2, 3]);
  assert.deepEqual(
    rebuilt.added.map((a) => a.session_id),
    [3],
  );
  assert.equal(rebuilt.report.understaffed[0].session_id, 2);
});

test("64 generated events satisfy assignment constraints in both fill and rebuild modes", () => {
  const clock = (minutes: number) =>
    new Date(Date.UTC(2030, 4, 10, 9, minutes)).toISOString().slice(11, 16);
  for (let seed = 1; seed <= 64; seed++) {
    let state = seed * 104729;
    const random = (limit: number) => {
      state = (state * 48271) % 2147483647;
      return Math.floor((state / 2147483647) * limit);
    };
    const travel = random(4) * 5;
    const breakStart = 60 + random(8) * 5;
    const allHands = session(2, clock(breakStart), clock(breakStart + 15), {
      required_staff: -1,
    });
    const sessions = [session(1, "09:00", "09:20"), allHands];
    for (let id = 3; id <= 14; id++) {
      const start = random(36) * 5;
      sessions.push(
        session(id, clock(start), clock(start + (1 + random(6)) * 10), {
          room_id: 1 + random(3),
          required_staff: 1 + random(3),
          category: random(2) === 0 ? "desk" : "session",
        }),
      );
    }
    const staffs = Array.from({ length: 7 }, (_, i) =>
      staff(i + 1, {
        role:
          i === 0
            ? "session,desk"
            : ["session", "desk", "session,desk"][random(3)],
        max_hours: (1 + random(5)) / 2,
        experience_count: random(3) === 0 ? 1 : 0,
      }),
    );
    const data = schedule(sessions, staffs, {
      categories: [{ id: 1, key: "desk" }],
      assignments: [assignment(1, 1)],
      staff_availabilities: staffs.map((st) => ({
        staff_id: st.id,
        start_time: at(clock(st.id === 1 ? 0 : random(10) * 5)),
        end_time: at(clock(90 + random(26) * 5)),
      })),
      staff_preferred_sessions: staffs.map((st) => ({
        staff_id: st.id,
        session_id: 3 + random(12),
        priority: 1 + random(6),
      })),
    });
    const blocked = new Map(
      staffs.map((st) => [
        st.id,
        new Set(
          sessions.filter((s) => s.id >= 3 && random(6) === 0).map((s) => s.id),
        ),
      ]),
    );
    for (const fill_only of [true, false]) {
      const caseName = `seed ${seed}, fill_only=${fill_only}`;
      const result = plan(
        data,
        { travel_buffer_minutes: String(travel) },
        { ...options, fill_only },
        blocked,
      );
      if (fill_only) assert.deepEqual(result.remove, [], caseName);
      const final = [
        ...data.assignments.filter(
          (a) => !result.remove.includes(a.session_id),
        ),
        ...result.added,
      ];
      assert.equal(final.length, result.report.assigned_slots, caseName);
      assert.ok(final.length > 0, caseName);
      for (const s of data.sessions) {
        const count = final.filter((a) => a.session_id === s.id).length;
        assert.ok(count <= Math.max(0, s.required_staff), caseName);
      }
      for (const st of data.staffs) {
        const duties = final
          .filter((a) => a.staff_id === st.id)
          .map((a) => data.sessions.find((s) => s.id === a.session_id)!)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        let total = 0;
        for (const [i, s] of duties.entries()) {
          assert.ok(st.role.includes(s.category), caseName);
          assert.ok(!blocked.get(st.id)!.has(s.id), caseName);
          assert.ok(
            s.end_time <= allHands.start_time ||
              s.start_time >= allHands.end_time,
            caseName,
          );
          assert.ok(
            st.availabilities.some(
              (a) => a.start_time <= s.start_time && s.end_time <= a.end_time,
            ),
            caseName,
          );
          const start = Date.parse(s.start_time + "Z");
          if (i > 0) {
            const previous = duties[i - 1];
            const changeRoom = previous.room_id !== s.room_id;
            assert.ok(
              start >=
                Date.parse(previous.end_time + "Z") +
                  (changeRoom ? travel * 60_000 : 0),
              caseName,
            );
          }
          total += Date.parse(s.end_time + "Z") - start;
        }
        assert.ok(total <= st.max_hours * 3_600_000, caseName);
      }
    }
  }
});
