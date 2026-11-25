import type { Schedule } from "@/lib/db";
import type { Session, Staff } from "@/lib/types";
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch(url, {
    method,
    headers:
      form || body === undefined ? {} : { "Content-Type": "application/json" },
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (r.status === 401) {
    location.assign("/login.html");
    throw Error("ログインが必要です");
  }
  if (!r.ok) {
    let detail = r.statusText;
    try {
      detail = ((await r.json()) as { detail: string }).detail || detail;
    } catch {}
    throw Error(detail);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}
export type Task = (
  operation: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>;
export const empty: Schedule = {
  sessions: [],
  rooms: [],
  staffs: [],
  categories: [],
  groups: [],
  maps: [],
  assignments: [],
};
export const shortTime = (s: string) => s.slice(11, 16);
export function staffFor(d: Schedule, s: Session) {
  const ids = new Set(
    d.assignments.filter((a) => a.session_id === s.id).map((a) => a.staff_id),
  );
  return d.staffs.filter((st) => ids.has(st.id));
}
export function sessionsFor(d: Schedule, st?: Staff) {
  if (!st) return [];
  const ids = new Set(
    d.assignments.filter((a) => a.staff_id === st.id).map((a) => a.session_id),
  );
  return d.sessions.filter((s) => ids.has(s.id) || s.required_staff === -1);
}
