ALTER TABLE "asset_profiles" ADD COLUMN "expense_ratio" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "asset_profiles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;