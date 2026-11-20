ALTER TABLE "exercise_setting" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "exercise_setting" ADD CONSTRAINT "exercise_setting_note_length" CHECK (char_length("note") <= 1000);