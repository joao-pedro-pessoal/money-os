CREATE TABLE "sync_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_login_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"secret_hash" text,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_login_methods_kind_subject" UNIQUE("kind","subject")
);
--> statement-breakpoint
CREATE TABLE "sync_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sync_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sync_vault_versions" (
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"device_id" text,
	"envelope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_vault_versions_user_id_version_pk" PRIMARY KEY("user_id","version")
);
--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_login_methods" ADD CONSTRAINT "sync_login_methods_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_device_id_sync_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sync_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_vault_versions" ADD CONSTRAINT "sync_vault_versions_user_id_sync_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sync_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_vault_versions" ADD CONSTRAINT "sync_vault_versions_device_id_sync_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sync_devices"("id") ON DELETE set null ON UPDATE no action;