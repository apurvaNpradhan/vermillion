ALTER TABLE "training_session" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "paused_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "session_paused_ms_range" CHECK ("paused_ms" BETWEEN 0 AND 604800000);