ALTER TABLE "investment_activities" ADD COLUMN "broker_position_id" text;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD COLUMN "broker_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD COLUMN "broker_position_summary" boolean DEFAULT false NOT NULL;