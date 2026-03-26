'use strict';

// ══════════════════════════════════════════════════
//  HOME SCREEN
// ══════════════════════════════════════════════════

function refreshHome() {
  const today = dayStr(new Date());
  if (db.lastStudyDate) {
    const d = daysDiff(db.lastStudyDate, today);
    if (d > 1) { db.streak = 0; persist(); }
  }

  document.getElementById('streak-count').textContent = db.streak || 0;
  document.getElementById('stat-total').textContent   = db.words.length;
  document.getElementById('stat-due').textContent     = db.words.filter(isDue).length;
  document.getElementById('stat-mastered').textContent = db.words.filter(w => ms(w) >= 9).length;

  const news    = db.words.filter(w => w.apps === 0);
  const reviews = db.words.filter(w => w.apps > 0 && isDue(w));
  const hard    = reviews.filter(w => ms(w) <= 3);

  const t = document.getElementById('session-tags');
  t.innerHTML = '';
  if (news.length)  t.innerHTML += `<span class="chip chip-new">${news.length} nuevas</span>`;
  if (hard.length)  t.innerHTML += `<span class="chip chip-hard">${hard.length} difíciles</span>`;
  const soft = reviews.length - hard.length;
  if (soft > 0)     t.innerHTML += `<span class="chip chip-review">${soft} revisión</span>`;
  if (!t.innerHTML) t.innerHTML  = '<span class="chip chip-done">Todo al día ✓</span>';

  const total = news.length + reviews.length;
  const btn   = document.getElementById('start-btn');
  btn.disabled    = total === 0;
  btn.textContent = total ? 'Comenzar sesión →' : 'Sin pendientes por ahora';

  renderCefrProgress();
}

function renderCefrProgress() {
  if (!LIB_READY) return;
  const lvls   = ['A1','A2','B1','B2','C1','C2'];
  const list   = document.getElementById('cefr-progress-list');
  const topLvl = [...lvls].reverse().find(l => db.words.some(w => w.cefr === l && ms(w) >= 5)) || null;
  document.getElementById('cefr-est').textContent = topLvl ? `Nivel: ${topLvl}` : '';

  list.innerHTML = lvls.map(l => {
    const total   = CEFR_TARGETS[l];
    const learned = db.words.filter(w => w.cefr === l && ms(w) >= 5).length;
    const pct     = Math.min(100, Math.round(learned / total * 1000) / 10);
    const col     = CEFR_COLORS[l];
    const fillW   = learned > 0 ? Math.max(pct, 0.5) : 0;
    return `<div class="cefr-progress-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="cefr cefr-${l.toLowerCase()}">${l}</span>
          <span style="font-size:12px;color:var(--text2);">${learned} / ${total.toLocaleString()}</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:${col};">${pct}%</span>
      </div>
      <div class="cefr-prog-bar"><div class="cefr-prog-fill" style="width:${fillW}%;background:${col};"></div></div>
    </div>`;
  }).join('');
}
