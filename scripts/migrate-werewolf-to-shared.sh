#!/usr/bin/env bash
# One-time historical-data import from the old Werewolf database.
# Keep both database URLs private and stop writes on the old game first.
set -euo pipefail
umask 077
: "${WEREWOLF_SOURCE_DATABASE_URL:?Set the original Werewolf database URL locally}"
: "${SHARED_APPS_DATABASE_URL:?Set the shared Apps database URL locally}"
for name in pg_dump psql sed grep diff; do
  command -v "$name" >/dev/null || { echo "Missing $name" >&2; exit 1; }
done
tables=(games players player_roles day_votes day_runoff_votes night_votes decoy_votes decoy_questions seer_investigations bodyguard_protections player_rejoin_tickets)
source_args=()
for table in "${tables[@]}"; do source_args+=("--table=public.$table"); done
source_file=$(mktemp)
mapped_file=$(mktemp)
transaction_file=$(mktemp)
source_counts=$(mktemp)
target_counts=$(mktemp)
trap 'rm -f "$source_file" "$mapped_file" "$transaction_file" "$source_counts" "$target_counts"' EXIT

pg_dump --dbname="$WEREWOLF_SOURCE_DATABASE_URL" --data-only --column-inserts \
  --no-owner --no-privileges "${source_args[@]}" > "$source_file"

grep -Eq '^INSERT INTO ' "$source_file" || { echo 'No source inserts: aborting' >&2; exit 1; }
sed -E 's/^INSERT INTO ("public"|public)\./INSERT INTO werewolf./' "$source_file" > "$mapped_file"
if grep -Eq '^INSERT INTO ("public"|public)\.' "$mapped_file"; then
  echo 'Unmapped public INSERT remains: aborting' >&2
  exit 1
fi

{
  echo 'BEGIN;'
  echo 'SET CONSTRAINTS ALL DEFERRED;'
  echo 'ALTER TABLE werewolf.players DISABLE TRIGGER USER;'
  echo 'TRUNCATE TABLE werewolf.games,werewolf.players,werewolf.player_roles,werewolf.day_votes,werewolf.day_runoff_votes,werewolf.night_votes,werewolf.decoy_votes,werewolf.decoy_questions,werewolf.seer_investigations,werewolf.bodyguard_protections,werewolf.player_rejoin_tickets;'
  cat "$mapped_file"
  echo 'ALTER TABLE werewolf.players ENABLE TRIGGER USER;'
  echo 'COMMIT;'
} > "$transaction_file"

psql "$SHARED_APPS_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$transaction_file"

count_sql() {
  local schema="$1"
  local first=1
  for table in "${tables[@]}"; do
    if (( first )); then first=0; else printf ' UNION ALL '; fi
    printf "SELECT '%s' AS name, count(*) AS n FROM %s.%s" "$table" "$schema" "$table"
  done
  printf ' ORDER BY name;'
}
psql "$WEREWOLF_SOURCE_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "$(count_sql public)" > "$source_counts"
psql "$SHARED_APPS_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "$(count_sql werewolf)" > "$target_counts"
if ! diff -u "$source_counts" "$target_counts"; then
  echo 'Counts differ: do not release production to shared backend' >&2
  exit 1
fi
echo 'Historical table counts match. Verify gameplay before production cutover.'
