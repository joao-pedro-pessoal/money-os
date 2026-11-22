"use server";

import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { requireServerSession } from "./requestSession";
import { cleanOrder, isOrderList, orderKey } from "@/lib/ui/userOrder";

export type OrderResult = { saved?: boolean; error?: string };

/** Stores the order the person dragged a list into. Ordering only: no money or record changes. */
export async function saveOrder(list: unknown, ids: unknown): Promise<OrderResult> {
  try {
    await requireServerSession();
  } catch {
    return { error: "Sign in again." };
  }
  const order = cleanOrder(ids);
  if (!isOrderList(list) || !order) return { error: "Could not save the order. Try again." };
  try {
    await db.insert(appSettings).values({ key: orderKey(list), value: JSON.stringify(order), updatedAt: new Date() })
      .onConflictDoUpdate({ target: [appSettings.userId, appSettings.key], set: { value: JSON.stringify(order), updatedAt: new Date() } });
  } catch {
    return { error: "Could not save the order. Try again." };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}
