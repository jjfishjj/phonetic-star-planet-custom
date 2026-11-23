import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../vendor/xlsx.full.min.js');
const adminImport = require('../shared/admin-import.js');

const expected = [
  {word:'apple', meaning:'蘋果', distractors:['香蕉','橘子','葡萄'], id:'75d27a4f-a041-5ea0-93cc-c2db30fac734'},
  {word:'water', meaning:'水', distractors:['牛奶','果汁','茶'], id:'5885b1ce-039e-5199-950a-fa5cadb9c55b'},
  {word:'book', meaning:'書', distractors:['鉛筆','桌子','書包'], id:'ab0ec7a2-7401-58e5-abaa-a9be26b585b8'},
  {word:'star', meaning:'星星', distractors:['月亮','行星','雲'], id:'6684d597-8c16-5bb5-969e-12a4112c79de'},
  {word:'smile', meaning:'微笑', distractors:['哭泣','皺眉','眨眼'], id:'35781fb6-ece9-5913-ae41-d066d09484d0'},
];

test('English A1 pilot CSV is five safe updates with exactly three distinct wrong answers each', () => {
  const file = new URL('../content/pilots/en-a1-distractors.csv', import.meta.url);
  const workbook = XLSX.read(fs.readFileSync(file), {type:'buffer'});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
  const parsed = adminImport.parseRows(sourceRows, {deck:{id:'en', lang:'en'}});

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.count, expected.length);
  assert.deepEqual(parsed.rows.map(({word, meaning, distractors, id}) => ({word, meaning, distractors, id})), expected);
  assert.ok(parsed.rows.every(row => row.hint.length > 0));
  assert.deepEqual(adminImport.validateDuplicates(
    parsed.rows,
    expected.map(({id, word}) => ({id, word})),
    'update'
  ), []);
  for (const row of parsed.rows) {
    assert.equal(row.distractors.length, 3);
    assert.equal(new Set(row.distractors.map(value => value.toLocaleLowerCase())).size, 3);
    assert.ok(row.distractors.every(value => value.toLocaleLowerCase() !== row.meaning.toLocaleLowerCase()));
  }
});
