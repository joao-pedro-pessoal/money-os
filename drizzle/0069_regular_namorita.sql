ALTER TABLE "holdings" ADD COLUMN "playlist_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "position_meta" ADD COLUMN "playlist_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_classifications" ADD COLUMN "playlist_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "playlist_ids" text[] DEFAULT '{}'::text[] NOT NULL;