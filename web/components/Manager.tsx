"use client";
import { Dialog } from "./Dialog";
import { useState } from "react";

import type { Schedule } from "@/lib/db";
import { api, shortTime, type Task } from "./client";

type Field = [key: string, label: string, type?: string];
const forms: Record<string, Field[]> = {
  rooms: [
    ["name", "部屋名"],
    ["capacity", "定員", "number"],
    ["floor", "階", "number"],
  ],
  categories: [
    ["label", "カテゴリ名"],
    ["key", "キー"],
    ["order", "表示順", "number"],
    ["color", "色", "color"],
  ],
  "session-groups": [
    ["label", "グループ名"],
    ["date", "日付", "date"],
    ["order", "表示順", "number"],
    ["color", "色", "color"],
  ],
  "venue-maps": [
    ["title", "地図名"],
    ["image", "画像", "file"],
    ["order", "表示順", "number"],
  ],
  staffs: [
    ["name", "名前"],
    ["slack_name", "Slack 名"],
    ["role", "担当ロール（カンマ区切り）"],
    ["skills", "スキル（カンマ区切り）"],
    ["english_ok", "英語対応", "checkbox"],
    ["experience_count", "経験回数", "number"],
    ["max_hours", "1日の最大稼働時間", "number"],
    ["emergency_contact", "緊急連絡先"],
    ["photo", "顔写真", "file"],
  ],
  sessions: [
    ["title", "セッション名"],
    ["speaker", "登壇者"],
    ["start_time", "開始", "datetime-local"],
    ["end_time", "終了", "datetime-local"],
    ["room_id", "部屋", "room"],
    ["group_id", "グループ", "group"],
    ["category", "カテゴリ", "category"],
    ["required_staff", "必要人数（全員は -1）", "number"],
    ["english_required", "英語対応", "checkbox"],
    ["description", "説明", "textarea"],
    ["notes", "メモ", "textarea"],
    ["speaker_kana", "登壇者ふりがな"],
    ["speaker_org", "所属"],
    ["speaker_title", "肩書"],
    ["speaker_profile", "プロフィール", "textarea"],
    ["speaker_photo", "登壇者写真", "file"],
  ],
};
const defaults: Record<string, unknown> = {
  floor: 1,
  capacity: 0,
  order: 0,
  color: "#336c5c",
  max_hours: 8,
  experience_count: 0,
  role: "session",
  category: "general",
  required_staff: 1,
};
type Editor = Record<string, any>;
const dynamicCats = [
  "general",
  "tech",
  "workshop",
  "keynote",
  "lt",
  "panel",
  "overall",
];

export default function Manager({
  path,
  data,
  task,
}: {
  path: string;
  data: Schedule;
  task: Task;
}) {
  const parts = path.split("/").filter(Boolean);
  const resource =
    parts.length > 1
      ? "sessions"
      : parts[0] === "groups"
        ? "session-groups"
        : parts[0];
  const lists: Record<string, Editor[]> = {
    rooms: data.rooms,
    categories: data.categories,
    "session-groups": data.groups,
    "venue-maps": data.maps,
    staffs: data.staffs,
    sessions: data.sessions,
  };
  const [edit, setEdit] = useState<Editor | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [extra, setExtra] = useState<Editor | null>(null);
  const prefix = "/api/" + resource;
  const rows = lists[resource].filter(
    (r) =>
      (parts.length === 1 ||
        (parts[0] === "groups"
          ? r.group_id === Number(parts[1])
          : r.category === (parts[0] === "overall" ? "overall" : parts[1]))) &&
      String(r.name || r.title || r.label)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function start(r?: Editor) {
    const initial: Editor = { ...defaults, ...r };
    if (!r && parts.length > 1) {
      if (parts[0] === "groups") initial.group_id = Number(parts[1]);
      else initial.category = parts[0] === "overall" ? "overall" : parts[1];
    }
    if (r?.skills)
      initial.skills = r.skills
        .map((s: { skill: string }) => s.skill)
        .join(",");
    setEdit(initial);
    setExtra(null);
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit || busy) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const good = await task(async () => {
      const body: Editor = {};
      for (const [k, , t] of forms[resource]) {
        const v = form.get(k);
        if (t === "file") {
          if (v instanceof File && v.size && k !== "photo") body[k] = v;
          continue;
        }
        body[k] = t === "checkbox" ? form.has(k) : v;
      }
      if (resource === "staffs") {
        body.role = String(body.role)
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
        body.skills = String(body.skills)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const payload = ["sessions", "venue-maps"].includes(resource)
        ? Object.entries(body).reduce((f, [k, v]) => {
            f.append(k, v instanceof File ? v : String(v ?? ""));
            return f;
          }, new FormData())
        : body;
      const row = await api(
        prefix + (edit.id ? "/" + edit.id : ""),
        edit.id ? "PUT" : "POST",
        payload,
      );
      const photo = form.get("photo");
      if (resource === "staffs" && photo instanceof File && photo.size) {
        const f = new FormData();
        f.set("photo", photo);
        await api(prefix + "/" + row.id + "/photo", "POST", f);
      }
    });
    setBusy(false);
    if (good) setEdit(null);
  }
  return (
    <section>
      <div className="filters">
        <label>
          検索
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button onClick={() => start()}>新規登録</button>
      </div>
      {rows.map((r) => (
        <article className="row" key={r.id}>
          <div>
            {r.photo && <img className="avatar" src={r.photo} alt="" />}
            <strong>{r.name || r.title || r.label}</strong>
            <small>
              {resource === "sessions"
                ? r.start_time.slice(0, 10) +
                  " " +
                  shortTime(r.start_time) +
                  " · " +
                  (r.room?.name || "")
                : resource === "rooms"
                  ? r.floor + "階 · 定員 " + r.capacity
                  : r.date || r.slack_name || r.key || ""}
            </small>
          </div>
          <div className="actions">
            {resource === "rooms" && (
              <a href={"/rooms/" + r.id + "/roster"}>担当表</a>
            )}
            {["categories", "session-groups"].includes(resource) && (
              <>
                <a
                  href={
                    "/" +
                    (resource === "categories"
                      ? "categories/" + r.key
                      : "groups/" + r.id) +
                    "/manage"
                  }
                >
                  セッション
                </a>
                <a
                  href={
                    "/" +
                    (resource === "categories"
                      ? "categories/" + r.key
                      : "groups/" + r.id) +
                    "/assign"
                  }
                >
                  配置
                </a>
              </>
            )}
            {resource === "staffs" && <a href={"/staffs/" + r.id}>担当表</a>}
            {(resource === "sessions" || resource === "staffs") && (
              <button
                className="light"
                onClick={() => {
                  setExtra(r);
                  setEdit(null);
                }}
              >
                {resource === "staffs" ? "希望・活動時間" : "個別トーク"}
              </button>
            )}
            {r.name !== "全体" && (
              <>
                <button className="light" onClick={() => start(r)}>
                  編集
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        (r.name || r.title || r.label) + " を削除しますか？",
                      )
                    )
                      task(
                        () => api(prefix + "/" + r.id, "DELETE"),
                        "削除しました",
                      );
                  }}
                >
                  削除
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {!rows.length && <p>登録がありません。</p>}
      {edit && (
        <Dialog
          close={() => setEdit(null)}
          title={edit.id ? "編集" : "新規登録"}
        >
          <form key={edit.id ?? "new"} onSubmit={save}>
            <h2>{edit.id ? "編集" : "新規登録"}</h2>
            <div className="formgrid">
              {forms[resource].map(([k, label, t]) => {
                const value = edit[k] ?? "";
                const options =
                  t === "room"
                    ? data.rooms.map((r) => [r.id, r.name])
                    : t === "group"
                      ? [
                          ["", "未指定"],
                          ...data.groups.map((g) => [g.id, g.label]),
                        ]
                      : t === "category"
                        ? [
                            ...dynamicCats,
                            ...data.categories.map((c) => c.key),
                          ].map((c) => [c, c])
                        : null;
                return (
                  <label key={k}>
                    {label}
                    {options ? (
                      <select name={k} defaultValue={String(value)}>
                        {options.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : t === "textarea" ? (
                      <textarea name={k} defaultValue={value} />
                    ) : t === "checkbox" ? (
                      <input
                        type="checkbox"
                        name={k}
                        defaultChecked={!!value}
                      />
                    ) : t === "file" ? (
                      <input
                        type="file"
                        name={k}
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        required={!edit.id && resource === "venue-maps"}
                      />
                    ) : (
                      <input
                        name={k}
                        type={t || "text"}
                        defaultValue={
                          t === "datetime-local"
                            ? String(value).replace(" ", "T").slice(0, 16)
                            : value
                        }
                        required={[
                          "name",
                          "title",
                          "label",
                          "start_time",
                          "end_time",
                        ].includes(k)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="actions">
              <button disabled={busy}>保存</button>
              <button
                type="button"
                className="light"
                onClick={() => setEdit(null)}
              >
                閉じる
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {extra && (
        <Dialog close={() => setExtra(null)} title={extra.name || extra.title}>
          <button className="light right" onClick={() => setExtra(null)}>
            閉じる
          </button>
          <h2>{extra.name || extra.title}</h2>
          {resource === "staffs" ? (
            <StaffDetails id={extra.id} data={data} task={task} />
          ) : (
            <Talks id={extra.id} data={data} task={task} />
          )}
        </Dialog>
      )}
    </section>
  );
}
function StaffDetails({
  id,
  data,
  task,
}: {
  id: number;
  data: Schedule;
  task: Task;
}) {
  const st = data.staffs.find((s) => s.id === id)!;
  const endpoint = "/api/staffs/" + id + "/";
  return (
    <>
      {st.photo && (
        <button
          className="light"
          onClick={() => task(() => api(endpoint + "photo", "DELETE"))}
        >
          スタッフ写真を削除
        </button>
      )}
      <h3>活動可能時間</h3>
      {st.availabilities.map((a) => (
        <p key={a.id}>
          {a.start_time} – {a.end_time}{" "}
          <button
            className="light"
            onClick={() =>
              task(() => api(endpoint + "availabilities/" + a.id, "DELETE"))
            }
          >
            削除
          </button>
        </p>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          task(() => api(endpoint + "availabilities", "POST", values));
        }}
      >
        <label>
          開始
          <input required type="datetime-local" name="start_time" />
        </label>
        <label>
          終了
          <input required name="end_time" type="datetime-local" />
        </label>
        <button>時間を追加</button>
      </form>
      <h3>希望セッション</h3>
      {st.preferred_sessions.map((p) => (
        <p key={p.id}>
          {p.priority} · {p.session?.title}{" "}
          <button
            className="light"
            onClick={() =>
              task(() => api(endpoint + "preferred-sessions/" + p.id, "DELETE"))
            }
          >
            削除
          </button>
        </p>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          task(() => api(endpoint + "preferred-sessions", "POST", values));
        }}
      >
        <label>
          セッション
          <select name="session_id">
            {data.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          優先順位
          <input type="number" name="priority" min="1" defaultValue="1" />
        </label>
        <button>希望を追加</button>
      </form>
    </>
  );
}
function Talks({ id, data, task }: { id: number; data: Schedule; task: Task }) {
  const s = data.sessions.find((s) => s.id === id)!;
  const [talks, setTalks] = useState<Editor[]>(s.lt_talks);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        task(async () => {
          const url = "/api/sessions/" + id + "/lt-talks";
          const saved = await api<Editor[]>(url, "PUT", talks);
          setTalks(saved);
          for (const [i, row] of saved.entries()) {
            const file = form.get("photo-" + i);
            if (file instanceof File && file.size) {
              const image = new FormData();
              image.set("photo", file);
              await api(url + "/" + row.id + "/photo", "POST", image);
            }
          }
          setTalks(await api<Editor[]>(url));
        });
      }}
    >
      {talks.map((t, i) => (
        <fieldset key={i}>
          <legend>トーク {i + 1}</legend>
          <label>
            登壇者写真
            <input name={"photo-" + i} type="file" accept="image/*" />
          </label>
          {[
            ["title", "タイトル"],
            ["speaker", "登壇者"],
            ["speaker_kana", "ふりがな"],
            ["speaker_org", "所属"],
            ["speaker_title", "肩書"],
            ["start_time", "開始"],
            ["end_time", "終了"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                value={t[k] ?? ""}
                onChange={(e) =>
                  setTalks(
                    talks.map((v, n) =>
                      n === i ? { ...v, [k]: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
          ))}
          <label>
            代表者
            <input
              type="checkbox"
              checked={!!t.is_representative}
              onChange={(e) =>
                setTalks(
                  talks.map((v, n) =>
                    n === i
                      ? { ...v, is_representative: e.target.checked ? 1 : 0 }
                      : v,
                  ),
                )
              }
            />
          </label>
          <button
            className="danger"
            type="button"
            onClick={() => setTalks(talks.filter((_, n) => n !== i))}
          >
            削除
          </button>
        </fieldset>
      ))}
      <div className="actions">
        <button
          type="button"
          className="light"
          onClick={() =>
            setTalks([
              ...talks,
              { title: "", speaker: "", order: talks.length },
            ])
          }
        >
          トーク追加
        </button>
        <button>保存</button>
      </div>
    </form>
  );
}
