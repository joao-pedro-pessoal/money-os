"use server";

import { db } from "@/db/client";
import { exchangeRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fetchRates, DEFAULT_BASE_CURRENCY, type RateMap } from "@/lib/fx";

/**
 * Current rates from the DB, always including the base at 1.
 * Never throws: if nothing is stored yet the caller still gets a usable map,
 * and amounts in other currencies are reported as unconverted rather than
 * being silently summed at 1:1.
 */
export async function getRates(): Promise<RateMap> {
  const rows = await db.select().from(exchangeRates);
  const rates: RateMap = { [DEFAULT_BASE_CURRENCY]: 1 };
  for (const r of rows) rates[r.quote] = Number(r.rate);
  return rates;
}

export async function listRates() {
  return db.select().from(exchangeRates);
}

/**
 * Refreshes rates from the provider. Rates the user pinned manually are left
 * alone — an automatic refresh must not override a deliberate choice.
 */
export async function refreshRates() {
  try {
    const fetched = await fetchRates();
    const existing = await db.select().from(exchangeRates);
    const manual = new Set(existing.filter((r) => r.manual).map((r) => r.quote));

    for (const [quote, rate] of Object.entries(fetched)) {
      if (quote === DEFAULT_BASE_CURRENCY || manual.has(quote)) continue;

      const row = existing.find((r) => r.quote === quote);
      if (row) {
        await db
          .update(exchangeRates)
          .set({ rate: String(rate), fetchedAt: new Date(), source: "frankfurter" })
          .where(eq(exchangeRates.quote, quote));
      } else {
        await db.insert(exchangeRates).values({
          base: DEFAULT_BASE_CURRENCY,
          quote,
          rate: String(rate),
          source: "frankfurter",
        });
      }
    }

    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true as const, count: Object.keys(fetched).length - 1 };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshRatesAction() {
  await refreshRates();
  revalidatePath("/settings");
}

/** Pins a rate by hand; it will survive automatic refreshes. */
export async function setManualRate(formData: FormData) {
  const quote = String(formData.get("quote") ?? "").trim().toUpperCase();
  const rate = Number(formData.get("rate") ?? "0");
  if (!quote || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Enter a currency and a rate greater than zero");
  }

  const [existing] = await db.select().from(exchangeRates).where(eq(exchangeRates.quote, quote));
  if (existing) {
    await db
      .update(exchangeRates)
      .set({ rate: String(rate), manual: true, fetchedAt: new Date(), source: "manual" })
      .where(eq(exchangeRates.quote, quote));
  } else {
    await db
      .insert(exchangeRates)
      .values({ base: DEFAULT_BASE_CURRENCY, quote, rate: String(rate), manual: true, source: "manual" });
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

/** Hands a pinned rate back to automatic updates. */
export async function unpinRate(formData: FormData) {
  const quote = String(formData.get("quote") ?? "").trim().toUpperCase();
  await db.update(exchangeRates).set({ manual: false }).where(eq(exchangeRates.quote, quote));
  await refreshRates();
  revalidatePath("/settings");
}
