/** Only account creation is challenged; existing sign-ins and recovery keep their own limits. */
export const REGISTRATION_PATH = "/api/register";
export const REGISTRATION_BOT_ROUTES = [{ path: REGISTRATION_PATH, method: "POST", advancedOptions: { checkLevel: "basic" as const } }];
export const REGISTRATION_BOT_REFUSED = "Could not verify this registration. Reload the page and try again.";
export const REGISTRATION_UNAVAILABLE = "Registration is temporarily unavailable. Try again later.";
export const REGISTRATION_INVALID = "Could not read this registration. Reload the page and try again.";

/** Vercel supplies this server-side marker; local/home installs have no BotID service. */
export function usesRegistrationBotProtection(env: { [key: string]: string | undefined }): boolean {
  return env.VERCEL === "1";
}
