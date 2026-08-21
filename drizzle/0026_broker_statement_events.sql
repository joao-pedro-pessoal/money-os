CREATE TABLE "broker_events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"symbol" text,
	"ticker" text,
	"quantity" numeric(30, 10),
	"price" numeric(20, 8),
	"amount" numeric(20, 4) NOT NULL,
	"fees" numeric(20, 4),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text,
	"external_id" text,
	"natural_key" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_events_account_natural_key" UNIQUE("account_id","natural_key")
);
--> statement-breakpoint
ALTER TABLE "broker_events" ADD CONSTRAINT "broker_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;