/* Public learning app. Filtered views never re-index or replace the underlying cards. */
(() => {
  'use strict';
  const Tags = window.PhoneticCardTags;
  const $ = id => document.getElementById(id);
  const STORE = 'phonetic-star-planet-v1';
  const defaultState = {learned:[], favorites:[], xp:0, reviewed:0, selected:'en', index:0, revealed:false, unlearnedOnly:false, customDecks:[]};
  function safeRead() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
  const VOICE_STORE = 'phonetic-star-planet-voice-v1';
  function safeReadVoices() { try { const value=JSON.parse(localStorage.getItem(VOICE_STORE)); return value && typeof value==='object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
  const voicePreferences = safeReadVoices();
  const VARK_STORE = 'phonetic-star-planet-vark-v1';
  const VARK_MODES = {
    normal:{label:'一般提示',field:null,prompt:''},
    visual:{label:'視覺 Visual',field:'cue_visual',prompt:'把聲音和意思連成一個畫面。'},
    auditory:{label:'聽覺 Auditory',field:'cue_auditory',prompt:'先聽原文發音，再用聲音線索聯想意思。'},
    read_write:{label:'讀／寫 Read/Write',field:'cue_read_write',prompt:'讀出拼字與意思，或自己寫下關鍵聯想。'},
    kinesthetic:{label:'動作／操作 Kinesthetic',field:'cue_kinesthetic',prompt:'用安全的小動作或操作，把聲音和意思連起來。'}
  };
  function safeReadVarkMode() { try { const value=localStorage.getItem(VARK_STORE); return Object.hasOwn(VARK_MODES,value) ? value : 'normal'; } catch { return 'normal'; } }
  let varkMode=safeReadVarkMode();
  const speechApi = window.speechSynthesis || null;
  let deviceVoices = [];
  const languageKey = language => String(language||'zh-TW').trim().replace(/_/g,'-').split('-')[0].toLowerCase();
  const voiceKey = voice => JSON.stringify([voice.voiceURI||'',voice.lang||'',voice.name||'']);
  function saveVoicePreferences() { try { localStorage.setItem(VOICE_STORE,JSON.stringify(voicePreferences)); } catch {} }
  function refreshVoiceOptions(deck=getDeck()) {
    const select=$('voiceSelect'), status=$('voiceAvailability');
    if (!select || !status) return;
    select.replaceChildren(new Option('系統自動選擇',''));
    if (!speechApi) { select.disabled=true; status.textContent='此瀏覽器不支援語音合成，無法播放語音。'; return; }
    try { deviceVoices=speechApi.getVoices()||[]; } catch { deviceVoices=[]; }
    const language=String(deck?.lang||'zh-TW').trim().replace(/_/g,'-'), prefix=languageKey(language);
    const matching=deviceVoices.filter(v=>v && languageKey(v.lang)===prefix);
    const unique=Array.from(new Map(matching.map(v=>[voiceKey(v),v])).values()).sort((a,b)=>String(a.lang).localeCompare(String(b.lang))||String(a.name).localeCompare(String(b.name)));
    unique.forEach(v=>select.add(new Option(`${v.name||'裝置語音'} · ${v.lang||language}${v.default?'（系統預設）':''}`,voiceKey(v))));
    select.disabled=false;
    const preferred=voicePreferences[prefix];
    if (preferred && unique.some(v=>voiceKey(v)===preferred)) select.value=preferred;
    else {
      if (preferred) { delete voicePreferences[prefix]; saveVoicePreferences(); }
      select.value='';
    }
    status.textContent=unique.length
      ? `這台裝置目前提供 ${unique.length} 種 ${language} 語音；口音依語音地區標示。`
      : `此裝置目前沒有 ${language} 語音，朗讀會回退到瀏覽器或系統預設聲音。`;
  }
  const state = {...defaultState, ...(safeRead() || {})};
  if (!Array.isArray(state.learned)) state.learned = [];
  if (!Array.isArray(state.favorites)) state.favorites = [];
  if (!Array.isArray(state.customDecks)) state.customDecks = [];
  if (typeof state.unlearnedOnly !== 'boolean') state.unlearnedOnly = false;
  state.customDecks = state.customDecks.filter(d => d && typeof d.id === 'string' && Array.isArray(d.cards));
  if (!Number.isInteger(state.index) || state.index < 0) state.index = 0;
  // Filters are view preferences, not a migration of the persisted learning data.
  const cardFilters = {topic:'all', difficulty:'all'};
  const practiceMode = {unlearned:state.unlearnedOnly};
  let choiceCardKey = null;
  const hasCardFilters = () => cardFilters.topic !== 'all' || cardFilters.difficulty !== 'all';
  const hasAnyFilters = () => hasCardFilters() || practiceMode.unlearned;
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { showToast('瀏覽器儲存空間不足，資料尚未保存'); } }
  function allDecks() { return [...decks, ...state.customDecks]; }
  function getDeck() { return allDecks().find(d => d.id === state.selected) || allDecks()[0] || {id:'catalog-empty', name:'尚無已發布牌組', native:'', lang:'zh-TW', cards:[]}; }
  function isCustom(d) { return state.customDecks.some(x => x.id === d.id); }
  // Keep the original v1 identifiers, including legacy_index and custom-card UUIDs.
  function cardKey(d, index) { const c = d.cards[index]; return d.id + ':' + (isCustom(d) ? c?.id : (c?.legacy_index ?? c?.id ?? index)); }
  const filterLevel = (card, deck) => Tags.getLevel(card, deck) || 'unrated';
  function activeEntries(d = getDeck()) {
    return d.cards.map((card,index) => ({card,index})).filter(({card,index}) =>
      (cardFilters.topic === 'all' || Tags.getTopic(card) === cardFilters.topic) &&
      (cardFilters.difficulty === 'all' || filterLevel(card,d) === cardFilters.difficulty) &&
      (!practiceMode.unlearned || !state.learned.includes(cardKey(d,index))));
  }
  function matchingEntries(d = getDeck()) {
    return d.cards.map((card,index) => ({card,index})).filter(({card}) =>
      (cardFilters.topic === 'all' || Tags.getTopic(card) === cardFilters.topic) &&
      (cardFilters.difficulty === 'all' || filterLevel(card,d) === cardFilters.difficulty));
  }
  function currentEntry(d = getDeck(), entries = activeEntries(d)) {
    const index = d.cards.length ? state.index % d.cards.length : 0;
    const entry = entries.find(e => e.index === index) || entries[0];
    if (entry) state.index = entry.index;
    return entry || null;
  }
  function getCard() { return currentEntry()?.card || null; }
  function resetFilters() { cardFilters.topic = 'all'; cardFilters.difficulty = 'all'; practiceMode.unlearned = false; state.unlearnedOnly = false; }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function usableDistractors(card) {
    if (!card || !Array.isArray(card.distractors) || card.distractors.length !== 3) return [];
    const values = card.distractors.map(value => typeof value === 'string' ? value.trim() : ''), normalized = values.map(value => value.toLowerCase()), answer = String(card.meaning || '').trim().toLowerCase();
    return values.every(Boolean) && new Set(normalized).size === 3 && normalized.every(value => value !== answer) ? values : [];
  }
  function choiceOptions(card) {
    const distractors = usableDistractors(card);
    return distractors.length === 3 ? [...distractors, String(card.meaning).trim()].sort(() => Math.random() - .5) : [];
  }
  function newId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

  function renderFilters() {
    $('allCount').textContent = allDecks().length;
    $('customCount').textContent = state.customDecks.length;
    $('publicDeckCount').textContent = decks.length;
    $('publicCardCount').textContent = decks.reduce((n,d) => n + d.cards.length, 0).toLocaleString('zh-TW');
    for (const [region,label] of [['asia','亞洲'],['europe','歐洲'],['other','其他']]) {
      document.querySelector(`[data-filter="${region}"]`).textContent = `${label} ${decks.filter(d => d.region === region).length}`;
    }
  }
  function renderDecks(filter = 'all') {
    renderFilters();
    const grid = $('deckGrid');
    const list = allDecks().filter(d => filter === 'all' || (filter === 'custom' ? isCustom(d) : d.region === filter));
    grid.innerHTML = list.map(d => {
      const selected = d.id === state.selected;
      const learnedCount = d.cards.filter((c,i) => state.learned.includes(cardKey(d,i))).length;
      return `<button class="deck ${selected?'selected':''}" data-deck="${escapeHTML(d.id)}" aria-pressed="${selected}"><span class="deck-top"><span class="flag">${escapeHTML(d.flag||'📚')}</span><span class="deck-check">● 已選擇</span></span><h3>${escapeHTML(d.name)}</h3><div class="native">${escapeHTML(d.native||'自訂牌組')} · ${escapeHTML(Tags.levelSchemeLabel(d))}</div><div class="deck-foot"><span>${d.cards.length} 張${isCustom(d)?'自訂卡':'分級卡'}</span><b>${learnedCount}/${d.cards.length} 已記住</b></div></button>`;
    }).join('');
    grid.querySelectorAll('[data-deck]').forEach(btn => btn.addEventListener('click', () => {
      state.selected = btn.dataset.deck; state.index = 0; state.revealed = false; resetFilters(); save(); renderAll();
      $('practice').scrollIntoView({behavior:'smooth',block:'start'});
    }));
    const d = getDeck();
    $('manageDeckBtn').disabled = !isCustom(d);
    $('manageDeckBtn').textContent = isCustom(d) ? `編輯「${d.name}」` : '編輯已選牌組';
  }
  function fillFilter(select, items, selected, allLabel, counts, total) {
    select.replaceChildren(new Option(`${allLabel} (${total})`, 'all'));
    items.forEach(item => {
      const count = counts.get(item.value) || 0;
      const option = new Option(`${item.label} (${count})`, String(item.value));
      option.disabled = count === 0;
      select.add(option);
    });
    select.value = selected;
  }
  function renderCardFilters(d, entries, matching) {
    const topics = new Map(), difficulties = new Map();
    d.cards.forEach(c => {
      const topic = Tags.getTopic(c), difficulty = filterLevel(c,d);
      topics.set(topic, (topics.get(topic)||0)+1); difficulties.set(difficulty, (difficulties.get(difficulty)||0)+1);
    });
    const levels = [...Tags.levelOptions(d)];
    if (difficulties.has('unrated')) levels.push({value:'unrated',label:'未分級'});
    fillFilter($('topicFilter'), Tags.TOPICS, cardFilters.topic, '全部主題', topics, d.cards.length);
    fillFilter($('difficultyFilter'), levels, cardFilters.difficulty, '全部程度', difficulties, d.cards.length);
    $('difficultyFilterLabel').textContent = `程度 · ${Tags.levelSchemeLabel(d)}`;
    $('levelReferenceNote').textContent = Tags.levelScheme(d) === 'legacy' ? '保留原有站內 1–3 練習難度' : '學習參考分級，非官方詞表或檢定保證';
    $('cardFilterSummary').textContent = practiceMode.unlearned
      ? `未記住 ${entries.length} / ${matching.length} 張`
      : `顯示 ${entries.length} / ${d.cards.length} 張`;
    $('practiceModeBtn').setAttribute('aria-pressed',String(practiceMode.unlearned));
    $('practiceModeBtn').classList.toggle('mode-active',practiceMode.unlearned);
    $('resetFiltersBtn').disabled = !hasAnyFilters();
  }
  function renderPractice() {
    const d = getDeck(), matching = matchingEntries(d), entries = activeEntries(d), entry = currentEntry(d,entries), c = entry?.card;
    refreshVoiceOptions(d);
    $('varkModeSelect').value=varkMode;
    const position = entry ? entries.findIndex(e => e.index === entry.index) : -1;
    const currentKey = c ? cardKey(d,entry.index) : null;
    if (choiceCardKey !== currentKey) {
      if (c) c.choiceResult = null;
      choiceCardKey = currentKey;
    }
    renderCardFilters(d,entries,matching);
    $('currentDeckLabel').textContent = `${d.flag||'📚'} ${d.name}`;
    const allMatchingRemembered = practiceMode.unlearned && matching.length > 0 && entries.length === 0;
    $('cardCounter').textContent = c ? `CARD ${String(position+1).padStart(2,'0')} / ${String(entries.length).padStart(2,'0')} · ${(d.native||'CUSTOM').toUpperCase()}` : (allMatchingRemembered ? 'ALL MATCHING CARDS REMEMBERED' : (hasCardFilters() ? 'NO MATCHING CARDS' : 'DECK · EMPTY'));
    $('wordText').textContent = c ? c.word : (allMatchingRemembered ? '都記住了！' : (hasCardFilters() ? '沒有符合的卡片' : '尚未新增卡片'));
    $('wordText').dir = d.id === 'ar' ? 'rtl' : 'auto';
    $('romanText').textContent = c ? (c.roman||'') : '';
    $('soundHint').textContent = c ? (c.hint||'尚未填寫') : '';
    $('cardTags').replaceChildren();
    if (c) {
      for (const [label,kind] of [[Tags.topicLabel(c.topic),'topic'],[Tags.levelLabel(Tags.getLevel(c,d),d),'difficulty']]) {
        const tag = document.createElement('span'); tag.className = `card-tag ${kind}`; tag.textContent = label; $('cardTags').append(tag);
      }
    }
    const id = currentKey;
    const favorite = !!id && state.favorites.includes(id), learned = !!id && state.learned.includes(id);
    $('favoriteBtn').textContent = favorite ? '♥' : '♡'; $('favoriteBtn').classList.toggle('is-fav',favorite); $('favoriteBtn').disabled = !c;
    $('favoriteBtn').setAttribute('aria-label',favorite ? '取消收藏' : '收藏此卡'); $('speakBtn').disabled = !c;
    $('cardPrompt').textContent = c ? (learned ? '這張卡已記住，還可以再複習。' : (usableDistractors(c).length ? '選一個你認為正確的意思。' : '先猜猜看它的意思是什麼？')) : (allMatchingRemembered ? '這個範圍的卡片都已記住。' : (hasCardFilters() ? '調整主題或難度，就能繼續練習。' : '先新增自己的詞彙卡，再開始練習。'));
    const panel = $('answerPanel');
    if (!c) {
      panel.classList.add('empty');
      panel.innerHTML = allMatchingRemembered
        ? '<div class="hint-bulb">✦</div><span class="answer-label">NICE WORK</span><p style="margin-top:8px">這個範圍的卡片都記住了！<br>可以切回全部卡片再次複習。</p><div class="answer-actions"><button id="emptyPracticeModeBtn" class="primary">練習全部卡片</button></div>'
        : hasCardFilters()
        ? '<div class="hint-bulb">✦</div><span class="answer-label">TRY ANOTHER COMBINATION</span><p style="margin-top:8px">這個主題與難度沒有交集，<br>清除篩選即可回到整副牌組。</p><div class="answer-actions"><button id="emptyResetBtn" class="primary">清除篩選</button></div>'
        : isCustom(d) ? '<div class="hint-bulb">✦</div><span class="answer-label">READY WHEN YOU ARE</span><p style="margin-top:8px">這副牌組還沒有卡片，加入第一個詞彙就能開始。</p><div class="answer-actions"><button id="emptyManageBtn" class="primary">新增卡片</button></div>'
        : '<span class="answer-label">READY WHEN YOU ARE</span><p>目前沒有已發布的卡片，請先選擇其他牌組。</p>';
      $('emptyPracticeModeBtn')?.addEventListener('click',togglePracticeMode);
      $('emptyManageBtn')?.addEventListener('click', () => openManager(d.id));
      $('emptyResetBtn')?.addEventListener('click', clearCardFilters);
    } else if (state.revealed) {
      panel.classList.remove('empty');
      const options = usableDistractors(c), result = c.choiceResult;
      const selectedMode=VARK_MODES[varkMode], specificCue=selectedMode.field ? String(c[selectedMode.field]||'').trim() : '';
      const example = c.example_sentence && c.example_translation
        ? `<section class="example-block" aria-label="短例句與繁中翻譯"><div class="example-heading"><b>短例句</b><button id="speakSentenceBtn" class="sentence-speak" aria-label="播放例句發音" title="朗讀例句">朗讀</button></div><p class="example-sentence" lang="${escapeHTML(d.lang||'zh-TW')}" dir="auto">${escapeHTML(c.example_sentence)}</p><p class="example-translation" lang="zh-Hant">${escapeHTML(c.example_translation)}</p></section>`
        : '<p class="example-missing">此卡尚未加入例句，可在編輯時補上。</p>';
      const varkFallback={
        visual:'此卡尚未提供專用視覺提示；試著把下面的原始提示想成一幅畫，再連到單字意思。',
        auditory:'此卡尚未提供專用聽覺提示；點單字旁的喇叭播放，再跟讀原文與諧音提示。',
        read_write:'此卡尚未提供專用讀／寫提示；先看拼字，再遮住原文寫出單字或意思。',
        kinesthetic:'此卡尚未提供專用動作提示；可用安全的小手勢演出原始提示，再說一次單字。'
      };
      const varkBlock=varkMode==='normal'?'':`<section class="vark-prompt" aria-label="${escapeHTML(selectedMode.label)}"><div><b>${escapeHTML(selectedMode.label)}提示</b><small>${escapeHTML(selectedMode.prompt)}</small></div><p>${escapeHTML(specificCue||varkFallback[varkMode])}</p></section>`;
      const cueLabel=varkMode==='normal'?'記憶畫面':'原始諧音提示';
      panel.innerHTML = `${result ? `<span class="answer-label">${result.correct ? '答對了！' : '答錯了'}</span><p class="choice-feedback">${result.correct ? '這次選對了，可以繼續練習。' : `正確答案是「${escapeHTML(c.meaning)}」，再試下一張。`}</p>` : `<span class="answer-label">${learned?'REVIEW THIS CARD':'YOU GOT IT'}</span>`}<h3>${escapeHTML(c.meaning)}</h3><p>${escapeHTML(d.name)} · ${escapeHTML(d.native||'自訂牌組')}　<span class="confetti">✦</span></p>${example}${varkBlock}<div class="mnemonic"><b>${cueLabel}</b><br>${escapeHTML(c.cue||'為這張卡想一個自己的聯想畫面吧。')}</div><div class="answer-actions"><button class="secondary" id="againBtn">再複習一次</button><button class="primary" id="knownBtn">${learned?'下一張':'記住了 ✓'}</button></div>`;
      $('speakSentenceBtn')?.addEventListener('click', () => speak(c.example_sentence,d.lang));
      $('againBtn').addEventListener('click', () => { c.choiceResult=null; state.revealed=false; state.reviewed+=1; save(); renderAll(); showToast('已加入本次複習'); });
      $('knownBtn').addEventListener('click', () => {
        const key = cardKey(d,entry.index), firstLearning = !state.learned.includes(key);
        if (firstLearning) { state.learned.push(key); state.xp+=10; } else { state.reviewed+=1; }
        c.choiceResult = null;
        state.index = entries[(position+1)%entries.length].index; state.revealed=false; save(); renderAll();
        showToast(firstLearning ? '記憶已更新 +10 XP' : '已前往下一張');
      });
    } else {
      panel.classList.add('empty');
      const options = choiceOptions(c);
      panel.innerHTML = options.length ? `<span class="answer-label">CHOOSE THE MEANING</span><p style="margin-top:8px">選出你認為正確的意思；作答後才會顯示答案。</p><div class="choice-grid" role="group" aria-label="四選一意思選項">${options.map((option,index)=>`<button type="button" class="choice-option" data-choice-index="${index}">${escapeHTML(option)}</button>`).join('')}</div><div class="answer-actions"><button id="revealBtn" class="secondary" type="button">改用翻卡</button></div>` : '<div class="hint-bulb">✦</div><span class="answer-label">READY WHEN YOU ARE</span><p style="margin-top:8px">用熟悉的聲音聯想陌生單字，<br>不確定也沒關係，翻開看看。</p><div class="answer-actions"><button id="revealBtn" class="primary">翻開答案</button></div>';
      $('revealBtn').addEventListener('click', () => { c.choiceResult=null; state.revealed=true; save(); renderPractice(); });
      panel.querySelectorAll('[data-choice-index]').forEach(button => button.addEventListener('click', () => {
        const selected = options[Number(button.dataset.choiceIndex)];
        c.choiceResult = {correct:selected === String(c.meaning).trim()}; state.revealed=true; renderPractice();
      }));
    }
    const completed = matching.filter(e => state.learned.includes(cardKey(d,e.index))).length;
    $('sessionProgressText').textContent = practiceMode.unlearned
      ? `未記住 ${entries.length} 張 · 已記住 ${completed} / ${matching.length}`
      : `${hasCardFilters()?'篩選進度':'本組進度'} ${completed} / ${matching.length}`;
    $('progressFill').style.width = matching.length ? `${Math.round(completed/matching.length*100)}%` : '0%';
    $('practiceSubtitle').textContent = `${d.name} · ${practiceMode.unlearned?`只練未記住，剩 ${entries.length} 張`:(hasCardFilters()?`符合 ${entries.length} / ${d.cards.length} 張`:`${d.cards.length} 張${isCustom(d)?'自訂':'分級示範'}卡`)}。用諧音記單字，再用短句學會用法。`;
  }
  function renderStats() {
    $('learnedStat').textContent=`${state.learned.length} 張`; $('xpStat').textContent=`${state.xp} XP`; $('favoriteStat').textContent=`${state.favorites.length} 張`;
    $('headerProgress').textContent=`今日 ${state.xp} XP`; $('streakStat').textContent=state.xp>0?'探索中':'第 1 天';
  }
  function renderLevelAnalysis(d=getDeck()) {
    const grid=$('levelAnalysisGrid'); if (!grid) return;
    const rows=Tags.levelOptions(d).map(item=>({value:String(item.value),label:item.label,total:0,learned:0}));
    const byValue=new Map(rows.map(row=>[row.value,row]));
    d.cards.forEach((card,index)=>{
      const level=filterLevel(card,d);
      if (!byValue.has(level)) {
        const row={value:level,label:level==='unrated'?'未分級':Tags.levelLabel(level,d),total:0,learned:0};
        rows.push(row); byValue.set(level,row);
      }
      const row=byValue.get(level); row.total++;
      if (state.learned.includes(cardKey(d,index))) row.learned++;
    });
    const total=d.cards.length, learned=rows.reduce((sum,row)=>sum+row.learned,0), percent=total?Math.round(learned/total*100):0;
    $('analysisSummary').textContent=`${d.name} · 全部 ${total} 張（不受目前篩選影響）`;
    $('analysisTotal').textContent=total?`${percent}% 已記住`:'0 張';
    const next=rows.find(row=>row.total>0&&row.learned<row.total);
    $('analysisNextStep').textContent=next
      ? `建議下一步：先練「${next.label}」，還有 ${next.total-next.learned} 張待記住。`
      : total ? '這副牌組各級都已記住；可選一級重複複習，或切換其他語言。' : '選擇或新增詞卡後，就會顯示各程度的學習比較。';
    grid.innerHTML=rows.map(row=>{
      const ratio=row.total?Math.round(row.learned/row.total*100):0;
      const action=!row.total?'尚無卡片':row.learned===row.total?'再複習':'練這一級';
      return `<button type="button" class="level-analysis-row" data-analysis-level="${escapeHTML(row.value)}" ${row.total?'':'disabled'} aria-label="${escapeHTML(row.label)}：已記住 ${row.learned} 張，共 ${row.total} 張；${action}"><span class="level-analysis-main"><b>${escapeHTML(row.label)}</b><small>${row.learned} / ${row.total} 已記住 · ${row.total-row.learned} 待練</small></span><span class="level-analysis-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}" aria-label="${escapeHTML(row.label)} 已記住比例"><i style="width:${ratio}%"></i></span><span class="level-analysis-percent">${ratio}%</span><span class="level-analysis-action">${action}</span></button>`;
    }).join('');
  }
  function renderAll() { renderDecks(document.querySelector('.filter.active')?.dataset.filter||'all'); renderPractice(); renderLevelAnalysis(); renderStats(); }
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    document.querySelector('.filter.active')?.classList.remove('active'); btn.classList.add('active'); renderDecks(btn.dataset.filter);
  }));
  function clearCardFilters() { resetFilters(); state.revealed=false; getCard(); save(); renderAll(); }
  function togglePracticeMode() { practiceMode.unlearned=!practiceMode.unlearned; state.unlearnedOnly=practiceMode.unlearned; state.revealed=false; getCard(); save(); renderAll(); }
  $('resetFiltersBtn').addEventListener('click',clearCardFilters);
  $('practiceModeBtn').addEventListener('click',togglePracticeMode);
  for (const [id,key] of [['topicFilter','topic'],['difficultyFilter','difficulty']]) {
    $(id).addEventListener('change', () => { cardFilters[key]=$(id).value; state.revealed=false; getCard(); save(); renderAll(); });
  }
  $('levelAnalysisGrid').addEventListener('click',event=>{
    const button=event.target.closest('[data-analysis-level]'); if (!button || button.disabled) return;
    const d=getDeck(), level=button.dataset.analysisLevel;
    cardFilters.difficulty=level; practiceMode.unlearned=false; state.unlearnedOnly=false; state.revealed=false;
    const matching=matchingEntries(d).filter(entry=>filterLevel(entry.card,d)===level);
    const target=matching.find(entry=>!state.learned.includes(cardKey(d,entry.index)))||matching[0];
    if (target) state.index=target.index;
    save(); renderAll(); $('practice').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('voiceSelect').addEventListener('change',()=>{
    const key=languageKey(getDeck().lang), choice=$('voiceSelect').value;
    if (choice) voicePreferences[key]=choice; else delete voicePreferences[key];
    saveVoicePreferences();
  });
  $('varkModeSelect').addEventListener('change',()=>{
    const selected=$('varkModeSelect').value;
    varkMode=Object.hasOwn(VARK_MODES,selected)?selected:'normal';
    try { localStorage.setItem(VARK_STORE,varkMode); } catch {}
    renderPractice();
  });

  const dialog = $('deckDialog');
  let managerDeckId = null;
  Tags.TOPICS.forEach(t => $('cardTopicInput').add(new Option(t.label,t.value)));
  function fillManagerLevels(card=null) {
    const d=state.customDecks.find(x=>x.id===managerDeckId)||{lang:$('deckLangInput').value};
    const legacy=Tags.levelScheme(d)==='legacy', select=$('cardDifficultyInput');
    select.replaceChildren();
    if (!legacy) select.add(new Option('選擇程度',''));
    Tags.levelOptions(d).forEach(item=>select.add(new Option(item.label,item.value)));
    select.value=card?Tags.getLevel(card,d):(legacy?'1':'');
    select.required=!legacy;
    $('cardLevelInputLabel').textContent=`程度 · ${Tags.levelSchemeLabel(d)}`;
  }
  function openManager(deckId=null) {
    managerDeckId=deckId;
    const d=deckId?state.customDecks.find(x=>x.id===deckId):null;
    $('dialogTitle').textContent=d?'管理自訂牌組':'建立自訂牌組';
    $('dialogSubtitle').textContent=d?'編輯牌組資訊、修改卡片內容，或刪除不需要的卡片。':'先取個名字；儲存後即可新增自己的詞彙卡。';
    $('deckNameInput').value=d?.name||''; $('deckNativeInput').value=d?.native||''; $('deckFlagInput').value=d?.flag||'📚'; $('deckLangInput').value=d?.lang||'zh-TW';
    $('deleteDeckBtn').hidden=!d; $('cardManagerPanel').classList.toggle('locked',!d);
    $('cardForm').querySelectorAll('input,textarea,select,button').forEach(el=>{if(el.id!=='editingCardId')el.disabled=!d;});
    $('cardManagerHint').textContent=d?'點選卡片旁的編輯或刪除；新增後立即可在練習區使用。':'儲存牌組後，就能開始新增卡片。';
    resetCardForm(); renderCardList(); dialog.showModal(); setTimeout(()=>$('deckNameInput').focus(),30);
  }
  function resetCardForm() {
    for(const id of ['editingCardId','cardWordInput','cardRomanInput','cardHintInput','cardMeaningInput','cardCueInput','cardCueVisualInput','cardCueAuditoryInput','cardCueReadWriteInput','cardCueKinestheticInput','cardExampleInput','cardExampleTranslationInput'])$(id).value='';
    $('cardTopicInput').value='general'; fillManagerLevels(); $('cardFormTitle').textContent='新增一張卡'; $('saveCardBtn').textContent='新增卡片'; $('cancelCardEditBtn').hidden=true;
  }
  function renderCardList() {
    const d=state.customDecks.find(x=>x.id===managerDeckId), list=$('customCardList');
    $('cardCountLabel').textContent=`${d?.cards.length||0} 張`;
    if(!d){list.innerHTML='<div class="card-list-empty">儲存牌組後，這裡會顯示卡片清單。</div>';return;}
    if(!d.cards.length){list.innerHTML='<div class="card-list-empty">還沒有卡片。用下方表單新增第一個詞彙。</div>';return;}
    list.innerHTML=d.cards.map(c=>`<div class="custom-card-row"><div class="custom-card-main"><strong>${escapeHTML(c.word)} <span style="color:#9aa5c1;font-weight:500">— ${escapeHTML(c.meaning)}</span></strong><small>諧音：${escapeHTML(c.hint)}${c.roman?' · '+escapeHTML(c.roman):''}</small><small>${escapeHTML(Tags.topicLabel(c.topic))} · ${escapeHTML(Tags.levelLabel(Tags.getLevel(c,d),d))}</small>${c.example_sentence?`<small lang="${escapeHTML(d.lang||'zh-TW')}" dir="auto">${escapeHTML(c.example_sentence)}</small>`:''}</div><div class="custom-card-actions"><button type="button" data-edit-card="${escapeHTML(c.id)}">編輯</button><button type="button" data-delete-card="${escapeHTML(c.id)}">刪除</button></div></div>`).join('');
    list.querySelectorAll('[data-edit-card]').forEach(btn=>btn.addEventListener('click',()=>{
      const card=d.cards.find(x=>x.id===btn.dataset.editCard);if(!card)return;
      $('editingCardId').value=card.id; $('cardWordInput').value=card.word; $('cardRomanInput').value=card.roman||''; $('cardHintInput').value=card.hint; $('cardMeaningInput').value=card.meaning; $('cardCueInput').value=card.cue||'';
      $('cardCueVisualInput').value=card.cue_visual||''; $('cardCueAuditoryInput').value=card.cue_auditory||''; $('cardCueReadWriteInput').value=card.cue_read_write||''; $('cardCueKinestheticInput').value=card.cue_kinesthetic||'';
      $('cardExampleInput').value=card.example_sentence||''; $('cardExampleTranslationInput').value=card.example_translation||'';
      $('cardTopicInput').value=Tags.getTopic(card); fillManagerLevels(card);
      $('cardFormTitle').textContent='編輯這張卡'; $('saveCardBtn').textContent='儲存卡片'; $('cancelCardEditBtn').hidden=false; $('cardWordInput').focus();
    }));
    list.querySelectorAll('[data-delete-card]').forEach(btn=>btn.addEventListener('click',()=>{
      const card=d.cards.find(x=>x.id===btn.dataset.deleteCard);if(!card||!confirm(`確定刪除「${card.word}」這張卡？`))return;
      d.cards=d.cards.filter(x=>x.id!==card.id);const key=d.id+':'+card.id;state.learned=state.learned.filter(x=>x!==key);state.favorites=state.favorites.filter(x=>x!==key);
      if(state.index>=d.cards.length)state.index=0;state.revealed=false;save();renderCardList();renderAll();showToast('卡片已刪除');
    }));
  }
  $('createDeckBtn').addEventListener('click',()=>openManager());
  $('manageDeckBtn').addEventListener('click',()=>{const d=getDeck();if(isCustom(d))openManager(d.id);});
  $('closeDialogBtn').addEventListener('click',()=>dialog.close());
  $('saveDeckBtn').addEventListener('click',()=>{
    const name=$('deckNameInput').value.trim();if(!name){$('deckNameInput').focus();$('deckNameInput').reportValidity();return;}
    const native=$('deckNativeInput').value.trim()||'自訂詞彙';
    if(!managerDeckId){
      const d={id:'custom-'+newId(),name,native,flag:$('deckFlagInput').value.trim()||'📚',lang:$('deckLangInput').value.trim()||'zh-TW',region:'custom',cards:[]};
      state.customDecks.push(d);managerDeckId=d.id;state.selected=d.id;state.index=0;state.revealed=false;resetFilters();
      $('dialogTitle').textContent='管理自訂牌組';$('dialogSubtitle').textContent='牌組已建立，現在可以新增自己的詞彙卡。';$('deleteDeckBtn').hidden=false;
      $('cardForm').querySelectorAll('input,textarea,select,button').forEach(el=>{if(el.id!=='editingCardId')el.disabled=false;});
      $('cardManagerHint').textContent='新增卡片後，就能在練習區翻答案、播放發音並累積進度。';$('cardManagerPanel').classList.remove('locked');showToast('牌組已建立，接著新增卡片');
    }else{
      const d=state.customDecks.find(x=>x.id===managerDeckId);if(!d)return;d.name=name;d.native=native;d.flag=$('deckFlagInput').value.trim()||'📚';d.lang=$('deckLangInput').value.trim()||'zh-TW';showToast('牌組資訊已更新');
    }
    save();fillManagerLevels();renderCardList();renderAll();
  });
  $('deleteDeckBtn').addEventListener('click',()=>{
    const d=state.customDecks.find(x=>x.id===managerDeckId);if(!d||!confirm(`確定刪除「${d.name}」牌組及其中所有卡片？`))return;
    const prefix=d.id+':';state.customDecks=state.customDecks.filter(x=>x.id!==d.id);state.learned=state.learned.filter(x=>!x.startsWith(prefix));state.favorites=state.favorites.filter(x=>!x.startsWith(prefix));
    if(state.selected===d.id){state.selected='en';state.index=0;resetFilters();}state.revealed=false;save();dialog.close();renderAll();showToast('牌組已刪除');
  });
  $('cardForm').addEventListener('submit',event=>{
    event.preventDefault();const d=state.customDecks.find(x=>x.id===managerDeckId);if(!d){showToast('請先儲存牌組資訊');return;}
    const word=$('cardWordInput').value.trim(),hint=$('cardHintInput').value.trim(),meaning=$('cardMeaningInput').value.trim();if(!word||!hint||!meaning)return;
    const sentence=$('cardExampleInput').value.trim(),translation=$('cardExampleTranslationInput').value.trim();
    if(!sentence||!translation){showToast('請填寫原文例句與繁中翻譯');return;}
    const existing=d.cards.find(c=>c.id===$('editingCardId').value),legacy=Tags.levelScheme(d)==='legacy';
    const level=Tags.normalizeLevel($('cardDifficultyInput').value,d);
    if(!legacy&&!level){$('cardDifficultyInput').reportValidity();return;}
    const card={id:$('editingCardId').value||newId(),word,roman:$('cardRomanInput').value.trim(),hint,meaning,cue:$('cardCueInput').value.trim(),cue_visual:$('cardCueVisualInput').value.trim(),cue_auditory:$('cardCueAuditoryInput').value.trim(),cue_read_write:$('cardCueReadWriteInput').value.trim(),cue_kinesthetic:$('cardCueKinestheticInput').value.trim(),topic:Tags.normalizeTopic($('cardTopicInput').value)||'general',difficulty:legacy?(Number(level)||1):Tags.getDifficulty(existing),proficiency_level:legacy?null:level,example_sentence:sentence,example_translation:translation,...(existing && Array.isArray(existing.distractors) ? {distractors:existing.distractors} : {})};
    const i=d.cards.findIndex(x=>x.id===card.id);if(i>=0){d.cards[i]=card;showToast('卡片已更新');}else{d.cards.push(card);showToast('卡片已新增');}
    state.selected=d.id;state.index=Math.max(0,d.cards.findIndex(x=>x.id===card.id));state.revealed=false;resetFilters();save();resetCardForm();renderCardList();renderAll();
  });
  $('cancelCardEditBtn').addEventListener('click',resetCardForm);
  $('favoriteBtn').addEventListener('click',()=>{
    const d=getDeck(),entry=currentEntry(d);if(!entry)return;const id=cardKey(d,entry.index),i=state.favorites.indexOf(id);
    if(i>=0){state.favorites.splice(i,1);showToast('已取消收藏');}else{state.favorites.push(id);showToast('已加入收藏');}save();renderAll();
  });
  function speak(value,language) {
    if(!speechApi || typeof SpeechSynthesisUtterance==='undefined'){showToast('此瀏覽器暫不支援語音播放');return;}
    if(!value)return;
    try { deviceVoices=speechApi.getVoices()||deviceVoices; } catch {}
    const prefix=languageKey(language), available=deviceVoices.filter(v=>v&&languageKey(v.lang)===prefix), preferred=voicePreferences[prefix];
    let voice=preferred?available.find(v=>voiceKey(v)===preferred):null;
    if (preferred&&!voice) { delete voicePreferences[prefix]; saveVoicePreferences(); refreshVoiceOptions(getDeck()); }
    if (!voice) voice=available.find(v=>v.default)||available[0]||null;
    speechApi.cancel();const u=new SpeechSynthesisUtterance(value);u.lang=voice?.lang||language||'zh-TW';u.rate=.84;if(voice)u.voice=voice;speechApi.speak(u);
  }
  $('speakBtn').addEventListener('click',()=>{const d=getDeck(),c=getCard();if(c)speak(c.word,d.lang);});
  let toastTimer;
  function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1900);}
  window.PhoneticApp={applyCatalog(nextDecks){
    const previous=getDeck(),card=getCard(),key=card?cardKey(previous,state.index%previous.cards.length):null;
    decks.splice(0,decks.length,...nextDecks);
    if(!allDecks().some(d=>d.id===state.selected)){state.selected=allDecks()[0]?.id||'en';state.index=0;state.revealed=false;}
    else if(!isCustom(previous)){const d=getDeck(),index=d.cards.findIndex((c,i)=>cardKey(d,i)===key);state.index=index>=0?index:0;if(index<0)state.revealed=false;}
    const available=new Set([...Tags.levelOptions(getDeck()).map(item=>item.value),'all']);
    if(getDeck().cards.some(card=>!Tags.getLevel(card,getDeck())))available.add('unrated');
    if(!available.has(cardFilters.difficulty))cardFilters.difficulty='all';
    renderAll();
  }};
  if (speechApi && typeof speechApi.addEventListener==='function') speechApi.addEventListener('voiceschanged',()=>refreshVoiceOptions(getDeck()));
  renderAll();
})();
