CREATE TABLE "deleted_progress_photo" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_photo" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"media_id" uuid NOT NULL,
	"pose" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "progress_photo_pose" CHECK ("pose" IN ('front','side','back'))
);
--> statement-breakpoint
CREATE INDEX "progress_photo_date_idx" ON "progress_photo" ("user_id","local_date" DESC NULLS LAST) WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "progress_photo_media_id_idx" ON "progress_photo" ("media_id");--> statement-breakpoint
ALTER TABLE "deleted_progress_photo" ADD CONSTRAINT "deleted_progress_photo_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "progress_photo" ADD CONSTRAINT "progress_photo_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE "progress_photo";--> statement-breakpoint
GRANT SELECT ON "progress_photo" TO powersync_replication;
