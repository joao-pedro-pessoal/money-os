CREATE TABLE "symbol_names" (
	"user_id" text DEFAULT current_setting('app.user_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_names_user_symbol" UNIQUE("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "symbol_names" ADD CONSTRAINT "symbol_names_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;