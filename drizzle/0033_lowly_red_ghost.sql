CREATE TABLE "investment_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"import_id" text,
	"connection_id" text,
	"date" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"symbol" text,
	"quantity" numeric(30, 10),
	"price" numeric(20, 8),
	"amount" numeric(20, 4) NOT NULL,
	"fees" numeric(20, 4),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text,
	"external_id" text,
	"realized_pnl" numeric(20, 4),
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_activities_account_fingerprint" UNIQUE("account_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;