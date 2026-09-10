CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"base" text DEFAULT 'EUR' NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text,
	CONSTRAINT "exchange_rates_quote_unique" UNIQUE("quote")
);
--> statement-breakpoint
CREATE TABLE "position_meta" (
	"connection_id" text NOT NULL,
	"coin" text NOT NULL,
	"risk_level" text,
	"expected_return" text,
	"time_horizon" text,
	"liquidity" text,
	"playlist_id" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_meta_connection_id_coin_pk" PRIMARY KEY("connection_id","coin")
);
--> statement-breakpoint
ALTER TABLE "position_meta" ADD CONSTRAINT "position_meta_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_meta" ADD CONSTRAINT "position_meta_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;