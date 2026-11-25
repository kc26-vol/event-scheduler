"use client";
import { useState } from "react";
export default function Login({ title }: { title: string }) {
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
            const r = await fetch("/auth/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                Object.fromEntries(new FormData(e.currentTarget)),
              ),
            });
            if (!r.ok)
              throw Error(((await r.json()) as { detail: string }).detail);
            location.replace("/");
          } catch (e) {
            setError(String((e as Error).message));
            setBusy(false);
          }
        }}
      >
        <h1>{title}</h1>
        <label>
          パスワード
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>ログイン</button>
      </form>
    </main>
  );
}
