"use client";
import { useState, useEffect, type FormEvent } from "react";
import { api, shortTime, type Task } from "./client";
import type { Schedule } from "@/lib/db";
import type { plan } from "@/lib/assign";
import { PreferenceWindowSettings } from "./ShiftPreferences";

type Props = { path: string; data: Schedule; task: Task; admin: boolean };
const form = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
const labels: Record<string, string> = {
  app_title: "イベント名",
  timezone: "タイムゾーン",
  allow_overlap: "手動配置で個別シフト同士の時間重複を許可（1/0）",
  travel_buffer_minutes: "部屋間の移動時間（分）",
  session_categories: "セッション種別",
  custom_roles: "追加ロール",
  category_role_links: "カテゴリとロールの対応",
  group_role_links: "グループとロールの対応",
  cors_origins: "許可するオリジン",
  webhook_url: "Webhook URL",
  github_dispatch_url: "GitHub workflow_dispatch URL",
  github_token: "GitHub トークン",
  interval_minutes: "実行間隔（分）",
  daily_time: "実行時刻",
  retention_count: "保存件数",
};
export default function Operations(props: Props) {
  const { path, data, task } = props;
  const [config, setConfig] = useState<Record<string, any>>({}),
    [history, setHistory] = useState<Record<string, any>[]>([]),
    [result, setResult] = useState(""),
    [failure, setFailure] = useState(""),
    [date, setDate] = useState(""),
    [selected, setSelected] = useState(0);
  const dates = [
    ...new Set(data.sessions.map((s) => s.start_time.slice(0, 10))),
  ];
  const base =
    path === "/backup"
      ? "/api/backup/auto"
      : path === "/public-api"
        ? "/api/public-api"
        : "/api";
  const reload = async () => {
    if (["/backup", "/settings", "/public-api"].includes(path))
      setConfig(await api(base + "/settings"));
    if (["/backup", "/public-api"].includes(path))
      setHistory(await api(base + "/history"));
  };
  useEffect(() => {
    reload().catch((e) => setFailure(e.message));
  }, [path]);
  const act = (fn: () => Promise<unknown>, msg?: string) =>
    task(async () => {
      await fn();
      await reload();
    }, msg);
  const show = (v: unknown) =>
    setResult(typeof v === "string" ? v : JSON.stringify(v, null, 2));
  const onForm =
    (fn: (b: Record<string, FormDataEntryValue>) => Promise<unknown>) =>
    (e: FormEvent<HTMLFormElement>) => {
      const v = form(e);
      act(() => fn(v));
    };
  const day = date || dates[0] || "",
    session = data.sessions.find((s) => s.id === selected);
  return (
    <section className="operations">
      {failure && <p role="alert">{failure}</p>}
      {path === "/algorithm" && (
        <>
          <h2>日程ごとの自動配置</h2>
          <p>全員参加の時間には個別シフトを配置できません。</p>
          <form
            onSubmit={onForm(async (b) => {
              const ids = data.sessions
                .filter((s) => s.start_time.startsWith(day))
                .map((s) => s.id);
              if (!ids.length) throw Error("セッションがありません");
              const r = await api<ReturnType<typeof plan>["report"]>(
                "/api/assignments/auto-assign",
                "POST",
                {
                  target_date: day,
                  session_ids: ids,
                  fill_only: b.fill_only === "on",
                },
              );
              show(
                [
                  `充足 ${r.fully_assigned} / ${r.total_sessions} セッション · 配置 ${r.assigned_slots} / ${r.required_slots} 人枠`,
                  ...r.understaffed.map(
                    (s) =>
                      `${s.session_title}　あと${s.required - s.assigned}名`,
                  ),
                ].join("\n"),
              );
            })}
          >
            <label>
              対象日
              <select
                required
                value={day}
                onChange={(e) => setDate(e.target.value)}
              >
                {dates.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              <input name="fill_only" type="checkbox" defaultChecked />
              現在の配置を維持して不足分を補う
            </label>
            <button disabled={!day}>自動配置を実行</button>
          </form>
          <button
            className="light"
            onClick={() =>
              act(async () => {
                const r = await api(
                  "/api/sessions/calc-required-staff",
                  "POST",
                  {},
                );
                show(
                  "最小 " +
                    r.min_total_staff +
                    " 名 · 休憩を含む推奨 " +
                    r.comfortable_total_staff +
                    " 名",
                );
              })
            }
          >
            必要人数を計算
          </button>
          <h2>手動配置</h2>
          <label>
            セッション
            <select
              value={selected || ""}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              <option value="">選択してください</option>
              {data.sessions
                .filter((s) => s.start_time.startsWith(day))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortTime(s.start_time)} {s.title}
                  </option>
                ))}
            </select>
          </label>
          {session && (
            <>
              <ul>
                {data.assignments
                  .filter((a) => a.session_id === selected)
                  .map((a) => (
                    <li key={a.id}>
                      {data.staffs.find((st) => st.id === a.staff_id)?.name}{" "}
                      <button
                        className="light"
                        onClick={() =>
                          act(
                            () => api("/api/assignments/" + a.id, "DELETE"),
                            "配置を解除しました",
                          )
                        }
                      >
                        解除
                      </button>
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={onForm((b) =>
                  api("/api/assignments", "POST", {
                    staff_id: Number(b.staff_id),
                    session_id: selected,
                  }),
                )}
              >
                <label>
                  スタッフ
                  <select name="staff_id">
                    {data.staffs.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button>追加</button>
              </form>
            </>
          )}
        </>
      )}
      {path === "/settings" && (
        <>
          {props.admin && <PreferenceWindowSettings />}
          <h2>イベント設定</h2>
          <form
            key={JSON.stringify(config)}
            onSubmit={onForm((b) => api("/api/settings", "PUT", b))}
          >
            {Object.entries(config).map(([k, v]) => (
              <label key={k}>
                {labels[k] || k}
                {[
                  "custom_roles",
                  "group_role_links",
                  "category_role_links",
                  "session_categories",
                ].includes(k) ? (
                  <textarea name={k} defaultValue={v} />
                ) : (
                  <input name={k} defaultValue={v} />
                )}
              </label>
            ))}
            <button>設定を保存</button>
          </form>
        </>
      )}
      {path === "/export" && (
        <>
          <h2>エクスポート</h2>
          <div className="actions">
            <a className="button" href="/api/export/excel">
              Excel をダウンロード
            </a>
            <a className="button" href="/api/export/backup">
              バックアップ ZIP
            </a>
          </div>
          <h2>バックアップから復元</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                confirm("現在のイベントデータを ZIP の内容で置き換えますか？")
              )
                act(
                  () => api("/api/export/restore", "POST", f),
                  "復元しました",
                );
            }}
          >
            <label>
              ZIP ファイル
              <input required type="file" name="file" accept=".zip" />
            </label>
            <button>復元</button>
          </form>
          <h2>connpass テンプレート</h2>
          <div className="actions">
            <button
              className="light"
              onClick={() =>
                show(
                  data.sessions
                    .map(
                      (s) =>
                        "| " +
                        s.start_time.slice(0, 10) +
                        " " +
                        shortTime(s.start_time) +
                        " | " +
                        s.title +
                        " | " +
                        s.speaker +
                        " | " +
                        (s.room?.name || "") +
                        " |",
                    )
                    .join("\n"),
                )
              }
            >
              タイムテーブル
            </button>
            <button
              className="light"
              onClick={() =>
                show(
                  data.sessions
                    .filter((s) => s.speaker)
                    .map(
                      (s) =>
                        "### " +
                        s.speaker +
                        "\n" +
                        s.speaker_org +
                        "\n" +
                        s.speaker_profile,
                    )
                    .join("\n\n"),
                )
              }
            >
              登壇者一覧
            </button>
          </div>
          <h2>データの初期化</h2>
          <form
            onSubmit={onForm(async (b) => {
              if (confirm("イベントデータをすべて削除しますか？"))
                await api("/api/export/reset", "POST", b);
            })}
          >
            <label>
              確認のため RESET と入力
              <input
                required
                name="confirmation"
                autoComplete="off"
                pattern="RESET"
              />
            </label>
            <button className="danger">初期化</button>
          </form>
        </>
      )}
      {path === "/backup" && (
        <>
          <form
            key={JSON.stringify(config)}
            onSubmit={onForm((b) =>
              api(base + "/settings", "PUT", {
                ...b,
                enabled: b.enabled === "on",
              }),
            )}
          >
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={config.enabled}
              />
              自動バックアップを有効化
            </label>
            <label>
              スケジュール
              <select name="schedule_type" defaultValue={config.schedule_type}>
                <option value="interval">一定間隔</option>
                <option value="daily">毎日</option>
              </select>
            </label>
            {["interval_minutes", "daily_time", "retention_count"].map((k) => (
              <label key={k}>
                {labels[k]}
                <input
                  name={k}
                  type={k === "daily_time" ? "time" : "number"}
                  defaultValue={config[k]}
                  required
                />
              </label>
            ))}
            <button>保存</button>
          </form>
          <button
            onClick={() =>
              act(
                () => api(base + "/run", "POST", {}),
                "バックアップを作成しました",
              )
            }
          >
            今すぐバックアップ
          </button>
        </>
      )}
      {path === "/public-api" && (
        <>
          <form
            key={JSON.stringify(config)}
            onSubmit={onForm((b) =>
              api(base + "/settings", "PUT", {
                ...b,
                enabled: b.enabled === "on",
              }),
            )}
          >
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={config.enabled}
              />
              公開 API を有効化
            </label>
            {[
              "cors_origins",
              "webhook_url",
              "github_dispatch_url",
              "github_token",
            ].map((k) => (
              <label key={k}>
                {labels[k]}
                <input
                  name={k}
                  type={k === "github_token" ? "password" : "text"}
                  defaultValue={config[k] ?? ""}
                />
              </label>
            ))}
            <button>保存</button>
          </form>
          {config.key && (
            <label>
              API キー
              <input readOnly value={config.key} />
            </label>
          )}
          <div className="actions">
            <button
              onClick={() =>
                act(() => api(base + "/publish", "POST", {}), "公開しました")
              }
            >
              現在のスケジュールを公開
            </button>
            <button
              className="light"
              onClick={() => {
                if (confirm("既存のキーを失効させますか？"))
                  act(() => api(base + "/settings/regenerate-key", "POST", {}));
              }}
            >
              キーを再生成
            </button>
            {config.github_token_set && (
              <button
                className="danger"
                onClick={() =>
                  act(() =>
                    api(base + "/settings/clear-github-token", "POST", {}),
                  )
                }
              >
                トークンを削除
              </button>
            )}
          </div>
        </>
      )}
      {["/backup", "/public-api"].includes(path) && (
        <>
          <h2>履歴</h2>
          {history.map((h) => (
            <article className="row" key={h.id}>
              <div>
                <strong>{h.created_at || h.published_at}</strong>
                <small>
                  {h.filename || h.session_count + " セッション"}{" "}
                  {h.active ? "公開中" : ""}
                </small>
              </div>
              <div className="actions">
                {path === "/backup" ? (
                  <a href={base + "/history/" + h.id + "/download"}>
                    ダウンロード
                  </a>
                ) : (
                  !h.active && (
                    <button
                      onClick={() =>
                        act(() => api(base + "/activate/" + h.id, "POST", {}))
                      }
                    >
                      有効化
                    </button>
                  )
                )}
                {!h.active && (
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm("履歴を削除しますか？"))
                        act(() => api(base + "/history/" + h.id, "DELETE"));
                    }}
                  >
                    削除
                  </button>
                )}
              </div>
            </article>
          ))}
          {!history.length && <p>履歴がありません。</p>}
        </>
      )}
      {path === "/help" && (
        <>
          <h2>当日の担当を確認する</h2>
          <p>
            マイページには自分の担当する時間・部屋・セッションが表示されます。全体スケジュールから部屋名を選ぶとその部屋の担当表が開きます。
          </p>
          {props.admin && (
            <>
              <h2>スタッフを配置する</h2>
              <p>
                部屋、セッション、スタッフを登録し、スタッフのロール・希望・活動時間を設定します。自動配置では対象日を選んで実行します。時間の重複・移動時間・1日の最大稼働時間を確認しながら、担当の希望と負担を考慮します。
              </p>
              <h2>公開とバックアップ</h2>
              <p>
                公開 API
                からスケジュールを公開すると、その時点のスナップショットを外部サイトから取得できます。入出力から
                Excel 出力やバックアップの復元ができます。
              </p>
            </>
          )}
        </>
      )}
      {result && (
        <div aria-live="polite">
          <textarea readOnly value={result} aria-label="結果" />
          <button
            className="light"
            onClick={() => navigator.clipboard.writeText(result)}
          >
            コピー
          </button>
        </div>
      )}
    </section>
  );
}
