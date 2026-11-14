import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tags=require('../shared/card-tags.js');
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const decks=JSON.parse(read('../index.html').match(/const decks\s*=\s*([\s\S]*?)\s*;\s*<\/script>/)[1]);
const originalHashes={
  en:'f71a7d5c8cc3a58fc8f3acc85b2558d1ae693e7b73d72b96f4fee06d939a3f16',
  ja:'a8cc84f484255cdc5c8c42cd0d671a47f81cca138af6f760b4ea9b5c1d7edc77',
  ko:'7b4e6145f9b287e84d860c384a056016f1e23261c75ce737c0aae6e4d58f48b7',
  es:'3937a8db395600335aa22171eb64d70b64483ec8e77f9e42f68d95c9afedd21b',
  fr:'c429fb8a3cc1bafbfc1ba91322e9f6212cfd0126757d540c64931b711fd2ac67',
  de:'c6211ea74bfb945e7a9d30894174c4896a5cecf9422ec13df1738809e352b7fd',
  ar:'128954f64fefde79946de24271a7e420919b386e7aaed641382a3b1fce7e5a1d',
  id:'75b9f6af9fff2508e73f4c33fa97aa79885c3eae3f4b4e5c47453674bc3c1292',
  th:'bde0935a6b99cfd673eb15a91a63a77c400c0ce4bf75cd7b38580677c7e59038',
  vi:'e6dbaf8c0f25900a1e8e2ebd19cbc167a83d6be0851d48b7bc97619a969c59f9',
  pt:'a6eefba51ba46b0f50d64110b5cbfaad62adce62c06eec4478627032f14081f2',
  it:'5b625d4903ae64531ef4f2458def001a0eecfb36529e101e0dbf3855dc81ab09'
};

test('language schemes expose every supported level in learning order',()=>{
  for(const lang of ['en-US','es-ES','fr-FR','de-DE','pt-PT','it-IT']){
    assert.equal(tags.levelScheme({lang}),'cefr');
    assert.deepEqual(tags.levelOptions({lang}).map(x=>x.value),['A1','A2','B1','B2','C1','C2']);
  }
  assert.deepEqual(tags.levelOptions({lang:'ja-JP'}).map(x=>x.value),['N5','N4','N3','N2','N1']);
  assert.deepEqual(tags.levelOptions({lang:'ko_KR'}).map(x=>x.value),['1','2','3','4','5','6']);
  for(const lang of ['ar-SA','id-ID','th-TH','vi-VN','zh-TW'])assert.equal(tags.levelScheme({lang}),'legacy');
  assert.equal(tags.levelScheme({id:'ja'}),'jlpt');
  assert.equal(tags.levelScheme({id:'en',lang:'th-TH'}),'legacy');
});

test('proficiency is normalized within its scheme and never guessed from old difficulty',()=>{
  assert.equal(tags.normalizeLevel('cefr a2',{lang:'en'}),'A2');
  assert.equal(tags.normalizeLevel('JLPT N4',{lang:'ja'}),'N4');
  assert.equal(tags.normalizeLevel('TOPIK 6 級',{lang:'ko'}),'6');
  assert.equal(tags.normalizeLevel('N5',{lang:'en'}),null);
  assert.equal(tags.normalizeLevel('C2',{lang:'ja'}),null);
  assert.equal(tags.normalizeLevel('7',{lang:'ko'}),null);
  assert.equal(tags.getLevel({difficulty:3},{lang:'en'}),'');
  assert.equal(tags.levelLabel('',{lang:'en'}),'未分級');
  assert.equal(tags.getLevel({difficulty:3},{lang:'ar'}),'3');
  assert.equal(tags.levelLabel('3',{lang:'ar'}),'挑戰');
});

test('all 1200 example pairs match reviewed content and original card data is byte-equivalent',()=>{
  let count=0;
  for(const deck of decks){
    const original=deck.cards.map(c=>[c.word,c.roman||'',c.hint,c.meaning,c.cue||'',c.topic,c.difficulty]);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),originalHashes[deck.id],`${deck.id} original fields changed`);
    const content=JSON.parse(read(`../content/${deck.id}.json`));
    assert.equal(content.level_scheme,tags.levelScheme(deck));
    assert.equal(content.cards.length,100);
    deck.cards.forEach((card,index)=>{
      const row=content.cards[index];
      assert.equal(row.legacy_index,index);assert.equal(row.word,card.word);
      for(const field of ['proficiency_level','example_sentence','example_translation'])assert.equal(card[field],row[field]);
      if(tags.levelScheme(deck)==='legacy')assert.equal(card.proficiency_level,null);
      else assert.equal(tags.normalizeLevel(card.proficiency_level,deck),card.proficiency_level);
      assert.ok(card.example_sentence.trim());assert.ok(card.example_translation.trim());
      assert.ok(card.example_sentence.length<=500);assert.ok(card.example_translation.length<=500);
      assert.match(card.example_translation,/[\u3400-\u9fff]/);
      count++;
    });
  }
  assert.equal(count,1200);
});

test('metadata upgrade grants only added columns and original-card backfill is guarded',()=>{
  const migration=read('../supabase/migrations/004_levels_examples.sql');
  assert.match(migration,/security invoker set search_path = ''/);
  assert.match(migration,/phonetic_cards_examples_pair/);
  assert.match(migration,/before insert or update of deck_id, proficiency_level/);
  assert.doesNotMatch(migration,/grant update \([^)]*(?:legacy_index|deck_id|\bid\b)/i);
  const backfill=read('../supabase/migrations/005_backfill_levels_examples.sql');
  assert.match(backfill,/c\.legacy_index = x\.legacy_index and c\.word = x\.word/);
  assert.match(backfill,/coalesce\(c\.proficiency_level, x\.proficiency_level\)/);
  assert.match(backfill,/case when btrim\(c\.example_sentence\) = '' and btrim\(c\.example_translation\) = ''/);
  assert.doesNotMatch(backfill,/\b(?:delete|truncate)\s/i);
});
