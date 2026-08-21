"use client";

import { useState } from "react";
import { autoPriceHoldings, forgetFoundPrices } from "@/actions/quotes";

/**
 * Prices everything it can, without asking you for a single symbol.
 *
 * The chain behind the button: the ISIN from your statement goes to OpenFIGI,
 * which names the instrument on each exchange; each name becomes a Stooq
 * symbol; each symbol is tried until one returns a price in the currency you
 * paid in. Nothing is accepted on the strength of the lookup alone — a
 * candidate has to answer with a real number first.
 *
 * It only touches positions that have no symbol yet, so a choice you made by
 * hand is never overwritten and pressing it twice costs nothing.
 */
export default function AutoPrice() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<{ symbol: string; ok: boolean; note: string }[]>([]);

  const run = async () => {
    setBusy(true);
    setSummary(null);
    setRows([]);
    try {
      const result = await autoPriceHoldings();
      const madeReal =
        result.created > 0
          ? `${result.created} position${result.created === 1 ? "" : "s"} created from your statement. `
          : "";

      /**
       * A batch that was found but refused is not a batch that failed to load.
       * Saying "0 of 11 priced" about eleven prices that arrived and were
       * rejected describes the wrong problem entirely.
       */
      const withheld =
        result.heldBack > 0
          ? " Some prices were found but not saved: they added up to a total your broker disagrees with, which means a listing was matched wrongly. The reasons are below."
          : "";

      setSummary(
        result.attempted === 0
          ? `${madeReal}Nothing left to look up — every position already has a price source, or has no ISIN to search by.`
          : `${madeReal}${result.matched} of ${result.attempted} priced.${withheld}`
      );
      setRows(result.results);
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    setBusy(true);
    setRows([]);
    try {
      const { cleared } = await forgetFoundPrices();
      setSummary(
        cleared === 0
          ? "No automatically found prices to clear."
          : `${cleared} price${cleared === 1 ? "" : "s"} cleared. Those positions are back at cost and marked as unpriced.`
      );
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Couldn't clear.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Find prices automatically</div>
          <p className="text-xs text-[var(--muted)] leading-snug mt-1 max-w-2xl">
            Looks up each ISIN, finds what it is called on the exchanges, and takes the first price
            that comes back in the currency you paid in. Two free services, no account, no key.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Undo for prices saved before the check above existed. Without it a
              wrong price is permanent, because the guard only refuses to write
              a new one. */}
          <button type="button" onClick={forget} disabled={busy} className="btn text-xs whitespace-nowrap">
            {busy ? "…" : "Forget found prices"}
          </button>
          <button type="button" onClick={run} disabled={busy} className="btn text-xs whitespace-nowrap">
            {busy ? "Looking up…" : "Find prices"}
          </button>
        </div>
      </div>

      {summary && <div className="text-xs mt-3">{summary}</div>}

      {/* Every result named, found or not. A position that stayed at cost looks
          identical to one that was just priced unless this says which. */}
      {rows.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {rows.map((r) => (
            <li
              key={r.symbol + r.note}
              className="text-[10px] leading-snug"
              style={{ color: r.ok ? "var(--green)" : "var(--amber)" }}
            >
              {/* The whole note, wrapped rather than clipped: it names every
                  symbol that was tried and what each answered, which is the
                  only thing that turns "no quote" into a next step. */}
              <span className="font-medium">{r.symbol}</span> — {r.note}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
        Daily closing prices, not live ones. Three checks before anything is saved: the price must
        state the currency you paid in, it must be from the last few days rather than from a venue
        that stopped trading, and the prices together must agree with what your broker says the
        account is worth. A batch that fails the last one is reported, not stored.
      </p>
    </div>
  );
}
