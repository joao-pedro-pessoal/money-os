-- Each person's arrivals are theirs alone, like every other row of their data
-- (CLAUDE.md, "Every person's rows are Postgres's to keep apart").
ALTER TABLE "expected_arrivals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "expected_arrivals"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));
