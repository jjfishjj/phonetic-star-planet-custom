\set ON_ERROR_STOP on
create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;

create temporary table original_card_fields as
select c.id, to_jsonb(c) - array['proficiency_level','example_sentence','example_translation','updated_at'] as original
from public.phonetic_cards c;
select public.test_assert((select count(*)=1200 from original_card_fields), 'backfill fixture has 1200 original cards');
update public.phonetic_cards set proficiency_level=null, example_sentence='', example_translation='';
update public.phonetic_cards set proficiency_level='B2', example_sentence='An authored example stays.', example_translation='保留人工編輯的例句。'
where deck_id='en' and legacy_index=0;

\i :backfill_file

select public.test_assert((select count(*)=1200 from public.phonetic_cards where btrim(example_sentence)<>'' and btrim(example_translation)<>''), 'all original cards receive example pairs');
select public.test_assert((select count(*)=800 from public.phonetic_cards where proficiency_level is not null), 'only CEFR/JLPT/TOPIK receive proficiency levels');
select public.test_assert((select count(*)=400 from public.phonetic_cards where deck_id in ('ar','id','th','vi') and proficiency_level is null), 'legacy proficiency stays null');
select public.test_assert(not exists (
  select 1 from public.phonetic_cards c full join original_card_fields o on c.id=o.id
  where c.id is null or o.id is null
     or (to_jsonb(c) - array['proficiency_level','example_sentence','example_translation','updated_at']) is distinct from o.original
), 'every original identifier, order, publication state and content field is unchanged');
select public.test_assert((select proficiency_level='B2' and example_sentence='An authored example stays.' and example_translation='保留人工編輯的例句。' from public.phonetic_cards where deck_id='en' and legacy_index=0), 'authored metadata wins over backfill');
create temporary table first_backfill_result as select id, to_jsonb(c) as card from public.phonetic_cards c;

\i :backfill_file

select public.test_assert(not exists (
  select 1 from public.phonetic_cards c full join first_backfill_result f on c.id=f.id
  where c.id is null or f.id is null or to_jsonb(c) is distinct from f.card
), 'second backfill is a true no-op, including updated_at');
\echo 'ALL CONTENT BACKFILL SQL TESTS PASSED'
