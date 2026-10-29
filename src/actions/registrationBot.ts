// Internal server helper, deliberately not a "use server" endpoint.
import { checkBotId } from "botid/server";
import { REGISTRATION_BOT_REFUSED, usesRegistrationBotProtection } from "@/lib/accounts/botProtection";

/** No account lookup, password hash or account insertion until a hosted request passes. */
export async function registrationBotRefusal(): Promise<string | null> {
  if (!usesRegistrationBotProtection(process.env)) return null;
  try {
    // Explicit Basic avoids enabling paid Deep Analysis. Never allow a development bypass on the host.
    const result = await checkBotId({ advancedOptions: { checkLevel: "basic" } });
    if (result.isHuman === true && result.isBot === false && result.isVerifiedBot !== true && result.bypassed !== true) return null;
  } catch {
    // Missing proof, OIDC configuration and upstream failures all refuse registration without diagnostics.
  }
  return REGISTRATION_BOT_REFUSED;
}
