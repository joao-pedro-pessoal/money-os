-- Accounts for everyone: every row of someone's money gets an owner.
--
-- Hand-arranged from drizzle-kit's output, in an order that works on a live
-- database: the owner's row first, then every existing row given to it (a
-- constant default fills them without rewriting the tables), and only then
-- the default every later insert uses — the connection's app.user_id, which
-- fails an insert with no one signed in rather than guessing. Row-level
-- security is the next migration.
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"password_hash" text,
	"password_kind" text DEFAULT 'keyed' NOT NULL,
	"recovery_hash" text,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"sessions_not_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);--> statement-breakpoint
INSERT INTO "users" ("id") VALUES ('owner');--> statement-breakpoint
-- The vault's password accounts become ordinary ones: same email, same
-- password. "legacy" hashes are of the password itself, "keyed" of the sign-in
-- key the page derives; both are accepted at sign-in (actions/auth.ts).
-- Their vaults do not come along: those were encrypted on their devices.
INSERT INTO "users" ("id", "email", "password_hash", "password_kind", "created_at")
SELECT u."id", u."email", m."secret_hash",
       CASE WHEN m."sealed_words" IS NULL THEN 'legacy' ELSE 'keyed' END,
       u."created_at"
FROM "sync_users" u
JOIN "sync_login_methods" m ON m."user_id" = u."id" AND m."kind" = 'password'
WHERE m."secret_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";--> statement-breakpoint
ALTER TABLE "learning_resources" DROP CONSTRAINT "learning_resources_slug_unique";--> statement-breakpoint
ALTER TABLE "learning_resources" DROP CONSTRAINT "learning_resources_editorial_rank_unique";--> statement-breakpoint
ALTER TABLE "playlists" DROP CONSTRAINT "playlists_name_unique";--> statement-breakpoint
ALTER TABLE "resource_categories" DROP CONSTRAINT "resource_categories_slug_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey";--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "broker_events" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "dividend_payments" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "expected_money" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_allocations" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "interest_payments" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "liabilities" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_balances" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "position_meta" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_categories" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_subtags" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_classifications" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_key_pk" PRIMARY KEY("user_id","key");--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_events" ADD CONSTRAINT "broker_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD CONSTRAINT "bucket_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_payments" ADD CONSTRAINT "dividend_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_money" ADD CONSTRAINT "expected_money_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_allocations" ADD CONSTRAINT "holding_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_payments" ADD CONSTRAINT "interest_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ADD CONSTRAINT "investment_activity_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ADD CONSTRAINT "learning_resource_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ADD CONSTRAINT "learning_resource_meta_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ADD CONSTRAINT "learning_resource_subtags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_balances" ADD CONSTRAINT "platform_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_meta" ADD CONSTRAINT "position_meta_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_categories" ADD CONSTRAINT "resource_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_subtags" ADD CONSTRAINT "resource_subtags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_classifications" ADD CONSTRAINT "trade_classifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_snapshots_user_id" ON "account_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_id" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "broker_events_user_id" ON "broker_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dividend_payments_user_id" ON "dividend_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holding_snapshots_user_id" ON "holding_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investment_activities_user_id" ON "investment_activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "position_snapshots_user_id" ON "position_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_logs_user_id" ON "sync_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id" ON "transactions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_name" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_user_slug" UNIQUE("user_id","slug");--> statement-breakpoint
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_user_editorial_rank" UNIQUE("user_id","editorial_rank");--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_name" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "resource_categories" ADD CONSTRAINT "resource_categories_user_slug" UNIQUE("user_id","slug");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_name" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "account_connections" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "account_snapshots" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "broker_events" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "bucket_allocations" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "buckets" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "budget_categories" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "dividend_payments" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "expected_money" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "holding_allocations" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "holding_snapshots" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "imports" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "interest_payments" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "investment_activities" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "learning_resources" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "liabilities" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "platform_balances" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "playlists" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "position_meta" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "position_snapshots" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "resource_categories" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "resource_subtags" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "saved_views" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "subcategories" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "subscription_charges" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "trade_classifications" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "transaction_tags" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "watchlist_items" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');
