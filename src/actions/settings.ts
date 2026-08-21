"use server";

import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_BASE_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { parseFavourites, serialiseFavourites } from "@/lib/fx/favourites";

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

const FAVOURITE_CURRENCIES_KEY = "favourite_currencies";

/**
 * The currencies the dashboard offers as a display choice.
 *
 * Stored as a comma-separated string in the settings table, so this needed no
 * migration. The base currency is always included by parseFavourites — it is
 * the denomination every stored figure is already comparable in, and removing
 * it would leave the app with nothing safe to fall back to.
 */
export async function getFavouriteCurrencies(): Promise<string[]> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, FAVOURITE_CURRENCIES_KEY));
  return parseFavourites(row?.value ?? null, await getBaseCurrency());
}

export async function setFavouriteCurrencies(formData: FormData) {
  const chosen = formData.getAll("favouriteCurrencies").map(String);
  const base = await getBaseCurrency();

  // Only currencies the app can actually convert into. Saving one without a
  // rate would offer a display option that renders nothing.
  const supported = chosen.filter((c) =>
    SUPPORTED_CURRENCIES.some((s) => s.code === c.trim().toUpperCase())
  );

  const value = serialiseFavourites(supported, base);

  await db
    .insert(appSettings)
    .values({ key: FAVOURITE_CURRENCIES_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  revalidatePath("/");
}

const DASHBOARD_CURRENCY_KEY = "dashboard_currency";

/**
 * The currency the dashboard opens in.
 *
 * Separate from the base currency on purpose. The base is what every total is
 * *stored and compared* in — changing it changes what the app keeps. This only
 * changes what the dashboard renders, so someone who banks in euros but thinks
 * about their portfolio in dollars doesn't have to choose between the two.
 *
 * Everything outside the dashboard stays in the base, which is why the setting
 * is named for the dashboard rather than called a second base.
 */
export async function getDashboardCurrency(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, DASHBOARD_CURRENCY_KEY));
  const saved = row?.value?.trim().toUpperCase() ?? "";
  if (saved === "") return null;

  // Only honoured while it is still a favourite. Removing a currency from the
  // favourites shouldn't leave the dashboard stuck in it.
  const favourites = await getFavouriteCurrencies();
  return favourites.includes(saved) ? saved : null;
}

export async function setDashboardCurrency(formData: FormData) {
  const raw = String(formData.get("dashboardCurrency") ?? "").trim().toUpperCase();
  const favourites = await getFavouriteCurrencies();

  // An empty value means "same as the base", which is the default and is
  // stored as empty rather than as the base code — so changing the base later
  // follows along instead of pinning the dashboard to the old one.
  const value = raw !== "" && favourites.includes(raw) ? raw : "";

  await db
    .insert(appSettings)
    .values({ key: DASHBOARD_CURRENCY_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  revalidatePath("/");
}
