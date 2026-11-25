import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
  title: "Event Scheduler",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true },
};
export const viewport = {
  themeColor: "#193e34",
  width: "device-width",
  initialScale: 1,
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
