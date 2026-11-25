"use client";
import { useEffect, useState, type FormEvent } from "react";
import { accountRequest } from "./AccountRequest";

export default function AccountRegistration() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("token")) {
      setToken(fragment.get("token"));
      // Keep the credential in memory for the confirmation button and out of browser history.
      history.replaceState(history.state, "", location.pathname);
    }
    setReady(true);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (token !== null) {
        await accountRequest("redeem", { token });
        location.replace("/link-account");
      } else {
        await accountRequest("register", {
          email: new FormData(e.currentTarget).get("email"),
        });
        setSent(true);
      }
    } catch (error) {
      setError(
        token !== null
          ? "リンクの確認に失敗しました。期限切れや使用済みの場合は、登録ページからやり直してください。"
          : "メールの送信を受け付けられませんでした。時間を置いてお試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <form onSubmit={submit}>
        <h1>{token !== null ? "メールアドレスを確認" : "スタッフ登録"}</h1>
        {!ready ? (
          <p>読み込み中…</p>
        ) : token !== null ? (
          <>
            <p>
              このメールアドレスを確認して、ログインに使う LINE または Google
              アカウントを連携します。
            </p>
            <button disabled={busy}>確認して登録を続ける</button>
            {error && <a href="/register">新しい確認リンクをリクエスト</a>}
          </>
        ) : sent ? (
          <>
            <p role="status">
              登録対象のメールアドレスであれば確認リンクが届きます。メールを開いて登録を続けてください。
            </p>
            <button
              className="light"
              type="button"
              onClick={() => setSent(false)}
            >
              メールアドレスを再入力
            </button>
          </>
        ) : (
          <>
            <p>
              管理者に届け出たメールアドレスに、初回登録用の確認リンクを送ります。
            </p>
            <label>
              メールアドレス
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <button disabled={busy}>確認リンクを送る</button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <a href="/login.html">登録済みの方はログイン</a>
      </form>
    </main>
  );
}
