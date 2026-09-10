ALTER TABLE "holdings" ALTER COLUMN "platform" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "asset_type" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "apr" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "rewards_earned" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;