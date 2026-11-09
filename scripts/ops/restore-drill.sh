#!/usr/bin/env bash
# Restore drill: proves a Postgres backup restores into an empty database and
# the tables the app depends on are there.
#
#   scripts/ops/restore-drill.sh path/to/backup.sql.gz|backup.dump|backup.sql
#
# Runs a throwaway postgres container (removed on exit) and touches nothing
# else. Handles Dokploy's gzipped SQL and pg_dump custom-format archives.
# Adapted from the morrow project's restore drill.
set -euo pipefail

backup="${1:?usage: restore-drill.sh <backup-file>}"
[ -f "$backup" ] || { echo "No such file: $backup" >&2; exit 1; }

# Match the major version of the production database service.
image="${POSTGRES_IMAGE:-postgres:18-alpine}"
# Tables to count after the restore. A fork that adds or drops tables edits this list.
tables=(user session account verification user_preferences exercise auth_email_outbox)

name="restore-drill-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=restore "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -U postgres -d restore >/dev/null

echo "Restoring $(basename "$backup") ..."
case "$backup" in
  *.gz)
    gunzip -c "$backup" | docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U postgres -d restore >/dev/null
    ;;
  *.sql)
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U postgres -d restore <"$backup" >/dev/null
    ;;
  *)
    docker exec -i "$name" pg_restore --no-owner --no-acl -U postgres -d restore <"$backup"
    ;;
esac

echo "Checking the restored data ..."
status=0
for table in "${tables[@]}"; do
  count=$(docker exec "$name" psql -At -U postgres -d restore -c "select count(*) from \"$table\"" 2>/dev/null || echo "MISSING")
  printf '  %-18s %s\n' "$table" "$count"
  [ "$count" = "MISSING" ] && status=1
done

if [ "$status" -eq 0 ]; then
  echo "Restore drill passed."
else
  echo "Restore drill FAILED: a required table is missing." >&2
fi
exit "$status"
