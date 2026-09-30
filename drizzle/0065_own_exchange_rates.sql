-- Exchange rates become each person's own: a rate pinned by hand is a choice
-- about one person's money. Arranged like 0062: the existing rows go to the
-- owner through a constant default, then inserts take the connection's
-- app.user_id, and the table gets the same row-level policy as the rest.
ALTER TABLE "exchange_rates" DROP CONSTRAINT "exchange_rates_quote_unique";--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_quote" UNIQUE("user_id","quote");--> statement-breakpoint
ALTER TABLE "exchange_rates" ALTER COLUMN "user_id" SET DEFAULT current_setting('app.user_id');--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_rows" ON "exchange_rates"
  USING ("user_id" = current_setting('app.user_id', true))
  WITH CHECK ("user_id" = current_setting('app.user_id', true));
