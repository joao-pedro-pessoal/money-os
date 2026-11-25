CREATE TABLE "private_snapshots" (
	"user_id" text DEFAULT current_setting('app.user_id') NOT NULL,
	"key" text NOT NULL,
	"payload" text,
	"generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone NOT NULL,
	CONSTRAINT "private_snapshots_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "private_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private_snapshots" ADD CONSTRAINT "private_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "private_snapshots_expiry_idx" ON "private_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "own_rows" ON "private_snapshots" AS PERMISSIVE FOR ALL TO public USING ("private_snapshots"."user_id" = current_setting('app.user_id', true)) WITH CHECK ("private_snapshots"."user_id" = current_setting('app.user_id', true));