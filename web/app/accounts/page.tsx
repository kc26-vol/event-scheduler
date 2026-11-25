import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AccountDirectory from "@/components/AccountDirectory";
import { currentAccount } from "@/lib/accounts";
import { bindings } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export default async function Page() {
  const env = bindings();
  const hdr = await headers();
  if (env.GEOIP_ENABLED === "1" && hdr.get("cf-ipcountry") !== "JP") notFound();
  const account = await currentAccount(
    new Request("https://scheduler.local", { headers: hdr }),
    env,
  );
  if (!account) redirect("/login");
  if (account.role !== "admin") notFound();
  const people = await env.DB.prepare(
    "SELECT id,name FROM staffs ORDER BY name,id",
  ).all<{ id: number; name: string }>();
  return (
    <AccountDirectory
      self={account.id}
      staff={people.results}
      canSwitchView={account.canSwitchView}
    />
  );
}
