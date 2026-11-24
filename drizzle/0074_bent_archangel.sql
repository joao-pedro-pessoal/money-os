CREATE TABLE "auth_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identity_subject_unique" UNIQUE("issuer","subject"),
	CONSTRAINT "auth_identity_user_issuer_unique" UNIQUE("user_id","issuer")
);
--> statement-breakpoint
CREATE TABLE "google_auth_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"browser_hash" text NOT NULL,
	"mode" text NOT NULL,
	"intent" text NOT NULL,
	"purpose" text,
	"native_challenge" text,
	"nonce" text NOT NULL,
	"destination" text NOT NULL,
	"target_user_id" text,
	"target_version" integer,
	"session_hash" text,
	"subject" text,
	"email" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_auth_requests" ADD CONSTRAINT "google_auth_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_auth_requests_expiry_idx" ON "google_auth_requests" USING btree ("expires_at");