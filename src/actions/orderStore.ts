// Internal server helper; never a callable "use server" endpoint.
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyOrder, orderKey, parseOrder, type OrderList } from "@/lib/ui/userOrder";

/** The signed-in person's saved order for one list (row security keeps it theirs). */
export async function savedOrder(list: OrderList): Promise<string[]> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, orderKey(list)));
  return parseOrder(row?.value);
}

/** `items` in the person's order for `list`. */
export async function inSavedOrder<T>(list: OrderList, items: T[], idOf: (item: T) => string): Promise<T[]> {
  return applyOrder(items, await savedOrder(list), idOf);
}
