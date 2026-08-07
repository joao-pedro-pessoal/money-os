import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  pgEnum,
  primaryKey,
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
  priority: numeric("priority", { precision: 4, scale: 0 }).notNull().default("0"),
  targetAmount: numeric("target_amount", { precision: 18, scale: 2 }),
  // Share of available cash this bucket should hold, 0-100. Null = no plan.
  targetPercent: numeric("target_percent", { precision: 5, scale: 2 }),
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
export const accountSnapshots = pgTable("account_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
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
