/**
 * What a person's vault holds, and the only ways it changes.
 *
 * The site's own tables live in Postgres and belong to whoever runs the site.
 * A vault is the opposite arrangement: one JSON document per person, encrypted
 * on their own device (see cipher.ts) and stored by the server as ciphertext it
 * cannot read. So everything a vault account owns is here, in one value that
 * can be encrypted whole — accounts, categories, movements and budgets.
 *
 * Amounts are decimal strings and are added as whole cents, never as floats: a
 * vault is edited for years, and a hundredth lost to binary rounding on every
 * addition is a balance that slowly stops matching the bank. Every operation
 * returns a new document; nothing here reads a clock, a database or a random
 * source — ids and dates are passed in, so the same edit always produces the
 * same document.
 */

import { z } from "zod";

export const DOCUMENT_VERSION = 1;

const money = z
  .string()
  .regex(/^-?\d{1,15}(\.\d{1,2})?$/, "An amount is a number with at most two decimals.");
const currency = z.string().regex(/^[A-Z]{3,8}$/, "A currency is its code, like EUR.");
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");

export const AccountSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    /** The site's own words for what kind of account this is. */
    kind: z.enum(["bank", "cash", "broker", "exchange", "other"]),
    currency,
    /** Follows the movements below; typed only when the account is created. */
    balance: money,
    createdAt: day,
  })
  .strict();

export const CategorySchema = z
  .object({ id, name: z.string().trim().min(1).max(60), kind: z.enum(["income", "expense"]) })
  .strict();

export const MovementSchema = z
  .object({
    id,
    accountId: id,
    type: z.enum(["income", "expense", "transfer"]),
    /** Always positive: which way it went is `type`, and for a transfer, which leg. */
    amount: money,
    currency,
    date: day,
    categoryId: id.nullable(),
    merchant: z.string().max(120).nullable(),
    description: z.string().max(500),
    /** The other leg of a transfer, so the two move and are removed together. */
    transferId: id.nullable(),
    /**
     * On a transfer, whether this is the leg the money left. Stated rather than
     * worked out from the pair's order: a list can be re-sorted, and a leg whose
     * direction depends on where it sits is one a sort can turn into a gain.
     */
    transferOut: z.boolean().nullable(),
  })
  .strict();

export const BudgetSchema = z
  .object({ id, categoryId: id, limit: money, period: z.enum(["monthly", "yearly"]) })
  .strict();

export const DocumentSchema = z
  .object({
    version: z.literal(DOCUMENT_VERSION),
    /** What totals are shown in. Each account keeps its own currency too. */
    baseCurrency: currency,
    accounts: z.array(AccountSchema).max(200),
    categories: z.array(CategorySchema).max(300),
    movements: z.array(MovementSchema).max(200_000),
    budgets: z.array(BudgetSchema).max(200),
  })
  .strict();

export type VaultAccount = z.infer<typeof AccountSchema>;
export type VaultCategory = z.infer<typeof CategorySchema>;
export type VaultMovement = z.infer<typeof MovementSchema>;
export type VaultBudget = z.infer<typeof BudgetSchema>;
export type VaultDocument = z.infer<typeof DocumentSchema>;

/** What went wrong, in words for the person rather than for the console. */
export class VaultDocumentError extends Error {}

// ------------------------------------------------------------------ cents

/** A decimal amount as whole cents. Strings in, integers inside, strings out. */
export function cents(amount: string): number {
  if (!/^-?\d{1,15}(\.\d{1,2})?$/.test(amount.trim())) {
    throw new VaultDocumentError(`"${amount}" is not an amount with at most two decimals.`);
  }
  const [whole, fraction = ""] = amount.trim().split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const units = Math.abs(Number(whole));
  return sign * (units * 100 + Number(fraction.padEnd(2, "0")));
}

export function fromCents(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(value));
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

// ----------------------------------------------------------- the document

export function emptyDocument(baseCurrency: string): VaultDocument {
  return DocumentSchema.parse({
    version: DOCUMENT_VERSION,
    baseCurrency: baseCurrency.toUpperCase(),
    accounts: [],
    categories: [],
    movements: [],
    budgets: [],
  });
}

/**
 * A document read back from the vault, checked before anything is shown.
 *
 * What comes out of decryption is bytes the app has never seen; a shape it only
 * half-understands would put a wrong balance on screen instead of saying so.
 */
export function readDocument(value: unknown): VaultDocument {
  const parsed = DocumentSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new VaultDocumentError(
      `This vault is not in a shape this version understands: ${first?.message ?? "unknown field"}`
    );
  }
  return parsed.data;
}

function accountOf(doc: VaultDocument, accountId: string): VaultAccount {
  const account = doc.accounts.find((a) => a.id === accountId);
  if (!account) throw new VaultDocumentError("That account is not in this vault.");
  return account;
}

function withBalance(doc: VaultDocument, accountId: string, deltaCents: number): VaultDocument {
  return {
    ...doc,
    accounts: doc.accounts.map((a) =>
      a.id === accountId ? { ...a, balance: fromCents(cents(a.balance) + deltaCents) } : a
    ),
  };
}

export function addAccount(doc: VaultDocument, account: VaultAccount): VaultDocument {
  const parsed = AccountSchema.parse(account);
  if (doc.accounts.some((a) => a.id === parsed.id)) throw new VaultDocumentError("That account is already here.");
  return { ...doc, accounts: [...doc.accounts, parsed] };
}

export function addCategory(doc: VaultDocument, category: VaultCategory): VaultDocument {
  const parsed = CategorySchema.parse(category);
  if (doc.categories.some((c) => c.name.toLowerCase() === parsed.name.toLowerCase() && c.kind === parsed.kind)) {
    // The site once grew a second "Food" category and every total split in two.
    throw new VaultDocumentError(`There is already a ${parsed.kind} category called ${parsed.name}.`);
  }
  return { ...doc, categories: [...doc.categories, parsed] };
}

/**
 * Records one movement and moves the account's balance with it.
 *
 * An expense is money that left, so it lowers the balance; income raises it.
 * A category is refused unless it belongs to the same side of the ledger —
 * "Salary" on an expense is wrong however confidently it was chosen.
 */
export function addMovement(doc: VaultDocument, movement: VaultMovement): VaultDocument {
  const parsed = MovementSchema.parse(movement);
  if (parsed.type === "transfer") {
    throw new VaultDocumentError("A transfer is recorded with both its legs at once, not one at a time.");
  }
  if (doc.movements.some((m) => m.id === parsed.id)) throw new VaultDocumentError("That movement is already here.");
  if (cents(parsed.amount) <= 0) throw new VaultDocumentError("An amount has to be more than zero.");
  const account = accountOf(doc, parsed.accountId);
  if (parsed.currency !== account.currency) {
    throw new VaultDocumentError(
      `This account is in ${account.currency}, so the amount has to be in ${account.currency}.`
    );
  }
  if (parsed.categoryId !== null) {
    const category = doc.categories.find((c) => c.id === parsed.categoryId);
    if (!category) throw new VaultDocumentError("That category is not in this vault.");
    if (category.kind !== parsed.type) {
      throw new VaultDocumentError(
        `${category.name} is a ${category.kind} category, and this is ${parsed.type === "income" ? "an income" : "an expense"}.`
      );
    }
  }
  const delta = parsed.type === "income" ? cents(parsed.amount) : -cents(parsed.amount);
  return withBalance({ ...doc, movements: [...doc.movements, parsed] }, parsed.accountId, delta);
}

/**
 * Moves money between two of your own accounts: one leg out, one in, each
 * carrying the other's id. Neither is income or an expense — nothing was earned
 * or spent — which is why both are typed `transfer`.
 *
 * Both accounts must share a currency. Converting here would need a rate, and a
 * rate invented inside a ledger is a figure nobody can check later.
 */
export function addTransfer(
  doc: VaultDocument,
  transfer: {
    fromId: string;
    toId: string;
    amount: string;
    date: string;
    description?: string;
    /** The two ids to give the legs, so the same transfer always looks the same. */
    outId: string;
    inId: string;
  }
): VaultDocument {
  if (transfer.fromId === transfer.toId) throw new VaultDocumentError("A transfer needs two different accounts.");
  const from = accountOf(doc, transfer.fromId);
  const to = accountOf(doc, transfer.toId);
  if (from.currency !== to.currency) {
    throw new VaultDocumentError(
      `${from.name} is in ${from.currency} and ${to.name} in ${to.currency}. Record it as an expense and an income, each in what its account really moved.`
    );
  }
  const shared = {
    type: "transfer" as const,
    amount: transfer.amount,
    currency: from.currency,
    date: transfer.date,
    categoryId: null,
    merchant: null,
    description: transfer.description ?? `${from.name} → ${to.name}`,
  };
  const out = MovementSchema.parse({ ...shared, id: transfer.outId, accountId: from.id, transferId: transfer.inId, transferOut: true });
  const into = MovementSchema.parse({ ...shared, id: transfer.inId, accountId: to.id, transferId: transfer.outId, transferOut: false });
  if (cents(out.amount) <= 0) throw new VaultDocumentError("An amount has to be more than zero.");
  let next: VaultDocument = { ...doc, movements: [...doc.movements, out, into] };
  next = withBalance(next, from.id, -cents(out.amount));
  next = withBalance(next, to.id, cents(out.amount));
  return next;
}

/**
 * Removes a movement and puts the balance back. A transfer takes its other leg
 * with it: half a transfer is money that left one account and reached none.
 */
export function removeMovement(doc: VaultDocument, movementId: string): VaultDocument {
  const movement = doc.movements.find((m) => m.id === movementId);
  if (!movement) throw new VaultDocumentError("That movement is not in this vault.");
  const legs = movement.transferId
    ? doc.movements.filter((m) => m.id === movement.id || m.id === movement.transferId)
    : [movement];
  let next: VaultDocument = { ...doc, movements: doc.movements.filter((m) => !legs.some((l) => l.id === m.id)) };
  for (const leg of legs) {
    const undo = balanceEffect(leg) * -1;
    next = withBalance(next, leg.accountId, undo);
  }
  return next;
}

/** What a movement did to its account's balance, in cents. */
export function balanceEffect(movement: VaultMovement): number {
  if (movement.type === "income") return cents(movement.amount);
  if (movement.type === "expense") return -cents(movement.amount);
  return movement.transferOut ? -cents(movement.amount) : cents(movement.amount);
}

/** Every account's balance added up, which is only meaningful in one currency. */
export function totalIn(doc: VaultDocument, currencyCode: string): { total: string; leftOut: string[] } {
  const wanted = currencyCode.toUpperCase();
  const leftOut = [...new Set(doc.accounts.filter((a) => a.currency !== wanted).map((a) => a.currency))].sort();
  const total = doc.accounts.filter((a) => a.currency === wanted).reduce((sum, a) => sum + cents(a.balance), 0);
  return { total: fromCents(total), leftOut };
}
