CREATE TABLE "dividend_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ticker" text NOT NULL,
	"instrument_name" text,
	"isin" text,
	"paid_on" timestamp with time zone NOT NULL,
	"quantity" numeric(30, 10),
	"gross_per_share" numeric(20, 8),
	"amount" numeric(20, 4) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"type" text,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dividend_payments_connection_reference" UNIQUE("connection_id","reference")
);
--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "last_realized_pnl" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "dividend_payments" ADD CONSTRAINT "dividend_payments_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_payments" ADD CONSTRAINT "dividend_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;