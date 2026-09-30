import AuthFrame from "@/components/AuthFrame";
import LoginScreen from "@/components/LoginScreen";
import { googleConfig } from "@/lib/vault/google";
import { maxAccounts } from "@/lib/vault/protocol";

export const dynamic = "force-dynamic";

/**
 * The way in, for the owner and for everyone with a vault here. The form is
 * LoginScreen; this page only says what this server offers, so nothing is
 * shown that would only answer with an error: Google when it is set up, and
 * vaults when accounts are open — not on a person's own copy
 * (scripts/new-person.ts sets SYNC_MAX_ACCOUNTS=0 there).
 */
export default function LoginPage() {
  const google = googleConfig(process.env, "") !== null;
  const vaults = maxAccounts(process.env.SYNC_MAX_ACCOUNTS) !== null;
  return (
    <AuthFrame vaults={vaults}>
      <LoginScreen google={google && vaults} vaults={vaults} />
    </AuthFrame>
  );
}
