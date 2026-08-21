"use client";

import { useState } from "react";
import { probeIbkrQuotes } from "@/actions/quotes";

type Result = Awaited<ReturnType<typeof probeIbkrQuotes>>;

/**
 * Asks the gateway a question I can't answer from here.
 *
 * Whether IBKR will price a Trade Republic ETF depends on two things neither of
 * us can settle by reasoning: which spelling of the search endpoint this
 * gateway version accepts, and whether the account is entitled to market data
 * for European ETFs. Both are one request away, and both decide whether the
 * feature is worth building at all.
 *
 * A probe rather than a feature, deliberately. The last time an API's shape was
 * assumed rather than checked, the connector spent a day returning 401.
 */
export default function QuoteProbe({ suggestions }: { suggestions: string[] }) {
  const [isin, setIsin] = useState(suggestions[0] ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await probeIbkrQuotes(isin.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The probe failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Can Interactive Brokers price these?</div>
        <p className="text-xs text-[var(--muted)] leading-snug mt-1">
          You already run an IBKR gateway, and IBKR knows what these ETFs are worth. The ISIN is the
          bridge — no new provider, no key, nothing to subscribe to. This asks your gateway whether
          it will answer, before anything is built on top of it.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input
          value={isin}
          onChange={(e) => setIsin(e.target.value)}
          placeholder="ISIN, e.g. IE00B5BMR087"
          className="input text-xs font-mono w-52"
        />
        <button type="button" onClick={run} disabled={busy || isin.trim() === ""} className="btn text-xs">
          {busy ? "Asking…" : "Ask the gateway"}
        </button>
        {suggestions.length > 1 && (
          <select
            onChange={(e) => setIsin(e.target.value)}
            value={isin}
            className="input input-narrow text-xs py-1"
          >
            {suggestions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}

      {result && !result.ok && (
        <div className="text-xs space-y-2">
          <div style={{ color: "var(--amber)" }}>{result.reason}</div>
          {"attempts" in result && result.attempts && (
            <ul className="space-y-0.5 text-[10px] text-[var(--muted)]">
              {result.attempts.map((a) => (
                <li key={a.path}>
                  <code>{a.path}</code> — {a.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && result.ok && (
        <div className="text-xs space-y-3">
          <div style={{ color: result.priced ? "var(--green)" : "var(--amber)" }}>
            {result.priced ? "It answered with a price." : "It found the instrument but gave no price."}{" "}
            {result.quoteNote}
          </div>

          <div>
            <div className="text-[10px] text-[var(--muted)] mb-1">
              {result.candidates.length} listing{result.candidates.length === 1 ? "" : "s"} for that
              ISIN
              {result.currencies.length > 1 && (
                <span style={{ color: "var(--amber)" }}>
                  {" "}
                  · in {result.currencies.length} currencies, which is why the choice can&apos;t be
                  automatic
                </span>
              )}
            </div>
            <table className="w-full text-[11px]">
              <tbody>
                {result.candidates.slice(0, 8).map((c) => (
                  <tr key={c.conid} className="border-t border-[var(--border)]">
                    <td className="py-1">{c.symbol ?? "—"}</td>
                    <td className="py-1 text-[var(--muted)] truncate max-w-[16rem]">{c.name ?? ""}</td>
                    <td className="py-1 text-right">{c.exchange ?? "—"}</td>
                    <td className="py-1 text-right font-medium">{c.currency ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
