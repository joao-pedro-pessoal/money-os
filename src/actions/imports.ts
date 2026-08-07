"use server";

import { db } from "@/db/client";
import { transactions, imports, accounts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface CsvRow {
  date: string;
  amount: string;
  description?: string;
}

/**
 * MVP_SPEC.md §7: upload -> column mapping -> preview -> duplicate detection -> import.
 * This action performs the final "import" step given already-mapped rows.
 * Dedup key: accountId + date + amount + description (deterministic, since bank
 * CSVs rarely provide a stable external id).
 */
export async function importCsvRows(
  accountId: string,
  fileName: string,
  rows: CsvRow[]
) {
  const existing = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  const existingKeys = new Set(
    existing.map((t) => `${t.date.toISOString().slice(0, 10)}|${t.amount}|${t.description ?? ""}`)
  );

  let created = 0;
  let duplicated = 0;
  let ignored = 0;
  let balanceDelta = 0;

  const [importRow] = await db
    .insert(imports)
    .values({ accountId, fileName, rowsImported: "0", rowsDuplicated: "0", rowsIgnored: "0" })
    .returning();

  for (const row of rows) {
    const amount = Number(row.amount);
    const date = new Date(row.date);
    if (!row.date || Number.isNaN(amount) || Number.isNaN(date.getTime())) {
      ignored++;
      continue;
    }
    const key = `${date.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${row.description ?? ""}`;
    if (existingKeys.has(key)) {
      duplicated++;
      continue;
    }
    existingKeys.add(key);

    await db.insert(transactions).values({
      accountId,
      type: amount >= 0 ? "income" : "expense",
      amount: String(amount),
      date,
      description: row.description ?? "",
      source: "csv",
      importId: importRow.id,
    });
    balanceDelta += amount;
    created++;
  }

  await db
    .update(imports)
    .set({ rowsImported: String(created), rowsDuplicated: String(duplicated), rowsIgnored: String(ignored) })
    .where(eq(imports.id, importRow.id));

  if (balanceDelta !== 0) {
    await db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${balanceDelta}`, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");

  return { created, duplicated, ignored };
}
