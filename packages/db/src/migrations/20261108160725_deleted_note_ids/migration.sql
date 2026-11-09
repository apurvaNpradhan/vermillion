CREATE TABLE "deleted_note_ids" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deleted_note_ids_user_id_idx" ON "deleted_note_ids" ("user_id");--> statement-breakpoint
ALTER TABLE "deleted_note_ids" ADD CONSTRAINT "deleted_note_ids_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;