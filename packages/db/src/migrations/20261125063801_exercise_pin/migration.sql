CREATE TABLE "exercise_pin" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"exercise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_pin_user_exercise_uidx" ON "exercise_pin" ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "exercise_pin_exercise_id_idx" ON "exercise_pin" ("exercise_id");--> statement-breakpoint
ALTER TABLE "exercise_pin" ADD CONSTRAINT "exercise_pin_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exercise_pin" ADD CONSTRAINT "exercise_pin_exercise_id_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercise"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE "exercise_pin";
--> statement-breakpoint
GRANT SELECT ON "exercise_pin" TO powersync_replication;
