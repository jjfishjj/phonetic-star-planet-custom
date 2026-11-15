-- Optional, switchable VARK presentation cues. The ordinary cue remains the fallback.
begin;

alter table public.phonetic_cards
  add column if not exists cue_visual text not null default '',
  add column if not exists cue_auditory text not null default '',
  add column if not exists cue_read_write text not null default '',
  add column if not exists cue_kinesthetic text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.phonetic_cards'::regclass and conname = 'phonetic_cards_cue_visual_length') then
    alter table public.phonetic_cards add constraint phonetic_cards_cue_visual_length check (length(cue_visual) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.phonetic_cards'::regclass and conname = 'phonetic_cards_cue_auditory_length') then
    alter table public.phonetic_cards add constraint phonetic_cards_cue_auditory_length check (length(cue_auditory) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.phonetic_cards'::regclass and conname = 'phonetic_cards_cue_read_write_length') then
    alter table public.phonetic_cards add constraint phonetic_cards_cue_read_write_length check (length(cue_read_write) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.phonetic_cards'::regclass and conname = 'phonetic_cards_cue_kinesthetic_length') then
    alter table public.phonetic_cards add constraint phonetic_cards_cue_kinesthetic_length check (length(cue_kinesthetic) <= 1000);
  end if;
end $$;

comment on column public.phonetic_cards.cue_visual is 'Optional visual-preference presentation cue; does not replace the ordinary cue or imply a fixed ability.';
comment on column public.phonetic_cards.cue_auditory is 'Optional auditory-preference presentation cue; may use the existing device speech controls.';
comment on column public.phonetic_cards.cue_read_write is 'Optional read/write-preference presentation cue.';
comment on column public.phonetic_cards.cue_kinesthetic is 'Optional kinesthetic-preference presentation cue.';

grant insert (cue_visual, cue_auditory, cue_read_write, cue_kinesthetic) on public.phonetic_cards to authenticated;
grant update (cue_visual, cue_auditory, cue_read_write, cue_kinesthetic) on public.phonetic_cards to authenticated;

-- Preserve the existing atomic/admin-only import contract while recognizing the new optional fields.
create or replace function public.phonetic_import_cards(p_deck_id text, p_rows jsonb, p_update_existing boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; v_id uuid; v_word text; v_roman text; v_hint text; v_meaning text; v_cue text;
  v_cue_visual text := ''; v_cue_auditory text := ''; v_cue_read_write text := ''; v_cue_kinesthetic text := '';
  v_topic text; v_difficulty smallint; v_level text; v_example_sentence text; v_example_translation text;
  v_has_topic boolean; v_has_difficulty boolean; v_has_level boolean; v_has_example_sentence boolean; v_has_example_translation boolean;
  v_has_cue_visual boolean; v_has_cue_auditory boolean; v_has_cue_read_write boolean; v_has_cue_kinesthetic boolean;
  v_has_roman boolean; v_has_cue boolean;
  v_published boolean; v_position integer; v_existing public.phonetic_cards%rowtype; v_lang text;
  v_max_position integer; v_inserted integer := 0; v_updated integer := 0; v_count integer := 0;
  v_seen_words text[] := array[]::text[]; v_seen_ids uuid[] := array[]::uuid[]; v_id_raw text; v_has_id boolean;
  v_has_published boolean; v_has_position boolean;
begin
  if not public.phonetic_is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select d.lang into v_lang from public.phonetic_decks d where d.id = p_deck_id;
  if p_deck_id is null or not found then raise exception 'unknown deck'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'import exceeds 2000 rows'; end if;
  select coalesce(max(position), -1) into v_max_position from public.phonetic_cards where deck_id = p_deck_id;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_count := v_count + 1;
    v_cue_visual := ''; v_cue_auditory := ''; v_cue_read_write := ''; v_cue_kinesthetic := '';
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
    if v_has_topic then if jsonb_typeof(r->'topic') is distinct from 'string' then raise exception 'row % topic must be a valid slug', v_count; end if; v_topic := r->>'topic'; if v_topic not in ('general','greetings','people','home','food','travel','time','numbers','expressions','nature','study','shopping','actions','descriptions') then raise exception 'row % topic must be a valid slug', v_count; end if; else v_topic := 'general'; end if;
    v_has_difficulty := r ? 'difficulty';
    if v_has_difficulty then if jsonb_typeof(r->'difficulty') is distinct from 'number' or (r->>'difficulty')::numeric <> trunc((r->>'difficulty')::numeric) or (r->>'difficulty')::numeric not between 1 and 3 then raise exception 'row % difficulty must be 1, 2, or 3', v_count; end if; v_difficulty := (r->>'difficulty')::smallint; else v_difficulty := 1; end if;
    v_has_level := r ? 'proficiency_level';
    if v_has_level then
      if jsonb_typeof(r->'proficiency_level') not in ('string','null') then raise exception 'row % proficiency_level must be a string or null', v_count; end if;
      v_level := case when jsonb_typeof(r->'proficiency_level') = 'null' then null else btrim(r->>'proficiency_level') end;
      if not public.phonetic_proficiency_level_valid(v_level, v_lang, p_deck_id) then raise exception 'row % proficiency_level is invalid for deck', v_count; end if;
    else v_level := null; end if;
    v_has_example_sentence := r ? 'example_sentence'; v_has_example_translation := r ? 'example_translation';
    if v_has_example_sentence then if jsonb_typeof(r->'example_sentence') is distinct from 'string' then raise exception 'row % example_sentence must be a string', v_count; end if; v_example_sentence := btrim(r->>'example_sentence'); else v_example_sentence := ''; end if;
    if v_has_example_translation then if jsonb_typeof(r->'example_translation') is distinct from 'string' then raise exception 'row % example_translation must be a string', v_count; end if; v_example_translation := btrim(r->>'example_translation'); else v_example_translation := ''; end if;
    if length(v_example_sentence) > 500 or length(v_example_translation) > 500 then raise exception 'row % has an example field over its length limit', v_count; end if;
    v_has_roman := r ? 'roman'; v_has_cue := r ? 'cue';
    v_has_cue_visual := r ? 'cue_visual'; v_has_cue_auditory := r ? 'cue_auditory';
    v_has_cue_read_write := r ? 'cue_read_write'; v_has_cue_kinesthetic := r ? 'cue_kinesthetic';
    if v_has_cue_visual then if jsonb_typeof(r->'cue_visual') not in ('string','null') then raise exception 'row % cue_visual must be a string or null', v_count; end if; v_cue_visual := case when jsonb_typeof(r->'cue_visual') = 'null' then '' else btrim(r->>'cue_visual') end; end if;
    if v_has_cue_auditory then if jsonb_typeof(r->'cue_auditory') not in ('string','null') then raise exception 'row % cue_auditory must be a string or null', v_count; end if; v_cue_auditory := case when jsonb_typeof(r->'cue_auditory') = 'null' then '' else btrim(r->>'cue_auditory') end; end if;
    if v_has_cue_read_write then if jsonb_typeof(r->'cue_read_write') not in ('string','null') then raise exception 'row % cue_read_write must be a string or null', v_count; end if; v_cue_read_write := case when jsonb_typeof(r->'cue_read_write') = 'null' then '' else btrim(r->>'cue_read_write') end; end if;
    if v_has_cue_kinesthetic then if jsonb_typeof(r->'cue_kinesthetic') not in ('string','null') then raise exception 'row % cue_kinesthetic must be a string or null', v_count; end if; v_cue_kinesthetic := case when jsonb_typeof(r->'cue_kinesthetic') = 'null' then '' else btrim(r->>'cue_kinesthetic') end; end if;
    if length(v_cue_visual) > 1000 or length(v_cue_auditory) > 1000 or length(v_cue_read_write) > 1000 or length(v_cue_kinesthetic) > 1000 then raise exception 'row % has a VARK cue over its 1000 character limit', v_count; end if;

    select * into v_existing from public.phonetic_cards c where c.id = v_id;
    if not p_update_existing then
      if v_existing.id is not null or exists (select 1 from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word) then raise exception 'row % conflicts with an existing card', v_count; end if;
      if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
      if (btrim(v_example_sentence) = '') <> (btrim(v_example_translation) = '') then raise exception 'row % example fields must both be blank or both be nonblank', v_count; end if;
      insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published, topic, difficulty, proficiency_level, example_sentence, example_translation, cue_visual, cue_auditory, cue_read_write, cue_kinesthetic)
      values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published, v_topic, v_difficulty, v_level, v_example_sentence, v_example_translation, v_cue_visual, v_cue_auditory, v_cue_read_write, v_cue_kinesthetic);
      v_inserted := v_inserted + 1;
    else
      if v_has_id and v_existing.id is null then if exists (select 1 from public.phonetic_cards c where c.id = v_id and c.deck_id <> p_deck_id) then raise exception 'row % id belongs to another deck', v_count; end if; raise exception 'row % id does not exist in this deck', v_count; end if;
      if v_existing.id is not null and v_existing.deck_id <> p_deck_id then raise exception 'row % id belongs to another deck', v_count; end if;
      if v_existing.id is null then select * into v_existing from public.phonetic_cards c where c.deck_id = p_deck_id and c.word = v_word; end if;
      if v_existing.id is not null then
        if not v_has_position then v_position := v_existing.position; end if;
        if not v_has_published then v_published := v_existing.published; end if;
        if not v_has_topic then v_topic := v_existing.topic; end if;
        if not v_has_difficulty then v_difficulty := v_existing.difficulty; end if;
        if not v_has_level then v_level := v_existing.proficiency_level; end if;
        if not v_has_example_sentence then v_example_sentence := v_existing.example_sentence; end if;
        if not v_has_example_translation then v_example_translation := v_existing.example_translation; end if;
        if not v_has_roman then v_roman := v_existing.roman; end if;
        if not v_has_cue then v_cue := v_existing.cue; end if;
        if not v_has_cue_visual then v_cue_visual := v_existing.cue_visual; end if;
        if not v_has_cue_auditory then v_cue_auditory := v_existing.cue_auditory; end if;
        if not v_has_cue_read_write then v_cue_read_write := v_existing.cue_read_write; end if;
        if not v_has_cue_kinesthetic then v_cue_kinesthetic := v_existing.cue_kinesthetic; end if;
        if (btrim(v_example_sentence) = '') <> (btrim(v_example_translation) = '') then raise exception 'row % example fields must both be blank or both be nonblank', v_count; end if;
        update public.phonetic_cards set word=v_word, roman=v_roman, hint=v_hint, meaning=v_meaning, cue=v_cue, position=v_position, published=v_published, topic=v_topic, difficulty=v_difficulty, proficiency_level=v_level, example_sentence=v_example_sentence, example_translation=v_example_translation, cue_visual=v_cue_visual, cue_auditory=v_cue_auditory, cue_read_write=v_cue_read_write, cue_kinesthetic=v_cue_kinesthetic where id=v_existing.id;
        v_updated := v_updated + 1;
      else
        if not v_has_position then v_max_position := v_max_position + 1; v_position := v_max_position; end if;
        if (btrim(v_example_sentence) = '') <> (btrim(v_example_translation) = '') then raise exception 'row % example fields must both be blank or both be nonblank', v_count; end if;
        insert into public.phonetic_cards(id, deck_id, word, roman, hint, meaning, cue, position, published, topic, difficulty, proficiency_level, example_sentence, example_translation, cue_visual, cue_auditory, cue_read_write, cue_kinesthetic)
        values (v_id, p_deck_id, v_word, v_roman, v_hint, v_meaning, v_cue, v_position, v_published, v_topic, v_difficulty, v_level, v_example_sentence, v_example_translation, v_cue_visual, v_cue_auditory, v_cue_read_write, v_cue_kinesthetic);
        v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end; $$;

revoke all on function public.phonetic_import_cards(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.phonetic_import_cards(text, jsonb, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
