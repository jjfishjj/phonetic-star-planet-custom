import assert from 'node:assert/strict';
import test from 'node:test';
import parser from '../shared/admin-import.js';

const headers = ['單字','音標','諧音','中文意思','記憶畫面','主題','難度','發布','排序','id'];

test('parses Chinese headers and normalizes fields', () => {
  const result = parser.parseRows([headers, ['bonjour','/bɔ̃/','蹦啾','你好','揮手打招呼','飲食','挑戰','是','2','abc']]);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {word:'bonjour',roman:'/bɔ̃/',hint:'蹦啾',meaning:'你好',cue:'揮手打招呼',topic:'food',difficulty:3,published:true,position:2,id:'abc',_row:2});
});

test('accepts English headers and canonical tag slugs', () => {
  const result = parser.parseRows([['word','hint','meaning','topic','difficulty'], ['hello','h','m','greetings','2']]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].topic, 'greetings');
  assert.equal(result.rows[0].difficulty, 2);
});

test('rejects invalid topic and difficulty values', () => {
  const result = parser.parseRows([['word','hint','meaning','topic','difficulty'], ['x','h','m','unknown','4']]);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(e => e.message.includes('主題')));
  assert.ok(result.errors.some(e => e.message.includes('難度')));
});

test('omits blank tags so RPC defaults or existing values remain intact', () => {
  const result = parser.parseRows([['word','hint','meaning','topic','difficulty'], ['x','h','m','  ','']]);
  assert.equal(result.errors.length, 0);
  assert.equal(Object.hasOwn(result.rows[0], 'topic'), false);
  assert.equal(Object.hasOwn(result.rows[0], 'difficulty'), false);
});

test('omits absent or blank publication status so update mode preserves drafts', () => {
  for (const rows of [
    [['word','hint','meaning'], ['draft','h','m']],
    [['word','hint','meaning','published'], ['draft','h','m','']]
  ]) {
    const parsed = parser.parseRows(rows);
    assert.equal(parsed.errors.length, 0);
    assert.equal(Object.hasOwn(parsed.rows[0], 'published'), false);
    const {_row, ...payload} = parsed.rows[0];
    assert.equal(Object.hasOwn(payload, 'published'), false);
  }
  const explicit = parser.parseRows([['word','hint','meaning','published'], ['draft','h','m',false], ['live','h','m',true]]);
  assert.equal(explicit.rows[0].published, false);
  assert.equal(explicit.rows[1].published, true);
});

test('rejects missing required columns and values', () => {
  const result = parser.parseRows([['word','hint'], ['x','']]);
  assert.ok(result.errors.some(e => e.message.includes('meaning')));
  assert.ok(result.errors.some(e => e.message.includes('中文意思')));
});

test('rejects unknown headers, invalid booleans, negative positions, and oversized fields', () => {
  const unknown = parser.parseRows([['word','hint','meaning','mystery'], ['x','h','m','v']]);
  assert.ok(unknown.errors.some(e => e.message.includes('未知欄位')));
  const result = parser.parseRows([['word','hint','meaning','published','position'], ['x','h','m','maybe','-1']]);
  assert.equal(result.errors.length, 2);
  const long = parser.parseRows([['word','hint','meaning'], ['x'.repeat(301),'h','m']]);
  assert.ok(long.errors.some(e => e.message.includes('300')));
  const longVark = parser.parseRows([['word','hint','meaning','cue_visual'], ['x','h','m','v'.repeat(1001)]]);
  assert.ok(longVark.errors.some(e => e.message.includes('cue_visual') && e.message.includes('1000')));
});

test('does not silently truncate rows above the cap', () => {
  const rows = [['word','hint','meaning'], ...Array.from({length: 2001}, (_, i) => [`w${i}`,'h','m'])];
  const result = parser.parseRows(rows);
  assert.equal(result.rows.length, 2001);
  assert.ok(result.errors.some(e => e.message.includes('2000')));
});

test('blank id is optional and duplicate rows are rejected', () => {
  const result = parser.parseRows([['word','hint','meaning','id'], ['same','h','m',''], ['same','h2','m2','']]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].id, undefined);
  const errors = parser.validateDuplicates(result.rows, [], 'append');
  assert.ok(errors.some(e => e.message.includes('單字「same」')));
});

test('conflicts are mode-specific', () => {
  const rows = parser.parseRows([['word','hint','meaning','id'], ['old','h','m','card-1'], ['new','h','m','']]).rows;
  const existing = [{id:'card-1', word:'old'}, {id:'card-2', word:'new'}];
  assert.ok(parser.validateDuplicates(rows, existing, 'append').length >= 2);
  const updateErrors = parser.validateDuplicates(rows, existing, 'update');
  assert.ok(updateErrors.some(e => e.message.includes('id「card-1」')) === false);
  assert.ok(updateErrors.some(e => e.message.includes('找不到 id')) === false);
});

test('CSV protects formula-like values', () => {
  assert.equal(parser.safeCsvCell('=1+1'), '"\'=1+1"');
  assert.match(parser.rowsToCsv([{word:'@cmd',hint:'h',meaning:'m'}]), /"'@cmd"/);
});

test('export includes canonical tags and can be parsed back', () => {
  const rows = [{word:'hello', roman:'/h/', hint:'h', meaning:'你好', topic:'greetings', difficulty:2, published:true, position:4, id:'c1'}];
  const sheet = parser.rowsToSheet(rows);
  assert.deepEqual(sheet[0], ['word','roman','hint','meaning','cue','cue_visual','cue_auditory','cue_read_write','cue_kinesthetic','topic','difficulty','proficiency_level','example_sentence','example_translation','published','position','id']);
  const parsed = parser.parseRows(sheet);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.rows[0], {...rows[0], cue:'', cue_visual:'', cue_auditory:'', cue_read_write:'', cue_kinesthetic:'', example_sentence:'', example_translation:'', _row: 2});
  assert.equal(Object.hasOwn(parsed.rows[0], 'proficiency_level'), false);
  assert.match(parser.rowsToCsv(rows), /"topic"/);
  assert.match(parser.rowsToCsv(rows), /"greetings"/);
});

test('parses Traditional Chinese VARK headers and roundtrips all four cues', () => {
  const sheet = [
    ['單字','諧音','中文意思','視覺提示','聽覺提示','讀寫提示','動作提示','記憶畫面'],
    ['apple','阿婆','蘋果','想像紅蘋果','朗讀 apple','寫出 apple','做摘蘋果的手勢','阿婆摘蘋果']
  ];
  const parsed = parser.parseRows(sheet);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows[0].cue_visual, '想像紅蘋果');
  assert.equal(parsed.rows[0].cue_auditory, '朗讀 apple');
  assert.equal(parsed.rows[0].cue_read_write, '寫出 apple');
  assert.equal(parsed.rows[0].cue_kinesthetic, '做摘蘋果的手勢');
  assert.equal(parsed.rows[0].cue, '阿婆摘蘋果');
  const exported = parser.rowsToSheet(parsed.rows);
  const reparsed = parser.parseRows(exported);
  assert.equal(reparsed.errors.length, 0);
  for (const key of ['cue_visual','cue_auditory','cue_read_write','cue_kinesthetic']) assert.equal(reparsed.rows[0][key], parsed.rows[0][key]);
});

test('omitted VARK columns remain omitted while explicit blanks can clear cues', () => {
  const omitted = parser.parseRows([['word','hint','meaning'],['apple','阿婆','蘋果']]);
  assert.equal(omitted.errors.length, 0);
  for (const key of ['cue_visual','cue_auditory','cue_read_write','cue_kinesthetic']) assert.equal(Object.hasOwn(omitted.rows[0], key), false);
  const blank = parser.parseRows([['word','hint','meaning','cue_visual','cue_auditory','cue_read_write','cue_kinesthetic'],['apple','阿婆','蘋果','','','','']]);
  assert.equal(blank.errors.length, 0);
  for (const key of ['cue_visual','cue_auditory','cue_read_write','cue_kinesthetic']) assert.equal(blank.rows[0][key], '');
});

test('roundtrips proficiency and paired examples using aliases', () => {
  const sheet = [['單字','諧音','中文意思','程度','原文例句','繁中翻譯'], ['hola','歐啦','你好','A1','Hola, Ana.','你好，安娜。']];
  const parsed = parser.parseRows(sheet, {deck:{lang:'es'}});
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.rows[0], {word:'hola',hint:'歐啦',meaning:'你好',proficiency_level:'A1',example_sentence:'Hola, Ana.',example_translation:'你好，安娜。',_row:2});
  const exported = parser.rowsToSheet(parsed.rows);
  const reparsed = parser.parseRows(exported, {deck:{lang:'es'}});
  assert.equal(reparsed.errors.length, 0);
  assert.equal(reparsed.rows[0].proficiency_level, 'A1');
  assert.equal(reparsed.rows[0].example_translation, '你好，安娜。');
});

test('validates levels against selected CEFR, JLPT, TOPIK and legacy schemes', () => {
  assert.equal(parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','N5']], {deck:{lang:'en'}}).errors.length, 1);
  assert.equal(parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','N5']], {deck:{lang:'ja'}}).errors.length, 0);
  assert.equal(parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','6']], {deck:{lang:'ko'}}).errors.length, 0);
  assert.equal(parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','4']], {deck:{lang:'id'}}).errors.length, 1);
  assert.equal(parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','1']], {deck:{lang:'id'}}).errors.length, 1);
});

test('requires paired examples but permits both explicit blanks to clear', () => {
  const one = parser.parseRows([['word','hint','meaning','example_sentence','example_translation'],['x','h','m','Hello','']]);
  assert.ok(one.errors.some(e => e.message.includes('成對')));
  const blank = parser.parseRows([['word','hint','meaning','example_sentence','example_translation'],['x','h','m','','']]);
  assert.equal(blank.errors.length, 0);
  assert.deepEqual([blank.rows[0].example_sentence, blank.rows[0].example_translation], ['', '']);
  const omitted = parser.parseRows([['word','hint','meaning','proficiency_level'],['x','h','m','']]);
  assert.equal(omitted.errors.length, 0);
  assert.equal(Object.hasOwn(omitted.rows[0], 'proficiency_level'), false);
});

test('legacy difficulty remains 1-3 and does not require proficiency', () => {
  const good = parser.parseRows([['word','hint','meaning','difficulty'],['x','h','m','挑戰']], {deck:{lang:'vi'}});
  assert.equal(good.errors.length, 0);
  assert.equal(good.rows[0].difficulty, 3);
  const bad = parser.parseRows([['word','hint','meaning','difficulty'],['x','h','m','4']], {deck:{lang:'vi'}});
  assert.equal(bad.errors.length, 1);
});
