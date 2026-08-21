CREATE TABLE "learning_resource_categories" (
	"resource_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "learning_resource_categories_resource_id_category_id_pk" PRIMARY KEY("resource_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "learning_resource_meta" (
	"resource_id" text PRIMARY KEY NOT NULL,
	"isbn13" text,
	"page_count" numeric(6, 0),
	"cover_url" text,
	"affiliate_url" text,
	"translator" text,
	"platform" text,
	"duration_minutes" numeric(8, 0),
	"channel_name" text,
	"host_name" text,
	"guest_name" text,
	"institution" text,
	"instructor" text,
	"lesson_count" numeric(6, 0),
	"completed_lessons" numeric(6, 0),
	"estimated_hours" numeric(6, 1),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_resource_subtags" (
	"resource_id" text NOT NULL,
	"subtag_id" text NOT NULL,
	CONSTRAINT "learning_resource_subtags_resource_id_subtag_id_pk" PRIMARY KEY("resource_id","subtag_id")
);
--> statement-breakpoint
CREATE TABLE "learning_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"creator" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"why_learn" text,
	"lessons" text,
	"external_url" text,
	"image_url" text,
	"level" text DEFAULT 'BEGINNER' NOT NULL,
	"perspective" text,
	"language" text,
	"publication_year" numeric(4, 0),
	"status" text DEFAULT 'SAVED' NOT NULL,
	"progress" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_units" numeric(10, 2),
	"progress_unit" text DEFAULT 'PERCENTAGE' NOT NULL,
	"personal_rating" numeric(2, 0),
	"notes" text,
	"featured" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "resource_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" numeric(4, 0) DEFAULT '0' NOT NULL,
	CONSTRAINT "resource_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "resource_subtags" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "resource_subtags_category_slug" UNIQUE("category_id","slug")
);
--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ADD CONSTRAINT "learning_resource_categories_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_categories" ADD CONSTRAINT "learning_resource_categories_category_id_resource_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."resource_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_meta" ADD CONSTRAINT "learning_resource_meta_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ADD CONSTRAINT "learning_resource_subtags_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource_subtags" ADD CONSTRAINT "learning_resource_subtags_subtag_id_resource_subtags_id_fk" FOREIGN KEY ("subtag_id") REFERENCES "public"."resource_subtags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_subtags" ADD CONSTRAINT "resource_subtags_category_id_resource_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."resource_categories"("id") ON DELETE cascade ON UPDATE no action;