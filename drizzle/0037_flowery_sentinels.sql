CREATE TABLE "investment_activity_tags" (
	"activity_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "investment_activity_tags_activity_id_tag_id_pk" PRIMARY KEY("activity_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ADD CONSTRAINT "investment_activity_tags_activity_id_investment_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."investment_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activity_tags" ADD CONSTRAINT "investment_activity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;