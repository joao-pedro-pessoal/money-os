import { redirect } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import GoogleRegistration from "@/components/GoogleRegistration";
import { pendingGoogleRegistration } from "@/actions/googleFlow";
import { hasInviteSecret, registrationMode } from "@/lib/accounts/registration";
import { maxAccounts } from "@/lib/accounts/limits";
export const dynamic = "force-dynamic";
export default async function GoogleRegistrationPage() {
  const pending = await pendingGoogleRegistration();
  if (!pending) redirect("/login?google=failed");
  const mode = registrationMode(process.env);
  const signUps = maxAccounts(process.env) !== null && mode !== "closed" && (mode !== "invite" || hasInviteSecret(process.env));
  return <AuthFrame><GoogleRegistration email={pending.email} taken={pending.taken} signUps={signUps} inviteRequired={mode === "invite"} /></AuthFrame>;
}
