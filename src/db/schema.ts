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
