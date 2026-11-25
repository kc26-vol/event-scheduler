import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { view, settings, tables, type Rows } from "../lib/db";
import { plan } from "../lib/assign";

test(
  "day-by-day coverage and maximum hours on an existing event",
  { skip: !existsSync("../scheduler.db") },
  () => {
    const sql = new DatabaseSync("../scheduler.db", { readOnly: true });
    try {
      const rows = Object.fromEntries(
        tables.map((t) => [
          t,
          sql.prepare("SELECT * FROM " + t + " ORDER BY rowid").all(),
        ]),
      ) as Rows;
      const data = view(rows),
        config = settings(rows.app_settings);
      for (const day of new Set(
        data.sessions.map((s) => s.start_time.slice(0, 10)),
      )) {
        const result = plan(data, config, { target_date: day });
        assert.equal(result.report.understaffed.length, 0);
        data.assignments = data.assignments.filter(
          (a) => !result.remove.includes(a.session_id),
        );
        data.assignments.push(
          ...result.added.map((a, i) => ({ ...a, id: i + 1 })),
        );
        const times = new Map<number, number>();
        for (const a of result.added) {
          const s = data.sessions.find((s) => s.id === a.session_id)!;
          const sum =
            (times.get(a.staff_id) ?? 0) +
            (Date.parse(s.end_time) - Date.parse(s.start_time)) / 3600000;
          times.set(a.staff_id, sum);
          assert.ok(
            sum <= data.staffs.find((st) => st.id === a.staff_id)!.max_hours,
          );
        }
        const fill = plan(data, config, { target_date: day, fill_only: true });
        assert.deepEqual(fill.added, []);
      }
    } finally {
      sql.close();
    }
  },
);
