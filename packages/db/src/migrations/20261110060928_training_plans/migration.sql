CREATE TABLE "program" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"planned_weeks" smallint,
	"cover_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "program_title_length" CHECK (char_length("title") BETWEEN 1 AND 100),
	CONSTRAINT "program_description_length" CHECK (char_length("description") <= 10000),
	CONSTRAINT "program_planned_weeks_range" CHECK ("planned_weeks" BETWEEN 1 AND 52)
);
--> statement-breakpoint
CREATE TABLE "program_slot" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"program_id" uuid NOT NULL,
	"workout_id" uuid,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "program_slot_position_length" CHECK (char_length("position") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"program_id" uuid,
	"title" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workout_title_length" CHECK (char_length("title") BETWEEN 1 AND 100),
	CONSTRAINT "workout_note_length" CHECK (char_length("note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "workout_exercise" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" text NOT NULL,
	"rest_seconds" smallint,
	"note" text,
	"superset_group" uuid,
	"sets" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workout_exercise_position_length" CHECK (char_length("position") BETWEEN 1 AND 100),
	CONSTRAINT "workout_exercise_rest_range" CHECK ("rest_seconds" BETWEEN 0 AND 600),
	CONSTRAINT "workout_exercise_note_length" CHECK (char_length("note") <= 1000),
	CONSTRAINT "workout_exercise_sets_shape" CHECK (jsonb_typeof("sets") = 'array' AND jsonb_array_length("sets") <= 20)
);
--> statement-breakpoint
CREATE INDEX "program_user_id_live_idx" ON "program" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "program_slot_user_id_live_idx" ON "program_slot" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "program_slot_order_idx" ON "program_slot" ("program_id","position","id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workout_user_id_live_idx" ON "workout" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workout_program_id_idx" ON "workout" ("program_id");--> statement-breakpoint
CREATE INDEX "workout_exercise_user_id_live_idx" ON "workout_exercise" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workout_exercise_order_idx" ON "workout_exercise" ("workout_id","position","id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "program_slot" ADD CONSTRAINT "program_slot_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "program_slot" ADD CONSTRAINT "program_slot_program_id_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "program_slot" ADD CONSTRAINT "program_slot_workout_id_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workout"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_program_id_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_workout_id_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workout"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_exercise_id_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercise"("id");--> statement-breakpoint
-- Replication for the synced training tables (ADR 0019, 0023, 0036). Added in the same release as
-- the `my_training` stream, before any stream reads them.
ALTER PUBLICATION powersync ADD TABLE program, workout, workout_exercise, program_slot;--> statement-breakpoint
GRANT SELECT ON program, workout, workout_exercise, program_slot TO powersync_replication;
