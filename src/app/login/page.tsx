import AuthFrame from "@/components/AuthFrame";
import LoginScreen from "@/components/LoginScreen";
import { googleConfig } from "@/lib/vault/google";

export const dynamic = "force-dynamic";

/**
 * The way in, for the owner and for everyone with a vault here. The form is
 * LoginScreen; this page only says whether Google sign-in is set up, so the
 * button is not offered where it would only answer with an error.
 */
export default function LoginPage() {
  const google = googleConfig(process.env, "") !== null;
  return (
    <AuthFrame>
      <LoginScreen google={google} />
    </AuthFrame>
  );
}
