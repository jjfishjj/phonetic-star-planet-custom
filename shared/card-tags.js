/* Stable metadata vocabulary shared by the public app, Admin Studio and import parser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhoneticCardTags = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TOPICS = Object.freeze([
    {value:'general', label:'其他／未分類'},
    {value:'greetings', label:'問候與禮貌'},
    {value:'people', label:'人物與關係'},
    {value:'home', label:'居家與用品'},
    {value:'food', label:'飲食'},
    {value:'travel', label:'交通與場所'},
    {value:'time', label:'時間與日期'},
    {value:'numbers', label:'數字與數量'},
    {value:'expressions', label:'基本表達'},
    {value:'nature', label:'自然'},
    {value:'study', label:'工作與學習'},
    {value:'shopping', label:'購物與金錢'},
    {value:'actions', label:'日常動作'},
    {value:'descriptions', label:'描述與感受'}
  ]);
  // Keep this original vocabulary and its meaning unchanged for existing data.
  const DIFFICULTIES = Object.freeze([
    {value:1, label:'入門'},
    {value:2, label:'基礎'},
    {value:3, label:'挑戰'}
  ]);
  const LEVELS = Object.freeze({
    cefr: Object.freeze(['A1','A2','B1','B2','C1','C2'].map(value => ({value, label:`CEFR ${value}`}))),
    jlpt: Object.freeze(['N5','N4','N3','N2','N1'].map(value => ({value, label:`JLPT ${value}`}))),
    topik: Object.freeze(['1','2','3','4','5','6'].map(value => ({value, label:`TOPIK ${value} 級`}))),
    legacy: Object.freeze(DIFFICULTIES.map(item => ({value:String(item.value),label:item.label})))
  });
  function normalizeTopic(value) {
    const text = String(value ?? '').trim();
    const match = TOPICS.find(t => t.value === text.toLowerCase() || t.label === text);
    if (match) return match.value;
    if (['其他','未分類','一般'].includes(text)) return 'general';
    return null;
  }
  function normalizeDifficulty(value) {
    const text = String(value ?? '').trim();
    const match = DIFFICULTIES.find(d => String(d.value) === text || d.label === text);
    return match ? match.value : null;
  }
  const getTopic = card => normalizeTopic(card?.topic) || 'general';
  const getDifficulty = card => normalizeDifficulty(card?.difficulty) || 1;
  const topicLabel = value => TOPICS.find(t => t.value === normalizeTopic(value))?.label || TOPICS[0].label;
  const difficultyLabel = value => DIFFICULTIES.find(d => d.value === normalizeDifficulty(value))?.label || DIFFICULTIES[0].label;
  function levelScheme(deck) {
    const language = String(deck?.lang || deck?.id || '').trim().toLowerCase().replace(/_/g,'-').split('-')[0];
    if (['en','es','fr','de','pt','it'].includes(language)) return 'cefr';
    if (language === 'ja') return 'jlpt';
    if (language === 'ko') return 'topik';
    return 'legacy';
  }
  const levelOptions = deck => LEVELS[levelScheme(deck)];
  const levelSchemeLabel = deck => ({cefr:'CEFR',jlpt:'JLPT',topik:'TOPIK',legacy:'站內難度'})[levelScheme(deck)];
  function normalizeLevel(value, deck) {
    let text = String(value ?? '').trim().toUpperCase();
    if (!text) return null;
    // Import may use visible labels, while storage always uses a canonical code.
    text = text.replace(/^(CEFR|JLPT|TOPIK)\s*/,'').replace(/\s*級$/,'').trim();
    if (deck == null) return /^(A[12]|B[12]|C[12]|N[1-5]|[1-6])$/.test(text) ? text : null;
    if (levelScheme(deck) === 'legacy') {
      const difficulty = normalizeDifficulty(text) ?? normalizeDifficulty(value);
      return difficulty == null ? null : String(difficulty);
    }
    return levelOptions(deck).some(item => item.value === text) ? text : null;
  }
  function getLevel(card, deck) {
    if (levelScheme(deck) === 'legacy') return String(getDifficulty(card));
    // Old 1–3 practice difficulty is not an exam grade. Never silently convert it.
    return normalizeLevel(card?.proficiency_level, deck) || '';
  }
  function levelLabel(value, deck) {
    const normalized = normalizeLevel(value, deck);
    return levelOptions(deck).find(item => item.value === normalized)?.label || '未分級';
  }
  return {TOPICS, DIFFICULTIES, LEVELS, normalizeTopic, normalizeDifficulty, getTopic, getDifficulty,
    topicLabel, difficultyLabel, levelScheme, levelOptions, levelSchemeLabel, normalizeLevel, getLevel, levelLabel};
});
