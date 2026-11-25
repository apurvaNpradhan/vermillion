ALTER TABLE "gym" ADD COLUMN "unavailable_equipment" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym" ADD COLUMN "dumbbell_max_kg" double precision;--> statement-breakpoint
ALTER TABLE "gym" ADD CONSTRAINT "gym_unavailable_equipment_shape" CHECK (jsonb_typeof("unavailable_equipment") = 'array' AND jsonb_array_length("unavailable_equipment") <= 12);--> statement-breakpoint
ALTER TABLE "gym" ADD CONSTRAINT "gym_dumbbell_max_range" CHECK ("dumbbell_max_kg" > 0 AND "dumbbell_max_kg" <= 1000);