"use server";
import { requireServerSession } from "./requestSession";

import { db } from "@/db/client";
import { transactions, imports, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dedupKey } from "@/lib/csv";

import { commitValidatedImport, undoBankImport } from "./importService";
import { shortText, type ValidImportRow, type ValidIntegrity } from "@/lib/csv/validation";
export type ImportRow = ValidImportRow;
export type ImportIntegrity = ValidIntegrity;

/** Preview convenience only; the commit repeats duplicate detection under lock. */
export async function getExistingKeys(accountId: string): Promise<string[]> {
  await requireServerSession();
  shortText(accountId, 200, "account");
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error("Account not found");
  const existing = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  return existing.map(t => dedupKey(new Date(t.date), Number(t.amount), t.description ?? ""));
}

/** Legacy small-body RPC; HTTP uploads also use this validated atomic service. */
export async function commitImport(accountId: string, fileName: string, rows: ImportRow[], columnMapping: string, adjustBalance = false, integrity?: ImportIntegrity, requestId?: string) {
  await requireServerSession();
  return commitValidatedImport(accountId, fileName, rows, columnMapping, adjustBalance, integrity, requestId);
}

export async function listImports() {
  await requireServerSession();
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
      rowsInFile: i.rowsInFile === null ? null : Number(i.rowsInFile),
      debitTotal: i.debitTotal === null ? null : Number(i.debitTotal),
      creditTotal: i.creditTotal === null ? null : Number(i.creditTotal),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Undo and its balance reversal commit together and tolerate a repeated click. */
export async function undoImport(formData: FormData) {
  await requireServerSession();
  await undoBankImport(shortText(formData.get("importId"), 200, "import"));
}
