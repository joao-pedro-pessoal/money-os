"use server";

import { db } from "@/db/client";
import { transactions, imports, accounts, auditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { dedupKey } from "@/lib/csv";

export interface ImportRow {
  date: string;
  amount: number;
  description: string;
  merchant?: string;
}

/** Keys of what's already in the account, so the preview can flag duplicates. */
export async function getExistingKeys(accountId: string): Promise<string[]> {
  const existing = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  return existing.map((t) => dedupKey(new Date(t.date), Number(t.amount), t.description ?? ""));
}

/**
 * Writes rows the user has already reviewed in the preview.
 *
 * `adjustBalance` is off by default and that matters: importing a statement is
 * usually recording history that the account balance ALREADY reflects, so
 * adding the net would double count it. It's offered for the case where the
 * balance hasn't been updated since those movements happened.
 */
export async function commitImport(
  accountId: string,
  fileName: string,
  rows: ImportRow[],
  columnMapping: string,
  adjustBalance = false
) {
  const [importRow] = await db
    .insert(imports)
    .values({
      accountId,
      fileName,
      columnMapping,
      rowsImported: "0",
      rowsDuplicated: "0",
      rowsIgnored: "0",
    })
    .returning();

  let created = 0;
  let net = 0;

  for (const row of rows) {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime()) || !Number.isFinite(row.amount) || row.amount === 0) continue;

    await db.insert(transactions).values({
      accountId,
      type: row.amount >= 0 ? "income" : "expense",
      amount: String(row.amount),
      date,
      description: row.description ?? "",
      merchant: row.merchant ?? null,
      source: "csv",
      importId: importRow.id,
    });
    net += row.amount;
    created++;
  }

  await db
    .update(imports)
    .set({ rowsImported: String(created) })
    .where(eq(imports.id, importRow.id));

  if (adjustBalance && net !== 0) {
    await db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${net}`, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
  }

  await db.insert(auditLog).values({
    entityType: "import",
    entityId: importRow.id,
    action: "csv_imported",
    details: JSON.stringify({ fileName, created, net, adjustBalance }),
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");

  return { importId: importRow.id, created, net };
}

export async function listImports() {
  const [rows, accountsList] = await Promise.all([
    db.select().from(imports),
    db.select().from(accounts),
  ]);
  const accountName = new Map(accountsList.map((a) => [a.id, a.name]));

  return rows
    .map((i) => ({
      ...i,
      accountName: i.accountId ? (accountName.get(i.accountId) ?? "—") : "—",
      rowsImported: Number(i.rowsImported),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Removes every transaction created by one import.
 *
 * The whole point of recording the Import is being able to take it back when
 * the mapping turns out to have been wrong — otherwise a bad import means
 * deleting rows by hand.
 */
export async function undoImport(formData: FormData) {
  const importId = String(formData.get("importId"));

  const [imp] = await db.select().from(imports).where(eq(imports.id, importId));
  if (!imp) throw new Error("Import not found");

  const rows = await db.select().from(transactions).where(eq(transactions.importId, importId));
  const net = rows.reduce((s, t) => s + Number(t.amount), 0);

  await db.delete(transactions).where(eq(transactions.importId, importId));

  // Only unwind the balance if this import moved it in the first place.
  const details = imp.columnMapping ? null : null;
  void details;
  const adjusted = await db.select().from(auditLog).where(eq(auditLog.entityId, importId));
  const didAdjust = adjusted.some((a) => {
    try {
      return JSON.parse(a.details ?? "{}").adjustBalance === true;
    } catch {
      return false;
    }
  });

  if (didAdjust && net !== 0 && imp.accountId) {
    await db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${net}`, updatedAt: new Date() })
      .where(eq(accounts.id, imp.accountId));
  }

  await db.delete(imports).where(eq(imports.id, importId));

  await db.insert(auditLog).values({
    entityType: "import",
    entityId: importId,
    action: "csv_import_undone",
    details: JSON.stringify({ removed: rows.length, net, balanceReverted: didAdjust }),
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}
