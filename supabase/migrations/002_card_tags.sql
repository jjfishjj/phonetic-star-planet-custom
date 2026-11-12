-- Additive card metadata upgrade. Existing IDs, deck links, order and legacy indexes stay intact.
begin;

alter table public.phonetic_cards add column if not exists topic text not null default 'general';
alter table public.phonetic_cards add column if not exists difficulty smallint not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.phonetic_cards'::regclass and conname='phonetic_cards_topic_valid') then
    alter table public.phonetic_cards add constraint phonetic_cards_topic_valid check (topic in ('general','greetings','people','home','food','travel','time','numbers','expressions','nature','study','shopping','actions','descriptions'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.phonetic_cards'::regclass and conname='phonetic_cards_difficulty_valid') then
    alter table public.phonetic_cards add constraint phonetic_cards_difficulty_valid check (difficulty between 1 and 3);
  end if;
end $$;
comment on column public.phonetic_cards.topic is 'Stable topic slug; labels live in shared/card-tags.js.';
comment on column public.phonetic_cards.difficulty is 'Site-relative practice level: 1 beginner, 2 basic, 3 challenge; not a proficiency-test rating.';

grant insert (topic, difficulty) on public.phonetic_cards to authenticated;
grant update (topic, difficulty) on public.phonetic_cards to authenticated;

create or replace function public.phonetic_import_cards(p_deck_id text, p_rows jsonb, p_update_existing boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; v_id uuid; v_word text; v_roman text; v_hint text; v_meaning text; v_cue text;
  v_topic text; v_difficulty smallint; v_has_topic boolean; v_has_difficulty boolean;
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
    v_has_topic := r ? 'topic';
    if v_has_topic then
      if jsonb_typeof(r->'topic') is distinct from 'string' then raise exception 'row % topic must be a valid slug', v_count; end if;
      v_topic := r->>'topic';
      if v_topic not in ('general','greetings','people','home','food','travel','time','numbers','expressions','nature','study','shopping','actions','descriptions') then raise exception 'row % topic must be a valid slug', v_count; end if;
    else v_topic := 'general'; end if;
    v_has_difficulty := r ? 'difficulty';
    if v_has_difficulty then
      if jsonb_typeof(r->'difficulty') is distinct from 'number' or (r->>'difficulty')::numeric <> trunc((r->>'difficulty')::numeric) or (r->>'difficulty')::numeric not between 1 and 3 then raise exception 'row % difficulty must be 1, 2, or 3', v_count; end if;
      v_difficulty := (r->>'difficulty')::smallint;
    else v_difficulty := 1; end if;
    select * into v_existing from public.phonetic_cards c where c.id = v_id;
    if not p_update_existing then
      if v_existing.id is not null or exists (select 1 from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word) then raise exception 'row % conflicts with an existing card', v_count; end if;
      if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
      insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published, topic, difficulty) values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published, v_topic, v_difficulty); v_inserted := v_inserted + 1;
    else
      if v_has_id and v_existing.id is null then if exists (select 1 from public.phonetic_cards c where c.id = v_id and c.deck_id <> p_deck_id) then raise exception 'row % id belongs to another deck', v_count; end if; raise exception 'row % id does not exist in this deck', v_count; end if;
      if v_existing.id is not null and v_existing.deck_id <> p_deck_id then raise exception 'row % id belongs to another deck', v_count; end if;
      if v_existing.id is null then select * into v_existing from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word; end if;
      if v_existing.id is not null then
        if not v_has_position then v_position := v_existing.position; end if;
        if not v_has_published then v_published := v_existing.published; end if;
        if not v_has_topic then v_topic := v_existing.topic; end if;
        if not v_has_difficulty then v_difficulty := v_existing.difficulty; end if;
        update public.phonetic_cards set word=v_word, roman=v_roman, hint=v_hint, meaning=v_meaning, cue=v_cue, position=v_position, published=v_published, topic=v_topic, difficulty=v_difficulty where id=v_existing.id; v_updated := v_updated + 1;
      else
        if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
        insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published, topic, difficulty) values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published, v_topic, v_difficulty); v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end; $$;

revoke all on function public.phonetic_import_cards(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.phonetic_import_cards(text, jsonb, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
