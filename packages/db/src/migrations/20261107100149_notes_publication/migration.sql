-- Replication setup for the synced `notes` table (ADR 0019, 0023). The privileged
-- bootstrap (`pnpm sync:bootstrap`) creates the `powersync` publication and the
-- `powersync_replication` role; run it before migrating. The migration fails when
-- either is missing, which is the point: a database that cannot replicate must
-- not look migrated. The whole table is published; the stream names its columns.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
		RAISE EXCEPTION 'publication "powersync" does not exist: run the sync bootstrap before migrating (ADR 0023)';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_replication') THEN
		RAISE EXCEPTION 'role "powersync_replication" does not exist: run the sync bootstrap before migrating (ADR 0023)';
	END IF;
END
$$;--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE notes;--> statement-breakpoint
GRANT SELECT ON notes TO powersync_replication;
