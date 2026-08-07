CREATE TABLE "holding_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"holding_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(18, 4) NOT NULL,
	"value" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"platform" text NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"avg_entry_price" numeric(18, 4) NOT NULL,
	"current_price" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"notes" text,
	"last_price_update" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;