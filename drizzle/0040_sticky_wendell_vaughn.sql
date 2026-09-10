CREATE TABLE "trade_classifications" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"asset_type" text,
	"risk_level" text,
	"expected_return" text,
	"time_horizon" text,
	"liquidity" text,
	"apr" numeric(8, 3),
	"playlist_id" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_classifications" ADD CONSTRAINT "trade_classifications_activity_id_investment_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."investment_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_classifications" ADD CONSTRAINT "trade_classifications_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;