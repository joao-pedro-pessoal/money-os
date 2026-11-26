"use server";
import { requireServerSession } from "./requestSession";

import { db } from "@/db/client";
import { exchangeRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fetchRates, DEFAULT_BASE_CURRENCY, type RateMap } from "@/lib/fx";
import { providerJson } from "./providerHttp";
import { withWork, WorkLimitedError } from "./workGate";
import { currentLanguage } from "./language";
import { readText } from "@/lib/accounts/readText";
import { manualRate, ManualRateError, type ManualRateResult } from "@/lib/fx/manual";

/**
 * Current rates from the DB, always including the base at 1.
 * Never throws: if nothing is stored yet the caller still gets a usable map,
 * and amounts in other currencies are reported as unconverted rather than
 * being silently summed at 1:1.
 */
export async function getRates(): Promise<RateMap> {
  await requireServerSession();
  const rows = await db.select().from(exchangeRates);
  const rates: RateMap = { [DEFAULT_BASE_CURRENCY]: 1 };
  for (const r of rows) {
    if (r.quote !== DEFAULT_BASE_CURRENCY) rates[r.quote] = Number(r.rate);
  }
  return rates;
}

export async function listRates() {
  await requireServerSession();
  const rows = await db.select().from(exchangeRates);
  return rows.map((row) => row.quote === DEFAULT_BASE_CURRENCY
    ? { ...row, rate: "1", manual: false, source: "reference" }
    : row);
}

/**
 * Refreshes rates from the provider. Rates the user pinned manually are left
 * alone — an automatic refresh must not override a deliberate choice.
 */
export async function refreshRates() {
  await requireServerSession();
  return guardedRefresh();
}

async function guardedRefresh(unpin?: string) {
  const text = readText(await currentLanguage());
  try {
    return await withWork("fx-refresh", async () => {
      const fetched = await fetchRates(async url => {
        const raw = await providerJson(url) as { base?: unknown; rates?: unknown } | null;
        if (!raw || typeof raw !== "object" || (raw.base !== undefined && raw.base !== DEFAULT_BASE_CURRENCY) || !raw.rates || typeof raw.rates !== "object" || Array.isArray(raw.rates)) throw new Error("Invalid rates");
        const entries = Object.entries(raw.rates);
        if (!entries.length || entries.length > 200 || entries.some(([currency, value]) => !/^[A-Z]{3}$/.test(currency) || typeof value !== "number" || !Number.isFinite(value) || value < 0.0000000001 || value > 1_000_000_000 || (currency === DEFAULT_BASE_CURRENCY && value !== 1))) throw new Error("Invalid rates");
        return raw;
      });
      await db.transaction(async tx => {
        if (unpin) await tx.update(exchangeRates).set({ manual: false }).where(eq(exchangeRates.quote, unpin));
        for (const [quote, rate] of Object.entries(fetched)) {
          if (quote === DEFAULT_BASE_CURRENCY) continue;
          const values = { rate: String(rate), fetchedAt: new Date(), source: "frankfurter" };
          // Check the manual flag when writing, not in a snapshot that another
          // request can change. The unique key also serializes first-time inserts.
          await tx.insert(exchangeRates)
            .values({ base: DEFAULT_BASE_CURRENCY, quote, ...values })
            .onConflictDoUpdate({
              target: [exchangeRates.userId, exchangeRates.quote],
              set: values,
              setWhere: eq(exchangeRates.manual, false),
            });
        }
      });
      try { revalidatePath("/settings"); revalidatePath("/"); }
      catch { console.error("fx_revalidation_failed"); }
      return { ok: true as const, count: Object.keys(fetched).filter(quote => quote !== DEFAULT_BASE_CURRENCY).length };
    });
  } catch (err) {
    if (err instanceof WorkLimitedError) return { ok: false as const, error: text.limited(err.retryAfter), retryAfter: err.retryAfter };
    return { ok: false as const, error: text.fxFailed };
  }
}

export async function refreshRatesAction() {
  await requireServerSession();
  return refreshRates();
}

/** Pins a rate by hand; it will survive automatic refreshes. */
export async function setManualRate(formData: FormData) {
  await requireServerSession();
  const { quote, rate } = manualRate(String(formData.get("quote") ?? ""), String(formData.get("rate") ?? ""));
  await withWork("fx-manual", async () => {
    const values = { rate, manual: true, fetchedAt: new Date(), source: "manual" };
    await db.insert(exchangeRates)
      .values({ base: DEFAULT_BASE_CURRENCY, quote, ...values })
      .onConflictDoUpdate({ target: [exchangeRates.userId, exchangeRates.quote], set: values });
  });

  try { revalidatePath("/settings"); revalidatePath("/"); }
  catch { console.error("fx_revalidation_failed"); }
}

export async function submitManualRate(formData: FormData): Promise<ManualRateResult> {
  await requireServerSession();
  try { await setManualRate(formData); return { saved: true }; }
  catch (error) {
    const text = readText(await currentLanguage());
    if (error instanceof ManualRateError) return { error: error.reason === "currency" ? text.fxCurrency : error.reason === "reference" ? text.fxReference : text.fxValue };
    if (error instanceof WorkLimitedError) return { error: text.limited(error.retryAfter), retryAfter: error.retryAfter };
    return { error: text.fxUnconfirmed };
  }
}

/** Hands a pinned rate back to automatic updates. */
export async function unpinRate(formData: FormData) {
  await requireServerSession();
  const quote = String(formData.get("quote") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(quote) || quote === DEFAULT_BASE_CURRENCY) return { ok: false as const, error: readText(await currentLanguage()).invalid };
  return guardedRefresh(quote);
}
