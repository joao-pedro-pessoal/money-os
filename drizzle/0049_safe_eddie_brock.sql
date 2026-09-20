ALTER TYPE "public"."import_source" ADD VALUE 'bank';--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "encrypted_session" text;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "bank_account_uid" text;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "consent_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "bank_import_from" text;