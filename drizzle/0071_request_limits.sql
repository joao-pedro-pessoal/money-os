CREATE TABLE "request_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"origin" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_limits_lookup_idx" ON "request_limits" USING btree ("action","origin","at");--> statement-breakpoint
CREATE INDEX "request_limits_at_idx" ON "request_limits" USING btree ("at");