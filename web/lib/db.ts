import type {
  Assignment,
  Category,
  Room,
  Session,
  SessionGroup,
  Staff,
  VenueMap,
  LTTalk,
} from "./types";

export interface Bindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  IMAGES?: ImagesBinding;
  GEOIP_ENABLED?: string;
  DEVELOPMENT_ROLE_SWITCH?: string;
  APP_ORIGIN?: string;
  AUTH_EMAIL_FROM?: string;
  MAILER?: {
    send(message: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
  };
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_API_KEY?: string;
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new HttpError(status, message);
}
export const tables = [
  "rooms",
  "session_groups",
  "categories",
  "staffs",
  "venue_maps",
  "sessions",
  "lt_talks",
  "staff_skills_v2",
  "staff_preferred_sessions",
  "staff_availabilities",
  "assignments",
  "app_settings",
] as const;
export type Table = (typeof tables)[number];
export type Row = Record<string, string | number | null>;
export type Rows = Record<Table, Row[]>;
export async function snapshot(db: D1Database) {
  const reads = tables.map((table) =>
    db.prepare("SELECT * FROM " + table + " ORDER BY rowid"),
  );
  const [rev, sequences, ...results] = await db.batch<Row>([
    db.prepare("SELECT version FROM scheduler_revision WHERE id=1"),
    db.prepare("SELECT name,seq FROM sqlite_sequence"),
    ...reads,
  ]);
  return {
    sequences: Object.fromEntries(
      sequences.results.map((r) => [r.name, Number(r.seq)]),
    ),
    version: Number(rev.results[0].version),
    rows: Object.fromEntries(
      tables.map((t, i) => [t, results[i].results]),
    ) as Rows,
  };
}
export function settings(rows: Row[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export function view(rows: Rows) {
  const rooms = rows.rooms as unknown as Room[];
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const sessions: Session[] = rows.sessions
    .map(
      (r) =>
        ({
          ...r,
          start_time: String(r.start_time).replace(" ", "T"),
          end_time: String(r.end_time).replace(" ", "T"),
          room: roomMap.get(Number(r.room_id)) ?? null,
          english_required: !!r.english_required,
          lt_talks: rows.lt_talks
            .filter((t) => t.session_id === r.id)
            .sort(
              (a, b) => Number(a.order) - Number(b.order),
            ) as unknown as LTTalk[],
        }) as Session,
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const bySession = new Map(sessions.map((s) => [s.id, s]));
  const staffs: Staff[] = rows.staffs.map(
    (r) =>
      ({
        ...r,
        emergency_contact: r.emergency_contact ?? "",
        role: String(r.role ?? "")
          .split(",")
          .filter(Boolean),
        english_ok: !!r.english_ok,
        skills: rows.staff_skills_v2.filter((v) => v.staff_id === r.id),
        preferred_sessions: rows.staff_preferred_sessions
          .filter((v) => v.staff_id === r.id)
          .map((p) => {
            const s = bySession.get(Number(p.session_id));
            return {
              ...p,
              session: s && {
                id: s.id,
                title: s.title,
                room_id: s.room_id,
                start_time: s.start_time,
                end_time: s.end_time,
                category: s.category,
              },
            };
          }),
        availabilities: rows.staff_availabilities.filter(
          (v) => v.staff_id === r.id,
        ),
      }) as unknown as Staff,
  );
  return {
    rooms,
    sessions,
    staffs,
    assignments: rows.assignments as unknown as Pick<
      Assignment,
      "id" | "session_id" | "staff_id" | "role"
    >[],
    groups: rows.session_groups as unknown as SessionGroup[],
    categories: rows.categories as unknown as Category[],
    maps: rows.venue_maps as unknown as VenueMap[],
  };
}
export type Schedule = ReturnType<typeof view>;
export function insert(db: D1Database, table: Table, values: Row) {
  // Callers supply literal column names or intersect input with the schema allowlist.
  const keys = Object.keys(values);
  return db
    .prepare(
      "INSERT INTO " +
        table +
        " (" +
        keys.map((k) => '"' + k + '"').join(",") +
        ") VALUES (" +
        keys.map(() => "?").join(",") +
        ")",
    )
    .bind(...Object.values(values));
}
export function putSetting(db: D1Database, k: string, v: string) {
  return db
    .prepare(
      "INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(k, v);
}
export async function write(
  db: D1Database,
  version: number,
  changes: D1PreparedStatement[],
) {
  // A stale reader sets -1, violating CHECK and rolling the entire D1 batch back.
  try {
    return await db.batch([
      db
        .prepare(
          "UPDATE scheduler_revision SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=1",
        )
        .bind(version),
      ...changes,
    ]);
  } catch (e) {
    const reason = String(e) + " " + String((e as Error).cause);
    if (/version >= 0/.test(reason))
      throw new HttpError(
        409,
        "他の人が更新しました。再読み込みしてください。",
      );
    if (/constraint/i.test(reason))
      throw new HttpError(400, "関連データまたは入力値を確認してください");
    throw e;
  }
}
