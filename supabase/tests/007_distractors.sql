-- Distractor schema, permissions, validation, roundtrip semantics and atomic RPC tests.
\set ON_ERROR_STOP on
begin;

create or replace function public.distractors_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;

select public.distractors_assert((select count(*) = 1 and bool_and(is_nullable = 'NO') and bool_and(column_default = '''[]''::jsonb') from information_schema.columns where table_schema='public' and table_name='phonetic_cards' and column_name='distractors'), 'distractors is non-null JSONB with empty-array default');
select public.distractors_assert((select count(*) = 1 from pg_constraint where conrelid='public.phonetic_cards'::regclass and conname='phonetic_cards_distractors_valid'), 'distractor validation constraint exists');
select public.distractors_assert(has_column_privilege('authenticated','public.phonetic_cards','distractors','INSERT'), 'authenticated can insert distractors');
select public.distractors_assert(has_column_privilege('authenticated','public.phonetic_cards','distractors','UPDATE'), 'authenticated can update distractors');
select public.distractors_assert(not has_column_privilege('anon','public.phonetic_cards','distractors','UPDATE'), 'anon cannot update distractors');
select public.distractors_assert(not has_column_privilege('authenticated','public.phonetic_cards','id','UPDATE'), 'distractor migration does not grant id update');
select public.distractors_assert(not public.phonetic_distractors_valid(jsonb_build_array(chr(9)), 'right'), 'tab-only distractors are invalid');
select public.distractors_assert(not public.phonetic_distractors_valid(jsonb_build_array('wrong', chr(9)||'WRONG'||chr(9)), 'right'), 'tab-surrounded duplicate distractors are invalid');
select public.distractors_assert(not public.phonetic_distractors_valid(jsonb_build_array(chr(9)||'RIGHT'||chr(9)), 'right'), 'tab-surrounded correct answer is invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
insert into public.phonetic_decks(id,name,native,flag,region,lang,position,published)
values ('__distractors_test__','Distractors test','測試','T','other','en-US',9997,true);

select public.phonetic_import_cards('__distractors_test__', '[{"word":"__three__","hint":"h","meaning":"right","distractors":["wrong one","wrong two","wrong three"]},{"word":"__partial__","hint":"h","meaning":"right","distractors":["one"]},{"word":"__legacy__","hint":"h","meaning":"right"}]', false);
select public.distractors_assert((select distractors = '["wrong one","wrong two","wrong three"]'::jsonb from public.phonetic_cards where deck_id='__distractors_test__' and word='__three__'), 'three distractors roundtrip');
select public.distractors_assert((select jsonb_array_length(distractors)=1 from public.phonetic_cards where deck_id='__distractors_test__' and word='__partial__'), 'partial distractors are stored but do not imply four-choice');
select public.distractors_assert((select distractors='[]'::jsonb from public.phonetic_cards where deck_id='__distractors_test__' and word='__legacy__'), 'omitted distractors retain legacy empty default');

do $$ begin
  begin
    perform public.phonetic_import_cards('__distractors_test__', jsonb_build_array(jsonb_build_object('word','__too_many__','hint','h','meaning','m','distractors',jsonb_build_array('a','b','c','d'))), false);
    raise exception 'TEST FAILED: more than three distractors accepted';
  exception when others then
    if sqlerrm not like '%distractor%' then raise; end if;
  end;
  begin
    perform public.phonetic_import_cards('__distractors_test__', jsonb_build_array(jsonb_build_object('word','__case_duplicate__','hint','h','meaning','m','distractors',jsonb_build_array('Wrong','wrong'))), false);
    raise exception 'TEST FAILED: case duplicate distractors accepted';
  exception when others then
    if sqlerrm not like '%distractor%' then raise; end if;
  end;
  begin
    perform public.phonetic_import_cards('__distractors_test__', jsonb_build_array(jsonb_build_object('word','__newline__','hint','h','meaning','m','distractors',jsonb_build_array('line'||chr(10)||'break'))), false);
    raise exception 'TEST FAILED: newline distractor accepted';
  exception when others then
    if sqlerrm not like '%distractor%' then raise; end if;
  end;
end $$;

select public.phonetic_import_cards('__distractors_test__', '[{"word":"__three__","hint":"new","meaning":"right"}]', true);
select public.distractors_assert((select distractors = '["wrong one","wrong two","wrong three"]'::jsonb from public.phonetic_cards where deck_id='__distractors_test__' and word='__three__'), 'omitted distractors preserve existing values');
select public.phonetic_import_cards('__distractors_test__', '[{"word":"__three__","hint":"new","meaning":"right","distractors":[]}]', true);
select public.distractors_assert((select distractors='[]'::jsonb from public.phonetic_cards where deck_id='__distractors_test__' and word='__three__'), 'explicit empty array clears distractors');

do $$ begin
  begin
    perform public.phonetic_import_cards('__distractors_test__', jsonb_build_array(jsonb_build_object('word','__atomic_good__','hint','h','meaning','m','distractors',jsonb_build_array('a','b','c')), jsonb_build_object('word','__atomic_bad__','hint','h','meaning','m','distractors',jsonb_build_array('m','b','b'))), false);
    raise exception 'TEST FAILED: invalid distractor batch accepted';
  exception when others then
    if sqlerrm not like '%distractors%' then raise; end if;
  end;
  perform public.distractors_assert((select count(*)=0 from public.phonetic_cards where deck_id='__distractors_test__' and word in ('__atomic_good__','__atomic_bad__')), 'invalid distractor batch rolled back atomically');
end $$;

rollback;
\echo 'DISTRACTOR SQL TESTS PASSED'
