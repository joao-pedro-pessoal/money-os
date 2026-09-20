CREATE TABLE "company_moves" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text,
	"change_year" numeric(12, 4),
	"change_day" numeric(12, 4),
	"currency" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_holdings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;