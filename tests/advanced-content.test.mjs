import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const XLSX=require('../vendor/xlsx.full.min.js');
const importer=require('../shared/admin-import.js');
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const decks=JSON.parse(read('../index.html').match(/const decks\s*=\s*([\s\S]*?)\s*;\s*<\/script>/)[1]);
const advanced={
  en:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  es:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  fr:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  de:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  pt:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  it:{scheme:'cefr',levels:['B1','B2','C1','C2'],counts:{B1:12,B2:12,C1:12,C2:12},count:48},
  ja:{scheme:'jlpt',levels:['N3','N2','N1'],counts:{N3:14,N2:13,N1:13},count:40},
  ko:{scheme:'topik',levels:['3','4','5','6'],counts:{3:12,4:12,5:12,6:12},count:48}
};
const keys=['word','roman','hint','meaning','cue','topic','difficulty','proficiency_level','example_sentence','example_translation','cue_visual','cue_auditory','cue_read_write','cue_kinesthetic'];
const norm=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase();

test('eight advanced sources add 376 complete cards without changing the original 1200',()=>{
  let total=0;
  for(const [id,meta] of Object.entries(advanced)){
    const deck=decks.find(d=>d.id===id);
    const source=JSON.parse(read(`../content/advanced/${id}.json`));
    assert.equal(source.deck_id,id);assert.equal(source.level_scheme,meta.scheme);
    assert.equal(source.cards.length,meta.count);
    assert.equal(deck.cards.length,100+meta.count,`${id} bundled total`);
    const expectedByLevel=meta.counts;
    const actualByLevel={};
    const originalWords=new Set(deck.cards.slice(0,100).map(c=>norm(c.word)));
    const sourceWords=new Set();
    for(let i=0;i<source.cards.length;i++){
      const card=source.cards[i], bundled=deck.cards[100+i];
      assert.deepEqual(Object.keys(card).sort(),keys.slice().sort());
      for(const key of keys)assert.ok(card[key]!==''&&card[key]!=null,`${id}:${card.word} missing ${key}`);
      assert.equal(card.difficulty,3);assert.ok(meta.levels.includes(card.proficiency_level));
      assert.ok(!originalWords.has(norm(card.word)),`${id} repeats an original word: ${card.word}`);
      assert.ok(!sourceWords.has(norm(card.word)),`${id} repeats a new word: ${card.word}`);
      sourceWords.add(norm(card.word));
      assert.ok(card.example_sentence.length<=500&&card.example_translation.length<=500);
      for(const field of ['hint','meaning','cue','example_translation'])assert.match(card[field],/[\u3400-\u9fff]/);
      for(const key of keys)assert.equal(bundled[key],card[key],`${id}:${card.word} is not bundled from source`);
      actualByLevel[card.proficiency_level]=(actualByLevel[card.proficiency_level]||0)+1;
      total++;
    }
    assert.deepEqual(actualByLevel,expectedByLevel,`${id} level distribution`);
  }
  assert.equal(total,376);
  assert.equal(decks.reduce((n,d)=>n+d.cards.length,0),1576);
});

test('all eight generated CSV spreadsheets round-trip through the actual admin importer',()=>{
  for(const [id,meta] of Object.entries(advanced)){
    const bytes=fs.readFileSync(new URL(`../content/advanced/csv/${id}.csv`,import.meta.url));
    assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf],`${id} CSV has UTF-8 BOM`);
    const workbook=XLSX.read(bytes,{type:'buffer'});
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:''});
    const deck=decks.find(d=>d.id===id);
    const parsed=importer.parseRows(rows,{deck});
    assert.equal(parsed.errors.length,0,`${id}: ${JSON.stringify(parsed.errors.slice(0,3))}`);
    assert.equal(parsed.count,meta.count);
    const duplicates=importer.validateDuplicates(parsed.rows,deck.cards.slice(0,100),'append');
    assert.deepEqual(duplicates,[],`${id} CSV should append without conflicts`);
  }
});
