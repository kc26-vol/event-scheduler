import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { bindings } from "@/lib/runtime";
import { setting, signedIn } from "@/lib/auth";
import Workspace from "@/components/Workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const path = "/" + ((await params).screen ?? []).join("/");
  if (
    !/^\/(|schedule|staff-detail|venue|staffs(?:\/\d+)?|rooms(?:\/\d+\/roster)?|venue-maps|sessions|categories|groups|(?:groups\/\d+|categories\/[\w-]+|overall)\/(?:manage|assign)|algorithm|settings|backup|export|public-api|help)$/.test(
      path,
    )
  )
    notFound();
  const env = bindings(),
    hdr = await headers();
  if (!(await setting(env.DB, "setup_completed"))) redirect("/setup.html");
  if (
    !signedIn(
      new Request("https://scheduler.local", {
        headers: { cookie: hdr.get("cookie") || "" },
      }),
      env,
    )
  )
    redirect("/login.html");
  if (env.GEOIP_ENABLED === "1" && hdr.get("cf-ipcountry") !== "JP") notFound();
  return (
    <Workspace
      path={path}
      title={(await setting(env.DB, "app_title")) || "Event Scheduler"}
    />
  );
}
