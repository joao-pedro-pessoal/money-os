import AuthFrame from "@/components/AuthFrame";
import LoginScreen from "@/components/LoginScreen";
import { maxAccounts } from "@/lib/accounts/limits";
import { safeReturnPath } from "@/lib/accounts/returnPath";

export const dynamic = "force-dynamic";

/**
 * The way in: signing in, making an account, getting back into one. The form
 * is LoginScreen; this page only says whether new accounts are being taken, so
 * "Create an account" is not offered where it would only be refused.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destination = safeReturnPath((await searchParams).next);
  const signUps = maxAccounts(process.env) !== null;
  return (
    <AuthFrame>
      <LoginScreen signUps={signUps} destination={destination} />
    </AuthFrame>
  );
}
