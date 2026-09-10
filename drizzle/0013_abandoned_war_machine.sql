CREATE TABLE "holding_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"holding_id" text NOT NULL,
	"bucket_id" text NOT NULL,
	"percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_allocations_holding_bucket" UNIQUE("holding_id","bucket_id")
);
--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "base_currency" text;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "rate" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "rate_source" text;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "rate_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "value_in_base" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "backfilled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "balance_meaning" text DEFAULT 'cash_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "rows_in_file" numeric(10, 0);--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "debit_total" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "credit_total" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "holding_allocations" ADD CONSTRAINT "holding_allocations_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_allocations" ADD CONSTRAINT "holding_allocations_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Every snapshot that already existed was written before conversions were
-- frozen, so it carries no rate. Marking them keeps the chart honest: they are
-- converted at today's rate and labelled approximate, rather than quietly
-- claiming to be the rate of their own day.
UPDATE "account_snapshots" SET "backfilled" = true WHERE "value_in_base" IS NULL;
