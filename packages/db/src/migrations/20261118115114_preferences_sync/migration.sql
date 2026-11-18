-- Preferences sync through PowerSync (ADR 0048): the existing one-row-per-user table joins the
-- publication so every device reads it locally. No column changes.
ALTER PUBLICATION powersync ADD TABLE "user_preferences";--> statement-breakpoint
GRANT SELECT ON "user_preferences" TO powersync_replication;
