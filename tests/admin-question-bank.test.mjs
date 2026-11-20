import assert from 'node:assert/strict';
import test from 'node:test';
import bank from '../shared/admin-question-bank.js';

const decks = [
  {id:'en',name:'英語',native:'English',lang:'en-US'},
  {id:'ja',name:'日語',native:'日本語',lang:'ja_JP'},
  {id:'ko',name:'韓語',native:'한국어',lang:'ko-KR'},
  {id:'id',name:'印尼語',native:'Bahasa Indonesia',lang:'id-ID'}
];
const cards = [
  {id:'en-1',deck_id:'en',legacy_index:0,word:'cloud',meaning:'雲',hint:'cloud cue',proficiency_level:'B1',difficulty:2},
  {id:'ja-1',deck_id:'ja',legacy_index:1,word:'雲',meaning:'cloud',hint:'kum o',proficiency_level:'N4',difficulty:3},
  {id:'ko-1',deck_id:'ko',legacy_index:2,word:'하늘',meaning:'天空',hint:'sky cue',proficiency_level:'3',difficulty:2},
  {id:'id-1',deck_id:'id',legacy_index:3,word:'awan',meaning:'雲',hint:'awan cue',difficulty:2},
  {id:'orphan',deck_id:'missing',legacy_index:4,word:'orphan',meaning:'孤兒',hint:'x'}
];

test('joins stored cards to their decks without inventing question or choice fields', () => {
  const rows = bank.rowsFor(decks, cards);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].card.id, 'en-1');
  assert.equal(rows[0].card.legacy_index, 0);
  assert.equal(Object.hasOwn(rows[0].card, 'options'), false);
  assert.deepEqual(bank.languageOptions(decks).map(option => option.value).sort(), ['en','id','ja','ko']);
});

test('uses each language’s existing level scheme and never converts practice difficulty into an exam grade', () => {
  const [english, japanese, korean, indonesian] = bank.rowsFor(decks, cards);
  assert.equal(bank.levelKey(english), 'cefr:B1');
  assert.equal(bank.levelLabel(english), 'CEFR B1');
  assert.equal(bank.levelKey(japanese), 'jlpt:N4');
  assert.equal(bank.levelLabel(japanese), 'JLPT N4');
  assert.equal(bank.levelKey(korean), 'topik:3');
  assert.equal(bank.levelLabel(korean), 'TOPIK 3 級');
  assert.equal(bank.levelKey(indonesian), 'legacy:2');
  assert.equal(bank.levelLabel(indonesian), '站內難度 · 基礎');
});

test('filters intersect language, level and stored text without mutating card identifiers or VARK cues', () => {
  const rows = bank.rowsFor(decks, cards.map(card => ({...card, cue_visual:'visual memory'})));
  const filtered = bank.filterRows(rows, {language:'ja',level:'jlpt:N4',query:'cloud'});
  assert.deepEqual(filtered.map(row => row.card.id), ['ja-1']);
  assert.equal(filtered[0].card.legacy_index, 1);
  assert.equal(filtered[0].card.cue_visual, 'visual memory');
  assert.deepEqual(cards.map(card => card.id), ['en-1','ja-1','ko-1','id-1','orphan']);
  assert.deepEqual(bank.filterRows(rows, {language:'ko',level:'jlpt:N4'}), []);
});
