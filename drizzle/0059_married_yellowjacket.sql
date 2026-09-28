CREATE TABLE "sync_device_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ciphertext" text,
	"state" text DEFAULT 'waiting' NOT NULL,
	"device_name" text,
	"claim_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_device_links" ADD CONSTRAINT "sync_device_links_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;