"use client";

import { useEffect } from "react";

/**
 * What a page shows when it throws.
 *
 * There was no boundary here at all, so a five-second network blip — a laptop
 * waking, a Wi-Fi hop, a VPN connecting — served the raw Next.js error page:
 * the full SELECT statement, the driver's stack trace, `getaddrinfo ENOTFOUND`.
 * That is indistinguishable from the app being broken, and it was read that
 * way.
 *
 * The IBKR connector already had this right, naming a refused connection as the
 * gateway not running rather than reporting a failure the user could not act
 * on. This is the same courtesy applied to the database.
 */

/** Is this the network failing to reach Postgres, rather than a defect? */
function isConnectionFailure(error: Error): boolean {
  // Next.js replaces the message with a digest in production, so the cause has
  // to be read from whatever survives: the message here, the digest never.
  const text = `${error.message} ${error.stack ?? ""}`;
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo|Connection terminated|timeout expired/i.test(
    text
  );
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Still worth having in the terminal — this replaces the page, not the log.
    console.error(error);
  }, [error]);

  const offline = isConnectionFailure(error);

  return (
    <div className="card p-6 max-w-lg mx-auto mt-12 space-y-4">
      <div className="text-sm font-medium">
        {offline ? "Can't reach the database right now" : "Something went wrong on this page"}
      </div>

      {offline ? (
        <div className="text-xs text-[var(--muted)] space-y-2">
          <p>
            The app is fine and nothing has been lost — it just couldn&apos;t look anything up.
            This is almost always the connection rather than the data: a laptop that has just
            woken, a Wi-Fi network changing, or a VPN connecting.
          </p>
          <p>Check you are online and try again. If it keeps failing, the database host may be down.</p>
        </div>
      ) : (
        <div className="text-xs text-[var(--muted)] space-y-2">
          <p>
            This page hit an error it didn&apos;t expect. Your data is untouched — nothing here
            writes anything.
          </p>
          {/* The message, not the stack. Enough to report, not a wall of SQL. */}
          {error.message && (
            <p className="font-mono text-[10px] break-words text-[var(--foreground)]">
              {error.message.slice(0, 300)}
            </p>
          )}
          {error.digest && <p className="text-[10px]">Reference: {error.digest}</p>}
        </div>
      )}

      <button type="button" onClick={reset} className="btn">
        Try again
      </button>
    </div>
  );
}
