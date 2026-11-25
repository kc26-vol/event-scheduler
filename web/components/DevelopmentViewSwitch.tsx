"use client";

import { useRef, useState } from "react";
import { participantPage } from "@/lib/visibility";
import { accountRequest } from "./AccountRequest";

export default function DevelopmentViewSwitch({ admin }: { admin: boolean }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchView() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await accountRequest("development-view", {
        role: admin ? "staff" : "admin",
      });
      if (participantPage(location.pathname)) location.reload();
      else location.replace("/");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "表示を切り替えられませんでした。もう一度お試しください。",
      );
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="開発用の表示切替">
      <div className="row">
        <div>
          <small>開発用</small>
          <strong>現在の表示：{admin ? "管理者" : "スタッフ"}</strong>
        </div>
        <button type="button" onClick={switchView} disabled={busy}>
          {busy
            ? "切り替え中…"
            : `${admin ? "スタッフ" : "管理者"}表示に切り替える`}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
