#!/usr/bin/env bash
set -euo pipefail

DB="phonetic_star_planet_test_$$"
SEED_FILE="${SEED_FILE:-supabase/seed.sql}"
cleanup() { sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

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

sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" < supabase/migrations/001_phonetic_admin.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -c "insert into public.phonetic_admins(user_id) values ('00000000-0000-0000-0000-000000000001');"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" < "$SEED_FILE"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" < supabase/tests/001_phonetic.sql
printf 'Local SQL verification passed in temporary database %s\n' "$DB"
