ALTER TABLE "program" ADD COLUMN "phase_plan" jsonb;--> statement-breakpoint
ALTER TABLE "program_run" ADD COLUMN "inserted_deloads" jsonb;--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "phase_modifiers" jsonb;--> statement-breakpoint
ALTER TABLE "workout" ADD COLUMN "main_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_phase_plan_shape" CHECK ("phase_plan" IS NULL OR jsonb_typeof("phase_plan") = 'object');--> statement-breakpoint
ALTER TABLE "program_run" ADD CONSTRAINT "program_run_inserted_deloads_shape" CHECK ("inserted_deloads" IS NULL OR (jsonb_typeof("inserted_deloads") = 'array' AND jsonb_array_length("inserted_deloads") <= 52));--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "session_phase_known" CHECK ("phase" IN ('build','push','test','deload'));--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "session_phase_modifiers_shape" CHECK ("phase_modifiers" IS NULL OR jsonb_typeof("phase_modifiers") = 'object');