'use strict';

// ══════════════════════════════════════════════════
//  VOCABULARY SCREEN
// ══════════════════════════════════════════════════

let vocabFilters = {status:'all', cefr:'all', cat:'all'};

function setVocabTab(type, val, el) {
  vocabFilters[type] = val;
  const rid = type === 'status' ? 0 : type === 'cefr' ? 1 : 2;
  document.querySelectorAll('.vtab-row')[rid].querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderVocab();
}

function renderVocab() {
  const q = (document.getElementById('vocab-search')?.value || '').toLowerCase();
  let words = [...db.words];
  if (q) words = words.filter(w => w.word.toLowerCase().includes(q) || (w.translation || '').toLowerCase().includes(q));

  if      (vocabFilters.status === 'new')      words = words.filter(w => (w.apps || 0) === 0);
  else if (vocabFilters.status === 'hard')     words = words.filter(w => ms(w) <= 3);
  else if (vocabFilters.status === 'review')   words = words.filter(w => isDue(w) && (w.apps || 0) > 0);
  else if (vocabFilters.status === 'mastered') words = words.filter(w => ms(w) >= 9);

  if (vocabFilters.cefr !== 'all') words = words.filter(w => w.cefr === vocabFilters.cefr);
  if (vocabFilters.cat  !== 'all') words = words.filter(w => w.category === vocabFilters.cat);

  words.sort((a, b) => {
    const ad = isDue(a), bd = isDue(b);
    if (ad && !bd) return -1;
    if (!ad && bd)  return 1;
    return ms(a) - ms(b);
  });

  document.getElementById('vocab-count').textContent = `${db.words.length} palabras`;
  const list = document.getElementById('vocab-list');

  if (!words.length) {
    list.innerHTML = db.words.length === 0
      ? `<div class="empty">Toca <strong style="color:var(--amber)">+</strong> o ve a <strong style="color:var(--amber)">Explorar</strong> para agregar tu primera palabra.</div>`
      : `<div class="empty">Sin palabras para este filtro.</div>`;
    return;
  }

  list.innerHTML = words.map(w => {
    const score = ms(w);
    const dot   = score >= 9 ? 'var(--teal)' : score >= 6 ? 'var(--amber)' : score >= 3 ? '#F0997B' : 'var(--blue)';
    const col   = score >= 8 ? 'var(--teal-l)' : score >= 5 ? 'var(--amber-l)' : '#F0997B';
    const avgT  = w.avgResponseTime;
    const si    = avgT ? avgT <= 4 ? '⚡' : avgT <= 9 ? '' : ' 🐢' : '';
    return `<div class="word-row" onclick="showDetail('${w.id}')">
      <div class="word-dot" style="background:${dot};"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:500;">${esc(w.word)}${si ? `<span style="font-size:11px;"> ${si}</span>` : ''}</div>
        <div class="tiny">${[w.partOfSpeech, w.cefr, w.category && w.category !== 'General' ? w.category : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <span style="font-size:13px;font-weight:600;color:${col};margin-left:8px;">${score}/10</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════
//  WORD DETAIL MODAL
// ══════════════════════════════════════════════════

function showDetail(id) {
  const w = db.words.find(x => x.id === id);
  if (!w) return;

  const score  = ms(w);
  const col    = score >= 8 ? 'var(--teal-l)' : score >= 5 ? 'var(--amber-l)' : '#F0997B';
  const nextR  = w.nextReview ? new Date(w.nextReview).toLocaleDateString('es-CO', {day:'numeric', month:'short'}) : 'pendiente';
  const avgT   = w.avgResponseTime;
  const speedL = avgT
    ? avgT <= 4 ? `⚡ Rápido (${avgT}s)` : avgT <= 9 ? `⏱ Normal (${avgT}s)` : `🐢 Necesita repaso (${avgT}s)`
    : 'Sin historial de tiempo';

  document.getElementById('detail-body').innerHTML = `
    <div class="handle"></div>
    <div id="word-img-wrap" style="display:none;margin-bottom:10px;">
      <img id="word-img" class="word-img" src="" alt="${esc(w.word)}" onerror="this.parentElement.style.display='none'">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
      <div>
        <div style="font-size:32px;font-weight:700;">${esc(w.word)}</div>
        <div style="color:var(--amber);font-size:12px;font-weight:500;">${esc(w.partOfSpeech || '')}</div>
      </div>
      <div style="text-align:right;">
        ${w.cefr ? `<span class="cefr cefr-${w.cefr.toLowerCase()}" style="padding:4px 10px;font-size:12px;">${w.cefr}</span>` : ''}
        ${w.category && w.category !== 'General' ? `<div class="tiny" style="margin-top:3px;">${w.category}</div>` : ''}
      </div>
    </div>
    ${w.ipa ? `<div class="ipa-row" style="margin-bottom:12px;">
      <span style="flex:1;color:var(--text2);font-size:13px;">${esc(w.ipa)}</span>
      <button class="play-btn" onclick="speak('${esc(w.word)}','en',this)">▶</button></div>` : ''}
    <div style="margin-bottom:10px;"><div class="tiny">Traducción</div>
      <div style="color:var(--amber-l);font-weight:500;font-size:14px;margin-top:2px;">${esc(w.translation || '—')}</div></div>
    <div style="margin-bottom:10px;"><div class="tiny">Significado</div>
      <div style="color:var(--text2);font-size:13px;line-height:1.6;">${esc(w.definition || '—')}</div></div>
    <div style="margin-bottom:12px;"><div class="tiny" style="margin-bottom:4px;">Ejemplo</div>
      <div class="example-row">
        <span class="example-text">"${esc(w.example || '—')}"</span>
        <button class="audio-btn" onclick="speak('${esc(w.example || w.word).replace(/'/g,"\\'")}','en',this)" title="Escuchar ejemplo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
        </button>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
      <div class="tiny">Dominio</div>
      <span style="font-size:13px;font-weight:600;color:${col}">${score}/10</span>
    </div>
    <div class="mastery-bar"><div class="mastery-fill" style="width:${score * 10}%;background:${col};"></div></div>
    <div class="tiny" style="margin-top:4px;">${w.apps || 0} apariciones · próxima: ${nextR}</div>
    <div class="tiny" style="margin-top:3px;">${speedL}</div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="closeDetail()">Cerrar</button>
      <button class="btn" style="flex:1;background:#2d1515;border:0.5px solid #993C1D;color:#F0997B;" onclick="deleteWord('${w.id}')">Eliminar</button>
    </div>`;

  document.getElementById('detail-overlay').classList.add('open');
  loadImageInto(w.word, 'word-img-wrap', 'word-img');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
}

function deleteWord(id) {
  if (!confirm('¿Eliminar esta palabra?')) return;
  db.words = db.words.filter(w => w.id !== id);
  persist();
  closeDetail(); renderVocab(); refreshHome();
}
