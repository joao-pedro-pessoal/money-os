ALTER TABLE "transactions" ADD COLUMN "discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "cashback_expected" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "cashback_for_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashback_for_id_transactions_id_fk" FOREIGN KEY ("cashback_for_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;