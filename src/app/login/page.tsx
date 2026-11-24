import AuthFrame from "@/components/AuthFrame";
import LoginScreen from "@/components/LoginScreen";
import { googleConfiguration } from "@/lib/accounts/google";
import { maxAccounts } from "@/lib/accounts/limits";
import { safeReturnPath } from "@/lib/accounts/returnPath";
import { hasInviteSecret, registrationMode } from "@/lib/accounts/registration";

export const dynamic = "force-dynamic";

/**
 * The way in: signing in, making an account, getting back into one. The form
 * is LoginScreen; this page only says whether new accounts are being taken, so
 * "Create an account" is not offered where it would only be refused.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; google?: string }> }) {
  const params = await searchParams;
  const destination = safeReturnPath(params.next);
  const mode = registrationMode(process.env);
  const signUps = maxAccounts(process.env) !== null && mode !== "closed"
    && (mode !== "invite" || hasInviteSecret(process.env));
  return (
    <AuthFrame>
      <LoginScreen signUps={signUps} inviteRequired={mode === "invite"} destination={destination} googleEnabled={!!googleConfiguration(process.env)} googleFailed={params.google === "failed"} />
    </AuthFrame>
  );
}
