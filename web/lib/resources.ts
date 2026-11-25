import {
  check,
  HttpError,
  insert,
  write,
  view,
  settings,
  snapshot,
  type Bindings,
  type Row,
  type Table,
  type Schedule,
} from "./db";
import {
  plan,
  permittedRoles,
  conflicts,
  travelMinutes,
  overlapsAllHands,
} from "./assign";
import {
  getPreferenceWindow,
  preferenceWindowGuard,
} from "./shift-preferences";
import { participantRows } from "./visibility";
import type { Session } from "./types";
export const columns = {
  rooms: "name capacity floor",
  categories: "key label color order",
  session_groups: "label date order color",
  venue_maps: "title image order",
  sessions:
    "title description notes speaker speaker_kana speaker_photo speaker_org speaker_title speaker_profile start_time end_time room_id required_staff category english_required group_id",
  staffs:
    "name slack_name photo english_ok role max_hours experience_count emergency_contact",
  lt_talks:
    "title speaker speaker_kana speaker_org speaker_title speaker_photo start_time end_time order is_representative",
  staff_skills_v2: "skill",
  staff_preferred_sessions: "session_id priority",
  staff_blocked_sessions: "staff_id session_id",
  staff_availabilities: "start_time end_time",
  assignments: "session_id staff_id role",
  app_settings: "key value",
} as const;
export const readonlySettings = {
  app_title: "Event Scheduler",
  allow_overlap: "0",
  session_categories: "",
  custom_roles: "",
  category_role_links: "",
  group_role_links: "",
  travel_buffer_minutes: "10",
  timezone: "Asia/Tokyo",
};
export function fields(table: Table, body: Record<string, unknown>): Row {
  const row: Row = {};
  for (const key of columns[table].split(" ")) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "role" && Array.isArray(value))
      row.role = value.map(String).join(",");
    else if (
      ["english_ok", "english_required", "is_representative"].includes(key)
    )
      row[key] = [1, true, "1", "true", "on"].includes(value as string) ? 1 : 0;
    else if (key === "group_id" && (value === "" || value == null))
      row[key] = null;
    else if (
      [
        "capacity",
        "floor",
        "order",
        "room_id",
        "required_staff",
        "group_id",
        "max_hours",
        "experience_count",
        "session_id",
        "staff_id",
        "priority",
      ].includes(key)
    ) {
      check(
        value !== "" && Number.isSafeInteger(Number(value)),
        "数値を確認してください",
      );
      row[key] = Number(value);
    } else {
      check(typeof value === "string", "文字列を入力してください");
      row[key] = value;
    }
  }
  return row;
}
export function update(db: D1Database, table: Table, id: number, values: Row) {
  const entries = Object.entries(values);
  check(entries.length, "変更項目がありません");
  return db
    .prepare(
      "UPDATE " +
        table +
        " SET " +
        entries.map(([k]) => '"' + k + '"=?').join(",") +
        " WHERE id=?",
    )
    .bind(...Object.values(values), id);
}
const names: Record<string, Table> = {
  rooms: "rooms",
  sessions: "sessions",
  staffs: "staffs",
  categories: "categories",
  "session-groups": "session_groups",
  "venue-maps": "venue_maps",
  assignments: "assignments",
};
export async function bodyOf(req: Request): Promise<Record<string, any>> {
  if (req.headers.get("content-type")?.includes("application/json"))
    return await req.json();
  return Object.fromEntries(await req.formData());
}
export async function upload(storage: R2Bucket, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  check(
    ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext),
    "画像形式が不正です",
  );
  const key = "uploads/" + crypto.randomUUID() + "." + ext;
  await storage.put(key, file.stream(), {
    httpMetadata: { contentType: "image/" + (ext === "jpg" ? "jpeg" : ext) },
  });
  return "/" + key;
}
export function durationRange(r: Row) {
  check(
    typeof r.start_time === "string" &&
      typeof r.end_time === "string" &&
      Date.parse(r.start_time) < Date.parse(r.end_time),
    "開始時刻と終了時刻を確認してください",
  );
}
function summaries(data: Schedule) {
  const staff = new Map(data.staffs.map((s) => [s.id, s]));
  return data.sessions.map((session) => ({
    session,
    assigned_staff: data.assignments
      .filter((a) => a.session_id === session.id)
      .map((a) => {
        const { preferred_sessions, availabilities, ...brief } = staff.get(
          a.staff_id,
        )!;
        return { assignment_id: a.id, staff: brief };
      }),
  }));
}
const noContent = () => new Response(null, { status: 204 });
async function adminPreferenceGuard(db: D1Database) {
  const { status } = await getPreferenceWindow(db);
  check(
    status === "unconfigured" || status === "open",
    "希望の受付期間外です",
    409,
  );
  return preferenceWindowGuard(db, true);
}
export async function resources(
  req: Request,
  env: Bindings,
  path: string[],
  staffId?: number | null,
) {
  const [resource, part, sub, last, extra] = path,
    db = env.DB,
    method = req.method;
  check(
    !extra ||
      (resource === "sessions" &&
        sub === "lt-talks" &&
        extra === "photo" &&
        path.length === 5),
    "Not found",
    404,
  );
  const table = names[resource];
  check(table, "Not found", 404);
  const { rows, version, sequences } = await snapshot(db),
    data = view(staffId === undefined ? rows : participantRows(rows, staffId)),
    config = settings(rows.app_settings);
  const all: Record<string, unknown[]> = {
    rooms: data.rooms,
    sessions: data.sessions,
    staffs: data.staffs,
    categories: data.categories,
    "session-groups": data.groups,
    "venue-maps": data.maps,
    assignments: data.assignments,
  };
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status });
  if (resource === "assignments" && method === "GET" && !sub) {
    if (part === "schedule") return json({ schedule: summaries(data) });
    if (part === "staff-schedule")
      return json({
        staff_assignments: data.staffs.map((st) => {
          const { preferred_sessions, ...staff } = st;
          const assigned = new Set(
            data.assignments
              .filter((a) => a.staff_id === st.id)
              .map((a) => a.session_id),
          );
          return {
            staff,
            assigned_sessions: data.sessions
              .filter((s) => assigned.has(s.id))
              .map(
                ({
                  description,
                  notes,
                  lt_talks,
                  speaker_profile,
                  speaker_photo,
                  speaker_kana,
                  ...summary
                }) => summary,
              ),
          };
        }),
      });
    if (!part)
      return json(
        data.assignments.map((a) => ({
          ...a,
          staff: data.staffs.find((s) => s.id === a.staff_id),
          session: data.sessions.find((s) => s.id === a.session_id),
        })),
      );
  }
  if (
    resource === "assignments" &&
    part === "auto-assign" &&
    method === "POST"
  ) {
    const blocked = new Map<number, Set<number>>();
    for (const row of rows.staff_blocked_sessions) {
      const staff = Number(row.staff_id);
      const ids = blocked.get(staff) ?? new Set<number>();
      ids.add(Number(row.session_id));
      blocked.set(staff, ids);
    }
    const result = plan(data, config, await bodyOf(req), blocked);
    const changes = result.remove.map((id) =>
      db.prepare("DELETE FROM assignments WHERE session_id=?").bind(id),
    );
    await write(db, version, [
      ...changes,
      ...result.added.map((a) => insert(db, "assignments", a)),
    ]);
    return json(result.report);
  }
  if (
    resource === "sessions" &&
    part === "calc-required-staff" &&
    method === "POST"
  ) {
    const times = data.sessions.flatMap((s) => [
      Date.parse(s.start_time),
      Date.parse(s.end_time),
    ]);
    const peak = (rest: number) =>
      Math.max(
        0,
        ...times.map((t) =>
          data.sessions.reduce(
            (n, s) =>
              n +
              (Date.parse(s.start_time) <= t &&
              Date.parse(s.end_time) + rest > t
                ? Math.max(0, s.required_staff)
                : 0),
            0,
          ),
        ),
      );
    return json({
      results: data.sessions.map((s) => ({
        session_id: s.id,
        title: s.title,
        required_staff: s.required_staff,
      })),
      min_total_staff: peak(0),
      comfortable_total_staff: peak(1800000),
      message: "必要人数を算出しました",
    });
  }
  const id = Number(part);
  const record = part ? rows[table].find((r) => r.id === id) : undefined;
  if (part) check(record, "Not found", 404);
  if (resource === "staffs" && sub === "blocked-sessions" && !last) {
    check(staffId === undefined, "管理者権限が必要です", 403);
    const current = rows.staff_blocked_sessions
      .filter((row) => row.staff_id === id)
      .map((row) => Number(row.session_id))
      .sort((a, b) => a - b);
    if (method === "GET") return json({ sessionIds: current });
    check(method === "PUT", "Method not allowed", 405);
    const body = await bodyOf(req);
    const sessionIds: unknown = body?.sessionIds;
    check(
      Array.isArray(sessionIds) &&
        sessionIds.every((v) => Number.isSafeInteger(v) && v > 0),
      "セッションの選択を確認してください",
    );
    if (body.previousSessionIds !== undefined) {
      const previous: unknown = body.previousSessionIds;
      check(
        Array.isArray(previous) &&
          previous.every((v) => Number.isSafeInteger(v) && v > 0),
        "変更前のセッションを確認してください",
      );
      const expected = new Set(previous);
      check(
        current.length === expected.size &&
          current.every((v) => expected.has(v)),
        "配置制限が更新されています。再読み込みしてから変更してください",
        409,
      );
    }
    const selected = new Set<number>(sessionIds);
    const assignable = new Set(
      data.sessions.filter((s) => s.required_staff > 0).map((s) => s.id),
    );
    check(
      [...selected].every((v) => assignable.has(v)),
      "個別に配置するセッションを選択してください",
    );
    check(
      !data.assignments.some(
        (a) => a.staff_id === id && selected.has(a.session_id),
      ),
      "選択したセッションに配置済みです。先にその配置を解除してください",
      409,
    );
    await write(db, version, [
      db
        .prepare("DELETE FROM staff_blocked_sessions WHERE staff_id=?")
        .bind(id),
      db
        .prepare(
          "INSERT INTO staff_blocked_sessions(staff_id,session_id) SELECT ?, value FROM json_each(?)",
        )
        .bind(id, JSON.stringify([...selected])),
    ]);
    return noContent();
  }
  if (!sub && method === "GET") {
    const items = all[resource] as { id: number; order?: number }[];
    if (["categories", "session-groups", "venue-maps"].includes(resource))
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return json(part ? items.find((r) => r.id === id) : items);
  }
  const changes: D1PreparedStatement[] = [];
  const body = method === "DELETE" || method === "GET" ? {} : await bodyOf(req);
  if (
    resource === "staffs" &&
    (sub === "preferred-sessions" || sub === "availabilities")
  ) {
    const child =
      sub === "availabilities"
        ? "staff_availabilities"
        : "staff_preferred_sessions";
    const guards =
      child === "staff_preferred_sessions"
        ? [await adminPreferenceGuard(db)]
        : [];
    if (method === "DELETE" && last) {
      check(
        rows[child].some((r) => r.id === Number(last) && r.staff_id === id),
        "Not found",
        404,
      );
      await write(db, version, [
        db
          .prepare("DELETE FROM " + child + " WHERE staff_id=? AND id=?")
          .bind(id, Number(last)),
        ...guards,
      ]);
      return noContent();
    }
    check(method === "POST" && !last, "Method not allowed", 405);
    const values = fields(child, body);
    if (child === "staff_availabilities") durationRange(values);
    if (child === "staff_preferred_sessions")
      check(
        !rows[child].some(
          (p) => p.staff_id === id && p.session_id === values.session_id,
        ),
        "このセッションは希望に登録済みです",
        409,
      );
    const result = await write(db, version, [
      insert(db, child, { ...values, staff_id: id }),
      ...guards,
    ]);
    return json({ ...values, id: result[1].meta.last_row_id }, 201);
  }
  if (resource === "sessions" && sub === "lt-talks" && !last) {
    if (method === "GET")
      return json(data.sessions.find((s) => s.id === id)!.lt_talks);
    check(
      method === "PUT" && Array.isArray(body),
      "トーク一覧を指定してください",
    );
    await write(db, version, [
      db.prepare("DELETE FROM lt_talks WHERE session_id=?").bind(id),
      update(db, "sessions", id, {
        speaker: body.filter((t) => t.is_representative).at(-1)?.speaker ?? "",
      }),
      ...body.map((t, i) =>
        insert(db, "lt_talks", {
          ...fields("lt_talks", t),
          order: t.order ?? i,
          session_id: id,
        }),
      ),
    ]);
    return json(
      (
        await db
          .prepare('SELECT * FROM lt_talks WHERE session_id=? ORDER BY "order"')
          .bind(id)
          .all()
      ).results,
    );
  }
  if (
    (resource === "staffs" && sub === "photo" && !last) ||
    (resource === "sessions" && sub === "lt-talks" && extra === "photo")
  ) {
    const child = resource === "staffs" ? "staffs" : "lt_talks",
      target = child === "staffs" ? id : Number(last),
      key = child === "staffs" ? "photo" : "speaker_photo";
    check(
      child === "staffs" ||
        rows.lt_talks.some((r) => r.id === target && r.session_id === id),
      "Not found",
      404,
    );
    check(
      method === "POST" || (child === "staffs" && method === "DELETE"),
      "Method not allowed",
      405,
    );
    check(method === "DELETE" || body.photo instanceof File, "画像が必要です");
    const photo =
      method === "DELETE" ? "" : await upload(env.STORAGE, body.photo);
    await write(db, version, [update(db, child, target, { [key]: photo })]);
    if (method === "DELETE") return noContent();
    return json(
      child === "staffs"
        ? { ...data.staffs.find((s) => s.id === id), photo }
        : {
            ...rows.lt_talks.find((t) => t.id === target),
            speaker_photo: photo,
          },
    );
  }
  if (sub)
    check(
      resource === "sessions" &&
        method === "PATCH" &&
        ["move", "required-staff"].includes(sub) &&
        !last,
      "Not found",
      404,
    );
  if (method === "DELETE") {
    if (!part) {
      check(resource === "assignments", "Method not allowed", 405);
      changes.push(db.prepare("DELETE FROM assignments"));
    } else {
      if (resource === "rooms")
        check(record!.name !== "全体", "全体は削除できません");
      if (resource === "categories")
        check(
          !data.sessions.some((s) => s.category === record!.key),
          "使用中のカテゴリです",
        );
      if (resource === "session-groups")
        changes.push(
          db.prepare("DELETE FROM sessions WHERE group_id=?").bind(id),
        );
      changes.push(db.prepare("DELETE FROM " + table + " WHERE id=?").bind(id));
    }
    await write(db, version, changes);
    return noContent();
  }
  check(
    part ? method === "PUT" || (method === "PATCH" && sub) : method === "POST",
    "Method not allowed",
    405,
  );
  if (sub) {
    const allowed =
      sub === "move"
        ? ["start_time", "end_time", "room_id"]
        : ["required_staff"];
    check(
      allowed.every((k) => body[k] != null) &&
        Object.keys(body).every((k) => allowed.includes(k)),
      "変更項目を確認してください",
    );
  }
  const mediaKey =
    table === "sessions"
      ? "speaker_photo"
      : table === "venue_maps"
        ? "image"
        : null;
  if (mediaKey && body[mediaKey] instanceof File)
    body[mediaKey] = await upload(env.STORAGE, body[mediaKey]);
  const values = fields(table, body);
  const merged = { ...record, ...values };
  if (table === "rooms")
    check(
      merged.name && merged.name !== "全体" && record?.name !== "全体",
      "この部屋名は使用できません",
    );
  if (table === "categories" && !merged.key) {
    let suffix = 1;
    while (data.categories.some((c) => c.key === "cat_" + suffix)) suffix++;
    values.key = "cat_" + suffix;
  }
  if (
    ["categories", "session_groups"].includes(table) &&
    values.order != null &&
    values.order !== record?.order
  )
    changes.push(
      db
        .prepare(
          "UPDATE " +
            table +
            ' SET "order"="order"+1 WHERE "order">=? AND id!=?',
        )
        .bind(values.order, id || 0),
    );
  if (table === "sessions") {
    durationRange(merged);
    if (record && Number(merged.required_staff) <= 0)
      check(
        !rows.staff_blocked_sessions.some((r) => r.session_id === id),
        "個別配置を終了する前に、このセッションの配置制限を解除してください",
        409,
      );
    const timeChanged =
      !record ||
      merged.start_time !== record.start_time ||
      merged.end_time !== record.end_time;
    const edited = {
      ...merged,
      required_staff: Number(merged.required_staff ?? 1),
    } as unknown as Session;
    if (timeChanged || merged.required_staff !== record?.required_staff) {
      const assignedSessions = new Set(
        data.assignments.map((a) => a.session_id),
      );
      if (edited.required_staff === -1)
        check(
          !data.sessions.some(
            (s) =>
              s.id !== id &&
              assignedSessions.has(s.id) &&
              overlapsAllHands(s, [edited]),
          ),
          "すでに個別シフトが入っています。配置または全員参加の時間を変更してください",
          409,
        );
      else if (assignedSessions.has(id))
        check(
          !overlapsAllHands(
            edited,
            data.sessions.filter((s) => s.id !== id),
          ),
          "全員参加の時間には個別シフトを入れられません",
          409,
        );
    }
    if (
      record &&
      (timeChanged || merged.room_id !== record.room_id) &&
      config.allow_overlap !== "1" &&
      edited.required_staff !== -1
    ) {
      const assigned = new Set(
        data.assignments
          .filter((a) => a.session_id === id)
          .map((a) => a.staff_id),
      );
      for (const a of data.assignments.filter(
        (a) => a.session_id !== id && assigned.has(a.staff_id),
      )) {
        const other = data.sessions.find((s) => s.id === a.session_id)!;
        check(
          other.required_staff === -1 ||
            !conflicts(edited, other, travelMinutes(config)),
          "時間が重複するか移動時間が不足しています",
        );
      }
    }
  }
  if (table === "assignments") {
    const s = data.sessions.find((s) => s.id === merged.session_id),
      st = data.staffs.find((st) => st.id === merged.staff_id);
    check(s && st, "セッションまたはスタッフが見つかりません", 404);
    check(
      !overlapsAllHands(s, data.sessions),
      "全員参加の時間には個別シフトを入れられません",
      409,
    );
    check(
      !rows.staff_blocked_sessions.some(
        (r) => r.staff_id === st.id && r.session_id === s.id,
      ),
      "このスタッフには、このセッションの配置制限があります",
      409,
    );
    check(
      s.category === "overall" ||
        st.role.some((r) => permittedRoles(data, s, config).includes(r)),
      "担当ロールが一致しません",
    );
    for (const a of data.assignments.filter(
      (a) => a.staff_id === st.id && a.id !== record?.id,
    )) {
      check(a.session_id !== s.id, "配置済みです");
      const other = data.sessions.find((x) => x.id === a.session_id)!;
      if (
        config.allow_overlap !== "1" &&
        s.required_staff !== -1 &&
        other.required_staff !== -1
      )
        check(
          !conflicts(s, other, travelMinutes(config)),
          "時間または移動時間が重複します",
        );
    }
  }
  // The revision check serializes allocations based on this snapshot. Child rows
  // can reference the new ID in the same atomic batch, including a staff's preferences.
  const target = record ? id : (sequences[table] ?? 0) + 1;
  if (!record) changes.push(insert(db, table, { ...values, id: target }));
  else if (Object.keys(values).length)
    changes.push(update(db, table, id, values));
  if (table === "staffs") {
    for (const [key, child] of [
      ["skills", "staff_skills_v2"],
      ["availabilities", "staff_availabilities"],
      ["preferred_sessions", "staff_preferred_sessions"],
    ] as const) {
      if (!Array.isArray(body[key])) continue;
      if (key === "preferred_sessions") {
        const ids = body[key].map((p: Row) => Number(p.session_id));
        check(
          new Set(ids).size === ids.length,
          "希望セッションが重複しています",
        );
      }
      changes.push(
        db.prepare("DELETE FROM " + child + " WHERE staff_id=?").bind(target),
      );
      for (const item of body[key]) {
        const row =
          key === "skills"
            ? { skill: String(item.skill ?? item) }
            : fields(child, item);
        if (key === "availabilities") durationRange(row);
        changes.push(insert(db, child, { ...row, staff_id: target }));
      }
    }
  }
  check(changes.length, "変更項目がありません");
  if (table === "staffs" && Array.isArray(body.preferred_sessions))
    changes.push(await adminPreferenceGuard(db));
  await write(db, version, changes);
  const fresh = view((await snapshot(db)).rows);
  const lists: Record<string, { id: number }[]> = {
    rooms: fresh.rooms,
    staffs: fresh.staffs,
    sessions: fresh.sessions,
    categories: fresh.categories,
    "session-groups": fresh.groups,
    "venue-maps": fresh.maps,
    assignments: fresh.assignments,
  };
  return json(
    lists[resource].find((v) => v.id === target),
    record ? 200 : 201,
  );
}
