ALTER TABLE "session_exercise" ADD COLUMN "warmup_key" text;--> statement-breakpoint
ALTER TABLE "session_set" ADD COLUMN "generated_warmup" boolean DEFAULT false NOT NULL;