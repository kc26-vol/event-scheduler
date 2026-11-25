import Login from "@/components/Login";
import { bindings } from "@/lib/runtime";
import { setting } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const db = bindings().DB;
  return (
    <Login title={(await setting(db, "app_title")) || "Event Scheduler"} />
  );
}
