ALTER TABLE "learning_resources" ADD COLUMN "favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "favourited_at" timestamp with time zone;