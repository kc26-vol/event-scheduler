import type { Rows } from "./db";

// Every other application screen requires an administrator.
export function participantPage(path: string) {
  return /^\/(?:|schedule|staff-detail|venue|help|staffs\/\d+|rooms\/\d+\/roster)$/.test(
    path,
  );
}

export function participantRead(path: string[]) {
  const route = path.join("/");
  return (
    /^(rooms|sessions|staffs|venue-maps|categories|session-groups|assignments)(?:\/\d+)?$/.test(
      route,
    ) ||
    /^assignments\/(schedule|staff-schedule)$/.test(route) ||
    /^sessions\/\d+\/lt-talks$/.test(route)
  );
}

// Apply before building any nested schedule or assignment response.
export function participantRows(rows: Rows, staffId: number | null): Rows {
  return {
    ...rows,
    app_settings: [],
    staff_blocked_sessions: [],
    sessions: rows.sessions.map(({ notes, ...session }) => session),
    staffs: rows.staffs.map((staff) =>
      staff.id === staffId
        ? staff
        : {
            id: staff.id,
            name: staff.name,
            photo: staff.photo,
            role: staff.role,
          },
    ),
    staff_skills_v2: rows.staff_skills_v2.filter((s) => s.staff_id === staffId),
    staff_preferred_sessions: rows.staff_preferred_sessions.filter(
      (s) => s.staff_id === staffId,
    ),
    staff_availabilities: rows.staff_availabilities.filter(
      (s) => s.staff_id === staffId,
    ),
  };
}
