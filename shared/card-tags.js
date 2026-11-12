/* Stable card metadata vocabulary shared by the public app and Admin Studio. */
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
  const DIFFICULTIES = Object.freeze([
    {value:1, label:'入門'},
    {value:2, label:'基礎'},
    {value:3, label:'挑戰'}
  ]);
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
  return {TOPICS, DIFFICULTIES, normalizeTopic, normalizeDifficulty, getTopic, getDifficulty, topicLabel, difficultyLabel};
});
