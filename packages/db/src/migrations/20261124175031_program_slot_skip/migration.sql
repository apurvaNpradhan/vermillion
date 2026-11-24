CREATE TABLE "program_slot_skip" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"cycle" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "program_slot_skip_cycle_range" CHECK ("cycle" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE INDEX "program_slot_skip_user_id_live_idx" ON "program_slot_skip" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "program_slot_skip_run_idx" ON "program_slot_skip" ("run_id","cycle");--> statement-breakpoint
ALTER TABLE "program_slot_skip" ADD CONSTRAINT "program_slot_skip_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "program_slot_skip" ADD CONSTRAINT "program_slot_skip_run_id_program_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "program_run"("id");--> statement-breakpoint
ALTER TABLE "program_slot_skip" ADD CONSTRAINT "program_slot_skip_slot_id_program_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "program_slot"("id");--> statement-breakpoint
-- Replication for the synced Slot skips (ADR 0019, 0023, 0036). Added in the same release as the
-- stream column list, before any stream reads the table.
ALTER PUBLICATION powersync ADD TABLE program_slot_skip;--> statement-breakpoint
GRANT SELECT ON program_slot_skip TO powersync_replication;
