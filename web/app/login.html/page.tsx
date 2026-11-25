import Login from "@/components/Login";
import { bindings } from "@/lib/runtime";
import { setting } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const db = bindings().DB;
  if (!(await setting(db, "setup_completed"))) redirect("/setup.html");
  return (
    <Login title={(await setting(db, "app_title")) || "Event Scheduler"} />
  );
}
