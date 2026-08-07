CREATE TABLE "playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"asset_type" text,
	"current_price" numeric(18, 4),
	"target_price" numeric(18, 4),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"notes" text,
	"playlist_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "direction" text DEFAULT 'long' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "playlist_id" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "realized_pnl" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;