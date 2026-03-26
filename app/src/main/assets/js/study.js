'use strict';

// ══════════════════════════════════════════════════
//  STUDY SCREEN
// ══════════════════════════════════════════════════

let sessionQueue = [], sessionIdx = 0, sessionStats = {good:0, bad:0};

function initStudyScreen() {
  if (sessionQueue.length === 0) {
    const hasDue = db.words.some(w => isDue(w)) || db.words.some(w => w.apps === 0);
    showStudyView(hasDue ? 'session' : 'empty');
    if (!hasDue) {
      document.getElementById('empty-msg').textContent = db.words.length === 0
        ? 'Agrega tu primera palabra con el botón +'
        : 'No hay palabras pendientes. ¡Vuelve mañana!';
      return;
    }
    buildQueue(); renderFlashcard();
  }
}

function startStudy() {
  buildQueue();
  if (sessionQueue.length === 0) { showScreen('study'); return; }
  showScreen('study'); showStudyView('session'); renderFlashcard();
}

function buildQueue() {
  const news    = db.words.filter(w => w.apps === 0).slice(0, 8);
  const reviews = db.words.filter(w => w.apps > 0 && isDue(w)).slice(0, 18);
  sessionQueue  = shuffle([...news, ...reviews]);
  sessionIdx    = 0;
  sessionStats  = {good:0, bad:0};
}

function showStudyView(v) {
  document.getElementById('study-session').style.display  = v === 'session'  ? 'flex' : 'none';
  document.getElementById('study-complete').style.display = v === 'complete' ? 'flex' : 'none';
  document.getElementById('study-empty').style.display    = v === 'empty'    ? 'flex' : 'none';
}

function renderFlashcard() {
  if (sessionIdx >= sessionQueue.length) { finishSession(); return; }

  const total = sessionQueue.length;
  const w     = sessionQueue[sessionIdx];
  const segs  = Math.min(total, 15);
  const pr    = sessionIdx / total;

  document.getElementById('study-prog').innerHTML =
    Array.from({length: segs}, (_, i) => {
      const p   = i / segs;
      const cls = p < pr ? 'done' : (Math.abs(p - pr) < 1 / segs ? 'current' : '');
      return `<div class="prog-seg ${cls}"></div>`;
    }).join('');

  document.getElementById('study-counter').textContent = `${sessionIdx + 1} / ${total}`;

  const hl  = hintLevel(w);
  const hlL = ['Completa','Sin traducción','Solo ejemplo'];
  document.getElementById('study-hint-lbl').textContent = hl > 0 ? hlL[hl] : '';

  const score = ms(w);
  const msCol = score >= 8 ? 'var(--teal-l)' : score >= 5 ? 'var(--amber-l)' : '#F0997B';

  let html = `<div class="card" style="margin-bottom:10px;">
    <div id="flash-img-wrap" style="display:none;margin-bottom:10px;">
      <div class="img-skeleton"></div>
      <img id="flash-img" class="word-img" src="" alt="${esc(w.word)}">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div><div class="flash-word">${esc(w.word)}</div>
      <div class="flash-pos">${esc(w.partOfSpeech || '')}</div></div>
      <div style="text-align:right;">
        ${w.cefr ? `<span class="cefr cefr-${w.cefr.toLowerCase()}">${w.cefr}</span>` : ''}
        ${w.freq ? `<div class="tiny" style="margin-top:2px;">#${w.freq}</div>` : ''}
      </div>
    </div>`;

  if (w.ipa) html += `<div class="ipa-row">
    <span class="muted" style="flex:1;font-size:13px;">${esc(w.ipa)}</span>
    <button class="play-btn" onclick="speak('${esc(w.word)}','en',this)">▶</button></div>`;

  html += '<div class="divider"></div>';
  if (hl > 0) html += `<span class="hint-badge">${hlL[hl]}</span><br>`;

  if (hl === 0) {
    html += `<div style="margin-bottom:8px;"><div class="tiny">Traducción</div>
      <div style="font-size:14px;color:var(--amber-l);font-weight:500;margin-top:2px;">${esc(w.translation || '—')}</div></div>`;
  } else {
    html += `<div style="margin-bottom:8px;"><div class="tiny">Traducción</div>
      <div style="margin-top:4px;"><span class="hidden-pill">oculta</span></div></div>`;
  }

  if (hl < 2) {
    html += `<div style="margin-bottom:8px;"><div class="tiny">Significado</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:2px;">${esc(w.definition || '—')}</div></div>`;
  }

  html += `<div><div class="tiny" style="margin-bottom:4px;">Ejemplo</div>
    <div class="example-row">
      <span class="example-text">"${esc(w.example || '—')}"</span>
      <button class="audio-btn" onclick="speak('${esc(w.example || w.word).replace(/'/g,"\\'")}','en',this)" title="Escuchar ejemplo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
      </button>
    </div></div></div>`;

  const avgT  = w.avgResponseTime;
  const speedL = avgT ? avgT <= 4 ? '⚡ Rápido' : avgT <= 9 ? '⏱ Normal' : '🐢 Necesita repaso' : '';
  html += `<div class="card-sm">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="tiny">${speedL}</span>
      <span style="font-size:13px;font-weight:600;color:${msCol}">${score}/10</span>
    </div>
    <div class="mastery-bar"><div class="mastery-fill" style="width:${score * 10}%;background:${msCol};"></div></div>
    <div class="tiny" style="margin-top:4px;">Vista ${w.apps || 0} ${(w.apps || 0) === 1 ? 'vez' : 'veces'}</div>
  </div>`;

  document.getElementById('flash-content').innerHTML = html;
  const fc = document.getElementById('flash-content');
  fc.classList.remove('flashcard-enter');
  void fc.offsetWidth;
  fc.classList.add('flashcard-enter');
  document.getElementById('flash-content').scrollTop = 0;

  // Load current card image (shows skeleton immediately, swaps when ready)
  loadImageInto(w.word, 'flash-img-wrap', 'flash-img');

  // Prefetch the next card's image while the user reads this one
  const nextCard = sessionQueue[sessionIdx + 1];
  if (nextCard) prefetchImage(nextCard.word);
}

function hintLevel(w) {
  if ((w.apps || 0) === 0)              return 0;
  if ((w.apps || 0) >= 6 && ms(w) >= 7) return 2;
  if ((w.apps || 0) >= 3 && ms(w) >= 5) return 1;
  return 0;
}

function rate(r) {
  if (sessionIdx >= sessionQueue.length) return;
  const w = db.words.find(x => x.id === sessionQueue[sessionIdx].id);
  if (w) applyRating(w, r, null);
  if (r <= 2) {
    sessionStats.bad++;
    const ri = Math.min(sessionIdx + (r === 1 ? 2 : 3), sessionQueue.length);
    sessionQueue.splice(ri, 0, {...sessionQueue[sessionIdx]});
  } else {
    sessionStats.good++;
  }
  sessionIdx++;
  // Prefetch the image for the card after next while the user is reading this one
  const nextNext = sessionQueue[sessionIdx + 1];
  if (nextNext) prefetchImage(nextNext.word);
  renderFlashcard();
}

function finishSession() {
  const today = dayStr(new Date());
  if (db.lastStudyDate !== today) {
    const diff  = db.lastStudyDate ? daysDiff(db.lastStudyDate, today) : 999;
    db.streak   = diff === 1 ? (db.streak || 0) + 1 : 1;
    db.lastStudyDate = today;
    db.totalSessions = (db.totalSessions || 0) + 1;
    persist();
  }
  sessionQueue = [];
  document.getElementById('complete-msg').innerHTML =
    `${sessionStats.good} correctas · ${sessionStats.bad} repasadas<br>
    Racha: <span style="color:var(--amber-l);font-weight:600;">${db.streak} días</span>`;
  showStudyView('complete');
}