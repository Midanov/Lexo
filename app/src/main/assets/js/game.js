'use strict';

// ══════════════════════════════════════════════════
//  GAME SCREEN
// ══════════════════════════════════════════════════

const DIFF_CONFIG = {
  easy:   {time:15, qType:'translation', label:'Fácil'},
  medium: {time:10, qType:'meaning',     label:'Medio'},
  hard:   {time:6,  qType:'definition',  label:'Difícil'}
};

let gameDiff      = 'easy';
let gameWordCount = 10;
let gameQueue     = [], gameIdx = 0, gameScore = 0, gameResults = [];
let timerInterval = null, timerStart = 0;
let gameAnswered  = false;

// ── Setup ────────────────────────────────────────
function initGameSetup() {
  stopTimer(); showGameView('setup');
  const el  = db.words.filter(w => (w.apps || 0) > 0 && (w.translation || w.definition));
  document.getElementById('game-eligible-count').textContent =
    el.length >= 4 ? `${el.length} palabras disponibles` : 'Necesitas al menos 4 palabras estudiadas';
  const btn = document.getElementById('game-start-btn');
  btn.disabled    = el.length < 4;
  btn.textContent = el.length >= 4 ? 'Comenzar juego →' : 'Estudia más palabras primero';
}

function setDiff(d, el) {
  gameDiff = d;
  document.querySelectorAll('#diff-selector .diff-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
}

function setMode(n, el) {
  gameWordCount = n;
  document.getElementById('mode-10').classList.remove('sel');
  document.getElementById('mode-20').classList.remove('sel');
  el.classList.add('sel');
}

function showGameView(v) {
  document.getElementById('game-setup').style.display   = v === 'setup'   ? 'flex' : 'none';
  document.getElementById('game-play').style.display    = v === 'play'    ? 'flex' : 'none';
  document.getElementById('game-results').style.display = v === 'results' ? 'flex' : 'none';
}

// ── Gameplay ─────────────────────────────────────
function startGame() {
  let pool = db.words.filter(w => (w.apps || 0) > 0 && (w.translation || w.definition));
  if (gameDiff === 'hard') pool.sort((a, b) => ms(a) - ms(b));
  else pool = shuffle(pool);
  gameQueue   = pool.slice(0, gameWordCount);
  gameIdx     = 0; gameScore = 0; gameResults = [];
  showGameView('play'); renderGameQuestion();
}

function renderGameQuestion() {
  if (gameIdx >= gameQueue.length) { finishGame(); return; }
  gameAnswered = false;
  const cfg = DIFF_CONFIG[gameDiff];
  const w   = gameQueue[gameIdx];

  document.getElementById('gp-counter').textContent = `${gameIdx + 1} / ${gameQueue.length}`;
  document.getElementById('gp-score').textContent   = `${gameScore} pts`;

  const pool   = db.words.filter(x => x.id !== w.id && (x.translation || x.definition));
  const wrongs = shuffle([...pool]).slice(0, 3);
  const choices = shuffle([w, ...wrongs]);

  let questionLabel = '', optionFn;
  if (cfg.qType === 'translation') {
    questionLabel = '¿Cuál es la traducción?';
    optionFn = c => `<strong>${esc(c.translation || c.word)}</strong>`;
  } else if (cfg.qType === 'meaning') {
    questionLabel = '¿Qué significa esta palabra?';
    optionFn = c => {
      const tr  = c.translation ? `<span style="color:var(--amber-l);font-weight:600;">${esc(c.translation)}</span><br>` : '';
      const def = c.definition  ? `<span style="font-size:11px;color:var(--text2);">${esc(c.definition.substring(0, 55))}${c.definition.length > 55 ? '…' : ''}</span>` : '';
      return tr + def;
    };
  } else {
    questionLabel = '¿A qué palabra corresponde esta definición?';
    optionFn = c => `<strong>${esc(c.word)}</strong>`;
  }

  timerStart = Date.now();
  startTimer(cfg.time, () => { autoFail(w.id); });

  let html = `<div class="card" style="text-align:center;padding:18px 14px;margin-bottom:8px;">`;
  if (cfg.qType === 'definition') {
    html += `<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:8px;">${esc(w.definition || '—')}</div>`;
    if (w.example) html += `<div style="font-size:11px;font-style:italic;color:var(--text3);">"${esc(w.example.substring(0, 80))}"</div>`;
  } else {
    html += `<div class="game-word-big">${esc(w.word)}</div>`;
    if (w.cefr) html += `<span class="cefr cefr-${w.cefr.toLowerCase()}" style="margin-top:8px;display:inline-block;">${w.cefr}</span>`;
    if (cfg.qType === 'medium' && w.ipa) html += `<div style="color:var(--text3);font-size:12px;margin-top:4px;">${esc(w.ipa)}</div>`;
  }
  html += `<div class="muted" style="margin-top:8px;font-size:12px;">${questionLabel}</div></div>`;
  html += `<div class="choices" id="game-choices">
    ${choices.map(c => `<div class="choice" onclick="gameChoice(this,'${c.id}','${w.id}')">${optionFn(c)}</div>`).join('')}
  </div>`;

  if (gameDiff === 'easy' && w.avgResponseTime) {
    const prev = w.avgResponseTime;
    const hc   = prev <= 4 ? 'var(--teal-l)' : prev <= 9 ? 'var(--amber-l)' : '#F0997B';
    html += `<div class="card-sm" style="margin-bottom:8px;"><div class="tiny">Tiempo anterior: <span style="color:${hc};font-weight:600;">${prev}s</span></div></div>`;
  }

  document.getElementById('game-play-content').innerHTML  = html;
  document.getElementById('game-play-content').scrollTop  = 0;
}

function gameChoice(el, chosenId, correctId) {
  if (gameAnswered) return;
  gameAnswered = true; stopTimer();
  const elapsed = Math.round((Date.now() - timerStart) / 100) / 10;
  const correct = chosenId === correctId;

  document.querySelectorAll('#game-choices .choice').forEach(c => {
    const m = c.getAttribute('onclick').match(/'([^']+)','[^']+'/);
    if (m && m[1] === correctId) c.classList.add('correct');
  });
  if (!correct) el.classList.add('wrong');

  const w   = db.words.find(x => x.id === correctId);
  const cfg = DIFF_CONFIG[gameDiff];
  const pts = correct ? Math.max(5, Math.round(10 + (cfg.time - elapsed) * 2)) : 0;
  if (correct) gameScore += pts;

  if (w) {
    w.masteryScore    = correct ? Math.min(10, (w.masteryScore || 1) + 0.3) : Math.max(1, (w.masteryScore || 1) - 0.3);
    const prev        = w.avgResponseTime || elapsed;
    w.avgResponseTime = Math.round((prev * 0.6 + elapsed * 0.4) * 10) / 10;
    persist();
  }
  gameResults.push({word: gameQueue[gameIdx].word, correct, elapsed, pts});
  gameIdx++;
  setTimeout(renderGameQuestion, correct ? 850 : 1300);
}

function autoFail(correctId) {
  if (gameAnswered) return;
  gameAnswered = true;
  document.querySelectorAll('#game-choices .choice').forEach(c => {
    const m = c.getAttribute('onclick').match(/'([^']+)','[^']+'/);
    if (m && m[1] === correctId) c.classList.add('correct');
  });
  const w = db.words.find(x => x.id === correctId);
  if (w) { w.masteryScore = Math.max(1, (w.masteryScore || 1) - 0.4); persist(); }
  gameResults.push({word: gameQueue[gameIdx].word, correct: false, elapsed: DIFF_CONFIG[gameDiff].time, pts: 0});
  gameIdx++;
  setTimeout(renderGameQuestion, 1300);
}

function finishGame() {
  stopTimer();
  db.totalGames = (db.totalGames || 0) + 1; persist();
  const cc   = gameResults.filter(r => r.correct).length;
  const avgT = Math.round(gameResults.reduce((a, r) => a + r.elapsed, 0) / gameResults.length * 10) / 10;

  document.getElementById('res-correct').textContent = `${cc}/${gameResults.length}`;
  document.getElementById('res-score').textContent   = gameScore;
  document.getElementById('res-avgtime').textContent = `${avgT}s`;

  const pct   = Math.round(cc / gameResults.length * 100);
  const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🎯' : pct >= 50 ? '👍' : '💪';
  document.getElementById('results-sub').textContent = `${emoji} ${pct}% precisión · ${DIFF_CONFIG[gameDiff].label}`;

  document.getElementById('results-detail').innerHTML = gameResults.map(r => {
    const sc = r.elapsed <= 4 ? 'var(--teal-l)' : r.elapsed <= 9 ? 'var(--amber-l)' : '#F0997B';
    const sn = r.elapsed <= 4 ? 'Rápido' : r.elapsed <= 9 ? 'Normal' : 'Lento';
    return `<div class="result-row">
      <span style="font-weight:500;">${esc(r.word)}</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:${sc};">${r.elapsed}s·${sn}</span>
        <span style="${r.correct ? 'color:var(--teal-l)' : 'color:#F0997B'}">${r.correct ? `+${r.pts}` : '✕'}</span>
      </div>
    </div>`;
  }).join('');

  showGameView('results');
}

// ── Timer ─────────────────────────────────────────
function startTimer(seconds, onExpire) {
  stopTimer();
  const ring  = document.getElementById('timer-ring');
  const txt   = document.getElementById('timer-txt');
  const circ  = 2 * Math.PI * 16;
  ring.setAttribute('stroke-dasharray', circ);
  ring.setAttribute('stroke', 'var(--amber)');
  let remaining = seconds;
  const update = () => {
    const frac = remaining / seconds;
    ring.setAttribute('stroke-dashoffset', circ * (1 - frac));
    ring.setAttribute('stroke', frac > 0.5 ? 'var(--amber)' : frac > 0.25 ? '#EF9F27' : 'var(--red)');
    txt.textContent = Math.ceil(remaining);
    txt.setAttribute('fill', frac > 0.5 ? 'var(--amber-l)' : frac > 0.25 ? '#EF9F27' : '#F0997B');
    if (remaining <= 0) { stopTimer(); onExpire(); return; }
    remaining = Math.round((remaining - 0.1) * 10) / 10;
  };
  update();
  timerInterval = setInterval(update, 100);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const ring = document.getElementById('timer-ring');
  if (ring) ring.setAttribute('stroke', 'var(--border)');
  const txt = document.getElementById('timer-txt');
  if (txt) txt.textContent = '—';
}
