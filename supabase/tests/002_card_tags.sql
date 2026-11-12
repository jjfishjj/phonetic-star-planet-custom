\set ON_ERROR_STOP on
begin;
create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;
select public.test_assert((select count(*)=1200 from public.phonetic_cards where topic<>'general' and difficulty between 1 and 3), 'all original seed cards have metadata');
select public.test_assert(has_column_privilege('authenticated','public.phonetic_cards','topic','UPDATE'), 'topic update is granted');
select public.test_assert(has_column_privilege('authenticated','public.phonetic_cards','difficulty','INSERT'), 'difficulty insert is granted');
select public.test_assert(not has_column_privilege('anon','public.phonetic_cards','topic','UPDATE'), 'anonymous cannot update metadata');
select public.test_assert(not has_column_privilege('authenticated','public.phonetic_cards','legacy_index','UPDATE'), 'legacy index stays protected');
select public.test_assert(not has_column_privilege('authenticated','public.phonetic_cards','id','UPDATE'), 'card id stays protected');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',true);
insert into public.phonetic_decks(id,name,native,flag,region,lang,position,published) values ('__tags__','Tags','Tags','📚','other','en-US',9999,true);
select public.phonetic_import_cards('__tags__','[{"word":"default","hint":"h","meaning":"m"}]',false);
select public.test_assert((select topic='general' and difficulty=1 from public.phonetic_cards where deck_id='__tags__' and word='default'),'new omitted metadata defaults');
select public.phonetic_import_cards('__tags__','[{"word":"tagged","hint":"h","meaning":"m","topic":"food","difficulty":3,"position":7,"published":false}]',false);
select public.phonetic_import_cards('__tags__','[{"word":"tagged","hint":"new h","meaning":"new m"}]',true);
select public.test_assert((select topic='food' and difficulty=3 and position=7 and published=false from public.phonetic_cards where deck_id='__tags__' and word='tagged'),'omitted metadata, order, and draft state preserved');
select public.phonetic_import_cards('__tags__','[{"word":"tagged","hint":"h","meaning":"m","topic":"study","difficulty":2}]',true);
select public.test_assert((select topic='study' and difficulty=2 from public.phonetic_cards where deck_id='__tags__' and word='tagged'),'explicit metadata update');
do $$
declare bad jsonb;
begin
  for bad in select value from jsonb_array_elements('[{"topic":"unknown","difficulty":1},{"topic":null,"difficulty":1},{"topic":"food","difficulty":0},{"topic":"food","difficulty":4},{"topic":"food","difficulty":1.5},{"topic":"food","difficulty":"2"},{"topic":"food","difficulty":null}]'::jsonb) loop
    begin
      perform public.phonetic_import_cards('__tags__',jsonb_build_array(jsonb_build_object('word','bad','hint','h','meaning','m')||bad),false);
      raise exception 'TEST FAILED: invalid metadata accepted';
    exception when others then
      if sqlerrm like 'TEST FAILED:%' then raise; end if;
      if sqlerrm not like '%topic%' and sqlerrm not like '%difficulty%' then raise; end if;
    end;
  end loop;
  begin
    perform public.phonetic_import_cards('__tags__','[{"word":"atomic-ok","hint":"h","meaning":"m","topic":"food","difficulty":2},{"word":"atomic-bad","hint":"h","meaning":"m","topic":"bad","difficulty":1}]',false);
    raise exception 'TEST FAILED: invalid metadata batch accepted';
  exception when others then if sqlerrm not like '%topic%' then raise; end if; end;
  perform public.test_assert((select count(*)=0 from public.phonetic_cards where deck_id='__tags__' and word in ('atomic-ok','atomic-bad')), 'invalid metadata rolls back the whole import');
end $$;
reset role;
rollback;
\echo 'ALL CARD TAG SQL TESTS PASSED'
