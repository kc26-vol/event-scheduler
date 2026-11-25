"use client";

import { useState, type ReactNode } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  signInWithPopup,
  signOut,
} from "firebase/auth";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export default function GoogleButton({
  config,
  onToken,
  onError,
  children,
  disabled,
}: {
  config: FirebaseWebConfig;
  onToken: (token: string) => Promise<void> | void;
  onError: (message: string) => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    try {
      const appName = "scheduler-" + config.projectId;
      const app =
        getApps().find((app) => app.name === appName) ??
        initializeApp(config, appName);
      const auth = initializeAuth(app, {
        persistence: inMemoryPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
      const google = new GoogleAuthProvider();
      google.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, google);
      try {
        await onToken(await user.getIdToken());
      } finally {
        await signOut(auth);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      )
        return;
      if (code === "auth/popup-blocked")
        onError("ポップアップを許可してもう一度お試しください。");
      else if (code?.startsWith("auth/"))
        onError("Google ログインに失敗しました。もう一度お試しください。");
      else
        onError(
          error instanceof Error ? error.message : "ログインできませんでした。",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" disabled={busy || disabled} onClick={signIn}>
      {children ?? "Google でログイン"}
    </button>
  );
}
