"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./client";

type Member = {
  id: number;
  email: string;
  role: "staff" | "admin";
  active: boolean;
  registered: boolean;
  staff_id: number | null;
};
type Staff = { id: number; name: string };

export default function AccountDirectory({
  self,
  staff,
}: {
  self: number;
  staff: Staff[];
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [edit, setEdit] = useState<Member | "new" | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const rows = await api<Member[]>("/api/accounts");
    setMembers(rows);
    setReady(true);
  }
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  const selected = edit && edit !== "new" ? edit : null;
  function begin(value: typeof edit) {
    setEdit(value);
    setError("");
    setNotice("");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const role = String(form.get("role"));
    const active = form.has("active");
    const profile = form.get("staff_id");
    const values = { role, staff_id: profile ? Number(profile) : null };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (selected) {
        await api("/api/accounts/" + selected.id, "PATCH", {
          ...values,
          active,
        });
        if (selected.id === self && (!active || role !== "admin")) {
          location.replace("/");
          return;
        }
      } else {
        await api("/api/accounts", "POST", {
          ...values,
          email: form.get("email"),
        });
      }
      setEdit(null);
      await load();
      setNotice(
        selected
          ? "アカウントを更新しました。"
          : "登録対象に追加しました。登録ページの URL を本人に共有してください。",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="pageheading">
        <h1>アカウント管理</h1>
        <a href="/">担当表に戻る</a>
      </div>
      <p>
        スタッフと管理者のメールアドレスを登録します。初回は各自が
        <a href="/register">登録ページ</a>
        でメールを確認し、ログイン方法を連携します。
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {edit ? (
        <section className="operations">
          <form key={selected?.id ?? "new"} onSubmit={save}>
            <h2>{selected ? selected.email : "登録対象の追加"}</h2>
            {!selected && (
              <label>
                メールアドレス
                <input name="email" type="email" required autoComplete="off" />
              </label>
            )}
            <label>
              権限
              <select name="role" defaultValue={selected?.role ?? "staff"}>
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </label>
            <label>
              配置表のスタッフ
              <select name="staff_id" defaultValue={selected?.staff_id ?? ""}>
                <option value="">未設定</option>
                {staff
                  .filter(
                    (person) =>
                      !members.some(
                        (member) =>
                          member.id !== selected?.id &&
                          member.staff_id === person.id,
                      ),
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </select>
            </label>
            {selected && (
              <label>
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={Boolean(selected.active)}
                />
                アクセスを許可
              </label>
            )}
            <div className="actions">
              <button disabled={busy}>
                {selected ? "変更を保存" : "追加"}
              </button>
              <button
                className="light"
                type="button"
                onClick={() => begin(null)}
                disabled={busy}
              >
                キャンセル
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="filters">
          <label>
            メールアドレスで検索
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button disabled={!ready} onClick={() => begin("new")}>
            登録対象を追加
          </button>
        </div>
      )}
      {!ready ? (
        <p>読み込み中…</p>
      ) : (
        <ul aria-label="アカウント一覧" style={{ padding: 0 }}>
          {members
            .filter((row) =>
              row.email.toLowerCase().includes(search.trim().toLowerCase()),
            )
            .map((row) => (
              <li key={row.id} className="row">
                <div>
                  <strong>{row.email}</strong> {row.id === self && "（自分）"}
                  <small>
                    {row.role === "admin" ? "管理者" : "スタッフ"} ·{" "}
                    {!row.active
                      ? "停止中"
                      : row.registered
                        ? "登録済み"
                        : "初回登録待ち"}
                    {row.staff_id != null &&
                      " · " +
                        (staff.find((person) => person.id === row.staff_id)
                          ?.name ?? "")}
                  </small>
                </div>
                <button
                  type="button"
                  className="light"
                  disabled={busy}
                  onClick={() => begin(row)}
                  aria-label={row.email + " を編集"}
                >
                  編集
                </button>
              </li>
            ))}
        </ul>
      )}
    </main>
  );
}
