import { bindings } from "@/lib/runtime";
import { setting } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const title =
    (await setting(bindings().DB, "app_title")) || "Event Scheduler";
  return Response.json(
    {
      id: "/",
      name: title,
      short_name: title.slice(0, 12),
      lang: "ja",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#faf9f6",
      theme_color: "#193e34",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      shortcuts: [
        { name: "マイページ", url: "/" },
        { name: "全体スケジュール", url: "/schedule" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-cache",
      },
    },
  );
}
