import { knownReason } from "@/lib/line-feedback";
import AccountProviderPage from "@/components/AccountProviderPage";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AccountProviderPage reason={knownReason((await searchParams).error)} />
  );
}
