-- Each person's names for their tickers are theirs alone, like every other row
-- of their data (CLAUDE.md, "Every person's rows are Postgres's to keep apart").
ALTER TABLE "symbol_names" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "symbol_names"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));
