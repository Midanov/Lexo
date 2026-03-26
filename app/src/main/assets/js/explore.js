'use strict';

// ══════════════════════════════════════════════════
//  EXPLORE SCREEN
// ══════════════════════════════════════════════════

let explorePage  = 0;
let exploreLevel = 'all';
let exploreCat   = 'all';

function setExploreLevel(lvl, el) {
  exploreLevel = lvl; explorePage = 0;
  document.querySelectorAll('#explore-tabs .vtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderExplore();
}

function setExploreCat(cat, el) {
  exploreCat = cat; explorePage = 0;
  document.querySelectorAll('#explore-cat-tabs .vtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderExplore();
}

async function renderExplore() {
  if (!LIB_READY) {
    document.getElementById('explore-list').innerHTML =
      '<div class="empty" style="padding-top:40px;"><div class="spinner" style="margin:0 auto 12px;"></div>Cargando biblioteca de palabras…</div>';
    // LIB not ready yet — onLibraryReady() will call us again once it is
    return;
  }
  // Safety check: if LIB loaded but is empty, show a clear message
  if (!LIB.length) {
    document.getElementById('explore-list').innerHTML =
      '<div class="empty">No se pudo cargar el diccionario.</div>';
    return;
  }

  const q        = (document.getElementById('explore-search')?.value || '').toLowerCase().trim();
  const addedSet = new Set(db.words.map(w => w.word.toLowerCase()));

  let words = LIB;
  if (exploreLevel !== 'all') words = words.filter(e => CEFR_CODES[+e.l] === exploreLevel);
  if (exploreCat   !== 'all') words = words.filter(e => CAT_NAMES[+e.c]  === exploreCat);
  if (q)                      words = words.filter(e => e.w.includes(q)  || e.t.toLowerCase().includes(q));

  const total = words.length;
  const added = words.filter(e => addedSet.has(e.w)).length;
  const page  = words.slice(0, (explorePage + 1) * PAGE_SIZE);

  const statsHtml = `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px 8px;">
    <span class="tiny">${total} palabras · ${added} en tu mazo</span>
    <span class="tiny" style="color:var(--amber-l);">${Math.round(added / Math.max(total, 1) * 100)}% agregadas</span>
  </div>`;

  const listHtml = page.map(entry => {
    const isAdded  = addedSet.has(entry.w);
    const cefrCode = CEFR_CODES[+entry.l] || 'C2';
    const catLabel = CAT_LABELS[+entry.c] || '';
    return `<div class="sug-word-card ${isAdded ? 'added' : ''}">
      <div style="text-align:center;flex-shrink:0;">
        <span class="cefr cefr-${cefrCode.toLowerCase()}">${cefrCode}</span>
        <div class="tiny" style="margin-top:3px;max-width:56px;line-height:1.2;">${catLabel}</div>
      </div>
      <div class="sug-word-info">
        <div class="sug-word-name">${esc(entry.w)}</div>
        <div class="sug-word-tr">${esc(entry.t)}</div>
        <div class="sug-word-meta">${entry.p==='v'?'verbo':entry.p==='n'?'sustantivo':entry.p==='a'?'adjetivo':entry.p==='d'?'adverbio':'palabra'}</div>
      </div>
      <button class="sug-add-btn ${isAdded ? 'done' : 'add'}"
        onclick="handleAddWord(this, '${esc(entry.w)}')"
        ${isAdded ? 'disabled' : ''}>${isAdded ? '✓' : '+'}</button>
    </div>`;
  }).join('');

  const moreHtml = page.length < total
    ? `<button class="btn btn-secondary" style="margin-top:4px;margin-bottom:16px;"
        onclick="explorePage++;renderExplore()">
        Cargar más (${total - page.length} restantes)
      </button>`
    : `<div class="tiny" style="text-align:center;padding:12px 0 20px;">— ${total} palabras mostradas —</div>`;

  const list = document.getElementById('explore-list');
  list.innerHTML = statsHtml + (listHtml || '<div class="empty">Sin resultados para este filtro.</div>') + moreHtml;
}

function handleAddWord(btn, word) {
  addSuggestedWord(word);
  const card = btn.closest('.sug-word-card');

  btn.textContent = '✓';
  btn.classList.remove('add');
  btn.classList.add('done');
  card.classList.add('added');

  card.style.transform = 'scale(1.03)';
  setTimeout(() => { card.style.transform = 'scale(1)'; }, 120);
  setTimeout(() => {
    card.style.transition = 'all .25s ease';
    card.style.opacity    = '0';
    card.style.transform  = 'translateY(-10px)';
  }, 200);
  setTimeout(() => { card.remove(); }, 450);
}

function addSuggestedWord(wordStr) {
  const entry = LIB.find(e => e.w === wordStr);
  if (!entry || db.words.some(w => w.word === wordStr)) return;

  db.words.push({
    id:           Date.now().toString() + Math.random().toString(36).slice(2),
    word:         entry.w,
    translation:  entry.t,
    definition:   entry.d,
    ipa:          '',
    example:      entry.e,
    partOfSpeech: entry.p==='v'?'verb':entry.p==='n'?'noun':entry.p==='a'?'adjective':entry.p==='d'?'adverb':'word',
    cefr:         CEFR_CODES[+entry.l] || 'C2',
    freq:         estimateFreq(entry.w),
    category:     CAT_NAMES[+entry.c] || 'General',
    masteryScore: 1, apps: 0, interval: 1, easeFactor: 2.5,
    nextReview:   new Date().toISOString()
  });

  persist(); renderExplore(); refreshHome();

  const fab = document.getElementById('fab');
  fab.textContent = '✓'; fab.style.background = 'var(--teal)';
  setTimeout(() => { fab.textContent = '+'; fab.style.background = 'var(--amber)'; }, 1400);
  showToast(`"${entry.w}" agregada ✓`);
}