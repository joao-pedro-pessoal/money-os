/**
 * Turning this installation's own records into a vault document.
 *
 * The site keeps one person's money in Postgres, in tables the operator can
 * read. A vault keeps it in one encrypted document only its owner can open.
 * Moving between the two is a translation, and a translation always loses
 * something — investments, connections, subscriptions and the rest have no
 * place in the vault's shape yet.
 *
 * So nothing is dropped quietly. Everything that does not fit comes back in
 * `leftOut`, counted and named, for the screen to show before anyone believes
 * their vault holds everything they had.
 *
 * Balances are carried across as the site states them, and the movements come
 * with them as history: the vault's rule that a balance follows its movements
 * governs what happens from then on, not a replay of years already settled.
 */

import {
  DOCUMENT_VERSION,
  cents,
  fromCents,
  readDocument,
  type VaultAccount,
  type VaultBudget,
  type VaultCategory,
  type VaultDocument,
  type VaultMovement,
} from "./document";

export interface SiteAccount {
  id: string;
  name: string;
  /** bank | broker | exchange | cash | other, as the site stores it. */
  accountType: string;
  currency: string;
  balance: string;
  active: boolean;
  createdAt: Date;
}

export interface SiteCategory {
  id: string;
  name: string;
  /** income | expense. */
  kind: string;
}

export interface SiteTransaction {
  id: string;
  accountId: string;
  type: string;
  /** Signed as the site stores it: an expense is negative. */
  amount: string;
  currency: string;
  date: Date;
  categoryId: string | null;
  merchant: string | null;
  description: string | null;
}

/** The two legs the site links as one transfer. */
export interface SiteTransfer {
  fromTransactionId: string;
  toTransactionId: string;
}

export interface SiteBudget {
  id: string;
  name: string;
  period: string;
  limitAmount: string;
  active: boolean;
  categoryIds: string[];
}

export interface LeftOut {
  what: string;
  count: number;
  why: string;
}

const KINDS: Record<string, VaultAccount["kind"]> = {
  bank: "bank",
  cash: "cash",
  broker: "broker",
  exchange: "exchange",
};

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * The vault document this installation's records make, and what could not come.
 *
 * Archived accounts stay behind with everything recorded on them: a vault is
 * what you have now, and an archived account is the site's way of saying "not
 * any more". An amount in a currency the account does not hold is left out too
 * — converting it here would need a rate, and a rate invented during a move is
 * a figure nobody can check afterwards.
 */
export function documentFromSite(input: {
  baseCurrency: string;
  accounts: readonly SiteAccount[];
  categories: readonly SiteCategory[];
  transactions: readonly SiteTransaction[];
  transfers: readonly SiteTransfer[];
  budgets: readonly SiteBudget[];
}): { document: VaultDocument; leftOut: LeftOut[] } {
  const leftOut: LeftOut[] = [];
  const note = (what: string, why: string, count: number) => {
    if (count > 0) leftOut.push({ what, count, why });
  };

  const live = input.accounts.filter((a) => a.active);
  note("archived accounts", "An archived account is money you no longer hold here.", input.accounts.length - live.length);

  const accounts: VaultAccount[] = live.map((a) => ({
    id: a.id,
    name: a.name,
    kind: KINDS[a.accountType] ?? "other",
    currency: a.currency.toUpperCase(),
    balance: fromCents(cents(a.balance)),
    createdAt: day(a.createdAt),
  }));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const categories: VaultCategory[] = [];
  const seen = new Set<string>();
  for (const c of input.categories) {
    if (c.kind !== "income" && c.kind !== "expense") continue;
    const key = `${c.kind}|${c.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push({ id: c.id, name: c.name.trim(), kind: c.kind });
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  /** Which leg of a transfer each side is: the one it left, or the one it reached. */
  const outLegs = new Set(input.transfers.map((t) => t.fromTransactionId));
  const inLegs = new Set(input.transfers.map((t) => t.toTransactionId));
  const otherLeg = new Map<string, string>();
  for (const t of input.transfers) {
    otherLeg.set(t.fromTransactionId, t.toTransactionId);
    otherLeg.set(t.toTransactionId, t.fromTransactionId);
  }

  const movements: VaultMovement[] = [];
  let investmentMoves = 0;
  let otherAccount = 0;
  let wrongCurrency = 0;
  let halfTransfers = 0;

  for (const t of input.transactions) {
    const account = accountById.get(t.accountId);
    if (!account) {
      otherAccount += 1;
      continue;
    }
    if (t.currency.toUpperCase() !== account.currency) {
      wrongCurrency += 1;
      continue;
    }
    if (t.type === "investment_contribution") {
      investmentMoves += 1;
      continue;
    }
    const isTransfer = t.type === "transfer" || outLegs.has(t.id) || inLegs.has(t.id);
    if (isTransfer && !otherLeg.has(t.id)) {
      // A transfer with no other leg recorded: money that left one account and
      // reached none. It is reported rather than turned into an expense.
      halfTransfers += 1;
      continue;
    }
    const type: VaultMovement["type"] = isTransfer ? "transfer" : t.type === "income" ? "income" : "expense";
    const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    movements.push({
      id: t.id,
      accountId: t.accountId,
      type,
      amount: fromCents(Math.abs(cents(t.amount))),
      currency: account.currency,
      date: day(t.date),
      // A category only travels if it belongs to the same side of the ledger.
      categoryId: category && type !== "transfer" && category.kind === type ? category.id : null,
      merchant: t.merchant,
      description: (t.description ?? "").slice(0, 500),
      transferId: isTransfer ? (otherLeg.get(t.id) ?? null) : null,
      transferOut: isTransfer ? outLegs.has(t.id) : null,
    });
  }

  note("investment contributions", "Money moved into investments, which a vault does not hold yet.", investmentMoves);
  note("movements on archived accounts", "Their account did not come across.", otherAccount);
  note(
    "movements in another currency than their account",
    "Bringing them would need an exchange rate, and a rate invented during a move is unverifiable.",
    wrongCurrency
  );
  note("halves of a transfer", "The other leg is not recorded, so neither side can be trusted.", halfTransfers);

  const budgets: VaultBudget[] = [];
  let oddBudgets = 0;
  for (const b of input.budgets) {
    if (!b.active) continue;
    const period = b.period === "monthly" || b.period === "yearly" ? b.period : null;
    const [categoryId, ...rest] = b.categoryIds.filter((id) => categoryById.has(id));
    if (!period || !categoryId || rest.length > 0) {
      oddBudgets += 1;
      continue;
    }
    budgets.push({ id: b.id, categoryId, limit: fromCents(cents(b.limitAmount)), period });
  }
  note(
    "budgets",
    "A vault budget is one category, monthly or yearly; weekly ones, quarterly ones and budgets watching several categories do not fit yet.",
    oddBudgets
  );

  const document = readDocument({
    version: DOCUMENT_VERSION,
    baseCurrency: input.baseCurrency.toUpperCase(),
    accounts,
    categories,
    movements,
    budgets,
  });
  return { document, leftOut };
}
