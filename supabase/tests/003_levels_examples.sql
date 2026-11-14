\set ON_ERROR_STOP on
begin;
create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;

select public.test_assert((select column_default is null from information_schema.columns where table_schema='public' and table_name='phonetic_cards' and column_name='proficiency_level'), 'proficiency defaults null');
select public.test_assert((select column_default like '%''''%' from information_schema.columns where table_schema='public' and table_name='phonetic_cards' and column_name='example_sentence'), 'sentence defaults blank');
select public.test_assert(has_column_privilege('authenticated','public.phonetic_cards','proficiency_level','UPDATE'), 'level update is granted');
select public.test_assert(has_column_privilege('authenticated','public.phonetic_cards','example_sentence','INSERT'), 'sentence insert is granted');
select public.test_assert(not has_column_privilege('anon','public.phonetic_cards','example_sentence','UPDATE'), 'anonymous cannot update examples');
select public.test_assert(not has_column_privilege('authenticated','public.phonetic_cards','id','UPDATE'), 'card id remains protected');
select public.test_assert(not has_column_privilege('authenticated','public.phonetic_cards','deck_id','UPDATE'), 'deck id remains protected');
select public.test_assert(not has_column_privilege('authenticated','public.phonetic_cards','legacy_index','UPDATE'), 'legacy index remains protected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',true);
insert into public.phonetic_decks(id,name,native,flag,region,lang,position,published) values
  ('__cefr__','CEFR','CEFR','C','other','en-US',10001,true),
  ('__jlpt__','JLPT','JLPT','J','other','ja_JP',10002,true),
  ('__topik__','TOPIK','TOPIK','K','other','ko-KR',10003,true),
  ('__legacy__','Legacy','Legacy','L','other','xx',10004,true);

select public.test_assert(public.phonetic_deck_level_scheme('en-US','x')='cefr', 'CEFR scheme');
select public.test_assert(public.phonetic_deck_level_scheme('ja_JP','x')='jlpt', 'JLPT scheme');
select public.test_assert(public.phonetic_deck_level_scheme('ko-KR','x')='topik', 'TOPIK scheme');
select public.test_assert(public.phonetic_deck_level_scheme(null,'__jlpt__')='legacy', 'deck-id fallback is only for missing unknown language');

insert into public.phonetic_cards(deck_id,word,hint,meaning,position,proficiency_level,example_sentence,example_translation)
values ('__cefr__','direct-a1','h','m',0,'A1','Hello.','你好。'),
       ('__jlpt__','direct-n5','h','m',0,'N5','',''),
       ('__topik__','direct-6','h','m',0,'6','',''),
       ('__legacy__','direct-null','h','m',0,null,'','');
select public.test_assert((select count(*)=4 from public.phonetic_cards where word like 'direct-%'), 'valid direct inserts');

-- Direct card trigger rejects mismatched levels and invalid legacy levels.
do $$ begin
  begin insert into public.phonetic_cards(deck_id,word,hint,meaning,position,proficiency_level) values ('__cefr__','bad-cefr','h','m',1,'N5'); raise exception 'TEST FAILED: mismatched CEFR level accepted';
  exception when others then if sqlerrm not like '%invalid proficiency_level%' then raise; end if; end;
  begin insert into public.phonetic_cards(deck_id,word,hint,meaning,position,proficiency_level) values ('__legacy__','bad-legacy','h','m',1,'1'); raise exception 'TEST FAILED: legacy level accepted';
  exception when others then if sqlerrm not like '%invalid proficiency_level%' then raise; end if; end;
end $$;
update public.phonetic_cards set proficiency_level='A2' where word='direct-a1';
do $$ begin
  begin update public.phonetic_cards set proficiency_level='N1' where word='direct-a1'; raise exception 'TEST FAILED: invalid direct update accepted';
  exception when others then if sqlerrm not like '%invalid proficiency_level%' then raise; end if; end;
end $$;

-- A deck language change cannot invalidate existing levels.
do $$ begin
  begin update public.phonetic_decks set lang='ja' where id='__cefr__'; raise exception 'TEST FAILED: invalidating deck language accepted';
  exception when others then if sqlerrm not like '%invalidate existing%' then raise; end if; end;
end $$;

select public.phonetic_import_cards('__cefr__','[{"word":"rpc-card","hint":"h","meaning":"m","proficiency_level":"B1","example_sentence":"I study.","example_translation":"我學習。"}]',false);
select public.test_assert((select proficiency_level='B1' and example_sentence='I study.' and example_translation='我學習。' from public.phonetic_cards where deck_id='__cefr__' and word='rpc-card'), 'RPC new fields roundtrip');
select public.phonetic_import_cards('__cefr__','[{"word":"rpc-card","hint":"changed","meaning":"changed"}]',true);
select public.test_assert((select proficiency_level='B1' and example_sentence='I study.' and example_translation='我學習。' from public.phonetic_cards where deck_id='__cefr__' and word='rpc-card'), 'omitted new fields preserve existing');
select public.phonetic_import_cards('__cefr__','[{"word":"rpc-card","hint":"h","meaning":"m","example_sentence":"I learn."}]',true);
select public.test_assert((select example_sentence='I learn.' and example_translation='我學習。' from public.phonetic_cards where deck_id='__cefr__' and word='rpc-card'), 'sentence-only update preserves translation');
select public.phonetic_import_cards('__cefr__','[{"word":"rpc-card","hint":"h","meaning":"m","example_translation":"我學習新事物。"}]',true);
select public.test_assert((select example_sentence='I learn.' and example_translation='我學習新事物。' from public.phonetic_cards where deck_id='__cefr__' and word='rpc-card'), 'translation-only update preserves sentence');
select public.phonetic_import_cards('__cefr__','[{"word":"rpc-card","hint":"h","meaning":"m","proficiency_level":null,"example_sentence":"","example_translation":""}]',true);
select public.test_assert((select proficiency_level is null and example_sentence='' and example_translation='' from public.phonetic_cards where deck_id='__cefr__' and word='rpc-card'), 'explicit clear works');

-- Invalid values and pair mismatches reject the entire batch.
do $$ begin
  begin perform public.phonetic_import_cards('__cefr__','[{"word":"atomic-level-ok","hint":"h","meaning":"m","proficiency_level":"A1"},{"word":"atomic-level-bad","hint":"h","meaning":"m","proficiency_level":"N5"}]',false); raise exception 'TEST FAILED: invalid level batch accepted';
  exception when others then if sqlerrm not like '%proficiency_level%' then raise; end if; end;
  perform public.test_assert((select count(*)=0 from public.phonetic_cards where word in ('atomic-level-ok','atomic-level-bad')), 'invalid level rolls back whole import');
  begin perform public.phonetic_import_cards('__cefr__','[{"word":"atomic-example-ok","hint":"h","meaning":"m","example_sentence":"x","example_translation":""},{"word":"atomic-example-bad","hint":"h","meaning":"m"}]',false); raise exception 'TEST FAILED: invalid example pair accepted';
  exception when others then if sqlerrm not like '%example fields%' then raise; end if; end;
  perform public.test_assert((select count(*)=0 from public.phonetic_cards where word='atomic-example-ok'), 'invalid example pair rolls back whole import');
end $$;

-- Non-admin authenticated users remain denied.
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002"}',true);
select public.test_assert(not public.phonetic_is_admin(), 'non-admin rejected');
do $$ begin
  begin perform public.phonetic_import_cards('__cefr__','[{"word":"nonadmin-level","hint":"h","meaning":"m","proficiency_level":"A1"}]',false); raise exception 'TEST FAILED: non-admin RPC succeeded';
  exception when others then if sqlerrm not like '%not authorized%' then raise; end if; end;
end $$;
reset role;
rollback;
\echo 'ALL LEVELS/EXAMPLES SQL TESTS PASSED'
