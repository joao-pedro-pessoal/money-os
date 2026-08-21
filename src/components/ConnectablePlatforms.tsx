"use client";

import { useState } from "react";
import Link from "next/link";
import { matchPlatform, type PlatformOption } from "@/lib/connectors/catalogue";

/**
 * Wraps the "Add account" form and shows what could be connected instead.
 *
 * It wraps rather than sits beside because it watches what you type into the
 * institution box, and input events only reach an ancestor. If it recognises a
 * platform it says so *before* you press Add — typing a balance for a platform
 * you also connect is how the same money ends up in the app twice.
 *
 * Nothing here blocks the form. There are good reasons to keep a manual account
 * for a connected platform — a sub-account the API doesn't report, for instance
 * — so it explains and then gets out of the way. The form itself is a plain
 * server action and still works with JavaScript off; this only adds the notice.
 */
export default function ConnectablePlatforms({
  options,
  institutionInputName = "institution",
  children,
}: {
  options: PlatformOption[];
  institutionInputName?: string;
  children: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const match = matchPlatform(typed, options);

  const watch = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement;
    if (target.name === institutionInputName) setTyped(target.value);
  };

  const unconnected = options.filter((o) => !o.connected);

  return (
    <div className="space-y-3" onInput={watch}>
      {children}

      {match && (
        <div
          className="rounded-lg border p-3 text-xs leading-relaxed max-w-md"
          style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
          role="status"
        >
          {match.connected ? (
            <>
              <strong>{match.label} is already connected</strong>, feeding{" "}
              {match.connectedTo.join(", ")}. A manual account for it as well means the same money
              is counted twice — unless this is money that connection doesn&apos;t report.
            </>
          ) : (
            <>
              <strong>{match.label} can be connected instead.</strong> The balance would keep itself
              up to date rather than being typed in and going stale.{" "}
              <Link href="/connections" className="underline">
                Connect it →
              </Link>
            </>
          )}
        </div>
      )}

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium">Or connect a platform</div>
        <p className="text-xs text-[var(--muted)] mt-1 mb-3">
          A connected platform reports its own balance and positions, read-only. Nothing here can
          place an order or move money.
        </p>

        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.platform} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs">{o.label}</div>
                <div className="text-[10px] text-[var(--muted)]">
                  {o.connected ? `Feeding ${o.connectedTo.join(", ")}` : o.requirement}
                </div>
              </div>
              {o.connected ? (
                <span className="text-[10px] text-[var(--green)] whitespace-nowrap">Connected</span>
              ) : (
                <Link
                  href="/connections"
                  className="text-[10px] text-[var(--accent)] whitespace-nowrap"
                >
                  Connect →
                </Link>
              )}
            </li>
          ))}
        </ul>

        {unconnected.length === 0 && (
          <p className="text-[10px] text-[var(--muted)] mt-3">
            Everything supported is connected. Anything else — a bank, or a broker without an API —
            belongs in the form above.
          </p>
        )}
      </div>
    </div>
  );
}
