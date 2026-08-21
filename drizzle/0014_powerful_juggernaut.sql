ALTER TABLE "accounts" ADD COLUMN "apr" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "apr_day_count" numeric(3, 0) DEFAULT '365';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "interest_withholding_percent" numeric(5, 2);