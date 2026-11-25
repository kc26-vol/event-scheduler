"use client";
import { useEffect, useState, useCallback } from "react";
import { Handoff, Timetable } from "./Schedule";
import type { Schedule } from "@/lib/db";
import type { Session } from "@/lib/types";
import {
  api,
  empty,
  sessionsFor,
  shortTime,
  staffFor,
  type Task,
} from "./client";
import { Dialog } from "./Dialog";
import Manager from "./Manager";
import { MyShiftPreferences } from "./ShiftPreferences";
import Operations from "./Operations";
import { participantPage } from "@/lib/visibility";
import DevelopmentViewSwitch from "./DevelopmentViewSwitch";

const links = [
  ["/", "マイページ"],
  ["/schedule", "全体スケジュール"],
  ["/staff-detail", "スタッフ別担当"],
  ["/venue", "会場案内"],
  ["/sessions", "セッション管理"],
  ["/staffs", "スタッフ管理"],
  ["/rooms", "部屋管理"],
  ["/venue-maps", "会場地図管理"],
  ["/groups", "グループ"],
  ["/categories", "カテゴリ"],
  ["/overall/manage", "全体活動の管理"],
  ["/overall/assign", "全体活動の配置"],
  ["/algorithm", "自動配置"],
  ["/export", "入出力"],
  ["/backup", "自動バックアップ"],
  ["/public-api", "公開 API"],
  ["/settings", "設定"],
  ["/accounts", "アカウント管理"],
  ["/help", "ヘルプ"],
];
export default function Workspace({
  path: initialPath,
  title,
  admin,
  staffId,
  offlineShell,
  canSwitchView,
}: {
  path: string;
  title: string;
  admin: boolean;
  staffId: number | null;
  offlineShell: boolean;
  canSwitchView: boolean;
}) {
  const [path, setPath] = useState(initialPath),
    [viewer, setViewer] = useState(0);
  const [data, setData] = useState<Schedule>(empty),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [err, setErr] = useState(""),
    [menu, setMenu] = useState(false),
    [date, setDate] = useState(""),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<Session | null>(null),
    [online, setOnline] = useState(true);
  const load = useCallback(async () => {
    const next = await api<Schedule>(
      offlineShell ? "/api/offline" : "/api/workspace",
    );
    setData(next);
    setReady(true);
  }, [offlineShell]);
  useEffect(() => {
    setPath(window.location.pathname);
    load().catch((e) => setErr(e.message));
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage("save-schedule"))
        .catch(() => {});
    let running = true;
    const sync = async () => {
      let connected = false;
      if (navigator.onLine) {
        try {
          connected = (
            await fetch("/api/health", {
              cache: "no-store",
              signal: AbortSignal.timeout(5000),
            })
          ).ok;
        } catch {}
      }
      if (!running) return;
      setOnline(connected);
      if (connected) load().catch((e) => setErr(e.message));
    };
    const interval = window.setInterval(sync, 30000);
    setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      running = false;
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [load]);
  const task: Task = async (fn, msg = "保存しました") => {
    setErr("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(msg);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  };
  const bits = path.split("/").filter(Boolean),
    isScoped =
      ["overall", "categories", "groups"].includes(bits[0]) && bits.length > 1;
  const id = Number(bits[1]),
    viewing = data.staffs.find(
      (s) =>
        s.id ===
        (bits[0] === "staffs" && id
          ? id
          : path === "/staff-detail"
            ? viewer
            : staffId),
    );
  const titleOf =
    links.find(([p]) => p === path)?.[1] ??
    (bits[2] === "roster"
      ? "場所ごとの担当表"
      : bits[0] === "staffs"
        ? viewing?.name
        : "セッション");
  const dates = [
    ...new Set(data.sessions.map((s) => s.start_time.slice(0, 10))),
  ];
  const scoped = data.sessions.filter(
    (s) =>
      !isScoped ||
      (bits[0] === "groups"
        ? s.group_id === id
        : s.category === (bits[0] === "overall" ? "overall" : bits[1])),
  );
  const personal =
    ["/", "/staff-detail"].includes(path) || (bits[0] === "staffs" && !!id);
  const displayed = (personal ? sessionsFor(data, viewing) : scoped).filter(
    (s) =>
      (!date || s.start_time.startsWith(date)) &&
      (!id || bits[2] !== "roster" || s.room_id === id) &&
      (s.title + " " + s.speaker + " " + (s.room?.name ?? ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const management =
    [
      "/staffs",
      "/rooms",
      "/venue-maps",
      "/categories",
      "/groups",
      "/sessions",
    ].includes(path) ||
    (isScoped && bits.at(-1) === "manage");
  const ops = [
    "/settings",
    "/export",
    "/backup",
    "/public-api",
    "/algorithm",
    "/help",
  ].includes(path);
  return (
    <div className="shell">
      <header>
        <button
          className="menu"
          onClick={() => setMenu(!menu)}
          aria-label="メニュー"
        >
          ☰
        </button>
        <a className="brand" href="/">
          {title}
        </a>
        <span className="status">{online ? "オンライン" : "オフライン"}</span>
      </header>
      <aside className={menu ? "open" : ""}>
        <nav>
          {links
            .filter(([p]) => admin || participantPage(p))
            .map(([p, label]) => (
              <a
                key={p}
                aria-current={path === p ? "page" : undefined}
                href={p}
                onClick={() => setMenu(false)}
              >
                {label}
              </a>
            ))}
          <a href="/auth/logout">ログアウト</a>
        </nav>
      </aside>
      <main>
        {canSwitchView && !offlineShell && (
          <DevelopmentViewSwitch admin={admin} />
        )}
        <div className="pageheading">
          <h1>{titleOf}</h1>
          <button className="light" onClick={() => task(load, "更新しました")}>
            更新
          </button>
        </div>
        {err && <p role="alert">{err}</p>}
        {notice && <p role="status">{notice}</p>}
        {!ready ? (
          <p>読み込み中…</p>
        ) : management ? (
          <Manager path={path} data={data} task={task} />
        ) : ops ? (
          <Operations path={path} data={data} task={task} admin={admin} />
        ) : path === "/venue" ? (
          <section>
            {data.maps.map((m) => (
              <figure key={m.id}>
                <figcaption>{m.title}</figcaption>
                <img src={m.image} alt={m.title} />
              </figure>
            ))}
            {!data.maps.length && <p>会場地図はまだ登録されていません。</p>}
          </section>
        ) : (
          <>
            {path === "/" && staffId === null && (
              <p>
                自分の担当の確認やシフト希望の入力には、管理者にスタッフ情報との紐付けを依頼してください。
              </p>
            )}
            {path === "/" && !offlineShell && staffId !== null && (
              <MyShiftPreferences sessions={data.sessions} online={online} />
            )}
            {path === "/" && <h2>自分の担当</h2>}
            {path === "/staff-detail" && (
              <label>
                表示するスタッフ
                <select
                  value={viewing?.id ?? ""}
                  onChange={(e) => setViewer(Number(e.target.value))}
                >
                  <option value="">選択してください</option>
                  {data.staffs.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="filters">
              <label>
                日程
                <select value={date} onChange={(e) => setDate(e.target.value)}>
                  <option value="">すべて</option>
                  {dates.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                検索
                <input
                  type="search"
                  placeholder="セッション・部屋・登壇者"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {bits[2] === "assign" || path === "/overall/assign" ? (
              <Operations
                admin={admin}
                path="/algorithm"
                data={{ ...data, sessions: scoped }}
                task={task}
              />
            ) : null}
            {path === "/schedule" ? (
              <Timetable data={data} sessions={displayed} open={setDetail} />
            ) : (
              displayed.map((s) => (
                <article className="shift" key={s.id}>
                  <time>
                    {s.start_time.slice(0, 10)}
                    <strong>
                      {shortTime(s.start_time)} – {shortTime(s.end_time)}
                    </strong>
                  </time>
                  <div>
                    <button
                      className="titlebutton"
                      onClick={() => setDetail(s)}
                    >
                      {s.title}
                    </button>
                    <p>
                      {s.speaker} ·{" "}
                      <a href={"/rooms/" + s.room_id + "/roster"}>
                        {s.room?.name}
                      </a>
                    </p>
                    {(personal || bits[2] === "roster") && (
                      <Handoff data={data} session={s} />
                    )}
                    <div className="chips">
                      {staffFor(data, s).map((st) => (
                        <a key={st.id} href={"/staffs/" + st.id}>
                          {st.name}
                        </a>
                      ))}
                    </div>
                  </div>
                </article>
              ))
            )}
            {!displayed.length && <p>該当する担当・セッションはありません。</p>}
          </>
        )}
        {detail && (
          <Dialog close={() => setDetail(null)} title={detail.title}>
            <button className="light right" onClick={() => setDetail(null)}>
              閉じる
            </button>
            <h2>{detail.title}</h2>
            <p>
              {detail.start_time.replace("T", " ")} –{" "}
              {shortTime(detail.end_time)} · {detail.room?.name}
            </p>
            <p>{detail.description}</p>
            <p>
              {detail.speaker} {detail.speaker_org}
            </p>
            <p>{detail.speaker_profile}</p>
            {detail.speaker_photo && (
              <img
                className="avatar"
                src={detail.speaker_photo}
                alt={detail.speaker}
              />
            )}
            <p>{detail.notes}</p>
            <Handoff data={data} session={detail} />
            {detail.lt_talks.map((t) => (
              <p key={t.id}>
                {t.start_time} {t.title} · {t.speaker}
              </p>
            ))}
          </Dialog>
        )}
      </main>
    </div>
  );
}
