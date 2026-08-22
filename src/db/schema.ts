import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  pgEnum,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ---------- Enums ----------
export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
  "investment_contribution",
]);

export const importSourceEnum = pgEnum("import_source", ["manual", "csv"]);

// ---------- Account ----------
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  institution: text("institution").notNull(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(), // bank, broker, exchange, cash, other
  currency: text("currency").notNull().default("EUR"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  // What `balance` actually means: "cash_only" (idle cash, positions add on
  // top), "includes_positions" (the broker's total, positions already in), or
  // "bank_and_broker" (one account that is both, split by `investedValue`).
  // The manual equivalent of a connector's `balancesAreSeparatePool`. Defaults
  // to the historical assumption so existing rows keep their meaning.
  balanceMeaning: text("balance_meaning").notNull().default("cash_only"),
  /**
   * For "bank_and_broker": how much of `balance` is invested.
   *
   * Trade Republic is one account holding spendable money and ETFs together.
   * Splitting it into two accounts works arithmetically but forces one half to
   * lie about its nature — the card money counting as invested, or the ETFs
   * counting as capital-guaranteed. One balance plus this figure keeps the
   * account whole and the Net Worth split honest.
   *
   * Declared, never inferred from positions. Null means not yet said.
   */
  investedValue: numeric("invested_value", { precision: 18, scale: 2 }),
  // Annual rate this account pays, as a percentage. Lets the app work out what
  // interest a period should produce, so what the bank actually paid can be
  // checked instead of only recorded.
  apr: numeric("apr", { precision: 6, scale: 3 }),
  // 365 or 360. Not cosmetic: 360 pays ~1.4% more for the same rate.
  aprDayCount: numeric("apr_day_count", { precision: 3, scale: 0 }).default("365"),
  // Tax withheld at source on interest, as a percentage. The user's own figure —
  // the app has no business assuming anyone's tax.
  interestWithholdingPercent: numeric("interest_withholding_percent", { precision: 5, scale: 2 }),
  /**
   * How much of this account's spare cash is investing money, as a percentage.
   *
   * The cash sitting in a broker waiting to buy something is not the same as
   * the cash in your current account, even though both are "free". Counting it
   * as spendable overstates what you could live on — the dashboard's free-cash
   * figure is the one people check before committing to something.
   *
   * A percentage rather than a flag because accounts are rarely all one thing:
   * an exchange can hold both a trading float and money you're about to
   * withdraw. Null means it has never been set, which the app reports as
   * unknown rather than assuming either extreme.
   */
  portfolioCashPercent: numeric("portfolio_cash_percent", { precision: 5, scale: 2 }),
  notes: text("notes"),
  icon: text("icon"),
  active: boolean("active").notNull().default(true),
  lastManualUpdate: timestamp("last_manual_update", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Category / Subcategory ----------
export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull(), // "income" | "expense"
  // Does money in this category arrive or leave whether you act or not?
  // Rent and salary are fixed; groceries and freelance are not. Set on the
  // category rather than per transaction so it needs deciding once — the cost
  // is that a genuinely mixed category lands entirely on one side.
  fixed: boolean("fixed").notNull().default(false),
});

export const subcategories = pgTable("subcategories", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

// ---------- Tags ----------
export const tags = pgTable("tags", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
});

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })]
);

// ---------- Transaction ----------
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  date: timestamp("date", { withTimezone: true }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  subcategoryId: text("subcategory_id").references(() => subcategories.id, { onDelete: "set null" }),
  merchant: text("merchant"),
  description: text("description"),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  source: importSourceEnum("source").notNull().default("manual"),
  externalId: text("external_id"),
  importId: text("import_id").references(() => imports.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Transfer (links two transaction legs) ----------
export const transfers = pgTable("transfers", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  fromTransactionId: text("from_transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  toTransactionId: text("to_transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Bucket ----------
export const buckets = pgTable("buckets", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  // Lower is more important. Drives the order money is distributed in: the
  // emergency fund fills before the holiday fund, which is the entire point of
  // ranking goals rather than just listing them.
  priority: numeric("priority", { precision: 4, scale: 0 }).notNull().default("0"),
  targetAmount: numeric("target_amount", { precision: 18, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- BucketAllocation ----------
export const bucketAllocations = pgTable("bucket_allocations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  bucketId: text("bucket_id")
    .notNull()
    .references(() => buckets.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- InterestPayment ----------
export const interestPayments = pgTable("interest_payments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- AccountSnapshot ----------
/**
 * A balance as it was, converted as it was.
 *
 * `balance` is the amount in the account's own currency. The conversion is
 * FROZEN here, with the rate that produced it, because a converted figure is
 * only true at the moment it was converted. Refreshing rates changes what
 * things are worth now; it must never rewrite what they were worth then.
 */
export const accountSnapshots = pgTable("account_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency"),
  baseCurrency: text("base_currency"),
  // Units of baseCurrency per 1 unit of currency, at snapshot time.
  rate: numeric("rate", { precision: 20, scale: 8 }),
  rateSource: text("rate_source"),
  // When the rate was fetched, not when the snapshot was taken.
  rateDate: timestamp("rate_date", { withTimezone: true }),
  valueInBase: numeric("value_in_base", { precision: 18, scale: 2 }),
  // True for rows written before conversions were frozen. Those are charted at
  // today's rate and marked approximate rather than dropped or trusted.
  backfilled: boolean("backfilled").notNull().default(false),
});

// ---------- Import ----------
export const imports = pgTable("imports", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  columnMapping: text("column_mapping"), // JSON string
  rowsImported: numeric("rows_imported", { precision: 10, scale: 0 }).notNull().default("0"),
  rowsDuplicated: numeric("rows_duplicated", { precision: 10, scale: 0 }).notNull().default("0"),
  rowsIgnored: numeric("rows_ignored", { precision: 10, scale: 0 }).notNull().default("0"),
  // Integrity record. A statement that passed through an AI can lose a row
  // silently — you cannot see the transaction that isn't there. The hash
  // identifies the exact file, and the sums prove what it contained.
  fileHash: text("file_hash"),
  rowsInFile: numeric("rows_in_file", { precision: 10, scale: 0 }),
  debitTotal: numeric("debit_total", { precision: 18, scale: 2 }),
  creditTotal: numeric("credit_total", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- AuditLog ----------
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Investment Portfolio ----------
// A Holding is money put at risk in the market — unrealized value, not
// guaranteed. It points at an Account purely as a LOCATION (which broker or
// wallet holds it). No double counting: an account's `balance` is idle cash
// only, positions live here and are added on top, so the two never overlap.

// ---------- Playlist (a named group of positions, e.g. "Reforma") ----------
export const playlists = pgTable("playlists", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Watchlist (assets being followed, NOT owned) ----------
// Deliberately a separate table from `holdings`: nothing here has a quantity or
// a cost basis, so it can never leak into portfolio value or Net Worth.
export const watchlistItems = pgTable("watchlist_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  symbol: text("symbol").notNull(),
  name: text("name"),
  assetType: text("asset_type"),
  currentPrice: numeric("current_price", { precision: 18, scale: 4 }),
  targetPrice: numeric("target_price", { precision: 18, scale: 4 }),
  currency: text("currency").notNull().default("EUR"),
  notes: text("notes"),
  playlistId: text("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const holdings = pgTable("holdings", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  symbol: text("symbol").notNull(),
  name: text("name"),
  // "long" (profit when price rises) or "short" (profit when price falls).
  direction: text("direction").notNull().default("long"),
  playlistId: text("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  // Profit/loss already locked in by partial sales. Kept apart from unrealized
  // P&L so an estimate is never mixed with money actually taken off the table.
  realizedPnl: numeric("realized_pnl", { precision: 18, scale: 2 }).default("0"),
  // Which account/wallet physically holds this position. Nullable so older rows
  // (and anything imported before this link existed) stay valid. This is a
  // LOCATION label only: the account's `balance` is idle cash, positions are
  // tracked here and added on top — the two never overlap, so no double counting.
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  platform: text("platform"),
  // cash | stablecoin | staking | crypto | stock_etf | bond | real_estate | other
  assetType: text("asset_type"),
  // Annual percentage rate for staked / yield-bearing positions (e.g. 5.25 = 5.25%).
  apr: numeric("apr", { precision: 8, scale: 4 }),
  // Rewards actually received so far on this position, in the position's currency.
  rewardsEarned: numeric("rewards_earned", { precision: 18, scale: 2 }).default("0"),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  avgEntryPrice: numeric("avg_entry_price", { precision: 18, scale: 4 }).notNull(),
  currentPrice: numeric("current_price", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  /**
   * Where to fetch this instrument's price from, chosen once.
   *
   * A Stooq symbol including its market suffix — `sxr8.de`, not `sxr8`. The
   * suffix is the important half: the same ETF trades in Frankfurt in euros and
   * in London in pounds, and a symbol without one is read as Polish.
   *
   * Null means nobody has chosen, and the price stays whatever you last set by
   * hand. Automatic pricing is opt-in per position, because choosing the wrong
   * listing produces a plausible number in the wrong currency, which is the
   * hardest kind of error to notice.
   */
  quoteSymbol: text("quote_symbol"),
  notes: text("notes"),
  // ---- Asset allocation tags (classification only — never affect P&L math) ----
  // risk: low | medium | high | very_high
  // expectedReturn: conservative | moderate | aggressive
  // timeHorizon: short | medium | long
  // liquidity: high | low
  riskLevel: text("risk_level"),
  expectedReturn: text("expected_return"),
  timeHorizon: text("time_horizon"),
  liquidity: text("liquidity"),
  lastPriceUpdate: timestamp("last_price_update", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const holdingSnapshots = pgTable("holding_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  holdingId: text("holding_id")
    .notNull()
    .references(() => holdings.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  price: numeric("price", { precision: 18, scale: 4 }).notNull(),
  value: numeric("value", { precision: 18, scale: 2 }).notNull(),
});

// ---------- HoldingAllocation ----------
/**
 * The other half of "purpose": part of a POSITION counting towards a goal.
 *
 * Cash is allocated as a fixed amount (bucketAllocations); an investment is
 * allocated as a PERCENTAGE. Promising a fixed €1 500 of an ETF becomes a lie
 * the moment the price moves — either the goal silently changes size or the
 * remainder has to go somewhere. A share tracks the market honestly, and means
 * a goal can now go DOWN, which the UI reports instead of hiding.
 */
export const holdingAllocations = pgTable(
  "holding_allocations",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    holdingId: text("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => buckets.id, { onDelete: "cascade" }),
    percent: numeric("percent", { precision: 5, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // One share per position per goal; allocating twice edits, never stacks.
  (t) => [unique("holding_allocations_holding_bucket").on(t.holdingId, t.bucketId)]
);

export const holdingsRelations = relations(holdings, ({ one, many }) => ({
  snapshots: many(holdingSnapshots),
  account: one(accounts, {
    fields: [holdings.accountId],
    references: [accounts.id],
  }),
  playlist: one(playlists, {
    fields: [holdings.playlistId],
    references: [playlists.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  holdings: many(holdings),
  watchlistItems: many(watchlistItems),
}));

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  playlist: one(playlists, {
    fields: [watchlistItems.playlistId],
    references: [playlists.id],
  }),
}));

// ---------- Relations ----------
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  bucketAllocations: many(bucketAllocations),
  interestPayments: many(interestPayments),
  snapshots: many(accountSnapshots),
}));

export const bucketsRelations = relations(buckets, ({ many }) => ({
  allocations: many(bucketAllocations),
}));

export const bucketAllocationsRelations = relations(bucketAllocations, ({ one }) => ({
  account: one(accounts, { fields: [bucketAllocations.accountId], references: [accounts.id] }),
  bucket: one(buckets, { fields: [bucketAllocations.bucketId], references: [buckets.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  subcategory: one(subcategories, {
    fields: [transactions.subcategoryId],
    references: [subcategories.id],
  }),
  tags: many(transactionTags),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

// ================= Connector / Sync layer (V1.5) =================
// Generic on purpose: Bybit and IBKR must reuse these tables unchanged.

// ---------- AccountConnection ----------
// Links one of our Accounts to an external platform.
//
// Hyperliquid's read-only info API needs only a public wallet address, so
// there is nothing secret to store. `encryptedSecret` exists for platforms
// that do require credentials (Bybit, IBKR) — it must never hold plaintext,
// and no connector may ever write an API key into `externalId`.
export const accountConnections = pgTable("account_connections", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // "hyperliquid" | "bybit" | ...
  // Which regional entity of the platform, where one exists (Bybit split into
  // global and EEA under MiCA). Null means the platform's default.
  region: text("region"),
  externalId: text("external_id").notNull(), // public wallet address / account id
  label: text("label"),
  encryptedSecret: text("encrypted_secret"),
  active: boolean("active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"), // "ok" | "error"
  lastSyncError: text("last_sync_error"),
  // Breakdown from the last successful sync, so the UI can show where the
  // account total comes from instead of just a single opaque number.
  lastEquity: numeric("last_equity", { precision: 20, scale: 4 }),
  lastSpotValue: numeric("last_spot_value", { precision: 20, scale: 4 }),
  lastWithdrawable: numeric("last_withdrawable", { precision: 20, scale: 4 }),
  lastMarginUsed: numeric("last_margin_used", { precision: 20, scale: 4 }),
  /**
   * All-time realised profit and loss, as the platform reports it.
   *
   * Not computed here. Working it out from an order history needs a cost-basis
   * method (FIFO, average, and they disagree), and a number we derived would
   * quietly contradict the one the broker shows you. Where a platform states
   * it, we store what it says; where it doesn't, this stays null and the app
   * says so rather than showing a zero that looks like a fact.
   */
  lastRealizedPnl: numeric("last_realized_pnl", { precision: 20, scale: 4 }),
  /**
   * The currency this platform reports its figures in.
   *
   * Every consumer used to assume USD, because the first two connectors did.
   * Trading 212 reports in the account's own currency, so a €144.84 balance was
   * read as $144.84 and converted down to about €125 — a 15% error that looked
   * like a mistake in the totals rather than in the units.
   */
  reportingCurrency: text("reporting_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Position (open position on an automated account) ----------
// NOTE ON DOUBLE COUNTING: a position's value is already inside the account's
// equity (accountValue), which sync writes to `accounts.balance`. Positions
// here are therefore DISPLAY ONLY and must never be summed into Net Worth.
// This is the opposite of manual `holdings`, where the balance is cash only
// and positions add on top.
export const positions = pgTable("positions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  connectionId: text("connection_id")
    .notNull()
    .references(() => accountConnections.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  coin: text("coin").notNull(),
  side: text("side").notNull(), // "long" | "short" (derived from signed size)
  size: numeric("size", { precision: 30, scale: 10 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }),
  markPrice: numeric("mark_price", { precision: 20, scale: 8 }),
  positionValue: numeric("position_value", { precision: 20, scale: 4 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 4 }),
  returnOnEquity: numeric("return_on_equity", { precision: 12, scale: 6 }),
  leverage: numeric("leverage", { precision: 10, scale: 2 }),
  leverageType: text("leverage_type"), // "cross" | "isolated"
  liquidationPrice: numeric("liquidation_price", { precision: 20, scale: 8 }),
  marginUsed: numeric("margin_used", { precision: 20, scale: 4 }),
  cumFunding: numeric("cum_funding", { precision: 20, scale: 6 }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const positionSnapshots = pgTable("position_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  connectionId: text("connection_id")
    .notNull()
    .references(() => accountConnections.id, { onDelete: "cascade" }),
  coin: text("coin").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  markPrice: numeric("mark_price", { precision: 20, scale: 8 }),
  positionValue: numeric("position_value", { precision: 20, scale: 4 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 4 }),
});

// ---------- SyncLog ----------
export const syncLogs = pgTable("sync_logs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  connectionId: text("connection_id")
    .notNull()
    .references(() => accountConnections.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "ok" | "error"
  positionsFound: numeric("positions_found", { precision: 6, scale: 0 }),
  equity: numeric("equity", { precision: 20, scale: 4 }),
  message: text("message"),
  trigger: text("trigger"), // "manual" | "scheduled"
});

export const accountConnectionsRelations = relations(accountConnections, ({ one, many }) => ({
  account: one(accounts, {
    fields: [accountConnections.accountId],
    references: [accounts.id],
  }),
  positions: many(positions),
  logs: many(syncLogs),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  connection: one(accountConnections, {
    fields: [positions.connectionId],
    references: [accountConnections.id],
  }),
}));

// ---------- PlatformBalance (spot / non-margin holdings on a connection) ----------
// Separate pool from the perps margin account, so these ARE added to equity to
// get the account total — unlike `positions`, whose value is already inside it.
export const platformBalances = pgTable("platform_balances", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  connectionId: text("connection_id")
    .notNull()
    .references(() => accountConnections.id, { onDelete: "cascade" }),
  coin: text("coin").notNull(),
  total: numeric("total", { precision: 30, scale: 10 }).notNull(),
  hold: numeric("hold", { precision: 30, scale: 10 }),
  price: numeric("price", { precision: 20, scale: 8 }),
  usdValue: numeric("usd_value", { precision: 20, scale: 4 }),
  // What the venue says the holding cost, in the platform's reporting currency.
  // Null means it doesn't say — never zero, because a zero cost would report
  // the whole balance as profit, and a missing cost used to report "+0,00 €"
  // P&L, which claims the holding is exactly flat.
  costBasis: numeric("cost_basis", { precision: 20, scale: 4 }),
  // False when this balance is already inside the account's equity (Bybit
  // unified). Only rows marked true are added to Portfolio Value — otherwise
  // the same money would land in Net Worth twice.
  countsInPortfolio: boolean("counts_in_portfolio").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- ExchangeRate ----------
// One row per quote currency, rate expressed per 1 unit of the base (EUR).
// Refreshed automatically; `manual` marks a rate the user pinned by hand so a
// later automatic refresh doesn't silently overwrite their choice.
export const exchangeRates = pgTable("exchange_rates", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  base: text("base").notNull().default("EUR"),
  quote: text("quote").notNull().unique(),
  rate: numeric("rate", { precision: 20, scale: 10 }).notNull(),
  manual: boolean("manual").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  source: text("source"),
});

// ---------- PositionMeta ----------
// Manual tags on an automatically-synced position.
//
// Sync fully replaces the `positions` rows, so tags cannot live there or every
// refresh would wipe them. Keyed by connection + coin, which is stable across
// syncs, honouring PRODUCT_VISION §10: automatic sync never deletes manual
// metadata attached to a position.
export const positionMeta = pgTable(
  "position_meta",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => accountConnections.id, { onDelete: "cascade" }),
    coin: text("coin").notNull(),
    riskLevel: text("risk_level"),
    expectedReturn: text("expected_return"),
    timeHorizon: text("time_horizon"),
    liquidity: text("liquidity"),
    // Filled in from what the platform says the instrument is.
    assetType: text("asset_type"),
    // Cash and stablecoins have no P&L — their price doesn't move — but they
    // can pay interest, and that is the only return they have. Yours to set;
    // the platform doesn't tell us.
    apr: numeric("apr", { precision: 6, scale: 3 }),
    // True while the value above came from the connector. A sync may replace
    // its own guess; the moment you choose one this goes false and syncing
    // leaves it alone forever.
    assetTypeAuto: boolean("asset_type_auto").notNull().default(false),
    playlistId: text("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.coin] })]
);

// ---------- AppSettings ----------
// Single-row key/value store for app-wide preferences (base currency, …).
// Kept as rows rather than columns so adding a preference needs no migration.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Subscription ----------
/**
 * Money that leaves every period whether you do anything or not.
 *
 * Deliberately NOT transactions. A subscription is a *commitment*: it says what
 * will be charged, not what has been. The charges themselves arrive as normal
 * transactions from a CSV import or by hand, and are counted there. Nothing in
 * this table is ever added to Net Worth or to spending totals — otherwise every
 * Netflix charge would land twice, once as the transaction and once as the
 * subscription.
 */
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  // "monthly" | "yearly" | "weekly" | "quarterly"
  cadence: text("cadence").notNull().default("monthly"),
  // Which account it is charged to, if known. Null = not tracked.
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  // Anchor date for working out the next charge. Null = unknown, so the app
  // shows the cost but says nothing about when.
  nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
  // Cancelled subscriptions are kept, not deleted: what you used to pay is the
  // most useful evidence that cancelling worked.
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Budget ----------
/**
 * A monthly spending limit for one expense category.
 *
 * NOT a bucket. A bucket is money physically set aside inside an account; a
 * budget is a limit on what you intend to spend and moves no money at all.
 * Conflating them would be the sixth double-counting bug in this project, so
 * budgets touch no balance and appear in no total.
 *
 * One row per category per month, so changing December's limit doesn't rewrite
 * what November was judged against.
 */
export const budgets = pgTable("budgets", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  // Yours to name. The first version hardcoded one budget per category per
  // month, which can express "€400 for food" and nothing else — not "€150 a
  // week for going out" across three categories, nor "€600 a year for
  // insurance". Both are budgets people actually keep.
  name: text("name").notNull(),
  // "weekly" | "monthly" | "quarterly" | "yearly"
  period: text("period").notNull().default("monthly"),
  limitAmount: numeric("limit_amount", { precision: 18, scale: 2 }).notNull(),
  // The cycle runs from this date, not from the 1st. A weekly budget started
  // on a Wednesday should run Wednesday to Wednesday.
  anchorDate: timestamp("anchor_date", { withTimezone: true }).defaultNow().notNull(),
  // Unspent budget carries into the next period — and so does overspend.
  rollover: boolean("rollover").notNull().default(false),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Which categories a budget watches. Many-to-many on purpose. */
export const budgetCategories = pgTable(
  "budget_categories",
  {
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.categoryId] })]
);

// =================== Knowledge Library ===================
/**
 * One table for books, videos, podcasts and courses.
 *
 * The alternative — a table per medium — duplicates the taxonomy four times
 * and makes "everything I have on Stoicism" a four-way union. A podcast
 * episode and a university lecture course are the same kind of thing here:
 * something to learn from, with a creator, a level and a progress.
 *
 * Nothing about money lives in this file's neighbourhood; the library never
 * touches an account, a balance or Net Worth.
 */
export const learningResources = pgTable("learning_resources", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  // "BOOK" | "VIDEO" | "PODCAST" | "COURSE"
  type: text("type").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  /**
   * Whoever made it: author, YouTube channel, podcast host, professor,
   * university. Deliberately one free-text field — a role system would earn
   * its complexity only once you needed to ask "everything by this person
   * across media", and you don't yet.
   */
  creator: text("creator").notNull(),
  description: text("description").notNull().default(""),
  whyLearn: text("why_learn"),
  lessons: text("lessons"),
  externalUrl: text("external_url"),
  imageUrl: text("image_url"),
  // "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
  level: text("level").notNull().default("BEGINNER"),
  perspective: text("perspective"),
  language: text("language"),
  publicationYear: numeric("publication_year", { precision: 4, scale: 0 }),
  // "SAVED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
  status: text("status").notNull().default("SAVED"),
  progress: numeric("progress", { precision: 10, scale: 2 }).notNull().default("0"),
  totalUnits: numeric("total_units", { precision: 10, scale: 2 }),
  // "PAGES" | "MINUTES" | "LESSONS" | "PERCENTAGE" — pages and minutes are
  // never added together, which is why the unit is stored per resource.
  progressUnit: text("progress_unit").notNull().default("PERCENTAGE"),
  personalRating: numeric("personal_rating", { precision: 2, scale: 0 }),
  notes: text("notes"),
  featured: boolean("featured").notNull().default(false),
  /**
   * Yours. Nothing else in the app may set this.
   *
   * Separate from `featured` (a shelf the app arranges) and from
   * `editorialRank` (a claim the app makes) precisely so the three can
   * disagree: the app can call a book the greatest ever written and you can
   * still not have starred it. The seed never sets it.
   */
  favourite: boolean("favourite").notNull().default(false),
  /** When you starred it, so the list can be ordered by most recent. */
  favouritedAt: timestamp("favourited_at", { withTimezone: true }),
  /**
   * Editorial standing, as opposed to what you personally thought of it.
   *
   * Rank 1 is a claim the application makes, held by one resource and no other
   * — the unique constraint is the enforcement, not a convention (Postgres
   * doesn't compare NULLs, so everything unranked coexists happily). Keeping
   * this separate from `personalRating` is the whole point: an editorial
   * position must never be implemented as a fake five stars.
   */
  editorialRank: numeric("editorial_rank", { precision: 4, scale: 0 }).unique(),
  /** Eligible for the hero slot at the top of the library. */
  heroFeatured: boolean("hero_featured").notNull().default(false),
  /**
   * The badge text, stored rather than derived.
   *
   * The alternative — `if (title === "The Holy Bible")` — would break on a
   * rename, on a translation of the interface, and on a second edition, and it
   * would hide an editorial decision inside a string comparison.
   */
  specialBadge: text("special_badge"),
  specialDescription: text("special_description"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Fields only some media have.
 *
 * Kept in a side table so the main row doesn't carry a dozen columns that are
 * null for three types out of four. A podcast has no ISBN and no page count,
 * and a schema that pretends otherwise invites a UI that shows them.
 */
export const learningResourceMeta = pgTable("learning_resource_meta", {
  resourceId: text("resource_id")
    .primaryKey()
    .references(() => learningResources.id, { onDelete: "cascade" }),
  // BOOK
  isbn13: text("isbn13"),
  pageCount: numeric("page_count", { precision: 6, scale: 0 }),
  coverUrl: text("cover_url"),
  // Affiliate links carry a different rel than ordinary ones; see
  // src/lib/library/links.ts.
  affiliateUrl: text("affiliate_url"),
  translator: text("translator"),
  /**
   * Which edition you actually hold.
   *
   * A work and a copy of it aren't the same thing: two Bibles can differ in
   * translation, canon, publisher, page count and ISBN while being the same
   * entry in the library. These fields describe your copy, so the library
   * doesn't need one row per translation.
   */
  translation: text("translation"),
  edition: text("edition"),
  publisher: text("publisher"),
  // VIDEO / PODCAST / COURSE
  platform: text("platform"),
  /**
   * Where to actually watch it, when that differs from the home page.
   *
   * A university course has two useful links: the site with the syllabus,
   * readings and transcripts, and the video playlist. `externalUrl` keeps the
   * site; this holds the playlist, so neither has to be thrown away.
   */
  videoUrl: text("video_url"),
  durationMinutes: numeric("duration_minutes", { precision: 8, scale: 0 }),
  channelName: text("channel_name"),
  hostName: text("host_name"),
  guestName: text("guest_name"),
  // COURSE
  institution: text("institution"),
  instructor: text("instructor"),
  lessonCount: numeric("lesson_count", { precision: 6, scale: 0 }),
  completedLessons: numeric("completed_lessons", { precision: 6, scale: 0 }),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 1 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One taxonomy for every medium. Philosophy holds books and lectures alike. */
export const resourceCategories = pgTable("resource_categories", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: numeric("sort_order", { precision: 4, scale: 0 }).notNull().default("0"),
});

/** A subtag belongs to one category: "Stoicism" only makes sense under Philosophy. */
export const resourceSubtags = pgTable(
  "resource_subtags",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    categoryId: text("category_id")
      .notNull()
      .references(() => resourceCategories.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique("resource_subtags_category_slug").on(t.categoryId, t.slug)]
);

export const learningResourceCategories = pgTable(
  "learning_resource_categories",
  {
    resourceId: text("resource_id")
      .notNull()
      .references(() => learningResources.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => resourceCategories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.categoryId] })]
);

export const learningResourceSubtags = pgTable(
  "learning_resource_subtags",
  {
    resourceId: text("resource_id")
      .notNull()
      .references(() => learningResources.id, { onDelete: "cascade" }),
    subtagId: text("subtag_id")
      .notNull()
      .references(() => resourceSubtags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.subtagId] })]
);

// ---------- SavedView ----------
/**
 * A named filter/group/sort combination for the investments analysis.
 *
 * Stored as an opaque JSON string on purpose: the analysis controls change
 * often, and a schema that mirrors them would need a migration every time. An
 * unreadable or outdated view is discarded when loaded rather than crashing.
 */
export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  // Which screen it belongs to, e.g. "investments-analysis".
  scope: text("scope").notNull(),
  config: text("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Dividends, interest and other distributions actually received.
 *
 * Only what was paid. The platforms report history; none of them publishes a
 * forward calendar, so nothing here is a prediction — anything the app says
 * about a *future* payment is inferred from these rows and labelled as such.
 *
 * `reference` is the platform's own id for the payment and is what makes
 * re-syncing safe: the same dividend arriving twice is the same row.
 */
export const dividendPayments = pgTable(
  "dividend_payments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    connectionId: text("connection_id")
      .notNull()
      .references(() => accountConnections.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The platform's ticker, matching positions.coin. */
    ticker: text("ticker").notNull(),
    instrumentName: text("instrument_name"),
    isin: text("isin"),
    paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
    quantity: numeric("quantity", { precision: 30, scale: 10 }),
    /** Gross per share, in the instrument's currency — not the account's. */
    grossPerShare: numeric("gross_per_share", { precision: 20, scale: 8 }),
    /** What actually landed, in the account's currency. */
    amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    /**
     * The platform's own word: ORDINARY, INTEREST, CAPITAL_GAINS and so on.
     * Kept raw. Interest on cash and a dividend on a share are both income but
     * they are not the same thing, and only the source can tell them apart.
     */
    type: text("type"),
    /** The platform's payment id, for deduplication. */
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("dividend_payments_connection_reference").on(t.connectionId, t.reference)]
);

/**
 * A broker statement, stored line by line.
 *
 * Kept verbatim rather than distilled on import. A statement is the only place
 * that says how much money you *added* — and a balance that rose because you
 * deposited is not a balance that rose because you did well. Distilling it into
 * totals at import time throws away the ability to ask a question you hadn't
 * thought of yet.
 *
 * `naturalKey` is what stops the same payment being counted twice when it
 * arrives both from a sync and from a file you import later.
 */
export const brokerEvents = pgTable(
  "broker_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    /** BUY | SELL | DIVIDEND | INTEREST | DEPOSIT | WITHDRAWAL | FEE */
    kind: text("kind").notNull(),
    /** The statement's own short symbol, e.g. "IGLA". */
    symbol: text("symbol"),
    /**
     * The instrument's ISIN, validated on import.
     *
     * This is what holdings are rebuilt on. A symbol is ambiguous across
     * exchanges and countries; an ISIN isn't, which matters for a broker like
     * Trade Republic where the statement is the only record of what is held.
     */
    isin: text("isin"),
    /** The platform ticker it was matched to, when a unique match existed. */
    ticker: text("ticker"),
    quantity: numeric("quantity", { precision: 30, scale: 10 }),
    price: numeric("price", { precision: 20, scale: 8 }),
    /** Signed: negative when money left the account. */
    amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
    fees: numeric("fees", { precision: 20, scale: 4 }),
    currency: text("currency").notNull().default("EUR"),
    description: text("description"),
    externalId: text("external_id"),
    naturalKey: text("natural_key").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("broker_events_account_natural_key").on(t.accountId, t.naturalKey)]
);
