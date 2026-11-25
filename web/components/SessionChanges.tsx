"use client";

import { useEffect } from "react";

export default function SessionChanges() {
  useEffect(() => {
    // A returning device may land on registration before it ever opens a schedule.
    navigator.serviceWorker
      ?.register("/sw.js", { updateViaCache: "none" })
      .catch(() => {});
    if (
      /^\/(auth\/|register(?:\/|$)|link-account(?:\/|$)|(?:login|setup)\.html$)/.test(
        location.pathname,
      )
    )
      return;

    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    const changed = (event: CookieChangeEvent) => {
      if (
        [...event.changed, ...event.deleted].some(
          (c) => c.name === "es_offline",
        )
      )
        location.reload();
    };
    window.addEventListener("pageshow", restore);
    window.cookieStore?.addEventListener("change", changed);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.cookieStore?.removeEventListener("change", changed);
    };
  }, []);
  return null;
}
