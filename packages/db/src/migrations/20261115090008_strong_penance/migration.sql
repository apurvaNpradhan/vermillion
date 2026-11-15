CREATE TABLE "session_photo" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exercise" ADD COLUMN "image_media_id" uuid;--> statement-breakpoint
CREATE INDEX "session_photo_user_id_live_idx" ON "session_photo" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_photo_session_position_idx" ON "session_photo" ("session_id","position","id");--> statement-breakpoint
ALTER TABLE "session_photo" ADD CONSTRAINT "session_photo_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_photo" ADD CONSTRAINT "session_photo_session_id_training_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_session"("id");
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE "session_photo";
--> statement-breakpoint
GRANT SELECT ON "session_photo" TO powersync_replication;
