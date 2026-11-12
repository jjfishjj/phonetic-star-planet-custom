/* Public catalogue transport. Deliberately does not read Auth sessions or localStorage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PhoneticPublicCatalog = api;
    const status = root.document.getElementById('catalogStatus');
    const config = root.PHONETIC_CONFIG || {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      if (status) status.textContent = '使用內建牌組';
      return;
    }
    if (status) status.textContent = '正在同步公開牌組…';
    api.load(config, root.fetch.bind(root)).then(decks => {
      root.PhoneticApp.applyCatalog(decks);
      if (status) status.textContent = '公開牌組已同步';
    }).catch(() => {
      if (status) status.textContent = '目前無法同步，暫用內建牌組';
    });
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function publicKey(key) {
    if (typeof key !== 'string') return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    try {
      const body = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(body)).role === 'anon';
    } catch { return false; }
  }
  async function load(config, fetcher) {
    const base = new URL(config.supabaseUrl);
    if (base.protocol !== 'https:' || !publicKey(config.supabaseAnonKey)) throw new Error('Invalid public configuration');
    async function pages(table, select, order) {
      const result = [], seen = new Set();
      for (let offset = 0; ; offset += 1000) {
        const url = new URL('/rest/v1/' + table, base);
        url.search = new URLSearchParams({select, published:'eq.true', order, limit:'1000', offset:String(offset)}).toString();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          response = await fetcher(url.href, {
            headers:{apikey:config.supabaseAnonKey, Accept:'application/json'},
            credentials:'omit', cache:'no-store', signal:controller.signal
          });
          if (!response.ok) throw new Error('Catalogue request failed');
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error('Invalid catalogue response');
          for (const row of rows) {
            if (!row || typeof row.id !== 'string' || seen.has(row.id)) throw new Error('Inconsistent catalogue');
            seen.add(row.id); result.push(row);
          }
          if (rows.length < 1000) return result;
          if (offset >= 199000) throw new Error('Catalogue safety limit reached');
        } finally { clearTimeout(timer); }
      }
    }
    const [decks, cards] = await Promise.all([
      pages('phonetic_decks','id,name,native,flag,region,lang,position','position.asc,id.asc'),
      pages('phonetic_cards','id,deck_id,word,roman,hint,meaning,cue,position,legacy_index','deck_id.asc,position.asc,id.asc')
    ]);
    const byDeck = new Map();
    for (const d of decks) {
      if (typeof d.name !== 'string' || !['asia','europe','other'].includes(d.region)) throw new Error('Invalid deck');
      byDeck.set(d.id, {...d, cards:[]});
    }
    for (const c of cards) {
      const deck = byDeck.get(c.deck_id);
      if (!deck) continue; // A deck may be unpublished between the two anonymous requests.
      if (typeof c.word !== 'string' || typeof c.hint !== 'string' || typeof c.meaning !== 'string') throw new Error('Invalid card');
      deck.cards.push(c);
    }
    return Array.from(byDeck.values());
  }
  return {load, publicKey};
});
