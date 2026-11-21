import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const admin = fs.readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');

function status(values, meaning) {
  const raw = (Array.isArray(values) ? values : String(values ?? '').split(/\r?\n/))
    .map(value => String(value).trim()).filter(Boolean);
  const answer = String(meaning ?? '').trim().toLocaleLowerCase();
  const seen = new Set();
  const valid = raw.filter(value => {
    const key = value.toLocaleLowerCase();
    if (key === answer || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {raw, valid, ready: raw.length === 3 && valid.length === 3};
}

test('three distinct wrong answers enable four-choice; legacy and partial cards stay flip mode', () => {
  assert.equal(status(['錯一','錯二','錯三'], '正解').ready, true);
  assert.equal(status([], '正解').ready, false);
  assert.equal(status(['錯一'], '正解').ready, false);
  assert.equal(status(['錯一','錯一','錯三'], '正解').ready, false);
  assert.equal(status(['正解','錯二','錯三'], '正解').ready, false);
});

test('admin reads, saves, displays and exports distractors without clearing them on publish toggle', () => {
  for (const needle of ['distractors','distractorStatus','distractorText']) assert.match(admin, new RegExp(needle));
  assert.match(admin, /published:!!card\.published/);
  assert.match(admin, /rowsToSheet\(safe\)/);
  assert.match(html, /admin\.css\?v=20261121-distractors1/);
  assert.match(html, /admin\.js\?v=20261121-distractors1/);
});
