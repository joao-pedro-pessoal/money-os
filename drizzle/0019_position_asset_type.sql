ALTER TABLE "position_meta" ADD COLUMN "asset_type" text;--> statement-breakpoint
ALTER TABLE "position_meta" ADD COLUMN "asset_type_auto" boolean DEFAULT false NOT NULL;