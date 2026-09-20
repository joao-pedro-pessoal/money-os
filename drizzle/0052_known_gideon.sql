CREATE TABLE "fund_holdings" (
	"lookup" text PRIMARY KEY NOT NULL,
	"isin" text,
	"fund_name" text,
	"source" text NOT NULL,
	"as_of" text,
	"rows" text NOT NULL,
	"row_count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
