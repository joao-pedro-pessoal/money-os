CREATE TABLE "benchmark_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"date" text NOT NULL,
	"close" numeric(20, 6) NOT NULL,
	"currency" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_prices_symbol_date" UNIQUE("symbol","date")
);
