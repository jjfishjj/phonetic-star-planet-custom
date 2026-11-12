(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhoneticAdminImport = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const headers = {
    word: ['word', '單字'], roman: ['roman', '音標'], hint: ['hint', '諧音'],
    meaning: ['meaning', '中文意思'], cue: ['cue', '記憶畫面'],
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
    const maxRows = options.maxRows || 2000, errors = [];
    if (!Array.isArray(rows) || !rows.length) return { rows: [], errors: [{ row: 1, message: '找不到資料列。' }], count: 0 };
    const sourceHeaders = (rows[0] || []).map(normalize), mapped = sourceHeaders.map(keyFor);
    const required = ['word', 'hint', 'meaning'];
    const unknown = sourceHeaders.filter((h, i) => h && !mapped[i]);
    unknown.forEach(h => errors.push({ row: 1, message: `未知欄位：${h}。` }));
    for (const key of required) if (!mapped.includes(key)) errors.push({ row: 1, message: `缺少必要欄位：${key === 'word' ? 'word／單字' : key === 'hint' ? 'hint／諧音' : 'meaning／中文意思'}。` });
    const data = rows.slice(1);
    if (data.length > maxRows) errors.push({ row: maxRows + 2, message: `資料列超過 ${maxRows} 列上限，請拆分檔案。` });
    const out = [];
    data.forEach((cells, index) => {
      const rowNumber = index + 2, obj = {};
      mapped.forEach((key, col) => { if (key) obj[key] = normalize((cells || [])[col]); });
      if (!Object.values(obj).some(Boolean)) return;
      for (const key of required) if (!obj[key]) errors.push({ row: rowNumber, message: `缺少${key === 'word' ? '單字' : key === 'hint' ? '諧音' : '中文意思'}。` });
      const limits = { word: 300, roman: 300, hint: 500, meaning: 500, cue: 2000 };
      for (const [key, limit] of Object.entries(limits)) if (obj[key] && obj[key].length > limit) errors.push({ row: rowNumber, message: `${key} 超過 ${limit} 字上限。` });
      // Omit absent/blank publication status: inserts default to true on the server,
      // while updates preserve an existing draft instead of accidentally publishing it.
      if (obj.published !== undefined && obj.published !== '') { const parsed = parseBoolean(obj.published); if (parsed === null) errors.push({ row: rowNumber, message: '發布欄位請填 true/false、1/0 或 是/否。' }); else obj.published = parsed; } else delete obj.published;
      if (obj.position !== undefined && obj.position !== '') { const n = Number(obj.position); if (!Number.isInteger(n) || n < 0) errors.push({ row: rowNumber, message: '排序必須是大於等於 0 的整數。' }); else obj.position = n; } else delete obj.position;
      if (obj.id === '') delete obj.id;
      out.push({ ...obj, _row: rowNumber });
    });
    return { rows: out, errors, count: out.length };
  }
  function validateDuplicates(rows, existing = [], mode = 'append') {
    const errors = [], ids = new Map(), words = new Map();
    rows.forEach(r => {
      if (r.id) { if (ids.has(r.id)) errors.push({ row: r._row, message: `id「${r.id}」與第 ${ids.get(r.id)} 列重複。` }); else ids.set(r.id, r._row); }
      const word = normalize(r.word); if (words.has(word)) errors.push({ row: r._row, message: `單字「${word}」與第 ${words.get(word)} 列重複。` }); else words.set(word, r._row);
    });
    const byId = new Map(existing.map(r => [String(r.id), r])), byWord = new Map(existing.map(r => [normalize(r.word), r]));
    rows.forEach(r => {
      const idMatch = r.id && byId.get(String(r.id)), wordMatch = byWord.get(normalize(r.word));
      if (idMatch && idMatch.word !== r.word && mode === 'update') errors.push({ row: r._row, message: `id「${r.id}」與既有單字不一致。` });
      if (mode === 'append' && (idMatch || wordMatch)) errors.push({ row: r._row, message: `追加模式衝突：${idMatch ? `id「${r.id}」` : `單字「${r.word}」`} 已存在。` });
      if (mode === 'update' && r.id && !idMatch) errors.push({ row: r._row, message: `更新模式找不到 id「${r.id}」。` });
    });
    return errors;
  }
  function rowsToSheet(rows) { return [['word','roman','hint','meaning','cue','published','position','id'], ...rows.map(r => [r.word || '', r.roman || '', r.hint || '', r.meaning || '', r.cue || '', r.published !== false, r.position ?? '', r.id || ''])]; }
  function safeCsvCell(value) { let s = normalize(value); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }
  function rowsToCsv(rows) { return rowsToSheet(rows).map(row => row.map(safeCsvCell).join(',')).join('\r\n'); }
  return { parseRows, validateDuplicates, rowsToSheet, rowsToCsv, safeCsvCell, parseBoolean, keyFor };
}));
