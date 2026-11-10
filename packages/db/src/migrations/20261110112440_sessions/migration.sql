CREATE TABLE "exercise_setting" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"exercise_id" uuid NOT NULL,
	"bar_id" uuid,
	"log_effort" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gym_equipment" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"weight_kg" double precision NOT NULL,
	"unit" text NOT NULL,
	"label" text,
	"count" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "gym_equipment_kind_known" CHECK ("kind" IN ('bar','plate')),
	CONSTRAINT "gym_equipment_weight_range" CHECK ("weight_kg" BETWEEN 0 AND 1000),
	CONSTRAINT "gym_equipment_unit_known" CHECK ("unit" IN ('kg','lb')),
	CONSTRAINT "gym_equipment_label_length" CHECK (char_length("label") BETWEEN 1 AND 100),
	CONSTRAINT "gym_equipment_count_range" CHECK ("count" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "training_session" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"workout_id" uuid,
	"program_id" uuid,
	"run_id" uuid,
	"slot_id" uuid,
	"cycle" integer,
	"title" text NOT NULL,
	"title_derived" boolean DEFAULT true NOT NULL,
	"note" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_s" integer,
	"device_id" uuid NOT NULL,
	"rest_set_id" uuid,
	"rest_started_at" timestamp with time zone,
	"rest_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "session_cycle_range" CHECK ("cycle" BETWEEN 1 AND 2147483647),
	CONSTRAINT "session_title_length" CHECK (char_length("title") BETWEEN 1 AND 100),
	CONSTRAINT "session_note_length" CHECK (char_length("note") <= 1000),
	CONSTRAINT "session_duration_range" CHECK ("duration_s" BETWEEN 0 AND 86400)
);
--> statement-breakpoint
CREATE TABLE "session_exercise" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_title" text NOT NULL,
	"exercise_type" text NOT NULL,
	"source_workout_exercise_id" uuid,
	"position" text NOT NULL,
	"rest_seconds" smallint,
	"note" text,
	"superset_group" uuid,
	"log_effort" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "session_exercise_title_length" CHECK (char_length("exercise_title") BETWEEN 1 AND 100),
	CONSTRAINT "session_exercise_type_known" CHECK ("exercise_type" IN ('weight_reps','reps_only','bodyweight_reps','bodyweight_assisted_reps','duration','distance_duration','short_distance_weight','floors_duration','steps_duration')),
	CONSTRAINT "session_exercise_position_length" CHECK (char_length("position") BETWEEN 1 AND 100),
	CONSTRAINT "session_exercise_rest_range" CHECK ("rest_seconds" BETWEEN 0 AND 600),
	CONSTRAINT "session_exercise_note_length" CHECK (char_length("note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "session_set" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"position" text NOT NULL,
	"kind" text NOT NULL,
	"weight_kg" double precision,
	"reps" integer,
	"duration_s" integer,
	"distance_m" double precision,
	"floors" integer,
	"steps" integer,
	"rpe" double precision,
	"completed_at" timestamp with time zone,
	"timer_started_at" timestamp with time zone,
	"target" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "session_set_position_length" CHECK (char_length("position") BETWEEN 1 AND 100),
	CONSTRAINT "session_set_kind_known" CHECK ("kind" IN ('warmup','working','drop','failure')),
	CONSTRAINT "session_set_weight_range" CHECK ("weight_kg" BETWEEN 0 AND 1000),
	CONSTRAINT "session_set_reps_range" CHECK ("reps" BETWEEN 1 AND 999),
	CONSTRAINT "session_set_duration_range" CHECK ("duration_s" BETWEEN 1 AND 86400),
	CONSTRAINT "session_set_distance_range" CHECK ("distance_m" BETWEEN 0 AND 1000000),
	CONSTRAINT "session_set_floors_range" CHECK ("floors" BETWEEN 1 AND 10000),
	CONSTRAINT "session_set_steps_range" CHECK ("steps" BETWEEN 1 AND 1000000),
	CONSTRAINT "session_set_rpe_step" CHECK ("rpe" IN (6,6.5,7,7.5,8,8.5,9,9.5,10)),
	CONSTRAINT "session_set_target_shape" CHECK ("target" IS NULL OR jsonb_typeof("target") = 'object')
);
--> statement-breakpoint
CREATE INDEX "exercise_setting_user_id_live_idx" ON "exercise_setting" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_setting_user_exercise_live_idx" ON "exercise_setting" ("user_id","exercise_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gym_equipment_user_id_live_idx" ON "gym_equipment" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_user_id_live_idx" ON "training_session" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_user_started_at_idx" ON "training_session" ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_exercise_user_id_live_idx" ON "session_exercise" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_exercise_order_idx" ON "session_exercise" ("session_id","position","id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_exercise_exercise_id_idx" ON "session_exercise" ("exercise_id");--> statement-breakpoint
CREATE INDEX "session_set_user_id_live_idx" ON "session_set" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_set_order_idx" ON "session_set" ("session_exercise_id","position","id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "exercise_setting" ADD CONSTRAINT "exercise_setting_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exercise_setting" ADD CONSTRAINT "exercise_setting_exercise_id_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercise"("id");--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_session_id_training_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_exercise_id_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercise"("id");--> statement-breakpoint
ALTER TABLE "session_set" ADD CONSTRAINT "session_set_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_set" ADD CONSTRAINT "session_set_session_exercise_id_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercise"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Replication for the synced session tables (ADR 0019, 0023, 0038). Added in the same release as
-- the stream columns, before any stream reads them.
ALTER PUBLICATION powersync ADD TABLE training_session, session_exercise, session_set, gym_equipment, exercise_setting;--> statement-breakpoint
GRANT SELECT ON training_session, session_exercise, session_set, gym_equipment, exercise_setting TO powersync_replication;
