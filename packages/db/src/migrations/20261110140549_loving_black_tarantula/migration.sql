CREATE TABLE "program_run" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"program_id" uuid NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"continued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "program_run_outcome" CHECK (("finished_at" IS NULL AND "outcome" IS NULL) OR ("finished_at" IS NOT NULL AND "outcome" IN ('completed', 'stopped')))
);
--> statement-breakpoint
CREATE INDEX "program_run_user_id_live_idx" ON "program_run" ("user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "program_run_program_id_idx" ON "program_run" ("program_id");--> statement-breakpoint
ALTER TABLE "program_run" ADD CONSTRAINT "program_run_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "program_run" ADD CONSTRAINT "program_run_program_id_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id");--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE public.program_run;
--> statement-breakpoint
GRANT SELECT ON public.program_run TO powersync_replication;
