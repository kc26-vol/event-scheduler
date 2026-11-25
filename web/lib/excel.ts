import ExcelJS from "exceljs";
import { binary } from "./backup";
import type { Bindings, Schedule } from "./db";

export async function excel(env: Bindings, data: Schedule) {
  const book = new ExcelJS.Workbook();
  function sheet(name: string, columns: string[]) {
    const base = name.replace(/[\\/:*?\[\]]/g, " ").slice(0, 31) || "一覧";
    let title = base;
    for (let n = 2; book.getWorksheet(title); n++)
      title = base.slice(0, 27) + " " + n;
    const ws = book.addWorksheet(title, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.addRow(columns);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF245547" },
      };
    });
    ws.columns.forEach((c) => {
      c.width = 22;
    });
    return ws;
  }
  async function picture(ws: ExcelJS.Worksheet, row: number, url: string) {
    if (!url.startsWith("/uploads/")) return;
    const obj = await env.STORAGE.get(url.slice(1));
    if (!obj) return;
    let bytes = await obj.arrayBuffer();
    const b = new Uint8Array(bytes);
    let extension: "png" | "jpeg" | "gif";
    if (b[0] === 0x89 && b[1] === 0x50) extension = "png";
    else if (b[0] === 0xff && b[1] === 0xd8) extension = "jpeg";
    else if (b[0] === 0x47 && b[1] === 0x49) extension = "gif";
    else {
      if (!env.IMAGES) return;
      try {
        const converted = await env.IMAGES.input(new Blob([bytes]).stream())
          .transform({ width: 96 })
          .output({ format: "image/png" });
        bytes = await converted.response().arrayBuffer();
      } catch {
        return;
      }
      extension = "png";
    }
    const img = book.addImage({
      base64: Buffer.from(bytes).toString("base64"),
      extension,
    });
    ws.addImage(img, {
      tl: { col: 0, row: row - 1 },
      ext: { width: 48, height: 48 },
    });
    ws.getRow(row).height = 40;
  }
  const rooms = sheet("部屋管理", ["ID", "部屋名", "定員", "階"]);
  for (const r of data.rooms.filter((r) => r.name !== "全体"))
    rooms.addRow([r.id, r.name, r.capacity, r.floor]);
  const staff = sheet("スタッフ管理", [
    "写真",
    "ID",
    "名前",
    "Slack名",
    "担当",
    "経験回数",
    "英語",
    "最大稼働時間",
    "活動可能時間",
    "担当数",
  ]);
  for (const s of data.staffs) {
    const row = staff.addRow([
      "",
      s.id,
      s.name,
      s.slack_name,
      s.role.join(", "),
      s.experience_count,
      s.english_ok ? "可" : "",
      s.max_hours,
      s.availabilities.map((a) => a.start_time + " – " + a.end_time).join("\n"),
      data.assignments.filter((a) => a.staff_id === s.id).length,
    ]);
    if (s.photo) await picture(staff, row.number, s.photo);
  }
  const dates = [
    ...new Set(data.sessions.map((s) => s.start_time.slice(0, 10))),
  ];
  if (!dates.length) dates.push("");
  const days = dates.map((date) => ({
    suffix: dates.length > 1 ? " " + date.slice(5) : "",
    sessions: data.sessions.filter((s) => s.start_time.startsWith(date)),
  }));
  const sections = days.map((d) => ({
    label: "セッション管理" + d.suffix,
    sessions: d.sessions,
  }));
  for (const c of data.categories)
    for (const d of days) {
      const sessions = d.sessions.filter((s) => s.category === c.key);
      if (sessions.length)
        sections.push({ label: c.label + d.suffix, sessions });
    }
  for (const group of sections) {
    const ws = sheet(group.label, [
      "写真",
      "開始",
      "終了",
      "部屋",
      "タイトル",
      "登壇者",
      "必要人数",
      "担当スタッフ",
      "備考",
    ]);
    for (const s of group.sessions) {
      const team = data.assignments
        .filter((a) => a.session_id === s.id)
        .map((a) => data.staffs.find((st) => st.id === a.staff_id)?.name);
      const row = ws.addRow([
        "",
        s.start_time,
        s.end_time,
        s.room?.name,
        s.title,
        s.speaker,
        s.required_staff,
        team.join(" / "),
        s.notes,
      ]);
      if (s.speaker_photo) await picture(ws, row.number, s.speaker_photo);
      for (const t of s.lt_talks) {
        const talk = ws.addRow([
          "",
          t.start_time,
          t.end_time,
          "",
          t.title,
          t.speaker,
        ]);
        if (t.speaker_photo) await picture(ws, talk.number, t.speaker_photo);
      }
    }
  }
  const people = new Map(data.staffs.map((st) => [st.id, st.name]));
  function team(id: number) {
    return data.assignments
      .filter((a) => a.session_id === id)
      .map((a) => people.get(a.staff_id))
      .join(" / ");
  }
  for (const d of days) {
    const placement = sheet("セッション配置" + d.suffix, [
      "開始",
      "終了",
      "部屋",
      "セッション",
      "必要人数",
      "担当者",
    ]);
    for (const s of d.sessions)
      placement.addRow([
        s.start_time,
        s.end_time,
        s.room?.name,
        s.title,
        s.required_staff,
        s.required_staff === -1 ? "全員" : team(s.id),
      ]);
    const rooms = data.rooms.filter((r) =>
      d.sessions.some((s) => s.room_id === r.id),
    );
    const matrix = sheet("全体スケジュール" + d.suffix, [
      "時刻",
      ...rooms.map((r) => r.name),
    ]);
    if (!d.sessions.length) continue;
    const start =
      Math.floor(
        Math.min(...d.sessions.map((s) => Date.parse(s.start_time))) / 300000,
      ) * 300000;
    const end = Math.max(...d.sessions.map((s) => Date.parse(s.end_time)));
    for (
      let stamp = start;
      stamp < end && stamp < start + 86400000;
      stamp += 300000
    ) {
      const values = rooms.map((room) =>
        d.sessions
          .filter(
            (s) =>
              s.room_id === room.id &&
              Date.parse(s.start_time) < stamp + 300000 &&
              Date.parse(s.end_time) > stamp,
          )
          .map(
            (s) =>
              s.title + "\n" + (s.required_staff === -1 ? "全員" : team(s.id)),
          )
          .join("\n"),
      );
      matrix.addRow([
        new Date(stamp).toISOString().slice(11, 16),
        ...values,
      ]).alignment = { wrapText: true, vertical: "top" };
    }
  }
  return binary(
    new Uint8Array(await book.xlsx.writeBuffer()),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "schedule.xlsx",
  );
}
