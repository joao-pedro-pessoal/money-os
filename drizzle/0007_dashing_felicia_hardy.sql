CREATE TABLE "platform_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"coin" text NOT NULL,
	"total" numeric(30, 10) NOT NULL,
	"hold" numeric(30, 10),
	"price" numeric(20, 8),
	"usd_value" numeric(20, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "last_equity" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "last_spot_value" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "last_withdrawable" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "last_margin_used" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "platform_balances" ADD CONSTRAINT "platform_balances_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;