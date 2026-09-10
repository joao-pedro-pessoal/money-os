CREATE TABLE "account_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"encrypted_secret" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"coin" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"mark_price" numeric(20, 8),
	"position_value" numeric(20, 4),
	"unrealized_pnl" numeric(20, 4)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"account_id" text NOT NULL,
	"coin" text NOT NULL,
	"side" text NOT NULL,
	"size" numeric(30, 10) NOT NULL,
	"entry_price" numeric(20, 8),
	"mark_price" numeric(20, 8),
	"position_value" numeric(20, 4),
	"unrealized_pnl" numeric(20, 4),
	"return_on_equity" numeric(12, 6),
	"leverage" numeric(10, 2),
	"leverage_type" text,
	"liquidation_price" numeric(20, 8),
	"margin_used" numeric(20, 4),
	"cum_funding" numeric(20, 6),
	"opened_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"positions_found" numeric(6, 0),
	"equity" numeric(20, 4),
	"message" text,
	"trigger" text
);
--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_account_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."account_connections"("id") ON DELETE cascade ON UPDATE no action;