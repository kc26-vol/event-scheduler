"use client";
import { useState } from "react";
export default function Login({
  setup,
  title,
}: {
  setup?: boolean;
  title: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/auth/" + (setup ? "setup" : "verify"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                Object.fromEntries(new FormData(e.currentTarget)),
              ),
            });
            if (!r.ok)
              throw Error(((await r.json()) as { detail: string }).detail);
            location.replace(setup ? "/login.html" : "/");
          } catch (e) {
            setError(String((e as Error).message));
            setBusy(false);
          }
        }}
      >
        <h1>{setup ? "初期設定" : title}</h1>
        {setup && (
          <>
            <label>
              セットアップトークン
              <input name="setup_token" type="password" required />
            </label>
            <label>
              イベント名
              <input name="app_title" required />
            </label>
            <label>
              タイムゾーン
              <input name="timezone" defaultValue="Asia/Tokyo" required />
            </label>
          </>
        )}
        <label>
          {setup ? "ログインパスワード" : "パスワード"}
          <input
            name={setup ? "login_password" : "password"}
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            required
          />
        </label>
        {setup && (
          <label>
            管理者パスワード
            <input
              name="admin_password"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>{setup ? "設定を保存" : "ログイン"}</button>
      </form>
    </main>
  );
}
