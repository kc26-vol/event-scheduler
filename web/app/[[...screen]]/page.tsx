import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { bindings } from "@/lib/runtime";
import { setting } from "@/lib/auth";
import { currentAccount } from "@/lib/accounts";
import { participantPage } from "@/lib/visibility";
import Workspace from "@/components/Workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>;
  searchParams: Promise<{ offline?: string }>;
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
  if (env.GEOIP_ENABLED === "1" && hdr.get("cf-ipcountry") !== "JP") notFound();
  const account = await currentAccount(
    new Request("https://scheduler.local", {
      headers: { cookie: hdr.get("cookie") || "" },
    }),
    env,
  );
  if (!account) redirect("/login.html");
  const offlineShell = (await searchParams).offline === "1";
  const admin = account.role === "admin" && !offlineShell;
  if (!admin && !participantPage(path)) notFound();
  return (
    <Workspace
      path={path}
      admin={admin}
      staffId={account.staff_id}
      offlineShell={offlineShell}
      title={(await setting(env.DB, "app_title")) || "Event Scheduler"}
    />
  );
}
