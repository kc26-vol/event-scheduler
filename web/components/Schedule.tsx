import type { Schedule } from "@/lib/db";
import type { Session } from "@/lib/types";
import { shortTime, staffFor } from "./client";

function team(data: Schedule, session: Session) {
  if (session.required_staff === -1) return "全員";
  return staffFor(data, session)
    .map((st) => st.name)
    .join("・");
}

export function Handoff({
  data,
  session,
}: {
  data: Schedule;
  session: Session;
}) {
  const nearby = data.sessions.filter(
    (s) =>
      s.id !== session.id && s.room_id === session.room_id && team(data, s),
  );
  function nearest(before: boolean) {
    const gaps = nearby
      .map((s) => ({
        s,
        gap: before
          ? Date.parse(session.start_time) - Date.parse(s.end_time)
          : Date.parse(s.start_time) - Date.parse(session.end_time),
      }))
      .filter(({ gap }) => gap >= 0 && gap <= 600000);
    const min = Math.min(...gaps.map(({ gap }) => gap));
    return gaps
      .filter(({ gap }) => gap === min)
      .map(({ s }) => s.title + "（" + team(data, s) + "）")
      .join(" / ");
  }
  const before = nearest(true),
    after = nearest(false);
  return (
    <>
      {before && <p>前の担当　{before}</p>}
      {after && <p>次の担当　{after}</p>}
    </>
  );
}

export function Timetable({
  data,
  sessions,
  open,
}: {
  data: Schedule;
  sessions: Session[];
  open: (s: Session) => void;
}) {
  const dates = [
    ...new Set(sessions.map((s) => s.start_time.slice(0, 10))),
  ].sort();
  return (
    <section className="timetable">
      <button className="light print" onClick={() => window.print()}>
        印刷
      </button>
      {dates.map((day) => {
        const items = sessions.filter((s) => s.start_time.startsWith(day));
        const rooms = data.rooms.filter((r) =>
          items.some((s) => s.room_id === r.id),
        );
        const times = [
          ...new Set(items.map((s) => shortTime(s.start_time))),
        ].sort();
        return (
          <div className="scrolltable" key={day}>
            <table>
              <caption>{day}</caption>
              <thead>
                <tr>
                  <th scope="col">開始</th>
                  {rooms.map((r) => (
                    <th scope="col" key={r.id}>
                      <a href={"/rooms/" + r.id + "/roster"}>{r.name}</a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t}>
                    <th scope="row">{t}</th>
                    {rooms.map((r) => (
                      <td key={r.id}>
                        {items
                          .filter(
                            (s) =>
                              s.room_id === r.id &&
                              shortTime(s.start_time) === t,
                          )
                          .map((s) => (
                            <button
                              className="entry"
                              key={s.id}
                              onClick={() => open(s)}
                            >
                              {s.title}
                              <small>
                                ～{shortTime(s.end_time)}　{team(data, s)}
                              </small>
                            </button>
                          ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
