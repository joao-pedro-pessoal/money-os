CREATE TABLE "asset_profiles" (
	"lookup" text PRIMARY KEY NOT NULL,
	"symbol" text,
	"name" text,
	"quote_type" text,
	"sector" text,
	"country" text,
	"sector_weights" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
