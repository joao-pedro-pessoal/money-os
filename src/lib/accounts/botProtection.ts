/** Only account creation is challenged; existing sign-ins and recovery keep their own limits. */
export const REGISTRATION_PATH = "/api/register";
export const REGISTRATION_BOT_ROUTES = [{ path: REGISTRATION_PATH, method: "POST", advancedOptions: { checkLevel: "basic" as const } }];
/**
 * Where the browser fetches BotID's check from on this domain: `withBotId` in
 * next.config.ts rewrites everything below it to Vercel. Fixed by the botid
 * package; the person registering has no session, so it must be public.
 */
export const BOTID_CHALLENGE_ROOT = "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3";
export const REGISTRATION_BOT_REFUSED = "Could not verify this registration. Reload the page and try again.";
export const REGISTRATION_UNAVAILABLE = "Registration is temporarily unavailable. Try again later.";
export const REGISTRATION_INVALID = "Could not read this registration. Reload the page and try again.";

/** Vercel supplies this server-side marker; local/home installs have no BotID service. */
export function usesRegistrationBotProtection(env: { [key: string]: string | undefined }): boolean {
  return env.VERCEL === "1";
}
