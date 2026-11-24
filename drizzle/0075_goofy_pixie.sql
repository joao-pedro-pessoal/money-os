CREATE TABLE "work_gates" (
	"key" text PRIMARY KEY NOT NULL,
	"history" text DEFAULT '[]' NOT NULL,
	"leases" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "work_gates_updated_idx" ON "work_gates" USING btree ("updated_at");