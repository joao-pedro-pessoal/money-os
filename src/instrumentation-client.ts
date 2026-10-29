import { initBotId } from "botid/client/core";
import { REGISTRATION_BOT_ROUTES } from "@/lib/accounts/botProtection";

// A public build-time boolean, never a credential. Challenges are lazy and restricted to registration POSTs.
if (process.env.NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION === "1") {
  initBotId({ protect: REGISTRATION_BOT_ROUTES });
}
