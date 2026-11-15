-- Optional VARK cue schema, privileges and atomic RPC semantics.
\set ON_ERROR_STOP on
begin;

create or replace function public.vark_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;

select public.vark_assert((
  select count(*) = 4 and bool_and(is_nullable='NO') and bool_and(column_default is not null)
  from information_schema.columns
  where table_schema='public' and table_name='phonetic_cards'
    and column_name in ('cue_visual','cue_auditory','cue_read_write','cue_kinesthetic')
), 'four VARK cue columns exist, are non-null, and have defaults');
select public.vark_assert((select count(*)=4 from pg_constraint where conrelid='public.phonetic_cards'::regclass and conname in ('phonetic_cards_cue_visual_length','phonetic_cards_cue_auditory_length','phonetic_cards_cue_read_write_length','phonetic_cards_cue_kinesthetic_length')), 'four VARK length constraints exist');
select public.vark_assert(has_column_privilege('authenticated','public.phonetic_cards','cue_visual','UPDATE'), 'authenticated VARK update grant exists');
select public.vark_assert(has_column_privilege('authenticated','public.phonetic_cards','cue_kinesthetic','INSERT'), 'authenticated VARK insert grant exists');
select public.vark_assert(not has_column_privilege('anon','public.phonetic_cards','cue_visual','UPDATE'), 'anon VARK update denied');
select public.vark_assert(not has_column_privilege('authenticated','public.phonetic_cards','id','UPDATE'), 'VARK migration did not grant id update');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
insert into public.phonetic_decks(id,name,native,flag,region,lang,position,published)
values ('__vark_test__','VARK test','VARK test','T','other','en-US',9998,true);

select public.phonetic_import_cards('__vark_test__', '[{"word":"__vark_card__","roman":"old roman","hint":"old hint","meaning":"old meaning","cue":"ordinary cue","cue_visual":"visual cue","cue_auditory":"auditory cue","cue_read_write":"read-write cue","cue_kinesthetic":"safe movement cue"}]', false);
select public.vark_assert((select cue='ordinary cue' and cue_visual='visual cue' and cue_auditory='auditory cue' and cue_read_write='read-write cue' and cue_kinesthetic='safe movement cue' from public.phonetic_cards where deck_id='__vark_test__' and word='__vark_card__'), 'RPC stores ordinary and four VARK cues independently');

-- A partial update omitting roman/cue/VARK fields must preserve them.
select public.phonetic_import_cards('__vark_test__', '[{"word":"__vark_card__","hint":"new hint","meaning":"new meaning"}]', true);
select public.vark_assert((select roman='old roman' and cue='ordinary cue' and cue_visual='visual cue' and cue_auditory='auditory cue' and cue_read_write='read-write cue' and cue_kinesthetic='safe movement cue' from public.phonetic_cards where deck_id='__vark_test__' and word='__vark_card__'), 'omitted cue fields are preserved on update');

-- Explicit blank or JSON null clears only the named optional cue.
select public.phonetic_import_cards('__vark_test__', '[{"word":"__vark_card__","hint":"new hint","meaning":"new meaning","cue_visual":"","cue_auditory":null}]', true);
select public.vark_assert((select cue='ordinary cue' and cue_visual='' and cue_auditory='' and cue_read_write='read-write cue' and cue_kinesthetic='safe movement cue' from public.phonetic_cards where deck_id='__vark_test__' and word='__vark_card__'), 'explicit blanks clear only their own VARK cue');

-- New imports without cue fields receive safe empty defaults; invalid batches roll back.
select public.phonetic_import_cards('__vark_test__', '[{"word":"__vark_default__","hint":"h","meaning":"m"}]', false);
select public.vark_assert((select cue_visual='' and cue_auditory='' and cue_read_write='' and cue_kinesthetic='' from public.phonetic_cards where deck_id='__vark_test__' and word='__vark_default__'), 'omitted VARK fields default to empty strings');
do $$ begin
  begin
    perform public.phonetic_import_cards('__vark_test__', jsonb_build_array(jsonb_build_object('word','__vark_atomic__','hint','h','meaning','m','cue_visual',repeat('x',1001))), false);
    raise exception 'TEST FAILED: overlong VARK cue accepted';
  exception when others then
    if sqlerrm not like '%VARK cue%' then raise; end if;
  end;
  perform public.vark_assert((select count(*)=0 from public.phonetic_cards where deck_id='__vark_test__' and word='__vark_atomic__'), 'overlong cue batch rolled back atomically');
end $$;

rollback;
\echo 'VARK CUE SQL TESTS PASSED'
