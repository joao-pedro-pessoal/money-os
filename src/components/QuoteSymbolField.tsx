"use client";

import { useState } from "react";
import { checkQuoteSymbol, setQuoteSymbol } from "@/actions/quotes";
import { suggestSymbols } from "@/lib/quotes/stooq";

type Check = Awaited<ReturnType<typeof checkQuoteSymbol>>;

/**
 * Choosing where a position's price comes from.
 *
 * Checked before it is saved, because the two ways this goes wrong are
 * invisible afterwards: a symbol that returns nothing, and a symbol that
 * returns the *wrong instrument's* price. Seeing the number and the date is the
 * only reliable way to tell either.
 *
 * The currency check is the one that matters most. A symbol's market decides
 * its currency, so pricing a euro position off the London listing is wrong by
 * the exchange rate and looks entirely reasonable. It is refused rather than
 * converted: converting would hide the mistake, and the fix is a different
 * symbol rather than more arithmetic.
 */
export default function QuoteSymbolField({
  id,
  symbol,
  currency,
  ticker,
}: {
  id: string;
  symbol: string | null;
  /** What the position was bought in — the price has to match it. */
  currency: string;
  /** A starting point for the suggestions, usually the instrument's own name. */
  ticker: string;
}) {
  const [value, setValue] = useState(symbol ?? "");
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = suggestSymbols(value || ticker).slice(0, 4);

  const run = async () => {
    setBusy(true);
    setCheck(null);
    try {
      setCheck(await checkQuoteSymbol(value, currency));
    } finally {
      setBusy(false);
    }
  };

  const usable = check?.ok === true && !check.mismatch;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end flex-wrap">
        <label className="block text-[10px]">
          <span className="text-[var(--muted)]">Price symbol (Stooq)</span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCheck(null);
            }}
            placeholder="e.g. sxr8.de"
            className="input input-narrow text-xs py-1 mt-0.5 font-mono w-32"
          />
        </label>

        <button
          type="button"
          onClick={run}
          disabled={busy || value.trim() === ""}
          className="btn text-xs py-1"
          style={{ background: "transparent", color: "var(--accent)" }}
        >
          {busy ? "Checking…" : "Check"}
        </button>

        {/* Saving is only offered once a real price has come back in the right
            currency — the check is not advisory. */}
        {usable && (
          <form action={setQuoteSymbol}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="quoteSymbol" value={value.trim()} />
            <button type="submit" className="btn text-xs py-1">
              Use this
            </button>
          </form>
        )}

        {symbol && (
          <form action={setQuoteSymbol}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="quoteSymbol" value="" />
            <button type="submit" className="text-[10px]" style={{ color: "var(--muted)" }}>
              Stop pricing this
            </button>
          </form>
        )}
      </div>

      {suggestions.length > 0 && check === null && (
        <div className="flex gap-1 flex-wrap text-[10px]">
          <span className="text-[var(--muted)]">try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className="font-mono"
              style={{ color: "var(--accent)" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {check && !check.ok && (
        <div className="text-[10px]" style={{ color: "var(--amber)" }}>
          {check.reason}
        </div>
      )}

      {check && check.ok && (
        <div
          className="text-[10px]"
          style={{ color: check.mismatch ? "var(--red)" : "var(--green)" }}
        >
          {check.quote.symbol} — {check.quote.close} {check.symbolCurrency ?? ""} · {check.note}
        </div>
      )}
    </div>
  );
}
