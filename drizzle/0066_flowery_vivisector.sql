CREATE TABLE "qr_sign_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_hash" text NOT NULL,
	"approval_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"approved_user_id" text,
	"approved_at" timestamp with time zone,
	"approver_issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qr_sign_ins" ADD CONSTRAINT "qr_sign_ins_approved_user_id_users_id_fk" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_sign_ins_expiry_idx" ON "qr_sign_ins" USING btree ("expires_at");