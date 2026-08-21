CREATE TABLE "budget_categories" (
	"budget_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "budget_categories_budget_id_category_id_pk" PRIMARY KEY("budget_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_category_month";--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "name" text DEFAULT 'Budget' NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "period" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "anchor_date" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "rollover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Carry the old per-category-per-month budgets into the new shape.
-- Each one becomes a monthly envelope named after its category, anchored to
-- the month it applied to, watching exactly that category. Nothing is lost.
UPDATE "budgets" b
SET "name" = c."name",
    "period" = 'monthly',
    "anchor_date" = (b."month")::timestamptz
FROM "categories" c
WHERE b."category_id" = c."id" AND b."month" IS NOT NULL;
--> statement-breakpoint

INSERT INTO "budget_categories" ("budget_id", "category_id")
SELECT "id", "category_id" FROM "budgets" WHERE "category_id" IS NOT NULL
ON CONFLICT DO NOTHING;
