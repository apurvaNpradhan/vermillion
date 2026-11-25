ALTER TABLE "exercise_setting" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "exercise_setting" ADD CONSTRAINT "exercise_setting_unit_known" CHECK ("unit" IN ('kg','lb'));