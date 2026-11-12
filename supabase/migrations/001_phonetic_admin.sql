-- Phonetic Star Planet database implementation.
-- Safe to re-run on Supabase/PostgreSQL.

create extension if not exists pgcrypto;

create table if not exists public.phonetic_decks (
  id text primary key,
  name text not null,
  native text not null,
  flag text not null,
  region text not null check (region in ('asia', 'europe', 'other')),
  lang text not null,
  position integer not null check (position >= 0),
  published boolean not null default true,
  constraint phonetic_decks_id_length check (length(id) between 1 and 100),
  constraint phonetic_decks_name_length check (length(name) between 1 and 200),
  constraint phonetic_decks_native_length check (length(native) between 1 and 100),
  constraint phonetic_decks_flag_length check (length(flag) between 1 and 32),
  constraint phonetic_decks_lang_length check (length(lang) between 1 and 32)
);

create table if not exists public.phonetic_cards (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  deck_id text not null references public.phonetic_decks(id) on delete restrict,
  word text not null,
  roman text not null default '',
  hint text not null,
  meaning text not null,
  cue text not null default '',
  position integer not null check (position >= 0),
  published boolean not null default true,
  legacy_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phonetic_cards_word_nonempty check (btrim(word) <> ''),
  constraint phonetic_cards_hint_nonempty check (btrim(hint) <> ''),
  constraint phonetic_cards_meaning_nonempty check (btrim(meaning) <> ''),
  constraint phonetic_cards_word_length check (length(word) <= 300),
  constraint phonetic_cards_roman_length check (length(roman) <= 300),
  constraint phonetic_cards_hint_length check (length(hint) <= 500),
  constraint phonetic_cards_meaning_length check (length(meaning) <= 500),
  constraint phonetic_cards_cue_length check (length(cue) <= 2000),
  constraint phonetic_cards_legacy_index_nonnegative check (legacy_index is null or legacy_index >= 0)
);

-- Keep the constraints present when upgrading a table created by an older migration.
alter table public.phonetic_cards alter column id set default pg_catalog.gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'phonetic_decks_id_length') then alter table public.phonetic_decks add constraint phonetic_decks_id_length check (length(id) between 1 and 100); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_decks_name_length') then alter table public.phonetic_decks add constraint phonetic_decks_name_length check (length(name) between 1 and 200); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_decks_native_length') then alter table public.phonetic_decks add constraint phonetic_decks_native_length check (length(native) between 1 and 100); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_decks_flag_length') then alter table public.phonetic_decks add constraint phonetic_decks_flag_length check (length(flag) between 1 and 32); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_decks_lang_length') then alter table public.phonetic_decks add constraint phonetic_decks_lang_length check (length(lang) between 1 and 32); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_cards_word_length') then alter table public.phonetic_cards add constraint phonetic_cards_word_length check (length(word) <= 300); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_cards_roman_length') then alter table public.phonetic_cards add constraint phonetic_cards_roman_length check (length(roman) <= 300); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_cards_hint_length') then alter table public.phonetic_cards add constraint phonetic_cards_hint_length check (length(hint) <= 500); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_cards_meaning_length') then alter table public.phonetic_cards add constraint phonetic_cards_meaning_length check (length(meaning) <= 500); end if;
  if not exists (select 1 from pg_constraint where conname = 'phonetic_cards_cue_length') then alter table public.phonetic_cards add constraint phonetic_cards_cue_length check (length(cue) <= 2000); end if;
end $$;

create unique index if not exists phonetic_cards_deck_word_key on public.phonetic_cards (deck_id, word);
create unique index if not exists phonetic_cards_deck_legacy_index_key on public.phonetic_cards (deck_id, legacy_index) where legacy_index is not null;

create table if not exists public.phonetic_admins (user_id uuid primary key references auth.users(id) on delete cascade);

create or replace function public.phonetic_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists phonetic_cards_set_updated_at on public.phonetic_cards;
create trigger phonetic_cards_set_updated_at before update on public.phonetic_cards for each row execute function public.phonetic_set_updated_at();

create or replace function public.phonetic_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.phonetic_admins pa where pa.user_id = (select auth.uid()));
$$;
revoke all on function public.phonetic_is_admin() from public;
grant execute on function public.phonetic_is_admin() to anon, authenticated;

alter table public.phonetic_decks enable row level security;
alter table public.phonetic_cards enable row level security;
alter table public.phonetic_admins enable row level security;

drop policy if exists phonetic_decks_public_select on public.phonetic_decks;
drop policy if exists phonetic_decks_admin_select on public.phonetic_decks;
drop policy if exists phonetic_decks_admin_insert on public.phonetic_decks;
drop policy if exists phonetic_decks_admin_update on public.phonetic_decks;
create policy phonetic_decks_public_select on public.phonetic_decks for select to anon, authenticated using (published);
create policy phonetic_decks_admin_select on public.phonetic_decks for select to authenticated using (public.phonetic_is_admin());
create policy phonetic_decks_admin_insert on public.phonetic_decks for insert to authenticated with check (public.phonetic_is_admin());
create policy phonetic_decks_admin_update on public.phonetic_decks for update to authenticated using (public.phonetic_is_admin()) with check (public.phonetic_is_admin());

drop policy if exists phonetic_cards_public_select on public.phonetic_cards;
drop policy if exists phonetic_cards_admin_select on public.phonetic_cards;
drop policy if exists phonetic_cards_admin_insert on public.phonetic_cards;
drop policy if exists phonetic_cards_admin_update on public.phonetic_cards;
create policy phonetic_cards_public_select on public.phonetic_cards for select to anon, authenticated using (published and exists (select 1 from public.phonetic_decks d where d.id = deck_id and d.published));
create policy phonetic_cards_admin_select on public.phonetic_cards for select to authenticated using (public.phonetic_is_admin());
create policy phonetic_cards_admin_insert on public.phonetic_cards for insert to authenticated with check (public.phonetic_is_admin());
create policy phonetic_cards_admin_update on public.phonetic_cards for update to authenticated using (public.phonetic_is_admin()) with check (public.phonetic_is_admin());

drop policy if exists phonetic_admins_self_select on public.phonetic_admins;
drop policy if exists phonetic_admins_self_insert on public.phonetic_admins;
drop policy if exists phonetic_admins_self_update on public.phonetic_admins;
create policy phonetic_admins_self_select on public.phonetic_admins for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.phonetic_decks, public.phonetic_cards, public.phonetic_admins from anon, authenticated;
grant select on public.phonetic_decks, public.phonetic_cards to anon, authenticated;
grant select (user_id) on public.phonetic_admins to authenticated;
grant insert (id, name, native, flag, region, lang, position, published) on public.phonetic_decks to authenticated;
grant update (name, native, flag, region, lang, position, published) on public.phonetic_decks to authenticated;
grant insert (id, deck_id, word, roman, hint, meaning, cue, position, published) on public.phonetic_cards to authenticated;
grant update (word, roman, hint, meaning, cue, position, published) on public.phonetic_cards to authenticated;

create or replace function public.phonetic_import_cards(p_deck_id text, p_rows jsonb, p_update_existing boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; v_id uuid; v_word text; v_roman text; v_hint text; v_meaning text; v_cue text;
  v_published boolean; v_position integer; v_existing public.phonetic_cards%rowtype;
  v_max_position integer; v_inserted integer := 0; v_updated integer := 0; v_count integer := 0;
  v_seen_words text[] := array[]::text[]; v_seen_ids uuid[] := array[]::uuid[]; v_id_raw text; v_has_id boolean;
  v_has_published boolean; v_has_position boolean;
begin
  if not public.phonetic_is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_deck_id is null or not exists (select 1 from public.phonetic_decks d where d.id = p_deck_id) then raise exception 'unknown deck'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'import exceeds 2000 rows'; end if;
  select coalesce(max(position), -1) into v_max_position from public.phonetic_cards where deck_id = p_deck_id;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_count := v_count + 1;
    if jsonb_typeof(r) <> 'object' then raise exception 'row % must be an object', v_count; end if;
    v_word := btrim(coalesce(r->>'word', '')); v_roman := btrim(coalesce(r->>'roman', '')); v_hint := btrim(coalesce(r->>'hint', '')); v_meaning := btrim(coalesce(r->>'meaning', '')); v_cue := btrim(coalesce(r->>'cue', ''));
    if v_word = '' or v_hint = '' or v_meaning = '' then raise exception 'row % requires word, hint, and meaning', v_count; end if;
    if length(v_word) > 300 or length(v_roman) > 300 or length(v_hint) > 500 or length(v_meaning) > 500 or length(v_cue) > 2000 then raise exception 'row % has a field over its length limit', v_count; end if;
    if v_word = any(v_seen_words) then raise exception 'duplicate word in input: %', v_word; end if;
    v_seen_words := array_append(v_seen_words, v_word);
    v_id_raw := nullif(btrim(coalesce(r->>'id', '')), ''); v_has_id := v_id_raw is not null;
    if v_has_id then begin v_id := v_id_raw::uuid; exception when invalid_text_representation then raise exception 'row % has invalid id', v_count; end; if v_id = any(v_seen_ids) then raise exception 'duplicate id in input: %', v_id; end if; v_seen_ids := array_append(v_seen_ids, v_id); else v_id := pg_catalog.gen_random_uuid(); end if;
    v_has_published := r ? 'published';
    if v_has_published then if jsonb_typeof(r->'published') is distinct from 'boolean' then raise exception 'row % published must be boolean', v_count; end if; v_published := (r->>'published')::boolean; else v_published := true; end if;
    v_has_position := r ? 'position';
    if v_has_position then if jsonb_typeof(r->'position') is distinct from 'number' or (r->>'position')::numeric <> trunc((r->>'position')::numeric) then raise exception 'row % position must be an integer', v_count; end if; v_position := (r->>'position')::integer; if v_position < 0 then raise exception 'row % position must be nonnegative', v_count; end if; end if;
    select * into v_existing from public.phonetic_cards c where c.id = v_id;
    if not p_update_existing then
      if v_existing.id is not null or exists (select 1 from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word) then raise exception 'row % conflicts with an existing card', v_count; end if;
      if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
      insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published) values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published); v_inserted := v_inserted + 1;
    else
      if v_has_id and v_existing.id is null then if exists (select 1 from public.phonetic_cards c where c.id = v_id and c.deck_id <> p_deck_id) then raise exception 'row % id belongs to another deck', v_count; end if; raise exception 'row % id does not exist in this deck', v_count; end if;
      if v_existing.id is not null and v_existing.deck_id <> p_deck_id then raise exception 'row % id belongs to another deck', v_count; end if;
      if v_existing.id is null then select * into v_existing from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word; end if;
      if v_existing.id is not null then
        if not v_has_position then v_position := v_existing.position; end if;
        if not v_has_published then v_published := v_existing.published; end if;
        update public.phonetic_cards set word=v_word, roman=v_roman, hint=v_hint, meaning=v_meaning, cue=v_cue, position=v_position, published=v_published where id=v_existing.id; v_updated := v_updated + 1;
      else
        if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
        insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published) values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published); v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end; $$;

revoke all on function public.phonetic_import_cards(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.phonetic_import_cards(text, jsonb, boolean) to authenticated;

-- Bootstrap an administrator after creating the auth user:
-- insert into public.phonetic_admins(user_id) select id from auth.users where email = 'ADMIN_EMAIL_HERE' on conflict do nothing;
