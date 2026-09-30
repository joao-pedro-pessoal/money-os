CREATE TABLE "sync_sign_in_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"device_name" text NOT NULL,
	"claim_hash" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"user_id" text,
	"ciphertext" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_sign_in_requests" ADD CONSTRAINT "sync_sign_in_requests_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;