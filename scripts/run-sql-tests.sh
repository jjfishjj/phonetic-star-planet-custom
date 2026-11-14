#!/usr/bin/env bash
set -euo pipefail

DB="phonetic_star_planet_test_$$"
SEED_FILE="${SEED_FILE:-supabase/seed.sql}"
BACKFILL_FILE="$(mktemp /tmp/phonetic-backfill.XXXXXX.sql)"
cleanup() { sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true; rm -f "$BACKFILL_FILE"; }
trap cleanup EXIT
cat supabase/migrations/005_backfill_levels_examples.sql > "$BACKFILL_FILE"
chmod 644 "$BACKFILL_FILE"

if ! pg_lsclusters 16 main --no-header | grep -q ' online '; then
  sudo pg_ctlcluster 16 main start
fi
sudo -u postgres createdb "$DB"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
drop role if exists anon;
drop role if exists authenticated;
create role anon nologin;
create role authenticated nologin;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text unique not null);
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','admin@test.local'),
 ('00000000-0000-0000-0000-000000000002','user@test.local');
create or replace function auth.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select ((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid);
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
SQL

for migration in supabase/migrations/*.sql; do
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" < "$migration"
done
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -c "insert into public.phonetic_admins(user_id) values ('00000000-0000-0000-0000-000000000001');"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" < "$SEED_FILE"
for test_file in supabase/tests/*.sql; do
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -v backfill_file="$BACKFILL_FILE" -d "$DB" < "$test_file"
done
printf 'Local SQL verification passed in temporary database %s\n' "$DB"
