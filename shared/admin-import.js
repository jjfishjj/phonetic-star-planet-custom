(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./card-tags.js'));
  else root.PhoneticAdminImport = factory(root.PhoneticCardTags);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (tags) {
  'use strict';
  if (!tags) throw new Error('PhoneticCardTags is required');
  const {normalizeTopic, normalizeDifficulty, normalizeLevel} = tags;
  const headers = {
    word: ['word', '單字'], roman: ['roman', '音標'], hint: ['hint', '諧音'],
    meaning: ['meaning', '中文意思'], cue: ['cue', '記憶畫面'], topic: ['topic', '主題'],
    difficulty: ['difficulty', '難度'], proficiency_level: ['proficiency_level', '程度', '檢定等級'],
    example_sentence: ['example_sentence', '例句', '原文例句'],
    example_translation: ['example_translation', '例句翻譯', '繁中翻譯'],
    published: ['published', '發布'], position: ['position', '排序'], id: ['id']
  };
  const normalize = value => String(value == null ? '' : value).trim();
  function keyFor(header) {
    const h = normalize(header).toLowerCase();
    for (const [key, names] of Object.entries(headers)) if (names.some(n => n.toLowerCase() === h)) return key;
    return null;
  }
  function parseBoolean(value, fallback = true) {
    const v = normalize(value).toLowerCase();
    if (!v) return fallback;
    if (['true', '1', 'yes', 'y', 'published', '是', '發布', '上架'].includes(v)) return true;
    if (['false', '0', 'no', 'n', 'unpublished', '否', '下架'].includes(v)) return false;
    return null;
  }
  function parseRows(rows, options = {}) {
    const maxRows = options.maxRows || 2000, deck = options.deck, errors = [];
    if (!Array.isArray(rows) || !rows.length) return {rows: [], errors: [{row: 1, message: '找不到資料列。'}], count: 0};
    const sourceHeaders = (rows[0] || []).map(normalize), mapped = sourceHeaders.map(keyFor);
    const required = ['word', 'hint', 'meaning'];
    sourceHeaders.filter((h, i) => h && !mapped[i]).forEach(h => errors.push({row: 1, message: `未知欄位：${h}。`}));
    for (const key of required) if (!mapped.includes(key)) errors.push({row: 1, message: `缺少必要欄位：${key === 'word' ? 'word／單字' : key === 'hint' ? 'hint／諧音' : 'meaning／中文意思'}。`});
    const hasSentence = mapped.includes('example_sentence'), hasTranslation = mapped.includes('example_translation');
    const data = rows.slice(1);
    if (data.length > maxRows) errors.push({row: maxRows + 2, message: `資料列超過 ${maxRows} 列上限，請拆分檔案。`});
    const out = [];
    data.forEach((cells, index) => {
      const rowNumber = index + 2, obj = {};
      mapped.forEach((key, col) => { if (key) obj[key] = normalize((cells || [])[col]); });
      if (!Object.values(obj).some(Boolean)) return;
      for (const key of required) if (!obj[key]) errors.push({row: rowNumber, message: `缺少${key === 'word' ? '單字' : key === 'hint' ? '諧音' : '中文意思'}。`});
      const limits = {word: 300, roman: 300, hint: 500, meaning: 500, cue: 2000, example_sentence: 500, example_translation: 500};
      for (const [key, limit] of Object.entries(limits)) if (obj[key] && obj[key].length > limit) errors.push({row: rowNumber, message: `${key} 超過 ${limit} 字上限。`});
      if (obj.topic !== undefined && obj.topic !== '') { const value = normalizeTopic(obj.topic); if (!value) errors.push({row: rowNumber, message: '主題/topic 必須是有效 slug 或中文主題。'}); else obj.topic = value; } else delete obj.topic;
      if (obj.difficulty !== undefined && obj.difficulty !== '') { const value = normalizeDifficulty(obj.difficulty); if (value == null) errors.push({row: rowNumber, message: '難度/difficulty 必須是 1、2、3 或 入門、基礎、挑戰。'}); else obj.difficulty = value; } else delete obj.difficulty;
      if (obj.proficiency_level !== undefined && obj.proficiency_level !== '') { const value = deck && tags.levelScheme(deck) === 'legacy' ? null : normalizeLevel(obj.proficiency_level, deck); if (value == null) errors.push({row: rowNumber, message: '程度/proficiency_level 不是所選牌組有效的等級。'}); else obj.proficiency_level = value; } else delete obj.proficiency_level;
      const sentence = hasSentence ? obj.example_sentence : undefined, translation = hasTranslation ? obj.example_translation : undefined;
      if ((sentence || translation) && (!sentence || !translation)) errors.push({row: rowNumber, message: '例句與例句翻譯必須成對提供。'});
      if (hasSentence && hasTranslation) { if (sentence || translation) { if (sentence && translation) { obj.example_sentence = sentence; obj.example_translation = translation; } } else { obj.example_sentence = ''; obj.example_translation = ''; } }
      else { delete obj.example_sentence; delete obj.example_translation; }
      if (obj.published !== undefined && obj.published !== '') { const parsed = parseBoolean(obj.published); if (parsed === null) errors.push({row: rowNumber, message: '發布欄位請填 true/false、1/0 或 是/否。'}); else obj.published = parsed; } else delete obj.published;
      if (obj.position !== undefined && obj.position !== '') { const n = Number(obj.position); if (!Number.isInteger(n) || n < 0) errors.push({row: rowNumber, message: '排序必須是大於等於 0 的整數。'}); else obj.position = n; } else delete obj.position;
      if (obj.id === '') delete obj.id;
      out.push({...obj, _row: rowNumber});
    });
    return {rows: out, errors, count: out.length};
  }
  function validateDuplicates(rows, existing = [], mode = 'append') {
    const errors = [], ids = new Map(), words = new Map();
    rows.forEach(r => { if (r.id) { if (ids.has(r.id)) errors.push({row: r._row, message: `id「${r.id}」與第 ${ids.get(r.id)} 列重複。`}); else ids.set(r.id, r._row); } const word = normalize(r.word); if (words.has(word)) errors.push({row: r._row, message: `單字「${word}」與第 ${words.get(word)} 列重複。`}); else words.set(word, r._row); });
    const byId = new Map(existing.map(r => [String(r.id), r])), byWord = new Map(existing.map(r => [normalize(r.word), r]));
    rows.forEach(r => { const idMatch = r.id && byId.get(String(r.id)), wordMatch = byWord.get(normalize(r.word)); if (idMatch && idMatch.word !== r.word && mode === 'update') errors.push({row: r._row, message: `id「${r.id}」與既有單字不一致。`}); if (mode === 'append' && (idMatch || wordMatch)) errors.push({row: r._row, message: `追加模式衝突：${idMatch ? `id「${r.id}」` : `單字「${r.word}」`} 已存在。`}); if (mode === 'update' && r.id && !idMatch) errors.push({row: r._row, message: `更新模式找不到 id「${r.id}」。`}); });
    return errors;
  }
  function rowsToSheet(rows) {
    return [['word','roman','hint','meaning','cue','topic','difficulty','proficiency_level','example_sentence','example_translation','published','position','id'], ...rows.map(r => [r.word || '', r.roman || '', r.hint || '', r.meaning || '', r.cue || '', normalizeTopic(r.topic) || '', normalizeDifficulty(r.difficulty) ?? '', r.proficiency_level || '', r.example_sentence || '', r.example_translation || '', r.published !== false, r.position ?? '', r.id || ''])];
  }
  function safeCsvCell(value) { let s = normalize(value); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }
  function rowsToCsv(rows) { return rowsToSheet(rows).map(row => row.map(safeCsvCell).join(',')).join('\r\n'); }
  return {parseRows, validateDuplicates, rowsToSheet, rowsToCsv, safeCsvCell, parseBoolean, keyFor};
}));
