#!/usr/bin/env bash
# Data repair for the week phases release: a Program Run's `started_at` is the start of its Run
# weeks (and so of every phase), but older builds left it empty or later than the Run's earliest
# live Session (a Session logged out of order, or backfilled). This resets it to that Session's
# start. Only live Runs and live Sessions count; a Run with no Session is left alone.
#
#   DATABASE_URL=postgres://... scripts/ops/repair-run-started-at.sh           # dry run: prints
#   DATABASE_URL=postgres://... scripts/ops/repair-run-started-at.sh --apply   # writes
#
# The default is a dry run: it prints the rows it would change and writes nothing. --apply runs
# one transaction and prints what it changed. Needs psql. Run the dry run, read the rows, then
# apply, before deploying the release (docs/runbook.md, "Pre-deploy data repairs").
set -euo pipefail

mode="dry-run"
case "${1:-}" in
  "") ;;
  --apply) mode="apply" ;;
  *) echo "usage: repair-run-started-at.sh [--apply]" >&2; exit 2 ;;
esac
: "${DATABASE_URL:?set DATABASE_URL to the database to repair}"

# Runs whose started_at is missing or later than their earliest live Session.
affected='
  SELECT r.id AS run_id, r.user_id, r.started_at AS current_started_at, f.first_started_at
  FROM program_run r
  JOIN (
    SELECT run_id, min(started_at) AS first_started_at
    FROM training_session
    WHERE run_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY run_id
  ) f ON f.run_id = r.id
  WHERE r.deleted_at IS NULL
    AND (r.started_at IS NULL OR r.started_at > f.first_started_at)'

if [ "$mode" = "dry-run" ]; then
  echo "Dry run: these program_run rows would get started_at = their earliest live Session."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --pset=footer=on -c "$affected ORDER BY r.created_at"
  echo "Nothing was written. Rerun with --apply to write."
  exit 0
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -c "
  WITH affected AS ($affected)
  UPDATE program_run r
  SET started_at = a.first_started_at, updated_at = now()
  FROM affected a
  WHERE r.id = a.run_id
  RETURNING r.id AS run_id, r.user_id, a.current_started_at AS was, r.started_at AS now"
