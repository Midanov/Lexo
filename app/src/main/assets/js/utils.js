'use strict';

// ══════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════
const CEFR_CODES  = ['','A1','A2','B1','B2','C1','C2','C2']; // index 7 = C2 (extended dataset)
const CAT_NAMES   = ['','Daily','Technology','Business','Finance','Travel',
                     'Food','Health','Science','Arts','Education','Nature','Society'];
const CAT_LABELS  = ['','Cotidiano','Tecnología','Negocios','Finanzas','Viajes',
                     'Comida','Salud','Ciencia','Arte','Educación','Naturaleza','Sociedad'];
const SCREEN_ORDER = ['home','study','game','vocab','explore'];
const CEFR_TARGETS = {A1:500, A2:1000, B1:2000, B2:3500, C1:5000, C2:8000};
const CEFR_COLORS  = {A1:'#378ADD', A2:'#1D9E75', B1:'#EF9F27', B2:'#EF9F27', C1:'#D4537E', C2:'#AFA9EC'};
const PAGE_SIZE    = 40;

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let LIB = [];
let LIB_READY = false;
let db = {words:[], streak:0, lastStudyDate:null, totalSessions:0, totalGames:0};

// ══════════════════════════════════════════════════
//  ANDROID BRIDGE
// ══════════════════════════════════════════════════
function isOnline() {
  if (window.Android && typeof Android.isOnline === 'function') return Android.isOnline();
  return navigator.onLine !== false;
}
function showNativeToast(msg) {
  if (window.Android && typeof Android.showToast === 'function') Android.showToast(msg);
}

// ══════════════════════════════════════════════════
//  FETCH WITH TIMEOUT
// ══════════════════════════════════════════════════
function fetchWithTimeout(url, options, ms) {
  ms = ms || 8000; options = options || {};
  return new Promise(function(resolve, reject) {
    const ctrl  = new AbortController();
    const timer = setTimeout(function() { ctrl.abort(); reject(new Error('Timeout')); }, ms);
    fetch(url, Object.assign({}, options, {signal: ctrl.signal}))
      .then(function(r) { clearTimeout(timer); resolve(r); })
      .catch(function(e) { clearTimeout(timer); reject(e); });
  });
}

// ══════════════════════════════════════════════════
//  INDEXEDDB — word library
// ══════════════════════════════════════════════════
const IDB_NAME  = 'lexo_library_v2';
const IDB_STORE = 'words';
const IDB_VER   = 1;

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(IDB_STORE))
        idb.createObjectStore(IDB_STORE, {keyPath:'w'});
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
function idbCount(idb) {
  return new Promise((res, rej) => {
    const req = idb.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).count();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = () => res(0);
  });
}
function idbPutAll(idb, rows) {
  return new Promise((res, rej) => {
    const tx    = idb.transaction(IDB_STORE,'readwrite');
    const store = tx.objectStore(IDB_STORE);
    rows.forEach(r => store.put(r));
    tx.oncomplete = res;
    tx.onerror    = rej;
  });
}
function idbGetAll(idb) {
  return new Promise((res, rej) => {
    const req = idb.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

// ══════════════════════════════════════════════════
//  INDEXEDDB — image cache
// ══════════════════════════════════════════════════
const IDB_IMG_NAME  = 'lexo_img_v1';
const IDB_IMG_STORE = 'cache';
let imgIDB = null;
const IMG_TTL = 7 * 24 * 3600 * 1000; // 7 days

async function openImgIDB() {
  if (imgIDB) return imgIDB;
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_IMG_NAME, 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(IDB_IMG_STORE))
        d.createObjectStore(IDB_IMG_STORE, {keyPath:'w'});
    };
    req.onsuccess = e => { imgIDB = e.target.result; res(imgIDB); };
    req.onerror   = e => rej(e.target.error);
  });
}
async function imgCacheGet(word) {
  try {
    const idb = await openImgIDB();
    return new Promise(res => {
      const req = idb.transaction(IDB_IMG_STORE,'readonly').objectStore(IDB_IMG_STORE).get(word);
      req.onsuccess = e => {
        const r = e.target.result;
        if (!r) return res(undefined);
        if (Date.now() - r.ts > IMG_TTL) return res(undefined);
        res(r.url);
      };
      req.onerror = () => res(undefined);
    });
  } catch(e) { return undefined; }
}
async function imgCacheSet(word, url) {
  try {
    const idb = await openImgIDB();
    return new Promise(res => {
      const tx = idb.transaction(IDB_IMG_STORE,'readwrite');
      tx.objectStore(IDB_IMG_STORE).put({w:word, url, ts:Date.now()});
      tx.oncomplete = res; tx.onerror = res;
    });
  } catch(e) {}
}

async function getWordImageUrl(word) {
  const cached = await imgCacheGet(word);
  if (cached !== undefined) return cached;
  let url = null;
  try {
    const r = await fetchWithTimeout(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
      {method:'GET'}, 6000);
    if (r.ok) {
      const data = await r.json();
      const desc = (data.description || '').toLowerCase();
      const irrelevant = /\b(film|album|song|singer|actor|footballer|politician|band|tv series|novel|book|manga)\b/;
      if (!irrelevant.test(desc)) url = data.thumbnail?.source || null;
    }
  } catch(e) {}
  await imgCacheSet(word, url);
  return url;
}

// Silently fetches + caches an image URL without touching the DOM.
// Call this while the user is reading the current card so the next one is warm.
async function prefetchImage(word) {
  await getWordImageUrl(word);
}

// Shows a skeleton immediately, then swaps in the real image when ready.
// The wrap element must already contain .img-skeleton and an <img id=imgId>.
async function loadImageInto(word, wrapId, imgId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  // Show the skeleton straight away — no layout jump
  wrap.style.display = 'block';

  const url = await getWordImageUrl(word);

  // If no image found, hide wrap so it takes no space
  if (!url) {
    wrap.style.display = 'none';
    return;
  }

  const img = document.getElementById(imgId);
  if (!img) return;

  // Pre-load into a throw-away Image so we only swap once it is fully decoded
  const loader = new Image();
  loader.onload = () => {
    const skeleton = wrap.querySelector('.img-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    img.src           = url;
    img.style.display = 'block';
  };
  loader.onerror = () => { wrap.style.display = 'none'; };
  loader.src = url;
}

// ══════════════════════════════════════════════════
//  LIBRARY LOADING
// ══════════════════════════════════════════════════
async function loadLibrary(idb) {
  const count = await idbCount(idb);

  if (count > 0) {
    LIB       = await idbGetAll(idb);
    LIB_READY = true;
    onLibraryReady();
    return;
  }

  showLoadingScreen('Cargando vocabulario… (solo la primera vez)');
  try {
    const res = await fetchWithTimeout('words.json', {method:'GET'}, 20000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw  = await res.json();
    const rows = raw.map(r => ({
      w: r[0], t: r[1], l: r[2], p: r[3], c: r[4],
      d: r[5] || '',
      e: r[6] || ''
    }));
    await idbPutAll(idb, rows);
    LIB = rows;
  } catch(err) {
    console.warn('words.json load failed:', err.message);
    LIB = [];
  }

  LIB_READY = true;
  hideLoadingScreen();
  onLibraryReady();
}

// Called once LIB is ready. Re-renders every screen that depends on LIB_READY.
// renderExplore() is async but safe to fire-and-forget: it guards on LIB_READY
// internally and is cheap when the list is already rendered.
function onLibraryReady() {
  updateWordCount();
  refreshHome();
  renderExplore();
}

function updateWordCount() {
  const el = document.getElementById('word-count');
  if (!el) return;
  el.innerHTML = `${LIB.length.toLocaleString()} palabras · A1 a C2 · Toca <strong style="color:var(--amber)">+</strong> para agregar`;
}

function showLoadingScreen(msg) {
  let ov = document.getElementById('lex-load');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'lex-load';
    ov.style.cssText = 'position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div style="font-size:36px;font-weight:800;color:var(--amber);letter-spacing:-2px;">Lexo</div>
    <div id="lex-load-msg" style="font-size:13px;color:var(--text2);">${msg}</div>
    <div class="spinner"></div>`;
}

function hideLoadingScreen() {
  const ov = document.getElementById('lex-load');
  if (ov) ov.remove();
}

// ══════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════
function persist() {
  localStorage.setItem('lexo_db', JSON.stringify(db));
  if (window.NotificationBridge && typeof NotificationBridge.syncStats === 'function') {
    try {
      const due = db.words.filter(isDue).length;
      NotificationBridge.syncStats(db.words.length, due, db.streak || 0);
    } catch(e) {}
  }
}

// ══════════════════════════════════════════════════
//  SRS HELPERS
// ══════════════════════════════════════════════════
function isDue(w)  { return !w.nextReview || new Date(w.nextReview) <= new Date(); }
function ms(w)     { return Math.round((w.masteryScore || 1) * 10) / 10; }
function dayStr(d) { return d.toISOString().split('T')[0]; }
function daysDiff(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

function applyRating(w, rating, responseTimeSec) {
  let ef = w.easeFactor || 2.5, iv = w.interval || 1, sc = w.masteryScore || 1;
  if      (rating === 1) { iv = 1; ef = Math.max(1.3, ef - 0.22); sc = Math.max(1, sc - 1.5); }
  else if (rating === 2) { iv = Math.max(1, Math.round(iv * 0.75)); ef = Math.max(1.3, ef - 0.1); sc = Math.max(1, sc - 0.2); }
  else if (rating === 3) { iv = Math.max(1, Math.round(iv * ef)); sc = Math.min(10, sc + 0.8); }
  else                   { iv = Math.max(1, Math.round(iv * ef * 1.3)); ef = Math.min(2.5, ef + 0.1); sc = Math.min(10, sc + 1.2); }
  if (responseTimeSec && responseTimeSec > 8 && rating >= 3) iv = Math.max(1, iv - 1);
  w.interval = iv; w.easeFactor = ef; w.masteryScore = sc;
  w.apps = (w.apps || 0) + 1;
  if (responseTimeSec) {
    const prev = w.avgResponseTime || responseTimeSec;
    w.avgResponseTime = Math.round((prev * 0.6 + responseTimeSec * 0.4) * 10) / 10;
  }
  const next = new Date(); next.setDate(next.getDate() + iv);
  w.nextReview = next.toISOString();
  persist();
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
function showScreen(name) {
  const current = document.querySelector('.screen.active');
  const next    = document.getElementById('screen-' + name);
  if (!current || current === next) return;

  const fab = document.getElementById('fab');
  fab.style.display = (name === 'vocab' || name === 'explore') ? 'flex' : 'none';

  if (name === 'home')    refreshHome();
  if (name === 'vocab')   renderVocab();
  if (name === 'study')   initStudyScreen();
  if (name === 'game')    initGameSetup();
  if (name === 'explore') renderExplore();

  const currentName  = current.id.replace('screen-', '');
  const currentIndex = SCREEN_ORDER.indexOf(currentName);
  const nextIndex    = SCREEN_ORDER.indexOf(name);
  const goingForward = nextIndex > currentIndex;

  current.classList.remove('active');
  current.classList.add(goingForward ? 'exit-left' : 'exit-right');

  // Position the incoming screen on the correct side before animating it in
  if (!goingForward) next.classList.add('enter-from-left');

  requestAnimationFrame(() => {
    next.classList.add('active');
    next.classList.remove('enter-from-left');
  });

  setTimeout(() => { current.classList.remove('exit-left', 'exit-right'); }, 300);

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.nav-btn[onclick="showScreen('${name}')"]`)?.classList.add('active');
}

// ══════════════════════════════════════════════════
//  SHARED HELPERS
// ══════════════════════════════════════════════════
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function estimateCEFR(w) {
  const a1 = ['do','be','have','go','say','get','make','know','think','take','come','see','want','look','use','find','give','tell','work','call','ask','need','feel','try','leave','put','mean','keep','let','begin','show','hear','play','run','move','live','believe','hold','bring','happen','write','sit','stand','lose','pay','meet','set','learn','change','lead','understand','watch','follow','stop','create','speak','read','spend','grow','open','walk','win','offer','remember'];
  const lw = w.toLowerCase();
  if (a1.includes(lw) || w.length <= 4)  return 'A1';
  if (w.length <= 6)  return 'A2';
  if (w.length <= 8)  return 'B1';
  if (w.length <= 10) return 'B2';
  if (w.length <= 13) return 'C1';
  return 'C2';
}

function estimateFreq(w) {
  const top = ['the','be','to','of','and','a','in','that','have','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when'];
  const i = top.indexOf(w.toLowerCase());
  if (i >= 0) return i + 1;
  if (w.length <= 4) return Math.floor(Math.random() * 200) + 50;
  if (w.length <= 6) return Math.floor(Math.random() * 800) + 200;
  if (w.length <= 9) return Math.floor(Math.random() * 3000) + 800;
  return Math.floor(Math.random() * 8000) + 3000;
}

function speak(text, lang, btn) {
  lang = lang || 'en';
  const setBtn = (on) => {
    if (!btn) return;
    btn.disabled     = !on;
    btn.style.opacity = on ? '1' : '0.45';
  };
  setBtn(false);

  if (window.AndroidTTS && typeof AndroidTTS.speak === 'function') {
    try {
      if (lang === 'en') AndroidTTS.speak(text);
      else               AndroidTTS.speakEs(text);
      setTimeout(() => setBtn(true), 500);
      return;
    } catch(e) { console.warn('AndroidTTS error:', e); }
  }

  if (!window.speechSynthesis) {
    setBtn(true);
    showToast('Activa TTS en Ajustes → Accesibilidad → Texto a voz');
    return;
  }

  const doSpeak = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = lang === 'en' ? 'en-US' : 'es-ES';
    u.rate  = 0.85;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      const pick = lang === 'en'
        ? voices.find(v => v.lang === 'en-US' && v.localService)
          || voices.find(v => v.lang.startsWith('en-') && v.localService)
          || voices.find(v => v.lang.startsWith('en-'))
        : voices.find(v => v.lang === 'es-ES' && v.localService)
          || voices.find(v => v.lang.startsWith('es-'));
      if (pick) u.voice = pick;
    }
    u.onstart = () => { if (btn) btn.style.background = 'var(--amber-d)'; };
    const reset = () => setBtn(true);
    u.onend   = reset;
    u.onerror = reset;
    window.speechSynthesis.speak(u);
  };

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    let done = false;
    window.speechSynthesis.onvoiceschanged = () => {
      if (done) return; done = true;
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
    setTimeout(() => { if (!done) { done = true; doSpeak(); } }, 700);
  } else { doSpeak(); }
}

function showToast(msg) {
  if (window.Android && typeof Android.showToast === 'function') { Android.showToast(msg); return; }
  let t = document.getElementById('lexo-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'lexo-toast';
    document.body.appendChild(t);
  }
  t.textContent        = msg;
  t.style.opacity      = '1';
  t.style.transform    = 'translateX(-50%) translateY(0)';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
  }, 2200);
}

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
async function init() {
  try { const s = localStorage.getItem('lexo_db'); if (s) db = JSON.parse(s); } catch(e) {}
  if (!Array.isArray(db.words)) db.words = [];
  try {
    const idb = await openIDB();
    await loadLibrary(idb);
  } catch(err) {
    console.warn('IDB error:', err.message);
    LIB = [];
  }
  document.getElementById('fab').style.display = 'none';

  // Explicitly render home content on first load.
  // showScreen() skips rendering when the target is already the active screen,
  // so we call refreshHome() directly here after data is ready.
  refreshHome();
}