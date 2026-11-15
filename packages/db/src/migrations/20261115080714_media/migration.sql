CREATE TABLE "media" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"thumb_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"objects_purged_at" timestamp with time zone,
	CONSTRAINT "media_kind_known" CHECK ("kind" IN ('program_cover','exercise_image','avatar','session_photo','progress_photo')),
	CONSTRAINT "media_mime_jpeg" CHECK ("mime" = 'image/jpeg'),
	CONSTRAINT "media_dimensions_positive" CHECK ("width" > 0 AND "height" > 0),
	CONSTRAINT "media_bytes_range" CHECK ("bytes" BETWEEN 1 AND 15728640
        AND "thumb_bytes" BETWEEN 1 AND 15728640)
);
--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
CREATE INDEX "media_user_id_live_idx" ON "media" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "media_deleted_at_idx" ON "media" ("deleted_at") WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE "media";--> statement-breakpoint
GRANT SELECT ON "media" TO powersync_replication;
