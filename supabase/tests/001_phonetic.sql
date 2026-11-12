-- Comprehensive local/Supabase-compatible SQL tests. Run with ON_ERROR_STOP=1.
\set ON_ERROR_STOP on
begin;

create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$ begin if not p_ok then raise exception 'TEST FAILED: %', p_message; end if; end $$;

select public.test_assert((select count(*) = 12 from public.phonetic_decks), 'seed must contain 12 decks');
select public.test_assert((select count(*) = 1200 from public.phonetic_cards), 'seed must contain 1200 cards');
select public.test_assert(to_regprocedure('public.phonetic_import_cards(text,jsonb,boolean)') is not null, 'import RPC exists');
select public.test_assert((select column_default like '%gen_random_uuid%' from information_schema.columns where table_schema='public' and table_name='phonetic_cards' and column_name='id'), 'UUID default uses pg_catalog');

-- Structural privilege checks: reads are public; writes and deletion are not.
select public.test_assert(not has_table_privilege('anon', 'public.phonetic_cards', 'INSERT'), 'anon card insert denied');
select public.test_assert(not has_table_privilege('authenticated', 'public.phonetic_cards', 'DELETE'), 'authenticated card delete denied');
select public.test_assert(has_column_privilege('authenticated', 'public.phonetic_cards', 'word', 'UPDATE'), 'authenticated card update granted');
select public.test_assert(not has_column_privilege('authenticated', 'public.phonetic_cards', 'id', 'UPDATE'), 'card id update denied');
select public.test_assert(not has_column_privilege('authenticated', 'public.phonetic_cards', 'legacy_index', 'UPDATE'), 'legacy index update denied');
select public.test_assert(not has_function_privilege('anon', 'public.phonetic_import_cards(text,jsonb,boolean)', 'EXECUTE'), 'anon RPC denied');

-- Anonymous can read published data, but cannot see drafts or write.
set local role anon;
select public.test_assert((select count(*) = 12 from public.phonetic_decks), 'anon sees published decks');
select public.test_assert((select count(*) = 1200 from public.phonetic_cards), 'anon sees published cards');
do $$ begin
  begin insert into public.phonetic_cards(deck_id,word,hint,meaning,position) values ('english','__anon_denied__','x','x',99999); raise exception 'TEST FAILED: anon write succeeded'; exception when insufficient_privilege or check_violation or foreign_key_violation then null; end;
end $$;
reset role;

-- Non-admin authenticated user cannot write or execute the RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', true);
select public.test_assert(not public.phonetic_is_admin(), 'non-admin rejected');
do $$ begin
  begin insert into public.phonetic_cards(deck_id,word,hint,meaning,position) values ('english','__nonadmin_denied__','x','x',99999); raise exception 'TEST FAILED: non-admin write succeeded'; exception when insufficient_privilege or check_violation then null; end;
end $$;
do $$ begin
  begin perform public.phonetic_import_cards('english','[{"word":"__nonadmin_rpc__","hint":"x","meaning":"x"}]',false); raise exception 'TEST FAILED: non-admin RPC succeeded'; exception when insufficient_privilege or others then if sqlerrm not like '%not authorized%' then raise; end if; end;
end $$;

-- Admin can CRUD within grants; archive is an update, deletion remains impossible.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.test_assert(public.phonetic_is_admin(), 'admin accepted');
insert into public.phonetic_decks(id,name,native,flag,region,lang,position,published) values ('__testdeck__','Test','測試','T','other','test',9999,true);
insert into public.phonetic_cards(deck_id,word,hint,meaning,position) values ('__testdeck__','__crud__','x','x',0);
update public.phonetic_cards set published=false where deck_id='__testdeck__' and word='__crud__';
select public.test_assert((select not published from public.phonetic_cards where deck_id='__testdeck__' and word='__crud__'), 'admin archive works');
do $$ begin
  begin delete from public.phonetic_cards where deck_id='__testdeck__'; raise exception 'TEST FAILED: delete succeeded'; exception when insufficient_privilege then null; end;
end $$;

-- Drafts are hidden from anonymous readers.
select public.phonetic_import_cards('__testdeck__','[{"word":"__draft__","hint":"x","meaning":"x","published":false}]',false);
reset role; set local role anon;
select public.test_assert((select count(*)=0 from public.phonetic_cards where deck_id='__testdeck__'), 'draft hidden from anon');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);

-- Update by word: omitted published and position retain existing values; blank id is treated as absent.
insert into public.phonetic_cards(deck_id,word,roman,hint,meaning,cue,position,published) values ('__testdeck__','__retain__','old','old','old','oldcue',42,false);
do $$ begin
  begin perform public.phonetic_import_cards('__testdeck__','[{"id":"","word":"__retain__","roman":"","hint":"new","meaning":"new","cue":"","position":null}]',true); raise exception 'TEST FAILED: null position accepted';
  exception when others then if sqlerrm not like '%position must be an integer%' then raise; end if; end;
end $$;
select public.test_assert((select position=42 and not published and roman='old' from public.phonetic_cards where word='__retain__'), 'invalid null position altered row');
select public.phonetic_import_cards('__testdeck__','[{"id":"","word":"__retain__","roman":"","hint":"new","meaning":"new","cue":"","position":42}]',true);
select public.test_assert((select position=42 and not published and roman='' and cue='' from public.phonetic_cards where word='__retain__'), 'blank optional fields replace and omitted state retains');

-- Omitted fields on a valid update retain state, and omitted position on insert appends.
select public.phonetic_import_cards('__testdeck__','[{"word":"__retain__","hint":"again","meaning":"again"}]',true);
select public.test_assert((select position=42 and not published from public.phonetic_cards where word='__retain__'), 'omitted update state/order retained');
select public.phonetic_import_cards('__testdeck__','[{"word":"__append__","hint":"x","meaning":"x"}]',true);
select public.test_assert((select position=43 and published from public.phonetic_cards where word='__append__'), 'insert omission appends and defaults published true');

-- Invalid IDs, field limits, 2000-row cap, and atomic rollback.
do $$ begin
  begin perform public.phonetic_import_cards('__testdeck__','[{"id":"not-a-uuid","word":"__badid__","hint":"x","meaning":"x"}]',true); raise exception 'TEST FAILED: invalid id accepted'; exception when others then if sqlerrm not like '%invalid id%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.phonetic_import_cards('__testdeck__',jsonb_build_array(jsonb_build_object('word','__too_long__','hint',repeat('x',501),'meaning','x')),false); raise exception 'TEST FAILED: length accepted'; exception when others then if sqlerrm not like '%length limit%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.phonetic_import_cards('__testdeck__',(select jsonb_agg(jsonb_build_object('word','__limit_'||n,'hint','x','meaning','x')) from generate_series(1,2001) n),false); raise exception 'TEST FAILED: 2000 cap accepted'; exception when others then if sqlerrm not like '%2000%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.phonetic_import_cards('__testdeck__','[{"word":"__atomic_ok__","hint":"x","meaning":"x"},{"word":"__atomic_bad__","hint":"x"}]',false); raise exception 'TEST FAILED: atomic invalid batch accepted'; exception when others then if sqlerrm not like '%requires word%' then raise; end if; end;
  perform public.test_assert((select count(*)=0 from public.phonetic_cards where word in ('__atomic_ok__','__atomic_bad__')), 'atomic rollback');
end $$;

-- Membership cannot be self-assigned: no INSERT/UPDATE privileges or policies.
select public.test_assert(not has_table_privilege('authenticated','public.phonetic_admins','INSERT'), 'admin membership insert denied');
select public.test_assert(not has_table_privilege('authenticated','public.phonetic_admins','UPDATE'), 'admin membership update denied');

rollback;
\echo 'ALL PHONETIC SQL TESTS PASSED'
