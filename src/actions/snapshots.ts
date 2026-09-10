"use server";

import { db } from "@/db/client";
import { accountSnapshots, exchangeRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase } from "@/lib/fx";
import { freezeConversion } from "@/lib/fx/historical";

/**
 * The only way a balance snapshot gets written.
 *
 * Every snapshot carries the conversion that was true when it was taken. This
 * exists because the charts used to convert the whole history at today's rate:
 * a snapshot of $100 from March was drawn as whatever $100 is worth today, so
 * every point on the net-worth line except the last one was wrong, and nothing
 * said so.
 *
 * Refreshing rates changes what money is worth NOW. It must never reach back
 * and rewrite what it was worth then — which is why the converted figure is
 * stored rather than recomputed on read.
 */
export async function writeSnapshot(accountId: string, balance: number, currency: string) {
  const [rates, base] = await Promise.all([getRates(), getBaseCurrency()]);

  // The rate row itself, so the snapshot can record where the number came from
  // and how fresh it was — not just its value.
  const [rateRow] = currency === base
    ? []
    : await db.select().from(exchangeRates).where(eq(exchangeRates.quote, currency));

  const converted = toBase(balance, currency, rates, base);
  const rate = currency === base ? 1 : converted === null ? null : converted / (balance || 1);

  const frozen = freezeConversion({
    value: balance,
    currency,
    baseCurrency: base,
    // A zero balance can't reveal a rate by division, so take it from the row.
    rate: balance === 0 ? (rateRow ? Number(rateRow.rate) : currency === base ? 1 : null) : rate,
    rateSource: rateRow?.manual ? "manual" : (rateRow?.source ?? null),
    rateDate: rateRow?.fetchedAt ?? null,
  });

  await db.insert(accountSnapshots).values({
    accountId,
    balance: String(frozen.originalValue),
    currency: frozen.originalCurrency,
    baseCurrency: frozen.baseCurrency,
    rate: frozen.rate === null ? null : String(frozen.rate),
    rateSource: frozen.rateSource,
    rateDate: frozen.rateDate,
    valueInBase: frozen.valueInBase === null ? null : String(frozen.valueInBase),
    backfilled: false,
  });
}
