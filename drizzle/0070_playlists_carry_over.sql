-- Every position, trade and watchlist item keeps the playlist it was in, now as
-- the first of a list. The old column stays until the version that reads it is
-- no longer published (TAREFAS.md).
UPDATE "holdings" SET "playlist_ids" = ARRAY["playlist_id"] WHERE "playlist_id" IS NOT NULL;--> statement-breakpoint
UPDATE "position_meta" SET "playlist_ids" = ARRAY["playlist_id"] WHERE "playlist_id" IS NOT NULL;--> statement-breakpoint
UPDATE "trade_classifications" SET "playlist_ids" = ARRAY["playlist_id"] WHERE "playlist_id" IS NOT NULL;--> statement-breakpoint
UPDATE "watchlist_items" SET "playlist_ids" = ARRAY["playlist_id"] WHERE "playlist_id" IS NOT NULL;
