ALTER TABLE "budgets" DROP CONSTRAINT "budgets_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "month";