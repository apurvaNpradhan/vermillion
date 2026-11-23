ALTER TABLE "training_session" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_session" ADD COLUMN "paused_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "session_paused_ms_range" CHECK ("paused_ms" BETWEEN 0 AND 9007199254740991);