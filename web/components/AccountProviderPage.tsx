import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentAccount, currentEnrollment } from "@/lib/accounts";
import { setting } from "@/lib/auth";
import { bindings } from "@/lib/runtime";
import Login from "./Login";
import { recoveryMessage, type LineReason } from "@/lib/line-feedback";

export default async function AccountProviderPage({
  link = false,
  reason,
}: {
  link?: boolean;
  reason?: LineReason | "provider";
}) {
  const env = bindings();
  const req = new Request("https://scheduler.local", {
    headers: await headers(),
  });
  if (await currentAccount(req, env)) redirect("/");
  const enrollment = await currentEnrollment(req, env);
  if (link && !enrollment)
    redirect(reason ? "/login?error=line-enrollment" : "/register");
  if (!link && enrollment)
    redirect(reason ? "/link-account?error=" + reason : "/link-account");

  const projectId = env.FIREBASE_PROJECT_ID;
  const apiKey = env.FIREBASE_API_KEY;
  return (
    <Login
      title={(await setting(env.DB, "app_title")) || "Event Scheduler"}
      email={link ? enrollment?.email : undefined}
      google={
        projectId && apiKey
          ? {
              projectId,
              apiKey,
              authDomain:
                env.FIREBASE_AUTH_DOMAIN || projectId + ".firebaseapp.com",
            }
          : undefined
      }
      line={Boolean(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET)}
      initialError={recoveryMessage(reason)}
    />
  );
}
