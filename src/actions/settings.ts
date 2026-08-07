"use server";

import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_BASE_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/fx";

const BASE_CURRENCY_KEY = "base_currency";

/** The currency every total is shown in. Falls back to EUR if never set. */
export async function getBaseCurrency(): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, BASE_CURRENCY_KEY));
  return row?.value ?? DEFAULT_BASE_CURRENCY;
}

export async function setBaseCurrency(formData: FormData) {
  const currency = String(formData.get("baseCurrency") ?? "").trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.some((c) => c.code === currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  await db
    .insert(appSettings)
    .values({ key: BASE_CURRENCY_KEY, value: currency, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: currency, updatedAt: new Date() },
    });

  // Every page shows money, so they all need re-rendering.
  revalidatePath("/", "layout");
}
