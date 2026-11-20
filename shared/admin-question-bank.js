/* Read-only cross-deck question-bank helpers for Admin Studio. */
(function (root, factory) {
  const tags = typeof module === 'object' && module.exports
    ? require('./card-tags.js')
    : root.PhoneticCardTags;
  const api = factory(tags);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhoneticAdminQuestionBank = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tags) {
  'use strict';

  function languageKey(deck) {
    const lang = String(deck?.lang || '').trim().replace(/_/g, '-');
    return (lang ? lang.split('-')[0] : String(deck?.id || 'unknown')).toLowerCase();
  }

  function languageOptions(decks) {
    const options = new Map();
    (decks || []).forEach(deck => {
      const key = languageKey(deck);
      if (!options.has(key)) options.set(key, {
        value: key,
        label: `${deck.native || deck.name || key} (${key})`
      });
    });
    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
  }

  function rowsFor(decks, cards) {
    const deckById = new Map((decks || []).map(deck => [String(deck.id), deck]));
    return (cards || []).flatMap(card => {
      const deck = deckById.get(String(card.deck_id));
      return deck ? [{ card, deck, language: languageKey(deck) }] : [];
    });
  }

  function levelValue(row) {
    return tags.getLevel(row.card, row.deck) || 'unrated';
  }

  function levelKey(row) {
    return `${tags.levelScheme(row.deck)}:${levelValue(row)}`;
  }

  function levelLabel(row) {
    const value = levelValue(row);
    const scheme = tags.levelScheme(row.deck);
    if (value === 'unrated') return `未分級 · ${tags.levelSchemeLabel(row.deck)}`;
    return scheme === 'legacy'
      ? `站內難度 · ${tags.levelLabel(value, row.deck)}`
      : tags.levelLabel(value, row.deck);
  }

  function levelOptions(rows, language = '') {
    const seen = new Map();
    (rows || []).filter(row => !language || row.language === language).forEach(row => {
      const key = levelKey(row);
      if (!seen.has(key)) seen.set(key, { value: key, label: levelLabel(row), deck: row.deck, level: levelValue(row) });
    });
    return [...seen.values()].sort((a, b) => {
      const schemeOrder = tags.levelScheme(a.deck).localeCompare(tags.levelScheme(b.deck));
      if (schemeOrder) return schemeOrder;
      if (a.level === 'unrated') return 1;
      if (b.level === 'unrated') return -1;
      const values = tags.levelOptions(a.deck).map(item => String(item.value));
      return values.indexOf(String(a.level)) - values.indexOf(String(b.level));
    }).map(({ value, label }) => ({ value, label }));
  }

  function filterRows(rows, { language = '', level = '', query = '' } = {}) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    return (rows || []).filter(row => {
      if (language && row.language !== language) return false;
      if (level && levelKey(row) !== level) return false;
      if (!needle) return true;
      const card = row.card;
      return [row.deck.name, row.deck.native, row.deck.lang, card.word, card.meaning, card.roman,
        card.hint, card.cue, card.cue_visual, card.cue_auditory, card.cue_read_write,
        card.cue_kinesthetic, card.example_sentence, card.example_translation]
        .some(value => String(value || '').toLocaleLowerCase().includes(needle));
    });
  }

  return { languageKey, languageOptions, rowsFor, levelValue, levelKey, levelLabel, levelOptions, filterRows };
});
