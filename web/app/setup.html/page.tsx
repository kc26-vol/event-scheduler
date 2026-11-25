import Login from "@/components/Login";
import { bindings } from "@/lib/runtime";
import { setting } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await setting(bindings().DB, "setup_completed")) redirect("/login.html");
  return <Login title="Event Scheduler" setup />;
}
