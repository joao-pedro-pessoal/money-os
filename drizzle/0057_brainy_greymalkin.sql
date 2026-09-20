CREATE TABLE "asset_logos" (
	"symbol" text PRIMARY KEY NOT NULL,
	"image" text,
	"bytes" integer,
	"source" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
