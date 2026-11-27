ALTER TABLE "program_run" ADD COLUMN "pauses" jsonb;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD COLUMN "stall_deload" boolean;