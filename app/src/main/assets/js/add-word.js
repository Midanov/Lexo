'use strict';

// ══════════════════════════════════════════════════
//  ADD WORD MODAL
// ══════════════════════════════════════════════════

let pendingCard = null;

function openAddWord() {
  document.getElementById('new-word').value = '';
  document.getElementById('new-ctx').value  = '';
  document.getElementById('new-cat').value  = 'General';
  resetAddModal();
  document.getElementById('add-overlay').classList.add('open');
  setTimeout(() => document.getElementById('new-word').focus(), 200);
}

function closeAddModal() {
  document.getElementById('add-overlay').classList.remove('open');
}

function resetAddModal() {
  document.getElementById('add-preview').style.display  = 'none';
  document.getElementById('add-error').style.display    = 'none';
  document.getElementById('add-loading').style.display  = 'none';
  document.getElementById('add-actions').style.display  = 'flex';
  document.getElementById('save-actions').style.display = 'none';
  pendingCard = null;
}

function showAddError(msg) {
  document.getElementById('add-error').style.display   = '';
  document.getElementById('add-error').textContent     = '⚠ ' + msg;
  document.getElementById('add-loading').style.display = 'none';
}

// Smart example sentence generator (no API needed)
function generateExample(word, pos, ctx) {
  if (ctx && ctx.length > 10) return ctx;
  const templates = {
    verb: [
      `She decided to ${word} everything carefully before making a decision.`,
      `They managed to ${word} together despite the challenges.`,
      `He always tries to ${word} in the most efficient way possible.`,
      `It is important to ${word} regularly if you want to improve.`
    ],
    noun: [
      `The ${word} played a crucial role in the outcome of the situation.`,
      `She studied the ${word} carefully to understand it better.`,
      `Having a good ${word} makes a big difference in daily life.`,
      `He explained the concept of ${word} to his colleagues.`
    ],
    adjective: [
      `The results were truly ${word} and exceeded all expectations.`,
      `She felt ${word} about the situation after hearing the news.`,
      `It was a ${word} experience that changed her perspective completely.`,
      `His approach to the problem was remarkably ${word}.`
    ],
    adverb: [
      `She ${word} finished the task before the deadline.`,
      `He spoke ${word} and everyone understood his point.`,
      `They ${word} agreed on the best course of action.`,
      `The team worked ${word} to complete the project on time.`
    ]
  };
  const t = templates[pos] || templates.noun;
  return t[Math.floor(Math.random() * t.length)];
}

async function generateCard() {
  const word = document.getElementById('new-word').value.trim().toLowerCase();
  if (!word) { alert('Escribe una palabra primero.'); return; }
  if (db.words.find(w => w.word.toLowerCase() === word)) {
    showAddError(`"${word}" ya está en tu vocabulario.`); return;
  }

  const ctx = document.getElementById('new-ctx').value.trim();
  const cat = document.getElementById('new-cat').value;

  document.getElementById('add-loading').style.display  = 'block';
  document.getElementById('add-preview').style.display  = 'none';
  document.getElementById('add-error').style.display    = 'none';
  document.getElementById('add-actions').style.display  = 'none';
  document.getElementById('save-actions').style.display = 'none';

  // 1. Check local library first
  const libEntry = LIB_READY ? LIB.find(e => e.w === word) : null;

  // 2. Try dictionary API
  let definition = '', ipa = '', example = '', partOfSpeech = 'word';
  let apiOnline  = false;
  try {
    const dictRes = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {method:'GET'}, 8000);
    if (dictRes.ok) {
      apiOnline = true;
      const data    = await dictRes.json();
      const entry   = data[0];
      const phonetic = entry.phonetics?.find(p => p.text) || {};
      ipa = phonetic.text || '';
      const meaning = entry.meanings?.[0];
      if (meaning) {
        partOfSpeech = meaning.partOfSpeech || 'word';
        const def    = meaning.definitions?.[0];
        definition   = def?.definition || '';
        example      = def?.example    || '';
      }
    }
  } catch(dictErr) { console.warn('Dictionary API error:', dictErr.message); }

  // 3. Try translation API
  let translation = libEntry ? libEntry.t : '';
  if (!translation) {
    try {
      const trRes = await fetchWithTimeout(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|es`,
        {method:'GET'}, 8000);
      if (trRes.ok) {
        const trData = await trRes.json();
        const raw    = (trData.responseData?.translatedText || '').trim();
        if (raw && raw.toLowerCase() !== word.toLowerCase() &&
            raw.toUpperCase() !== raw &&
            !raw.includes('MYMEMORY') && raw.length <= 80) {
          translation = raw;
        }
      }
    } catch(trErr) { console.warn('MyMemory API error:', trErr.message); }
  }

  document.getElementById('add-loading').style.display = 'none';

  // 4. Bail if nothing found
  if (!definition && !translation && !libEntry) {
    showAddError(`No se encontró "${word}". Verifica la ortografía (solo palabras en inglés).`);
    document.getElementById('add-actions').style.display = 'flex';
    return;
  }

  // Fill gaps with local data
  if (libEntry && (!partOfSpeech || partOfSpeech === 'word'))
    partOfSpeech = libEntry.p==='v'?'verb':libEntry.p==='n'?'noun':libEntry.p==='a'?'adjective':libEntry.p==='d'?'adverb':'word';

  example = example || generateExample(word, partOfSpeech, ctx);
  const cefr       = libEntry ? CEFR_CODES[libEntry.l] : estimateCEFR(word);
  const freq       = estimateFreq(word);
  const offlineNote = !apiOnline
    ? '<div style="font-size:11px;color:var(--amber-l);margin-bottom:8px;">⚠ Sin conexión — tarjeta generada sin definición en línea</div>'
    : '';

  pendingCard = {
    id: Date.now().toString(), word,
    translation:  translation  || '—',
    definition:   definition   || `The word "${word}".`,
    ipa, example, partOfSpeech, cefr, freq, category: cat,
    masteryScore: 1, apps: 0, interval: 1, easeFactor: 2.5,
    nextReview: new Date().toISOString()
  };

  document.getElementById('add-preview').style.display = 'block';
  document.getElementById('add-preview').innerHTML = `
    <div class="card" style="margin-bottom:0;">
      ${offlineNote}
      <div id="prev-img-wrap" style="display:none;margin-bottom:10px;">
        <img id="prev-img" class="word-img" src="" alt="${esc(pendingCard.word)}" onerror="this.parentElement.style.display='none'">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:26px;font-weight:700;">${esc(pendingCard.word)}</div>
          <div style="color:var(--amber);font-size:12px;font-weight:500;">${esc(pendingCard.partOfSpeech)}</div>
        </div>
        <div style="text-align:right;">
          <span class="cefr cefr-${pendingCard.cefr.toLowerCase()}">${pendingCard.cefr}</span>
          <div class="tiny" style="margin-top:2px;">${pendingCard.category}</div>
        </div>
      </div>
      ${pendingCard.ipa ? `<div class="ipa-row" style="margin-bottom:8px;">
        <span style="flex:1;color:var(--text2);font-size:13px;">${esc(pendingCard.ipa)}</span>
        <button class="play-btn" onclick="speak('${esc(pendingCard.word)}','en',this)">▶</button></div>` : ''}
      <div style="margin-bottom:6px;"><div class="tiny">Traducción</div>
        <div style="color:var(--amber-l);font-weight:500;font-size:14px;margin-top:2px;">${esc(pendingCard.translation)}</div></div>
      <div class="divider"></div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:6px;">${esc(pendingCard.definition)}</div>
      <div class="example-row">
        <span class="example-text">"${esc(pendingCard.example)}"</span>
        <button class="audio-btn" onclick="speak('${esc(pendingCard.example).replace(/'/g,"\\'")}','en',this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
        </button>
      </div>
    </div>`;

  document.getElementById('save-actions').style.display = 'flex';
  loadImageInto(pendingCard.word, 'prev-img-wrap', 'prev-img');
}

function saveWord() {
  if (!pendingCard) return;
  db.words.push(pendingCard); persist();
  closeAddModal(); refreshHome(); renderVocab();
  const fab = document.getElementById('fab');
  fab.textContent = '✓'; fab.style.background = 'var(--teal)';
  setTimeout(() => { fab.textContent = '+'; fab.style.background = 'var(--amber)'; }, 1400);
}

// ══════════════════════════════════════════════════
//  SETTINGS MODAL
// ══════════════════════════════════════════════════

function openSettings() {
  document.getElementById('s-words').textContent    = db.words.length;
  document.getElementById('s-sessions').textContent = db.totalSessions || 0;
  document.getElementById('s-streak').textContent   = (db.streak || 0) + ' días';
  document.getElementById('s-games').textContent    = db.totalGames || 0;

  // Inject notification section once
  if (!document.getElementById('notif-section')) {
    const modal  = document.querySelector('#settings-overlay .modal');
    const danger = modal?.querySelector('[style*="border-top"]');
    if (modal) {
      const sec = document.createElement('div');
      sec.id = 'notif-section';
      sec.innerHTML = `
        <div class="divider"></div>
        <h3 style="margin-bottom:10px;">Notificaciones</h3>
        <div class="card-sm" style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:13px;color:var(--text2);">Recordatorio diario</span>
            <label style="position:relative;width:40px;height:22px;cursor:pointer;">
              <input type="checkbox" id="notif-enabled" onchange="toggleNotif(this.checked)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span id="notif-track" style="position:absolute;inset:0;background:var(--border);border-radius:11px;transition:background .2s;"></span>
              <span id="notif-thumb" style="position:absolute;width:16px;height:16px;top:3px;left:3px;background:#fff;border-radius:50%;transition:transform .2s;"></span>
            </label>
          </div>
          <label style="margin-top:0;">Hora del recordatorio</label>
          <input type="time" id="notif-time" value="09:00" onchange="updateNotifTime()">
        </div>`;
      if (danger) modal.insertBefore(sec, danger); else modal.appendChild(sec);
      document.getElementById('notif-enabled').addEventListener('change', function() {
        const on = this.checked;
        document.getElementById('notif-track').style.background  = on ? 'var(--teal)' : 'var(--border)';
        document.getElementById('notif-thumb').style.transform   = on ? 'translateX(18px)' : 'translateX(0)';
      });
    }
  }

  const enabled = localStorage.getItem('lexo_notif_enabled') === 'true';
  const time    = localStorage.getItem('lexo_notif_time') || '09:00';
  const cb = document.getElementById('notif-enabled');
  const ti = document.getElementById('notif-time');
  if (cb) {
    cb.checked = enabled;
    document.getElementById('notif-track').style.background = enabled ? 'var(--teal)' : 'var(--border)';
    document.getElementById('notif-thumb').style.transform  = enabled ? 'translateX(18px)' : 'translateX(0)';
  }
  if (ti) ti.value = time;
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

function toggleNotif(enabled) {
  localStorage.setItem('lexo_notif_enabled', enabled);
  const time = document.getElementById('notif-time')?.value || '09:00';
  if (enabled) {
    const [h, m] = time.split(':').map(Number);
    scheduleNotif(h, m);
    showToast('Notificaciones activadas ✓');
  } else {
    cancelNotif();
    showToast('Notificaciones desactivadas');
  }
}

function updateNotifTime() {
  const time = document.getElementById('notif-time')?.value || '09:00';
  localStorage.setItem('lexo_notif_time', time);
  if (document.getElementById('notif-enabled')?.checked) {
    const [h, m] = time.split(':').map(Number);
    scheduleNotif(h, m);
    showToast('Hora actualizada ✓');
  }
}

function scheduleNotif(hour, minute) {
  if (window.NotificationBridge && typeof NotificationBridge.scheduleDaily === 'function') {
    try { NotificationBridge.scheduleDaily(hour, minute); } catch(e) {}
  }
}

function cancelNotif() {
  if (window.NotificationBridge && typeof NotificationBridge.cancelDaily === 'function') {
    try { NotificationBridge.cancelDaily(); } catch(e) {}
  }
}

function resetApp() {
  if (!confirm('¿Borrar TODOS los datos? No se puede deshacer.')) return;
  localStorage.removeItem('lexo_db');
  location.reload();
}
