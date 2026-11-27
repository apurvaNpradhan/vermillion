CREATE TABLE "gym" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "gym_name_length" CHECK (char_length("name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "gym_exercise_setting" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"gym_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"load_ranges" jsonb DEFAULT '[]' NOT NULL,
	"setup_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "gym_exercise_setting_ranges_shape" CHECK (jsonb_typeof("load_ranges") = 'array' AND jsonb_array_length("load_ranges") <= 8),
	CONSTRAINT "gym_exercise_setting_note_length" CHECK (char_length("setup_note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD COLUMN "gym_id" uuid;--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "gym_id" uuid;--> statement-breakpoint
CREATE INDEX "gym_user_id_live_idx" ON "gym" ("user_id","created_at","id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gym_equipment_gym_id_live_idx" ON "gym_equipment" ("gym_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gym_exercise_setting_user_id_live_idx" ON "gym_exercise_setting" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_exercise_setting_live_idx" ON "gym_exercise_setting" ("user_id","gym_id","exercise_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "gym" ADD CONSTRAINT "gym_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gym"("id");--> statement-breakpoint
ALTER TABLE "gym_exercise_setting" ADD CONSTRAINT "gym_exercise_setting_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gym_exercise_setting" ADD CONSTRAINT "gym_exercise_setting_gym_id_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gym"("id");--> statement-breakpoint
ALTER TABLE "gym_exercise_setting" ADD CONSTRAINT "gym_exercise_setting_exercise_id_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercise"("id");--> statement-breakpoint
ALTER TABLE "gym_equipment" DROP CONSTRAINT "gym_equipment_kind_known", ADD CONSTRAINT "gym_equipment_kind_known" CHECK ("kind" IN ('bar','plate','dumbbell_rack','stack','add_on'));--> statement-breakpoint
-- Hand-written: publication, grants and the backfill (drizzle-kit does not generate these).
-- Keep them when this migration is regenerated.
ALTER PUBLICATION powersync ADD TABLE "gym", "gym_exercise_setting";--> statement-breakpoint
GRANT SELECT ON "gym", "gym_exercise_setting" TO powersync_replication;--> statement-breakpoint
-- Everyone who has a kit gets "My gym", and the kit moves into it. Accounts without a kit get
-- theirs when they next ask for sync credentials (the server creates it then). Sessions stay
-- gym_id NULL, which reads as any gym.
INSERT INTO "gym" ("id", "user_id", "name")
SELECT uuidv7(), "user_id", 'My gym' FROM (SELECT DISTINCT "user_id" FROM "gym_equipment") AS owners;--> statement-breakpoint
UPDATE "gym_equipment" SET "gym_id" = "gym"."id"
FROM "gym" WHERE "gym"."user_id" = "gym_equipment"."user_id" AND "gym_equipment"."gym_id" IS NULL;
