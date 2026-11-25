import { check, type Schedule } from "./db";
import type { Session, Staff } from "./types";

type Pair = { session_id: number; staff_id: number; role: string };
type Options = {
  target_date?: string;
  session_ids?: number[];
  fill_only?: boolean;
};
const time = (date: string) =>
  Date.parse(
    date.replace(" ", "T") + (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(date) ? "" : "Z"),
  );
const duration = (s: Session) => time(s.end_time) - time(s.start_time);
const hours = (s: Session) => duration(s) / 3_600_000;
const day = (s: Session) => s.start_time.slice(0, 10);
export function travelMinutes(config: Record<string, string>) {
  const value = Number(config.travel_buffer_minutes?.trim() || 10);
  return Number.isFinite(value) ? Math.max(0, value) : 10;
}
export function conflicts(a: Session, b: Session, travel: number) {
  const gap = Math.max(
    time(a.start_time) - time(b.end_time),
    time(b.start_time) - time(a.end_time),
  );
  return gap < (a.room_id === b.room_id ? 0 : travel * 60_000);
}
export function overlapsAllHands(
  session: Session,
  sessions: readonly Session[],
) {
  return (
    session.required_staff !== -1 &&
    sessions.some(
      (other) =>
        other.id !== session.id &&
        other.required_staff === -1 &&
        conflicts(session, other, 0),
    )
  );
}
function preferenceScore(priority: number) {
  // Retain the original 100/80/60/40/20 scores, then taper lower ranks.
  return priority <= 5 ? 100 - (priority - 1) * 20 : 20 / (priority - 4);
}
export function permittedRoles(
  data: Schedule,
  session: Session,
  config: Record<string, string>,
) {
  const role = data.categories.some((c) => c.key === session.category)
    ? session.category
    : "session";
  const linked = (key: string, id: string) => {
    try {
      const roles = JSON.parse(config[key] || "{}")[id];
      return Array.isArray(roles) ? roles : [];
    } catch {
      return [];
    }
  };
  return [
    role,
    ...linked("category_role_links", role),
    ...linked("group_role_links", String(session.group_id)),
  ];
}
export function plan(
  data: Schedule,
  config: Record<string, string>,
  options: Options,
  blocked: ReadonlyMap<number, ReadonlySet<number>> = new Map(),
) {
  const ids = options.session_ids?.length ? new Set(options.session_ids) : null;
  const selected = data.sessions.filter(
    (s) =>
      (!ids || ids.has(s.id)) &&
      (!options.target_date || day(s) === options.target_date),
  );
  check(ids || options.target_date, "対象の日付を指定してください");
  check(
    selected.length && new Set(selected.map(day)).size === 1,
    "同じ日付のセッションを指定してください",
  );
  const targets = selected.filter(
    (s) => s.category !== "overall" && s.required_staff > 0,
  );
  const targetIds = new Set(targets.map((s) => s.id));
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const allHands = data.sessions.filter((s) => s.required_staff === -1);
  const reserved = new Set(
    data.sessions.filter((s) => overlapsAllHands(s, allHands)).map((s) => s.id),
  );
  const staff = new Map(data.staffs.map((s) => [s.id, s]));
  const existing = data.assignments.filter(
    (a) => options.fill_only || !targetIds.has(a.session_id),
  );
  const shifts = new Map(data.staffs.map((s) => [s.id, [] as Session[]]));
  const teams = new Map(data.sessions.map((s) => [s.id, [] as Staff[]]));
  function place(st: Staff, s: Session) {
    shifts.get(st.id)!.push(s);
    teams.get(s.id)!.push(st);
  }
  const targetDay = day(selected[0]);
  for (const a of existing) {
    const s = sessions.get(a.session_id)!;
    if (s.required_staff === -1) continue;
    check(
      day(s) !== targetDay || !reserved.has(s.id),
      `全員参加の時間と重なる担当「${s.title}」があります。先に担当を外すか、時間を変更してください。`,
      409,
    );
    place(staff.get(a.staff_id)!, s);
  }
  const travel = travelMinutes(config);
  function eligible(st: Staff, s: Session, ignore?: Session) {
    const duties = shifts.get(st.id)!.filter((v) => v !== ignore);
    return (
      !reserved.has(s.id) &&
      !blocked.get(st.id)?.has(s.id) &&
      st.role.some((r) => permittedRoles(data, s, config).includes(r)) &&
      (!st.availabilities.length ||
        st.availabilities.some(
          (v) =>
            time(v.start_time) <= time(s.start_time) &&
            time(v.end_time) >= time(s.end_time),
        )) &&
      duties
        .filter((d) => day(d) === day(s))
        .reduce((ms, d) => ms + duration(d), duration(s)) /
        3_600_000 <=
        st.max_hours &&
      !duties.some((d) => conflicts(s, d, travel))
    );
  }
  const trainedAt = new Map<number, number>();
  function experiencedAt(s: Session) {
    const start = time(s.start_time);
    return (st: Staff) =>
      st.experience_count > 0 || (trainedAt.get(st.id) ?? Infinity) <= start;
  }
  function refreshTraining() {
    trainedAt.clear();
    // The schedule view orders sessions by start. Only completed mentoring counts.
    for (const s of data.sessions) {
      const team = teams.get(s.id)!;
      if (team.length < 2 || !team.some(experiencedAt(s))) continue;
      const finish = time(s.end_time);
      for (const st of team) {
        if (st.experience_count === 0)
          trainedAt.set(
            st.id,
            Math.min(trainedAt.get(st.id) ?? Infinity, finish),
          );
      }
    }
  }
  refreshTraining();
  const pairs = new Map<string, number>();
  const pairKey = (a: number, b: number) =>
    [Math.min(a, b), Math.max(a, b)].join("-");
  function countPairs(team: Staff[], change = 1) {
    for (const [i, s] of team.entries())
      for (const other of team.slice(i + 1)) {
        const key = pairKey(s.id, other.id);
        pairs.set(key, (pairs.get(key) ?? 0) + change);
      }
  }
  for (const [id, team] of teams) if (!targetIds.has(id)) countPairs(team);
  const added: Pair[] = [];
  function bestAvailable(s: Session, team: Staff[], available: Staff[]) {
    const experienced = experiencedAt(s);
    function rank(st: Staff) {
      const duties = shifts.get(st.id)!;
      const today = duties.filter((v) => day(v) === day(s));
      const before = today
        .filter((v) => time(v.end_time) <= time(s.start_time))
        .sort((a, b) => time(b.end_time) - time(a.end_time));
      const pref = st.preferred_sessions.find((p) => p.session_id === s.id);
      const role = permittedRoles(data, s, config)[0];
      let score =
        (pref ? preferenceScore(pref.priority) : 0) +
        (st.skills.some((k) => k.skill === s.category) ? 10 : 0) +
        (st.role.includes(role) ? 5 : 0) +
        (s.english_required && st.english_ok ? 50 : 0);
      score -=
        today.length * 8 + today.reduce((sum, v) => sum + hours(v) * 12, 0);
      score -= duties
        .filter((v) => day(v) !== day(s))
        .reduce((sum, v) => sum + 2 + 2 * hours(v), 0);
      if (!today.length) score += 30;
      if (before.length) {
        score -=
          3 * Math.abs((s.room?.floor ?? 0) - (before[0].room?.floor ?? 0));
        if (time(s.start_time) - time(before[0].end_time) < 30 * 60_000)
          score -= 40;
        if (before.slice(0, 2).some((v) => v.room_id === s.room_id))
          score -= 25;
      }
      return (
        score -
        team.reduce(
          (sum, v) => sum + 15 * (pairs.get(pairKey(v.id, st.id)) ?? 0),
          0,
        )
      );
    }
    if (
      s.required_staff >= 2 &&
      !team.some(experienced) &&
      available.some((st) => !experienced(st)) &&
      available.some(experienced)
    )
      available = available.filter(experienced);
    available.sort(
      (a, b) =>
        rank(b) - rank(a) ||
        shifts.get(a.id)!.length - shifts.get(b.id)!.length ||
        shifts.get(a.id)!.reduce((n, v) => n + hours(v), 0) -
          shifts.get(b.id)!.reduce((n, v) => n + hours(v), 0) ||
        a.id - b.id,
    );
    return available[0];
  }
  function releaseFor(s: Session) {
    for (const duty of added) {
      const from = sessions.get(duty.session_id)!;
      const moved = staff.get(duty.staff_id)!;
      if (
        from === s ||
        !conflicts(from, s, travel) ||
        !eligible(moved, s, from)
      )
        continue;
      const previousTeam = teams.get(from.id)!;
      const remaining = previousTeam.filter((st) => st !== moved);
      const replacement = bestAvailable(
        from,
        remaining,
        data.staffs.filter((st) => eligible(st, from)),
      );
      if (!replacement) continue;
      countPairs(previousTeam, -1);
      const duties = shifts.get(moved.id)!;
      duties.splice(duties.indexOf(from), 1);
      previousTeam[previousTeam.indexOf(moved)] = replacement;
      shifts.get(replacement.id)!.push(from);
      duty.staff_id = replacement.id;
      countPairs(previousTeam);
      if (previousTeam.length >= 2) refreshTraining();
      return moved;
    }
  }
  for (const s of targets) {
    const team = teams.get(s.id)!;
    const candidates = data.staffs.filter((st) => eligible(st, s));
    while (team.length < s.required_staff) {
      // Refill one conflicting duty from this run when it frees a qualified worker.
      const pick =
        bestAvailable(
          s,
          team,
          candidates.filter((st) => !team.includes(st)),
        ) ?? releaseFor(s);
      if (!pick) break;
      place(pick, s);
      added.push({
        session_id: s.id,
        staff_id: pick.id,
        role: permittedRoles(data, s, config)[0],
      });
    }
    if (team.length >= 2) refreshTraining();
    countPairs(team);
  }
  // Exchange only newly planned duties. Preserve manual assignments in fill-only mode.
  for (const s of targets) {
    const team = teams.get(s.id)!;
    const experienced = experiencedAt(s);
    if (team.length < 2 || team.some(experienced)) continue;
    let exchanged = false;
    for (const t of targets.filter((t) => t !== s && conflicts(s, t, 0))) {
      const others = teams.get(t.id)!;
      const donorMentors = others.filter(experiencedAt(t));
      for (const exp of donorMentors.filter(experienced)) {
        if (donorMentors.length === 1 && others.length > 1) continue;
        const a = added.find(
          (p) => p.session_id === t.id && p.staff_id === exp.id,
        );
        const novice = team.find(
          (st) =>
            eligible(st, t, s) &&
            added.some((p) => p.session_id === s.id && p.staff_id === st.id),
        );
        if (!a || !novice || !eligible(exp, s, t)) continue;
        added.find(
          (p) => p.session_id === s.id && p.staff_id === novice.id,
        )!.staff_id = exp.id;
        a.staff_id = novice.id;
        team[team.indexOf(novice)] = exp;
        others[others.indexOf(exp)] = novice;
        shifts.get(novice.id)![shifts.get(novice.id)!.indexOf(s)] = t;
        shifts.get(exp.id)![shifts.get(exp.id)!.indexOf(t)] = s;
        refreshTraining();
        exchanged = true;
        break;
      }
      if (exchanged) break;
    }
  }
  const results = targets.map((s) => ({
    session_id: s.id,
    session_title: s.title,
    required: s.required_staff,
    assigned: teams.get(s.id)!.length,
  }));
  const understaffed = results.filter((r) => r.required > r.assigned);
  return {
    remove: options.fill_only ? [] : [...targetIds],
    added,
    report: {
      message: "Auto-assignment completed",
      target_date: targetDay,
      total_sessions: results.length,
      fully_assigned: results.length - understaffed.length,
      skipped_sessions: selected.length - targets.length,
      required_slots: results.reduce((n, r) => n + r.required, 0),
      assigned_slots: results.reduce((n, r) => n + r.assigned, 0),
      understaffed,
    },
  };
}
