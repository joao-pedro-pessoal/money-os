CREATE TABLE "expected_arrivals" (
	"user_id" text DEFAULT current_setting('app.user_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"expected_id" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"account_id" text,
	"transaction_id" text,
	"closed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expected_money" ADD COLUMN "received" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "expected_money" ADD COLUMN "extra" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "expected_money" ADD COLUMN "next_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expected_arrivals" ADD CONSTRAINT "expected_arrivals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_arrivals" ADD CONSTRAINT "expected_arrivals_expected_id_expected_money_id_fk" FOREIGN KEY ("expected_id") REFERENCES "public"."expected_money"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_arrivals" ADD CONSTRAINT "expected_arrivals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_arrivals" ADD CONSTRAINT "expected_arrivals_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;