"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PreferenceWindow,
  ShiftPreferences,
} from "@/lib/shift-preferences";
import type { Session, Staff } from "@/lib/types";
import { api, shortTime, type Task } from "./client";

const windowEndpoint = "/api/preference-window";
const ownEndpoint = "/api/shift-preferences";
const statusLabels = {
  unconfigured: "受付期間はまだ設定されていません。",
  upcoming: "受付開始前です。",
  open: "受付中です。締切まで希望を変更できます。",
  closed: "受付を終了しました。保存済みの希望が確定しています。",
};
const japanTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

function useWindowStatus(
  saved: PreferenceWindow | null,
  reload: () => Promise<boolean>,
  online = true,
) {
  const [now, setNow] = useState(() => Date.now());
  const { opensAt, closesAt } = saved ?? {};
  useEffect(() => {
    if (!online) return;
    const onVisible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, 30000);
    const current = Date.now();
    setNow(current);
    const timers = [opensAt, closesAt].flatMap((value) => {
      const delay = value ? Date.parse(value) - current : 0;
      return delay > 0 && delay < 2_147_483_647
        ? [window.setTimeout(onVisible, delay + 1)]
        : [];
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [opensAt, closesAt, reload, online]);
  if (closesAt && now >= Date.parse(closesAt)) return "closed";
  return saved?.status;
}

function sameSelections(a: number[], b: number[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function SessionChoices({
  sessions,
  selected,
  onChange,
  disabled,
}: {
  sessions: Session[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const matching = sessions.filter((s) =>
    [s.title, s.room?.name, s.start_time.slice(0, 10)]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      {sessions.length > 0 && (
        <label>
          セッションを検索
          <input
            type="search"
            placeholder="タイトル・日付・部屋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className="session-choices">
        {matching.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={disabled}
              onChange={(e) => {
                onChange(
                  e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                );
              }}
            />
            <span>
              {s.title}
              <small>
                {s.start_time.slice(0, 10)} {shortTime(s.start_time)}–
                {shortTime(s.end_time)}　{s.room?.name}
              </small>
            </span>
          </label>
        ))}
        {!matching.length && (
          <p>
            {sessions.length
              ? "検索条件に一致するセッションはありません。"
              : "対象のセッションはありません。"}
          </p>
        )}
      </div>
    </>
  );
}

function useRemoteValue<T>(endpoint: string, enabled = true) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await api<T>(endpoint);
      if (request === sequence.current) {
        setValue(next);
        setError("");
      }
      return true;
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
      return false;
    }
  }, [endpoint]);
  useEffect(() => {
    if (enabled) void reload();
    return () => {
      sequence.current++;
    };
  }, [reload, enabled]);
  return { value, reload, error };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    message && (
      <div>
        <p role="alert">{message}</p>
        <button type="button" className="light" onClick={retry}>
          再読み込み
        </button>
      </div>
    )
  );
}

export function MyShiftPreferences({
  sessions,
  online,
}: {
  sessions: Session[];
  online: boolean;
}) {
  const {
    value: saved,
    reload,
    error: readError,
  } = useRemoteValue<ShiftPreferences>(ownEndpoint, online);
  const [draft, setDraft] = useState<{ ids: number[]; version: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const status = useWindowStatus(saved, reload, online);
  if (!online) return null;
  const eligible = sessions.filter(
    (s) => s.required_staff > 0 || saved?.sessionIds.includes(s.id),
  );
  const ids = draft?.ids ?? saved?.sessionIds ?? [];
  const updated = !!draft && !!saved && !sameSelections(ids, saved.sessionIds);
  const stale = updated && draft?.version !== saved?.version;
  async function save() {
    if (!draft || busy || stale || status !== "open") return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(ownEndpoint, "PUT", {
        sessionIds: draft.ids,
        version: draft.version,
      });
      if (await reload()) setDraft(null);
      setMessage("希望を保存しました。");
    } catch (e) {
      setError((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="preference-panel" aria-label="シフト希望">
      <h2>シフト希望</h2>
      <LoadError message={readError} retry={reload} />
      {!saved && !readError && <p>希望を読み込み中…</p>}
      {saved && status && (
        <>
          <p>
            {statusLabels[status]}
            {saved.opensAt && saved.closesAt && (
              <>
                <br />
                受付期間（日本時間）　
                {japanTime.format(new Date(saved.opensAt))} 〜{" "}
                {japanTime.format(new Date(saved.closesAt))}
              </>
            )}
          </p>
          {saved.staffId === null ? (
            <p>
              シフト希望を入力するには、管理者にスタッフ情報との紐付けを依頼してください。
            </p>
          ) : status === "open" ? (
            <>
              <p>担当を希望するセッションを選んで保存してください。</p>
              <SessionChoices
                sessions={eligible}
                selected={ids}
                disabled={busy}
                onChange={(next) => {
                  setDraft(
                    sameSelections(next, saved.sessionIds)
                      ? null
                      : {
                          ids: next,
                          version:
                            updated && draft ? draft.version : saved.version,
                        },
                  );
                  setMessage("");
                  setError("");
                }}
              />
              <div className="actions">
                <span>
                  選択中 {ids.length} 件{updated && "（未保存）"}
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || !updated || stale}
                >
                  {busy ? "保存中…" : "希望を保存"}
                </button>
              </div>
              {stale && (
                <div>
                  <p role="alert">
                    受付期間または保存済みの希望が更新されています。最新の内容を確認して選び直してください。
                  </p>
                  <button
                    className="light"
                    onClick={() => {
                      setDraft(null);
                      setError("");
                      setMessage("");
                    }}
                  >
                    最新の希望を表示
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h3>保存済みの希望（{saved.sessionIds.length}件）</h3>
              {saved.sessionIds.length ? (
                <ul>
                  {saved.sessionIds.map((id) => {
                    const s = sessions.find((row) => row.id === id);
                    return (
                      <li key={id}>
                        {s
                          ? `${s.start_time.slice(0, 10)} ${shortTime(s.start_time)}　${s.title}`
                          : `セッション #${id}`}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>保存済みの希望はありません。</p>
              )}
              {updated && (
                <p role="alert">
                  受付中に保存しなかった変更は提出されていません。
                </p>
              )}
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function japanInput(value: string | null) {
  return value
    ? new Date(Date.parse(value) + 9 * 3600_000).toISOString().slice(0, 16)
    : "";
}

export function PreferenceWindowSettings() {
  const {
    value: saved,
    reload,
    error: readError,
  } = useRemoteValue<PreferenceWindow>(windowEndpoint);
  const [draft, setDraft] = useState<{
    opensAt: string;
    closesAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dates = draft ?? {
    opensAt: japanInput(saved?.opensAt ?? null),
    closesAt: japanInput(saved?.closesAt ?? null),
  };
  return (
    <section aria-label="シフト希望の受付期間">
      <h2>シフト希望の受付期間</h2>
      <LoadError message={readError} retry={reload} />
      {saved && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setError("");
            setMessage("");
            if (dates.opensAt >= dates.closesAt) {
              setError("受付終了は受付開始より後に設定してください。");
              return;
            }
            setBusy(true);
            try {
              await api(windowEndpoint, "PUT", {
                opensAt: new Date(`${dates.opensAt}:00+09:00`).toISOString(),
                closesAt: new Date(`${dates.closesAt}:00+09:00`).toISOString(),
              });
              if (await reload()) setDraft(null);
              setMessage("受付期間を保存しました。");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            受付終了時に希望が確定します。受付期間を延長して再開すると、スタッフは希望を変更できます。
          </p>
          <div className="formgrid">
            {(
              [
                ["opensAt", "受付開始（日本時間）"],
                ["closesAt", "受付終了（日本時間）"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="datetime-local"
                  name={key}
                  required
                  disabled={busy}
                  value={dates[key]}
                  onChange={(e) => {
                    setDraft({ ...dates, [key]: e.target.value });
                    setMessage("");
                    setError("");
                  }}
                />
              </label>
            ))}
          </div>
          <button disabled={busy || !draft}>受付期間を保存</button>
        </form>
      )}
      {!saved && !readError && <p>受付期間を読み込み中…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function StaffExclusions({
  staffId,
  sessions,
}: {
  staffId: number;
  sessions: Session[];
}) {
  const endpoint = `/api/staffs/${staffId}/blocked-sessions`;
  const {
    value: saved,
    reload,
    error: readError,
  } = useRemoteValue<{ sessionIds: number[] }>(endpoint);
  const [draft, setDraft] = useState<{
    ids: number[];
    previousSessionIds: number[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = draft?.ids ?? saved?.sessionIds ?? [];
  const stale =
    !!draft &&
    !!saved &&
    !sameSelections(draft.previousSessionIds, saved.sessionIds);
  return (
    <section className="preference-panel" aria-label="配置しないセッション">
      <h3>配置しないセッション</h3>
      <p>
        このスタッフを配置できないセッションを選んでください。自動配置と手動配置の両方に適用されます。
      </p>
      <LoadError message={readError} retry={reload} />
      {!saved && !readError && <p>配置制限を読み込み中…</p>}
      {saved && (
        <>
          <SessionChoices
            sessions={sessions.filter(
              (s) => s.required_staff > 0 || saved.sessionIds.includes(s.id),
            )}
            selected={selected}
            disabled={busy}
            onChange={(next) => {
              setDraft(
                sameSelections(next, saved.sessionIds)
                  ? null
                  : {
                      ids: next,
                      previousSessionIds:
                        draft?.previousSessionIds ?? saved.sessionIds,
                    },
              );
              setError("");
              setMessage("");
            }}
          />
          <div className="actions">
            <span>
              選択中 {selected.length} 件{draft && "（未保存）"}
            </span>
            <button
              disabled={busy || !draft || stale}
              onClick={async () => {
                if (!draft || busy || stale) return;
                setBusy(true);
                setMessage("");
                setError("");
                try {
                  await api(endpoint, "PUT", {
                    sessionIds: draft.ids,
                    previousSessionIds: draft.previousSessionIds,
                  });
                  if (await reload()) setDraft(null);
                  setMessage("配置制限を保存しました。");
                } catch (e) {
                  setError((e as Error).message);
                  await reload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              配置制限を保存
            </button>
          </div>
          {draft && (stale || error) && (
            <button
              type="button"
              className="light"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                if (await reload()) {
                  setDraft(null);
                  setError("");
                  setMessage("");
                }
                setBusy(false);
              }}
            >
              未保存の変更を破棄して最新の配置制限を表示
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function AdminPreferenceEditor({
  staff,
  sessions,
  task,
}: {
  staff: Staff;
  sessions: Session[];
  task: Task;
}) {
  const {
    value: saved,
    reload,
    error,
  } = useRemoteValue<PreferenceWindow>(windowEndpoint);
  const status = useWindowStatus(saved, reload);
  const editable = status === "unconfigured" || status === "open";
  const endpoint = `/api/staffs/${staff.id}/preferred-sessions`;
  const available = sessions.filter(
    (s) =>
      s.required_staff > 0 &&
      !staff.preferred_sessions.some((p) => p.session_id === s.id),
  );
  return (
    <section aria-label="希望セッション">
      <h3>希望セッション</h3>
      <LoadError message={error} retry={reload} />
      {!editable && status && <p>{statusLabels[status]}</p>}
      {!staff.preferred_sessions.length && <p>保存済みの希望はありません。</p>}
      {staff.preferred_sessions.map((p) => (
        <p key={p.id}>
          {p.priority} · {p.session?.title}{" "}
          {editable && (
            <button
              type="button"
              className="light"
              onClick={() => task(() => api(endpoint + "/" + p.id, "DELETE"))}
            >
              削除
            </button>
          )}
        </p>
      ))}
      {editable && available.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            task(() => api(endpoint, "POST", values));
          }}
        >
          <label>
            セッション
            <select name="session_id">
              {available.map((s) => (
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
      )}
    </section>
  );
}
