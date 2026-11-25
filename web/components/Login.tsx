"use client";

import { useState } from "react";
import GoogleButton from "./GoogleButton";
import { accountRequest } from "./AccountRequest";

interface Props {
  title: string;
  email?: string;
  google?: { apiKey: string; authDomain: string; projectId: string };
  line: boolean;
  failed?: boolean;
}

export default function Login({ title, email, google, line, failed }: Props) {
  const [error, setError] = useState(
    failed
      ? email
        ? "アカウント連携を完了できませんでした。ログイン方法を選んでもう一度お試しください。"
        : "ログインを完了できませんでした。もう一度お試しください。"
      : "",
  );
  const [busy, setBusy] = useState(false);

  async function googleSignIn(token: string) {
    setBusy(true);
    setError("");
    try {
      await accountRequest("google", { token });
      location.replace("/");
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }

  async function lineSignIn() {
    setBusy(true);
    setError("");
    try {
      const { url } = await accountRequest<{ url: string }>("line-start", {});
      location.assign(url);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form onSubmit={(event) => event.preventDefault()}>
        <h1>{email ? "ログイン方法を連携" : title}</h1>
        {email ? (
          <p>
            <strong>{email}</strong>{" "}
            のメール確認が完了しました。今後ログインに使うアカウントを選んでください。
          </p>
        ) : (
          <p>登録時に連携したアカウントでログインしてください。</p>
        )}
        {line && (
          <button type="button" onClick={lineSignIn} disabled={busy}>
            {email ? "LINE と連携する" : "LINE でログイン"}
          </button>
        )}
        {google && (
          <GoogleButton
            config={google}
            onToken={googleSignIn}
            onError={setError}
            disabled={busy}
          >
            {email ? "Google と連携する" : "Google でログイン"}
          </GoogleButton>
        )}
        {!line && !google && (
          <p role="alert">
            ログイン方法の設定が必要です。イベントの管理者にご連絡ください。
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {!email && <a href="/register">初めての方はメールアドレスで登録</a>}
      </form>
    </main>
  );
}
