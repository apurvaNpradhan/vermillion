CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY,
	"user_id" text,
	"title" text NOT NULL,
	"primary_muscle" text NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"equipment" text NOT NULL,
	"exercise_type" text NOT NULL,
	"is_full_bodyweight" boolean DEFAULT false NOT NULL,
	"rank" smallint DEFAULT 0 NOT NULL,
	"search_terms" text,
	"aka" text,
	"instructions" text,
	"video_key" text,
	"thumbnail_key" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_primary_muscle_known" CHECK ("primary_muscle" IN ('abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'cardio', 'chest', 'forearms', 'full_body', 'glutes', 'hamstrings', 'lats', 'lower_back', 'neck', 'other', 'quadriceps', 'shoulders', 'traps', 'triceps', 'upper_back')),
	CONSTRAINT "exercise_secondary_muscles_known" CHECK ("secondary_muscles" <@ ARRAY['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'cardio', 'chest', 'forearms', 'full_body', 'glutes', 'hamstrings', 'lats', 'lower_back', 'neck', 'other', 'quadriceps', 'shoulders', 'traps', 'triceps', 'upper_back']::text[]),
	CONSTRAINT "exercise_equipment_known" CHECK ("equipment" IN ('none', 'barbell', 'dumbbell', 'kettlebell', 'machine', 'plate', 'resistance_band', 'suspension', 'other')),
	CONSTRAINT "exercise_type_known" CHECK ("exercise_type" IN ('weight_reps', 'reps_only', 'bodyweight_reps', 'bodyweight_assisted_reps', 'duration', 'distance_duration', 'short_distance_weight', 'floors_duration', 'steps_duration')),
	CONSTRAINT "exercise_title_length" CHECK (char_length("title") BETWEEN 1 AND 100),
	CONSTRAINT "exercise_instructions_length" CHECK (char_length("instructions") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "reference_import" (
	"catalog" text PRIMARY KEY,
	"fingerprint" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "exercise_user_id_idx" ON "exercise" ("user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_catalog_title_uidx" ON "exercise" ("title") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Replication for the synced `exercise` table (ADR 0019, 0023, 0034). Added in the same release
-- as the streams' table, before any stream reads it. `reference_import` stays server-only.
ALTER PUBLICATION powersync ADD TABLE exercise;--> statement-breakpoint
GRANT SELECT ON exercise TO powersync_replication;
