-- Row-level security: each person sees and writes only their own rows.
--
-- The app sets app.user_id on every connection it hands out (src/db/client.ts)
-- and connects as a login without BYPASSRLS, so these hold for every query it
-- makes, including one that forgot to filter. With app.user_id unset or empty
-- a query sees nothing and can write nothing. Migrations and scripts run as
-- the database's owner, which these do not restrict.
--
-- src/lib/__tests__/row-security.test.ts fails if a table with a user_id
-- column is missing here.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "accounts"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "categories"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "subcategories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "subcategories"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "tags"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "transaction_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "transaction_tags"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "transactions"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "transfers"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "buckets"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "bucket_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "bucket_allocations"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "interest_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "interest_payments"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "account_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "account_snapshots"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "imports"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "audit_log"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "playlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "playlists"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "watchlist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "watchlist_items"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "holdings"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "holding_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "holding_snapshots"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "holding_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "holding_allocations"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "account_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "account_connections"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "positions"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "position_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "position_snapshots"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "sync_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "sync_logs"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "platform_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "platform_balances"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "position_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "position_meta"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "app_settings"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "subscriptions"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "subscription_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "subscription_charges"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "expected_money" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "expected_money"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "budgets"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "budget_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "budget_categories"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "learning_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "learning_resources"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "learning_resource_meta"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "resource_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "resource_categories"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "resource_subtags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "resource_subtags"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "learning_resource_categories"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "learning_resource_subtags"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "saved_views"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "dividend_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "dividend_payments"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "broker_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "broker_events"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "investment_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "investment_activities"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "liabilities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "liabilities"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "investment_activity_tags"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));--> statement-breakpoint
ALTER TABLE "trade_classifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "trade_classifications"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));
