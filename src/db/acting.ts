import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who a piece of server work is explicitly being done for, when no request's
 * cookie can say: sign-up, the scheduled sync, scripts. Apart from the database
 * client so the checks that ask do not have to load the database.
 */
const acting = new AsyncLocalStorage<{ userId: string }>();

/** Runs `work` as this person, whatever the request's cookie says — for sign-up, cron and scripts. */
export function asUser<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return acting.run({ userId }, work);
}

/** The person named by `asUser`, or undefined when the request's session decides. */
export function actingAs(): string | undefined {
  return acting.getStore()?.userId;
}
