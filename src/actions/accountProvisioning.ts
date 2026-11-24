// Shared admission/creation for password and Google. Not a Server Action.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users, OWNER_USER_ID, categories, exchangeRates } from "@/db/schema";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/db/defaultCategories";
import { refreshRates } from "./fx";
import { maxAccounts, registrationRefusal } from "@/lib/accounts/limits";
import { normalizeEmail } from "@/lib/accounts/credentials";

export type AuthTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class RegistrationRefused extends Error {}
export async function registrationCounts(reader: Pick<typeof db, "select"> = db) {
  const [counts] = await reader.select({ total: sql<number>`count(*)::int`, lastHour: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '1 hour')::int`, lastDay: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '1 day')::int` }).from(users);
  return counts;
}

export async function insertRegisteredUser(tx: AuthTransaction, values: typeof users.$inferInsert) {
  await tx.execute(sql`select pg_advisory_xact_lock(1297040207, 1)`);
  const reason = registrationRefusal(await registrationCounts(tx), maxAccounts(process.env));
  if (reason) throw new RegistrationRefused(reason);
  const [owner] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, OWNER_USER_ID));
  if (owner && owner.passwordHash === null && values.email === normalizeEmail(process.env.APP_EMAIL ?? "")) throw new RegistrationRefused("An account with this email already exists. Sign in instead.");
  const [made] = await tx.insert(users).values(values).returning({ id: users.id });
  return made.id;
}

export async function seedNewAccount(): Promise<void> {
  await db.insert(categories).values([
    ...DEFAULT_INCOME_CATEGORIES.map(name => ({ name, kind: "income" })),
    ...DEFAULT_EXPENSE_CATEGORIES.map(name => ({ name, kind: "expense" })),
  ]).onConflictDoNothing();
}

export async function ensureRates(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(exchangeRates);
  if (row && row.n > 0) return;
  await Promise.race([refreshRates(), new Promise(resolve => setTimeout(resolve, 5000))]);
}

export async function ensureStartingData(): Promise<void> {
  await ensureRates();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(categories);
  if (!row || row.n === 0) await seedNewAccount();
}
