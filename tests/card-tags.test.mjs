import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tags=require('../shared/card-tags.js');
test('stable tag vocabulary canonicalizes labels and rejects unknown values',()=>{
  assert.equal(tags.normalizeTopic('飲食'),'food');
  assert.equal(tags.normalizeTopic('FOOD'),'food');
  assert.equal(tags.normalizeTopic('不存在'),null);
  assert.equal(tags.normalizeTopic('數字與數量'),'numbers');
  assert.equal(tags.normalizeDifficulty('基礎'),2);
  assert.equal(tags.normalizeDifficulty(3),3);
  for(const value of [0,4,1.5,'easy',''])assert.equal(tags.normalizeDifficulty(value),null);
  assert.equal(tags.getTopic({}),'general');assert.equal(tags.getDifficulty({}),1);
});
test('all 1576 bundled cards have valid metadata while keeping the 12 original decks',()=>{
  const text=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const match=text.match(/const decks\s*=\s*([\s\S]*?)\s*;\s*<\/script>/);
  const decks=JSON.parse(match[1]);
  assert.deepEqual(decks.map(d=>d.id),['en','ja','ko','es','fr','de','ar','id','th','vi','pt','it']);
  let count=0, originalCount=0, advancedCount=0;
  for(const d of decks){assert.ok(d.cards.length>=100);for(const [index,c] of d.cards.entries()){
    assert.equal(tags.normalizeTopic(c.topic),c.topic);assert.equal(tags.normalizeDifficulty(c.difficulty),c.difficulty);
    assert.ok(c.word&&c.hint&&c.meaning);
    if(index<100){assert.notEqual(c.topic,'general');originalCount++;}
    else {assert.equal(c.difficulty,3);assert.ok(c.proficiency_level);advancedCount++;}
    count++;
  }}
  assert.equal(originalCount,1200);assert.equal(advancedCount,376);assert.equal(count,1576);
});
test('additive metadata migration keeps identifiers protected and validates the same slugs',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/002_card_tags.sql',import.meta.url),'utf8');
  for(const t of tags.TOPICS)assert.ok(sql.includes(`'${t.value}'`));
  assert.match(sql,/grant update \(topic, difficulty\)/);
  assert.doesNotMatch(sql,/grant update \([^)]*(?:legacy_index|deck_id|\bid\b)/i);
  const backfill=fs.readFileSync(new URL('../supabase/migrations/003_backfill_card_tags.sql',import.meta.url),'utf8');
  assert.match(backfill,/set topic=m\.topic, difficulty=m\.difficulty/);
  assert.match(backfill,/c\.legacy_index=m\.legacy_index and c\.word=m\.word/);
  assert.doesNotMatch(backfill,/\b(?:delete|truncate)\s/i);
});
