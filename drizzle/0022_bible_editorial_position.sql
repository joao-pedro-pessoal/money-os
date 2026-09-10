ALTER TABLE "learning_resource_meta" ADD COLUMN "translation" text;--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ADD COLUMN "edition" text;--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ADD COLUMN "publisher" text;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "editorial_rank" numeric(4, 0);--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "hero_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "special_badge" text;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD COLUMN "special_description" text;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_editorial_rank_unique" UNIQUE("editorial_rank");