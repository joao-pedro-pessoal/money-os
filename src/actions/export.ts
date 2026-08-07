"use server";

import { db } from "@/db/client";
import { accounts, transactions, buckets, bucketAllocations, interestPayments, accountSnapshots, categories } from "@/db/schema";

/**
 * Full JSON export — MVP_SPEC.md §8 / PRODUCT_VISION.md §64:
 * "the user should never be locked into the app to access their own data."
 */
export async function exportAllData() {
  const [acc, tx, bk, ba, ip, snap, cat] = await Promise.all([
    db.select().from(accounts),
    db.select().from(transactions),
    db.select().from(buckets),
    db.select().from(bucketAllocations),
    db.select().from(interestPayments),
    db.select().from(accountSnapshots),
    db.select().from(categories),
  ]);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      accounts: acc,
      transactions: tx,
      buckets: bk,
      bucketAllocations: ba,
      interestPayments: ip,
      accountSnapshots: snap,
      categories: cat,
    },
    null,
    2
  );
}
