
'use strict';

// ══════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════
const CEFR_CODES = ['','A1','A2','B1','B2','C1','C2'];
const CAT_NAMES  = ['','Daily','Technology','Business','Finance','Travel',
                    'Food','Health','Science','Arts','Education','Nature','Society'];
const CAT_LABELS = ['','Cotidiano','Tecnología','Negocios','Finanzas','Viajes',
                    'Comida','Salud','Ciencia','Arte','Educación','Naturaleza','Sociedad'];
const SCREEN_ORDER = ['home','study','game','vocab','explore'];
// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let LIB = [];        // word library — loaded from IndexedDB / words.json
let LIB_READY = false;
let db = {words:[],streak:0,lastStudyDate:null,totalSessions:0,totalGames:0};
let pendingCard=null;
let sessionQueue=[],sessionIdx=0,sessionStats={good:0,bad:0};
let gameDiff='easy',gameWordCount=10;
let gameQueue=[],gameIdx=0,gameScore=0,gameResults=[];
let timerInterval=null,timerStart=0;
let gameAnswered=false;
let vocabFilters={status:'all',cefr:'all',cat:'all'};
let explorePage=0, exploreLevel='all', exploreCat='all';
const PAGE_SIZE=40;
const CEFR_TARGETS={A1:500,A2:1000,B1:2000,B2:3500,C1:5000,C2:8000};
const CEFR_COLORS={A1:'#378ADD',A2:'#1D9E75',B1:'#EF9F27',B2:'#EF9F27',C1:'#D4537E',C2:'#AFA9EC'};
const DIFF_CONFIG={
  easy:  {time:15,qType:'translation',label:'Fácil'},
  medium:{time:10,qType:'meaning',    label:'Medio'},
  hard:  {time:6, qType:'definition', label:'Difícil'}
};

// ══════════════════════════════════════════════════
//  ANDROID BRIDGE
// ══════════════════════════════════════════════════
function isOnline(){
  if(window.Android&&typeof Android.isOnline==='function')return Android.isOnline();
  return navigator.onLine!==false;
}
function showNativeToast(msg){
  if(window.Android&&typeof Android.showToast==='function')Android.showToast(msg);
}

// ══════════════════════════════════════════════════
//  FETCH WITH TIMEOUT
// ══════════════════════════════════════════════════
function fetchWithTimeout(url,options,ms){
  ms=ms||8000;options=options||{};
  return new Promise(function(resolve,reject){
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort();reject(new Error('Timeout'));},ms);
    fetch(url,Object.assign({},options,{signal:ctrl.signal}))
      .then(function(r){clearTimeout(timer);resolve(r);})
      .catch(function(e){clearTimeout(timer);reject(e);});
  });
}

// ══════════════════════════════════════════════════
//  INDEXEDDB — word library
// ══════════════════════════════════════════════════
const IDB_NAME='lexo_library_v2', IDB_STORE='words', IDB_VER=1;

function openIDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(IDB_NAME,IDB_VER);
    req.onupgradeneeded=e=>{
      const idb=e.target.result;
      if(!idb.objectStoreNames.contains(IDB_STORE))
        idb.createObjectStore(IDB_STORE,{keyPath:'w'});
    };
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}
function idbCount(idb){
  return new Promise((res,rej)=>{
    const req=idb.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).count();
    req.onsuccess=e=>res(e.target.result);
    req.onerror=()=>res(0);
  });
}
function idbPutAll(idb,rows){
  return new Promise((res,rej)=>{
    const tx=idb.transaction(IDB_STORE,'readwrite');
    const store=tx.objectStore(IDB_STORE);
    rows.forEach(r=>store.put(r));
    tx.oncomplete=res;
    tx.onerror=rej;
  });
}
function idbGetAll(idb){
  return new Promise((res,rej)=>{
    const req=idb.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}

// ══════════════════════════════════════════════════
//  INDEXEDDB — image cache
// ══════════════════════════════════════════════════
const IDB_IMG_NAME='lexo_img_v1', IDB_IMG_STORE='cache';
let imgIDB=null;
const IMG_TTL=7*24*3600*1000; // 7 days

async function openImgIDB(){
  if(imgIDB)return imgIDB;
  return new Promise((res,rej)=>{
    const req=indexedDB.open(IDB_IMG_NAME,1);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains(IDB_IMG_STORE))
        d.createObjectStore(IDB_IMG_STORE,{keyPath:'w'});
    };
    req.onsuccess=e=>{imgIDB=e.target.result;res(imgIDB);};
    req.onerror=e=>rej(e.target.error);
  });
}
async function imgCacheGet(word){
  try{
    const idb=await openImgIDB();
    return new Promise(res=>{
      const req=idb.transaction(IDB_IMG_STORE,'readonly').objectStore(IDB_IMG_STORE).get(word);
      req.onsuccess=e=>{
        const r=e.target.result;
        if(!r)return res(undefined);
        if(Date.now()-r.ts>IMG_TTL)return res(undefined);
        res(r.url);
      };
      req.onerror=()=>res(undefined);
    });
  }catch(e){return undefined;}
}
async function imgCacheSet(word,url){
  try{
    const idb=await openImgIDB();
    return new Promise(res=>{
      const tx=idb.transaction(IDB_IMG_STORE,'readwrite');
      tx.objectStore(IDB_IMG_STORE).put({w:word,url,ts:Date.now()});
      tx.oncomplete=res;tx.onerror=res;
    });
  }catch(e){}
}

// Returns image URL string, null (no image), or undefined (cache miss→fetch)
async function getWordImageUrl(word){
  const cached=await imgCacheGet(word);
  if(cached!==undefined)return cached; // null = confirmed no image
  let url=null;
  try{
    const r=await fetchWithTimeout(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
      {method:'GET'},6000);
    if(r.ok){
      const data=await r.json();
      const desc=(data.description||'').toLowerCase();
      const irrelevant=/\b(film|album|song|singer|actor|footballer|politician|band|tv series|novel|book|manga)\b/;
      if(!irrelevant.test(desc)){
        url=data.thumbnail?.source||null;
      }
    }
  }catch(e){}
  await imgCacheSet(word,url);
  return url;
}

// Async: fetches image and injects it into a placeholder already in the DOM
async function loadImageInto(word,wrapId,imgId){
  const url=await getWordImageUrl(word);
  if(!url)return;
  const wrap=document.getElementById(wrapId);
  const img=document.getElementById(imgId);
  if(wrap&&img){img.src=url;img.style.width = '200px';
                              img.style.height = '200px';
                              img.style.objectFit = 'cover';  img.style.display = 'block';
                                                              img.style.margin = '0 auto';img.onerror=()=>{wrap.style.display='none';};wrap.style.display='block';}
}

async function loadLibrary(idb){
  const count=await idbCount(idb);
  if(count>0){LIB=await idbGetAll(idb);LIB_READY=true;return;}
  // First run: load words.json
  showLoadingScreen('Cargando vocabulario… (solo la primera vez)');
  try{
    const res=await fetchWithTimeout('words.json',{method:'GET'},20000);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const raw=await res.json();
    // raw is array of arrays: [word,translation,level,pos,cat]
    const rows = raw.map(r => ({
      w: r[0],
      t: r[1],
      l: r[2],
      p: r[3],
      c: r[4],
      d: r[5] || '',   // definition
      e: r[6] || ''    // example
    }));
    await idbPutAll(idb,rows);
    LIB=rows;
  }catch(err){
    console.warn('words.json load failed:',err.message);
    LIB=[];
  }
  LIB_READY=true;
  hideLoadingScreen();
}

function showLoadingScreen(msg){
  let ov=document.getElementById('lex-load');
  if(!ov){
    ov=document.createElement('div');
    ov.id='lex-load';
    ov.style.cssText='position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;';
    document.body.appendChild(ov);
  }
  ov.innerHTML=`<div style="font-size:36px;font-weight:800;color:var(--amber);letter-spacing:-2px;">Lexo</div>
    <div id="lex-load-msg" style="font-size:13px;color:var(--text2);">${msg}</div>
    <div class="spinner"></div>`;
}
function hideLoadingScreen(){
  const ov=document.getElementById('lex-load');
  if(ov)ov.remove();
}

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
async function init(){
  try{const s=localStorage.getItem('lexo_db');if(s)db=JSON.parse(s);}catch(e){}
  if(!Array.isArray(db.words))db.words=[];
  try{
    const idb=await openIDB();
    await loadLibrary(idb);
  }catch(err){
    console.warn('IDB error:',err.message);
    LIB=[];
  }
  document.getElementById('fab').style.display='flex';
  showScreen('home');
}
function persist(){
  localStorage.setItem('lexo_db',JSON.stringify(db));
  if(window.NotificationBridge&&typeof NotificationBridge.syncStats==='function'){
    try{
      const due=db.words.filter(isDue).length;
      NotificationBridge.syncStats(db.words.length,due,db.streak||0);
    }catch(e){}
  }
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
function showScreen(name){
  const current = document.querySelector('.screen.active');
  const next = document.getElementById('screen-' + name);

  if(!current || current === next) return;
  const fab = document.getElementById('fab');
  if(name === 'vocab' || name === 'explore'){
    fab.style.display = 'flex';
  } else {
    fab.style.display = 'none';
  }
  // lógica existente (no la rompemos)
  if(name==='home')  refreshHome();
  if(name==='vocab') renderVocab();
  if(name==='study') initStudyScreen();
  if(name==='game')  initGameSetup();
  if(name==='explore') renderExplore();

  // detectar dirección
  const currentName = current.id.replace('screen-','');
  const currentIndex = SCREEN_ORDER.indexOf(currentName);
  const nextIndex = SCREEN_ORDER.indexOf(name);

  const goingForward = nextIndex > currentIndex;

  // animación de salida
  current.classList.remove('active');
  current.classList.add(goingForward ? 'exit-left' : 'exit-right');

  // animación de entrada
  requestAnimationFrame(()=>{
    next.classList.add('active');
  });

  // limpiar clases después de la animación
  setTimeout(()=>{
    current.classList.remove('exit-left','exit-right');
  }, 300);
  // actualizar botones activos
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.classList.remove('active');
  });

  document.querySelector(`.nav-btn[onclick="showScreen('${name}')"]`)
    ?.classList.add('active');
}

// ══════════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════════
function refreshHome(){
  const today=dayStr(new Date());
  if(db.lastStudyDate){const d=daysDiff(db.lastStudyDate,today);if(d>1){db.streak=0;persist();}}
  document.getElementById('streak-count').textContent=db.streak||0;
  document.getElementById('stat-total').textContent=db.words.length;
  document.getElementById('stat-due').textContent=db.words.filter(isDue).length;
  document.getElementById('stat-mastered').textContent=db.words.filter(w=>ms(w)>=9).length;
  const news=db.words.filter(w=>w.apps===0);
  const reviews=db.words.filter(w=>w.apps>0&&isDue(w));
  const hard=reviews.filter(w=>ms(w)<=3);
  const t=document.getElementById('session-tags');
  t.innerHTML='';
  if(news.length)t.innerHTML+=`<span class="chip chip-new">${news.length} nuevas</span>`;
  if(hard.length)t.innerHTML+=`<span class="chip chip-hard">${hard.length} difíciles</span>`;
  const soft=reviews.length-hard.length;
  if(soft>0)t.innerHTML+=`<span class="chip chip-review">${soft} revisión</span>`;
  if(!t.innerHTML)t.innerHTML='<span class="chip chip-done">Todo al día ✓</span>';
  const total=news.length+reviews.length;
  const btn=document.getElementById('start-btn');
  btn.disabled=total===0;
  btn.textContent=total?'Comenzar sesión →':'Sin pendientes por ahora';
  renderCefrProgress();
}
function renderCefrProgress(){
  if (!LIB_READY) return;
  const lvls=['A1','A2','B1','B2','C1','C2'];
  const list=document.getElementById('cefr-progress-list');
  const topLvl=[...lvls].reverse().find(l=>db.words.some(w=>w.cefr===l&&ms(w)>=5))||null;
  document.getElementById('cefr-est').textContent=topLvl?`Nivel: ${topLvl}`:'';
  list.innerHTML=lvls.map(l=>{
    const total=CEFR_TARGETS[l];
    const learned=db.words.filter(w=>w.cefr===l&&ms(w)>=5).length;
    const pct=Math.min(100,Math.round(learned/total*1000)/10);
    const col=CEFR_COLORS[l];
    const fillW=learned>0?Math.max(pct,0.5):0;
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

// ══════════════════════════════════════════════════
//  SRS
// ══════════════════════════════════════════════════
function isDue(w){return !w.nextReview||new Date(w.nextReview)<=new Date();}
function ms(w){return Math.round((w.masteryScore||1)*10)/10;}
function dayStr(d){return d.toISOString().split('T')[0];}
function daysDiff(a,b){return Math.floor((new Date(b)-new Date(a))/86400000);}
function applyRating(w,rating,responseTimeSec){
  let ef=w.easeFactor||2.5,iv=w.interval||1,sc=w.masteryScore||1;
  if(rating===1){iv=1;ef=Math.max(1.3,ef-0.22);sc=Math.max(1,sc-1.5);}
  else if(rating===2){iv=Math.max(1,Math.round(iv*0.75));ef=Math.max(1.3,ef-0.1);sc=Math.max(1,sc-0.2);}
  else if(rating===3){iv=Math.max(1,Math.round(iv*ef));sc=Math.min(10,sc+0.8);}
  else{iv=Math.max(1,Math.round(iv*ef*1.3));ef=Math.min(2.5,ef+0.1);sc=Math.min(10,sc+1.2);}
  if(responseTimeSec&&responseTimeSec>8&&rating>=3)iv=Math.max(1,iv-1);
  w.interval=iv;w.easeFactor=ef;w.masteryScore=sc;
  w.apps=(w.apps||0)+1;
  if(responseTimeSec){
    const prev=w.avgResponseTime||responseTimeSec;
    w.avgResponseTime=Math.round((prev*0.6+responseTimeSec*0.4)*10)/10;
  }
  const next=new Date();next.setDate(next.getDate()+iv);
  w.nextReview=next.toISOString();
  persist();
}

// ══════════════════════════════════════════════════
//  STUDY
// ══════════════════════════════════════════════════
function initStudyScreen(){
  if(sessionQueue.length===0){
    const hasDue=db.words.some(w=>isDue(w))||db.words.some(w=>w.apps===0);
    showStudyView(hasDue?'session':'empty');
    if(!hasDue){
      document.getElementById('empty-msg').textContent=db.words.length===0
        ?'Agrega tu primera palabra con el botón +'
        :'No hay palabras pendientes. ¡Vuelve mañana!';
      return;
    }
    buildQueue();renderFlashcard();
  }
}
function startStudy(){
  buildQueue();
  if(sessionQueue.length===0){showScreen('study');return;}
  showScreen('study');showStudyView('session');renderFlashcard();
}
function buildQueue(){
  const news=db.words.filter(w=>w.apps===0).slice(0,8);
  const reviews=db.words.filter(w=>w.apps>0&&isDue(w)).slice(0,18);
  sessionQueue=shuffle([...news,...reviews]);
  sessionIdx=0;sessionStats={good:0,bad:0};
}
function showStudyView(v){
  document.getElementById('study-session').style.display=v==='session'?'flex':'none';
  document.getElementById('study-complete').style.display=v==='complete'?'flex':'none';
  document.getElementById('study-empty').style.display=v==='empty'?'flex':'none';
}
function renderFlashcard(){
  if(sessionIdx>=sessionQueue.length){finishSession();return;}
  const total=sessionQueue.length,w=sessionQueue[sessionIdx];
  const segs=Math.min(total,15),pr=sessionIdx/total;
  document.getElementById('study-prog').innerHTML=
    Array.from({length:segs},(_,i)=>{
      const p=i/segs;const cls=p<pr?'done':(Math.abs(p-pr)<1/segs?'current':'');
      return `<div class="prog-seg ${cls}"></div>`;
    }).join('');
  document.getElementById('study-counter').textContent=`${sessionIdx+1} / ${total}`;
  const hl=hintLevel(w);
  const hlL=['Completa','Sin traducción','Solo ejemplo'];
  document.getElementById('study-hint-lbl').textContent=hl>0?hlL[hl]:'';
  const score=ms(w),msCol=score>=8?'var(--teal-l)':score>=5?'var(--amber-l)':'#F0997B';
  let html=`<div class="card" style="margin-bottom:10px;">
    <div id="flash-img-wrap" style="display:none;margin-bottom:10px;">
      <img id="flash-img" class="word-img" src="" alt="${esc(w.word)}" onerror="this.parentElement.style.display='none'">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div><div class="flash-word">${esc(w.word)}</div>
      <div class="flash-pos">${esc(w.partOfSpeech||'')}</div></div>
      <div style="text-align:right;">
        ${w.cefr?`<span class="cefr cefr-${w.cefr.toLowerCase()}">${w.cefr}</span>`:''}
        ${w.freq?`<div class="tiny" style="margin-top:2px;">#${w.freq}</div>`:''}
      </div>
    </div>`;
  if(w.ipa)html+=`<div class="ipa-row">
    <span class="muted" style="flex:1;font-size:13px;">${esc(w.ipa)}</span>
    <button class="play-btn" onclick="speak('${esc(w.word)}','en',this)">▶</button></div>`;
  html+='<div class="divider"></div>';
  if(hl>0)html+=`<span class="hint-badge">${hlL[hl]}</span><br>`;
  if(hl===0){
    html+=`<div style="margin-bottom:8px;"><div class="tiny">Traducción</div>
      <div style="font-size:14px;color:var(--amber-l);font-weight:500;margin-top:2px;">${esc(w.translation||'—')}</div></div>`;
  }else{
    html+=`<div style="margin-bottom:8px;"><div class="tiny">Traducción</div>
      <div style="margin-top:4px;"><span class="hidden-pill">oculta</span></div></div>`;
  }
  if(hl<2){
    html+=`<div style="margin-bottom:8px;"><div class="tiny">Significado</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:2px;">${esc(w.definition||'—')}</div></div>`;
  }
  // Example with audio button
  html+=`<div><div class="tiny" style="margin-bottom:4px;">Ejemplo</div>
    <div class="example-row">
      <span class="example-text">"${esc(w.example||'—')}"</span>
      <button class="audio-btn" onclick="speak('${esc(w.example||w.word).replace(/'/g,"\\'")}','en',this)" title="Escuchar ejemplo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
      </button>
    </div></div></div>`;
  // Mastery
  const avgT=w.avgResponseTime;
  const speedL=avgT?avgT<=4?'⚡ Rápido':avgT<=9?'⏱ Normal':'🐢 Necesita repaso':'';
  html+=`<div class="card-sm">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="tiny">${speedL}</span>
      <span style="font-size:13px;font-weight:600;color:${msCol}">${score}/10</span>
    </div>
    <div class="mastery-bar"><div class="mastery-fill" style="width:${score*10}%;background:${msCol};"></div></div>
    <div class="tiny" style="margin-top:4px;">Vista ${w.apps||0} ${(w.apps||0)===1?'vez':'veces'}</div>
  </div>`;
  document.getElementById('flash-content').innerHTML=html;
  const fc = document.getElementById('flash-content');
  fc.classList.remove('flashcard-enter');
  void fc.offsetWidth; // reflow → reinicia animación
  fc.classList.add('flashcard-enter');
  document.getElementById('flash-content').scrollTop=0;
  loadImageInto(w.word,'flash-img-wrap','flash-img');
}
function hintLevel(w){
  if((w.apps||0)===0)return 0;
  if((w.apps||0)>=6&&ms(w)>=7)return 2;
  if((w.apps||0)>=3&&ms(w)>=5)return 1;
  return 0;
}
function rate(r){
  if(sessionIdx>=sessionQueue.length)return;
  const w=db.words.find(x=>x.id===sessionQueue[sessionIdx].id);
  if(w)applyRating(w,r,null);
  if(r<=2){sessionStats.bad++;const ri=Math.min(sessionIdx+(r===1?2:3),sessionQueue.length);sessionQueue.splice(ri,0,{...sessionQueue[sessionIdx]});}
  else sessionStats.good++;
  sessionIdx++;renderFlashcard();
}
function finishSession(){
  const today=dayStr(new Date());
  if(db.lastStudyDate!==today){
    const diff=db.lastStudyDate?daysDiff(db.lastStudyDate,today):999;
    db.streak=diff===1?(db.streak||0)+1:1;
    db.lastStudyDate=today;db.totalSessions=(db.totalSessions||0)+1;persist();
  }
  sessionQueue=[];
  document.getElementById('complete-msg').innerHTML=
    `${sessionStats.good} correctas · ${sessionStats.bad} repasadas<br>
    Racha: <span style="color:var(--amber-l);font-weight:600;">${db.streak} días</span>`;
  showStudyView('complete');
}

// ══════════════════════════════════════════════════
//  GAME
// ══════════════════════════════════════════════════
function initGameSetup(){
  stopTimer();showGameView('setup');
  const el=db.words.filter(w=>(w.apps||0)>0&&(w.translation||w.definition));
  document.getElementById('game-eligible-count').textContent=
    el.length>=4?`${el.length} palabras disponibles`:'Necesitas al menos 4 palabras estudiadas';
  const btn=document.getElementById('game-start-btn');
  btn.disabled=el.length<4;
  btn.textContent=el.length>=4?'Comenzar juego →':'Estudia más palabras primero';
}
function setDiff(d,el){
  gameDiff=d;
  document.querySelectorAll('#diff-selector .diff-btn').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
}
function setMode(n,el){
  gameWordCount=n;
  document.getElementById('mode-10').classList.remove('sel');
  document.getElementById('mode-20').classList.remove('sel');
  el.classList.add('sel');
}
function showGameView(v){
  document.getElementById('game-setup').style.display=v==='setup'?'flex':'none';
  document.getElementById('game-play').style.display=v==='play'?'flex':'none';
  document.getElementById('game-results').style.display=v==='results'?'flex':'none';
}
function startGame(){
  const cfg=DIFF_CONFIG[gameDiff];
  let pool=db.words.filter(w=>(w.apps||0)>0&&(w.translation||w.definition));
  if(gameDiff==='hard')pool.sort((a,b)=>ms(a)-ms(b));
  else pool=shuffle(pool);
  gameQueue=pool.slice(0,gameWordCount);
  gameIdx=0;gameScore=0;gameResults=[];
  showGameView('play');renderGameQuestion();
}
function renderGameQuestion(){
  if(gameIdx>=gameQueue.length){finishGame();return;}
  gameAnswered=false;
  const cfg=DIFF_CONFIG[gameDiff],w=gameQueue[gameIdx];
  document.getElementById('gp-counter').textContent=`${gameIdx+1} / ${gameQueue.length}`;
  document.getElementById('gp-score').textContent=`${gameScore} pts`;
  const pool=db.words.filter(x=>x.id!==w.id&&(x.translation||x.definition));
  const wrongs=shuffle([...pool]).slice(0,3);
  const choices=shuffle([w,...wrongs]);
  let questionLabel='',optionFn;
  if(cfg.qType==='translation'){
    questionLabel='¿Cuál es la traducción?';
    optionFn=c=>`<strong>${esc(c.translation||c.word)}</strong>`;
  }else if(cfg.qType==='meaning'){
    questionLabel='¿Qué significa esta palabra?';
    optionFn=c=>{
      const tr=c.translation?`<span style="color:var(--amber-l);font-weight:600;">${esc(c.translation)}</span><br>`:'';
      const def=c.definition?`<span style="font-size:11px;color:var(--text2);">${esc(c.definition.substring(0,55))}${c.definition.length>55?'…':''}</span>`:'';
      return tr+def;
    };
  }else{
    questionLabel='¿A qué palabra corresponde esta definición?';
    optionFn=c=>`<strong>${esc(c.word)}</strong>`;
  }
  timerStart=Date.now();
  startTimer(cfg.time,()=>{autoFail(w.id);});
  let html=`<div class="card" style="text-align:center;padding:18px 14px;margin-bottom:8px;">`;
  if(cfg.qType==='definition'){
    html+=`<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:8px;">${esc(w.definition||'—')}</div>`;
    if(w.example)html+=`<div style="font-size:11px;font-style:italic;color:var(--text3);">"${esc(w.example.substring(0,80))}"</div>`;
  }else{
    html+=`<div class="game-word-big">${esc(w.word)}</div>`;
    if(w.cefr)html+=`<span class="cefr cefr-${w.cefr.toLowerCase()}" style="margin-top:8px;display:inline-block;">${w.cefr}</span>`;
    if(cfg.qType==='medium'&&w.ipa)html+=`<div style="color:var(--text3);font-size:12px;margin-top:4px;">${esc(w.ipa)}</div>`;
  }
  html+=`<div class="muted" style="margin-top:8px;font-size:12px;">${questionLabel}</div></div>`;
  html+=`<div class="choices" id="game-choices">
    ${choices.map(c=>`<div class="choice" onclick="gameChoice(this,'${c.id}','${w.id}')">${optionFn(c)}</div>`).join('')}
  </div>`;
  if(gameDiff==='easy'&&w.avgResponseTime){
    const prev=w.avgResponseTime;
    const hc=prev<=4?'var(--teal-l)':prev<=9?'var(--amber-l)':'#F0997B';
    html+=`<div class="card-sm" style="margin-bottom:8px;"><div class="tiny">Tiempo anterior: <span style="color:${hc};font-weight:600;">${prev}s</span></div></div>`;
  }
  document.getElementById('game-play-content').innerHTML=html;
  document.getElementById('game-play-content').scrollTop=0;
}
function gameChoice(el,chosenId,correctId){
  if(gameAnswered)return;
  gameAnswered=true;stopTimer();
  const elapsed=Math.round((Date.now()-timerStart)/100)/10;
  const correct=chosenId===correctId;
  document.querySelectorAll('#game-choices .choice').forEach(c=>{
    const m=c.getAttribute('onclick').match(/'([^']+)','[^']+'/);
    if(m&&m[1]===correctId)c.classList.add('correct');
  });
  if(!correct)el.classList.add('wrong');
  const w=db.words.find(x=>x.id===correctId);
  const cfg=DIFF_CONFIG[gameDiff];
  const pts=correct?Math.max(5,Math.round(10+(cfg.time-elapsed)*2)):0;
  if(correct)gameScore+=pts;
  if(w){
    w.masteryScore=correct?Math.min(10,(w.masteryScore||1)+0.3):Math.max(1,(w.masteryScore||1)-0.3);
    const prev=w.avgResponseTime||elapsed;
    w.avgResponseTime=Math.round((prev*0.6+elapsed*0.4)*10)/10;
    persist();
  }
  gameResults.push({word:gameQueue[gameIdx].word,correct,elapsed,pts});
  gameIdx++;
  setTimeout(renderGameQuestion,correct?850:1300);
}
function autoFail(correctId){
  if(gameAnswered)return;
  gameAnswered=true;
  document.querySelectorAll('#game-choices .choice').forEach(c=>{
    const m=c.getAttribute('onclick').match(/'([^']+)','[^']+'/);
    if(m&&m[1]===correctId)c.classList.add('correct');
  });
  const w=db.words.find(x=>x.id===correctId);
  if(w){w.masteryScore=Math.max(1,(w.masteryScore||1)-0.4);persist();}
  gameResults.push({word:gameQueue[gameIdx].word,correct:false,elapsed:DIFF_CONFIG[gameDiff].time,pts:0});
  gameIdx++;setTimeout(renderGameQuestion,1300);
}
function finishGame(){
  stopTimer();
  db.totalGames=(db.totalGames||0)+1;persist();
  const cc=gameResults.filter(r=>r.correct).length;
  const avgT=Math.round(gameResults.reduce((a,r)=>a+r.elapsed,0)/gameResults.length*10)/10;
  document.getElementById('res-correct').textContent=`${cc}/${gameResults.length}`;
  document.getElementById('res-score').textContent=gameScore;
  document.getElementById('res-avgtime').textContent=`${avgT}s`;
  const pct=Math.round(cc/gameResults.length*100);
  const emoji=pct>=90?'🏆':pct>=70?'🎯':pct>=50?'👍':'💪';
  document.getElementById('results-sub').textContent=`${emoji} ${pct}% precisión · ${DIFF_CONFIG[gameDiff].label}`;
  document.getElementById('results-detail').innerHTML=gameResults.map(r=>{
    const sc=r.elapsed<=4?'var(--teal-l)':r.elapsed<=9?'var(--amber-l)':'#F0997B';
    const sn=r.elapsed<=4?'Rápido':r.elapsed<=9?'Normal':'Lento';
    return `<div class="result-row">
      <span style="font-weight:500;">${esc(r.word)}</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:${sc};">${r.elapsed}s·${sn}</span>
        <span style="${r.correct?'color:var(--teal-l)':'color:#F0997B'}">${r.correct?`+${r.pts}`:'✕'}</span>
      </div>
    </div>`;
  }).join('');
  showGameView('results');
}

// ══════════════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════════════
function startTimer(seconds,onExpire){
  stopTimer();
  const ring=document.getElementById('timer-ring');
  const txt=document.getElementById('timer-txt');
  const circ=2*Math.PI*16;
  ring.setAttribute('stroke-dasharray',circ);
  ring.setAttribute('stroke','var(--amber)');
  let remaining=seconds;
  const update=()=>{
    const frac=remaining/seconds;
    ring.setAttribute('stroke-dashoffset',circ*(1-frac));
    ring.setAttribute('stroke',frac>0.5?'var(--amber)':frac>0.25?'#EF9F27':'var(--red)');
    txt.textContent=Math.ceil(remaining);
    txt.setAttribute('fill',frac>0.5?'var(--amber-l)':frac>0.25?'#EF9F27':'#F0997B');
    if(remaining<=0){stopTimer();onExpire();return;}
    remaining=Math.round((remaining-0.1)*10)/10;
  };
  update();
  timerInterval=setInterval(update,100);
}
function stopTimer(){
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  const ring=document.getElementById('timer-ring');
  if(ring)ring.setAttribute('stroke','var(--border)');
  const txt=document.getElementById('timer-txt');
  if(txt)txt.textContent='—';
}

// ══════════════════════════════════════════════════
//  VOCAB
// ══════════════════════════════════════════════════
function setVocabTab(type,val,el){
  vocabFilters[type]=val;
  const rid=type==='status'?0:type==='cefr'?1:2;
  document.querySelectorAll('.vtab-row')[rid].querySelectorAll('.vtab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderVocab();
}
function renderVocab(){
  const q=(document.getElementById('vocab-search')?.value||'').toLowerCase();
  let words=[...db.words];
  if(q)words=words.filter(w=>w.word.toLowerCase().includes(q)||(w.translation||'').toLowerCase().includes(q));
  if(vocabFilters.status==='new')words=words.filter(w=>(w.apps||0)===0);
  else if(vocabFilters.status==='hard')words=words.filter(w=>ms(w)<=3);
  else if(vocabFilters.status==='review')words=words.filter(w=>isDue(w)&&(w.apps||0)>0);
  else if(vocabFilters.status==='mastered')words=words.filter(w=>ms(w)>=9);
  if(vocabFilters.cefr!=='all')words=words.filter(w=>w.cefr===vocabFilters.cefr);
  if(vocabFilters.cat!=='all')words=words.filter(w=>w.category===vocabFilters.cat);
  words.sort((a,b)=>{const ad=isDue(a),bd=isDue(b);if(ad&&!bd)return -1;if(!ad&&bd)return 1;return ms(a)-ms(b);});
  document.getElementById('vocab-count').textContent=`${db.words.length} palabras`;
  const list=document.getElementById('vocab-list');
  if(!words.length){
    list.innerHTML=db.words.length===0
      ?`<div class="empty">Toca <strong style="color:var(--amber)">+</strong> o ve a <strong style="color:var(--amber)">Explorar</strong> para agregar tu primera palabra.</div>`
      :`<div class="empty">Sin palabras para este filtro.</div>`;
    return;
  }
  list.innerHTML=words.map(w=>{
    const score=ms(w);
    const dot=score>=9?'var(--teal)':score>=6?'var(--amber)':score>=3?'#F0997B':'var(--blue)';
    const col=score>=8?'var(--teal-l)':score>=5?'var(--amber-l)':'#F0997B';
    const avgT=w.avgResponseTime;
    const si=avgT?avgT<=4?'⚡':avgT<=9?'':' 🐢':'';
    return `<div class="word-row" onclick="showDetail('${w.id}')">
      <div class="word-dot" style="background:${dot};"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:500;">${esc(w.word)}${si?`<span style="font-size:11px;"> ${si}</span>`:''}</div>
        <div class="tiny">${[w.partOfSpeech,w.cefr,w.category&&w.category!=='General'?w.category:''].filter(Boolean).join(' · ')}</div>
      </div>
      <span style="font-size:13px;font-weight:600;color:${col};margin-left:8px;">${score}/10</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════
//  EXPLORE  (Suggested Words)
// ══════════════════════════════════════════════════

function setExploreLevel(lvl, el){
  exploreLevel = lvl; explorePage = 0;
  document.querySelectorAll('#explore-tabs .vtab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderExplore();
}
function setExploreCat(cat, el){
  exploreCat = cat; explorePage = 0;
  document.querySelectorAll('#explore-cat-tabs .vtab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderExplore();
}

async function renderExplore(){
  if (!LIB_READY) {
    document.getElementById('explore-list').innerHTML =
      '<div class="empty" style="padding-top:40px;"><div class="spinner" style="margin:0 auto 12px;"></div>Cargando biblioteca de palabras…</div>';
    return;
  }
  const q = (document.getElementById('explore-search')?.value||'').toLowerCase().trim();
  const addedSet = new Set(db.words.map(w=>w.word.toLowerCase()));
  
  let words = LIB;
  if(exploreLevel!=='all') words = words.filter(e=>CEFR_CODES[e.l]===exploreLevel);
  if(exploreCat!=='all')   words = words.filter(e=>CAT_NAMES[e.c]===exploreCat);
  if(q) words = words.filter(e=>e.w.includes(q)||e.t.toLowerCase().includes(q));

  const total = words.length;
  const added = words.filter(e=>addedSet.has(e.w)).length;
  const page  = words.slice(0, (explorePage+1)*PAGE_SIZE);

  // Stats bar
  const statsHtml = `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px 8px;">
    <span class="tiny">${total} palabras · ${added} en tu mazo</span>
    <span class="tiny" style="color:var(--amber-l);">${Math.round(added/Math.max(total,1)*100)}% agregadas</span>
  </div>`;

  const listHtml = page.map(entry=>{
    const isAdded = addedSet.has(entry.w);
    const cefrCode = CEFR_CODES[entry.l];
    const catLabel = CAT_LABELS[entry.c];
    return `<div class="sug-word-card ${isAdded?'added':''}">
      <div style="text-align:center;flex-shrink:0;">
        <span class="cefr cefr-${cefrCode.toLowerCase()}">${cefrCode}</span>
        <div class="tiny" style="margin-top:3px;max-width:56px;line-height:1.2;">${catLabel}</div>
      </div>
      <div class="sug-word-info">
        <div class="sug-word-name">${esc(entry.w)}</div>
        <div class="sug-word-tr">${esc(entry.t)}</div>
        <div class="sug-word-meta">${entry.p==='v'?'verbo':entry.p==='n'?'sustantivo':entry.p==='a'?'adjetivo':entry.p==='d'?'adverbio':'palabra'}</div>
      </div>
      <button class="sug-add-btn ${isAdded?'done':'add'}"
        onclick="handleAddWord(this, '${esc(entry.w)}')"
        ${isAdded?'disabled':''}>${isAdded?'✓':'+'}</button>
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
function handleAddWord(btn, word){
  // 1. Guardar palabra
  addSuggestedWord(word);

  const card = btn.closest('.sug-word-card');

  // 2. Feedback inmediato en botón
  btn.textContent = '✓';
  btn.classList.remove('add');
  btn.classList.add('done');

  // 3. Feedback visual en tarjeta
  card.classList.add('added');

  // 4. Animación "pop"
  card.style.transform = 'scale(1.03)';
  setTimeout(()=>{
    card.style.transform = 'scale(1)';
  }, 120);

  // 5. Desaparecer suavemente
  setTimeout(()=>{
    card.style.transition = 'all .25s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';
  }, 200);

  // 6. Eliminar del DOM
  setTimeout(()=>{
    card.remove();
  }, 450);
}

function addSuggestedWord(wordStr){
  const entry = LIB.find(e=>e.w===wordStr);
  if(!entry || db.words.some(w=>w.word===wordStr)) return;
  db.words.push({
    id: Date.now().toString()+Math.random().toString(36).slice(2),
    word: entry.w, translation: entry.t,
    definition:entry.d, ipa: '', example: entry.e,
    partOfSpeech: entry.p==='v'?'verb':entry.p==='n'?'noun':entry.p==='a'?'adjective':entry.p==='d'?'adverb':'word',
    cefr: CEFR_CODES[entry.l], freq: estimateFreq(entry.w),
    category: CAT_NAMES[entry.c],
    masteryScore:1, apps:0, interval:1, easeFactor:2.5,
    nextReview: new Date().toISOString()
  });
  persist(); renderExplore(); refreshHome();
  // FAB feedback
  const fab=document.getElementById('fab');
  fab.textContent='✓'; fab.style.background='var(--teal)';
  setTimeout(()=>{ fab.textContent='+'; fab.style.background='var(--amber)'; }, 1400);
  showToast(`"${entry.w}" agregada ✓`);
}


// ══════════════════════════════════════════════════
//  WORD DETAIL
// ══════════════════════════════════════════════════
function showDetail(id){
  const w=db.words.find(x=>x.id===id);if(!w)return;
  const score=ms(w);
  const col=score>=8?'var(--teal-l)':score>=5?'var(--amber-l)':'#F0997B';
  const nextR=w.nextReview?new Date(w.nextReview).toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'pendiente';
  const avgT=w.avgResponseTime;
  const speedL=avgT?avgT<=4?`⚡ Rápido (${avgT}s)`:avgT<=9?`⏱ Normal (${avgT}s)`:`🐢 Necesita repaso (${avgT}s)`:'Sin historial de tiempo';
  document.getElementById('detail-body').innerHTML=`
    <div class="handle"></div>
    <div id="word-img-wrap" style="display:none;margin-bottom:10px;">
      <img id="word-img" class="word-img" src="" alt="${esc(w.word)}" onerror="this.parentElement.style.display='none'">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
      <div>
        <div style="font-size:32px;font-weight:700;">${esc(w.word)}</div>
        <div style="color:var(--amber);font-size:12px;font-weight:500;">${esc(w.partOfSpeech||'')}</div>
      </div>
      <div style="text-align:right;">
        ${w.cefr?`<span class="cefr cefr-${w.cefr.toLowerCase()}" style="padding:4px 10px;font-size:12px;">${w.cefr}</span>`:''}
        ${w.category&&w.category!=='General'?`<div class="tiny" style="margin-top:3px;">${w.category}</div>`:''}
      </div>
    </div>
    ${w.ipa?`<div class="ipa-row" style="margin-bottom:12px;">
      <span style="flex:1;color:var(--text2);font-size:13px;">${esc(w.ipa)}</span>
      <button class="play-btn" onclick="speak('${esc(w.word)}','en',this)">▶</button></div>`:''}
    <div style="margin-bottom:10px;"><div class="tiny">Traducción</div>
      <div style="color:var(--amber-l);font-weight:500;font-size:14px;margin-top:2px;">${esc(w.translation||'—')}</div></div>
    <div style="margin-bottom:10px;"><div class="tiny">Significado</div>
      <div style="color:var(--text2);font-size:13px;line-height:1.6;">${esc(w.definition||'—')}</div></div>
    <div style="margin-bottom:12px;"><div class="tiny" style="margin-bottom:4px;">Ejemplo</div>
      <div class="example-row">
        <span class="example-text">"${esc(w.example||'—')}"</span>
        <button class="audio-btn" onclick="speak('${esc(w.example||w.word).replace(/'/g,"\\'")}','en',this)" title="Escuchar ejemplo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
        </button>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
      <div class="tiny">Dominio</div>
      <span style="font-size:13px;font-weight:600;color:${col}">${score}/10</span>
    </div>
    <div class="mastery-bar"><div class="mastery-fill" style="width:${score*10}%;background:${col};"></div></div>
    <div class="tiny" style="margin-top:4px;">${w.apps||0} apariciones · próxima: ${nextR}</div>
    <div class="tiny" style="margin-top:3px;">${speedL}</div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="closeDetail()">Cerrar</button>
      <button class="btn" style="flex:1;background:#2d1515;border:0.5px solid #993C1D;color:#F0997B;" onclick="deleteWord('${w.id}')">Eliminar</button>
    </div>`;
  document.getElementById('detail-overlay').classList.add('open');
  loadImageInto(w.word,'word-img-wrap','word-img');
}
function closeDetail(){document.getElementById('detail-overlay').classList.remove('open');}
function deleteWord(id){
  if(!confirm('¿Eliminar esta palabra?'))return;
  db.words=db.words.filter(w=>w.id!==id);persist();
  closeDetail();renderVocab();refreshHome();
}

// ══════════════════════════════════════════════════
//  ADD WORD
// ══════════════════════════════════════════════════
function openAddWord(){
  document.getElementById('new-word').value='';
  document.getElementById('new-ctx').value='';
  document.getElementById('new-cat').value='General';
  resetAddModal();
  document.getElementById('add-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('new-word').focus(),200);
}
function closeAddModal(){document.getElementById('add-overlay').classList.remove('open');}
function resetAddModal(){
  document.getElementById('add-preview').style.display='none';
  document.getElementById('add-error').style.display='none';
  document.getElementById('add-loading').style.display='none';
  document.getElementById('add-actions').style.display='flex';
  document.getElementById('save-actions').style.display='none';
  pendingCard=null;
}

// Smart example sentence generator (no API needed)
function generateExample(word,pos,ctx){
  if(ctx&&ctx.length>10)return ctx;
  const templates={
    verb:[
      `She decided to ${word} everything carefully before making a decision.`,
      `They managed to ${word} together despite the challenges.`,
      `He always tries to ${word} in the most efficient way possible.`,
      `It is important to ${word} regularly if you want to improve.`
    ],
    noun:[
      `The ${word} played a crucial role in the outcome of the situation.`,
      `She studied the ${word} carefully to understand it better.`,
      `Having a good ${word} makes a big difference in daily life.`,
      `He explained the concept of ${word} to his colleagues.`
    ],
    adjective:[
      `The results were truly ${word} and exceeded all expectations.`,
      `She felt ${word} about the situation after hearing the news.`,
      `It was a ${word} experience that changed her perspective completely.`,
      `His approach to the problem was remarkably ${word}.`
    ],
    adverb:[
      `She ${word} finished the task before the deadline.`,
      `He spoke ${word} and everyone understood his point.`,
      `They ${word} agreed on the best course of action.`,
      `The team worked ${word} to complete the project on time.`
    ]
  };
  const t=templates[pos]||templates.noun;
  return t[Math.floor(Math.random()*t.length)];
}

async function generateCard(){
  const word=document.getElementById('new-word').value.trim().toLowerCase();
  if(!word){alert('Escribe una palabra primero.');return;}
  if(db.words.find(w=>w.word.toLowerCase()===word)){
    showAddError(`"${word}" ya está en tu vocabulario.`);return;
  }
  const ctx=document.getElementById('new-ctx').value.trim();
  const cat=document.getElementById('new-cat').value;
  document.getElementById('add-loading').style.display='block';
  document.getElementById('add-preview').style.display='none';
  document.getElementById('add-error').style.display='none';
  document.getElementById('add-actions').style.display='none';
  document.getElementById('save-actions').style.display='none';

  // ── 1. Check local library first (fast, offline) ─────────────────
  const libEntry=LIB_READY?LIB.find(e=>e.w===word):null;

  // ── 2. Try dictionary API (may fail on Android WebView / offline) ─
  let definition='',ipa='',example='',partOfSpeech='word';
  let apiOnline=false;
  try{
    const dictRes=await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {method:'GET'},8000);
    if(dictRes.ok){
      apiOnline=true;
      const data=await dictRes.json();
      const entry=data[0];
      const phonetic=entry.phonetics?.find(p=>p.text)||{};
      ipa=phonetic.text||'';
      const meaning=entry.meanings?.[0];
      if(meaning){
        partOfSpeech=meaning.partOfSpeech||'word';
        const def=meaning.definitions?.[0];
        definition=def?.definition||'';
        example=def?.example||'';
      }
    }
  }catch(dictErr){
    console.warn('Dictionary API error:',dictErr.message);
  }

  // ── 3. Try translation API ───────────────────────────────────────
  let translation=libEntry?libEntry.t:'';
  if(!translation){
    try{
      const trRes=await fetchWithTimeout(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|es`,
        {method:'GET'},8000);
      if(trRes.ok){
        const trData=await trRes.json();
        const raw=(trData.responseData?.translatedText||'').trim();
        if(raw&&raw.toLowerCase()!==word.toLowerCase()&&
           raw.toUpperCase()!==raw&&
           !raw.includes('MYMEMORY')&&raw.length<=80){
          translation=raw;
        }
      }
    }catch(trErr){
      console.warn('MyMemory API error:',trErr.message);
    }
  }

  document.getElementById('add-loading').style.display='none';

  // ── 4. If still nothing usable, infer from LIB or bail ───────────
  if(!definition&&!translation&&!libEntry){
    showAddError(`No se encontró "${word}". Verifica la ortografía (solo palabras en inglés).`);
    document.getElementById('add-actions').style.display='flex';
    return;
  }

  // Fill in gaps with local data
  if(libEntry){
    if(!partOfSpeech||partOfSpeech==='word')
      partOfSpeech=libEntry.p==='v'?'verb':libEntry.p==='n'?'noun':libEntry.p==='a'?'adjective':libEntry.p==='d'?'adverb':'word';
  }
  example=example||generateExample(word,partOfSpeech,ctx);
  const cefr=libEntry?CEFR_CODES[libEntry.l]:estimateCEFR(word);
  const freq=estimateFreq(word);
  const offlineNote=!apiOnline?'<div style="font-size:11px;color:var(--amber-l);margin-bottom:8px;">⚠ Sin conexión — tarjeta generada sin definición en línea</div>':'';

  pendingCard={
    id:Date.now().toString(),word,
    translation:translation||'—',
    definition:definition||`The word "${word}".`,
    ipa,example,partOfSpeech,cefr,freq,category:cat,
    masteryScore:1,apps:0,interval:1,easeFactor:2.5,
    nextReview:new Date().toISOString()
  };

  document.getElementById('add-preview').style.display='block';
  document.getElementById('add-preview').innerHTML=`
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
      ${pendingCard.ipa?`<div class="ipa-row" style="margin-bottom:8px;">
        <span style="flex:1;color:var(--text2);font-size:13px;">${esc(pendingCard.ipa)}</span>
        <button class="play-btn" onclick="speak('${esc(pendingCard.word)}','en',this)">▶</button></div>`:''}
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
  document.getElementById('save-actions').style.display='flex';
  loadImageInto(pendingCard.word,'prev-img-wrap','prev-img');
}
function showAddError(msg){
  document.getElementById('add-error').style.display='';
  document.getElementById('add-error').textContent='⚠ '+msg;
  document.getElementById('add-loading').style.display='none';
}
function saveWord(){
  if(!pendingCard)return;
  db.words.push(pendingCard);persist();
  closeAddModal();refreshHome();renderVocab();
  const fab=document.getElementById('fab');
  fab.textContent='✓';fab.style.background='var(--teal)';
  setTimeout(()=>{fab.textContent='+';fab.style.background='var(--amber)';},1400);
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════
function openSettings(){
  document.getElementById('s-words').textContent=db.words.length;
  document.getElementById('s-sessions').textContent=db.totalSessions||0;
  document.getElementById('s-streak').textContent=(db.streak||0)+' días';
  document.getElementById('s-games').textContent=db.totalGames||0;
  // Inject notification section once
  if(!document.getElementById('notif-section')){
    const modal=document.querySelector('#settings-overlay .modal');
    const danger=modal?.querySelector('[style*="border-top"]');
    if(modal){
      const sec=document.createElement('div');
      sec.id='notif-section';
      sec.innerHTML=`
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
      if(danger)modal.insertBefore(sec,danger);else modal.appendChild(sec);
      // Toggle thumb visual
      document.getElementById('notif-enabled').addEventListener('change',function(){
        const on=this.checked;
        document.getElementById('notif-track').style.background=on?'var(--teal)':'var(--border)';
        document.getElementById('notif-thumb').style.transform=on?'translateX(18px)':'translateX(0)';
      });
    }
  }
  // Restore saved settings
  const enabled=localStorage.getItem('lexo_notif_enabled')==='true';
  const time=localStorage.getItem('lexo_notif_time')||'09:00';
  const cb=document.getElementById('notif-enabled');
  const ti=document.getElementById('notif-time');
  if(cb){
    cb.checked=enabled;
    document.getElementById('notif-track').style.background=enabled?'var(--teal)':'var(--border)';
    document.getElementById('notif-thumb').style.transform=enabled?'translateX(18px)':'translateX(0)';
  }
  if(ti)ti.value=time;
  document.getElementById('settings-overlay').classList.add('open');
}
function closeSettings(){document.getElementById('settings-overlay').classList.remove('open');}
function toggleNotif(enabled){
  localStorage.setItem('lexo_notif_enabled',enabled);
  const time=document.getElementById('notif-time')?.value||'09:00';
  if(enabled){
    const[h,m]=time.split(':').map(Number);
    scheduleNotif(h,m);
    showToast('Notificaciones activadas ✓');
  }else{
    cancelNotif();
    showToast('Notificaciones desactivadas');
  }
}
function updateNotifTime(){
  const time=document.getElementById('notif-time')?.value||'09:00';
  localStorage.setItem('lexo_notif_time',time);
  if(document.getElementById('notif-enabled')?.checked){
    const[h,m]=time.split(':').map(Number);
    scheduleNotif(h,m);
    showToast('Hora actualizada ✓');
  }
}
function scheduleNotif(hour,minute){
  if(window.NotificationBridge&&typeof NotificationBridge.scheduleDaily==='function'){
    try{NotificationBridge.scheduleDaily(hour,minute);}catch(e){}
  }
}
function cancelNotif(){
  if(window.NotificationBridge&&typeof NotificationBridge.cancelDaily==='function'){
    try{NotificationBridge.cancelDaily();}catch(e){}
  }
}
function resetApp(){
  if(!confirm('¿Borrar TODOS los datos? No se puede deshacer.'))return;
  localStorage.removeItem('lexo_db');location.reload();
}

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function estimateCEFR(w){
  const a1=['do','be','have','go','say','get','make','know','think','take','come','see','want','look','use','find','give','tell','work','call','ask','need','feel','try','leave','put','mean','keep','let','begin','show','hear','play','run','move','live','believe','hold','bring','happen','write','sit','stand','lose','pay','meet','set','learn','change','lead','understand','watch','follow','stop','create','speak','read','spend','grow','open','walk','win','offer','remember'];
  const lw=w.toLowerCase();
  if(a1.includes(lw)||w.length<=4)return 'A1';
  if(w.length<=6)return 'A2';
  if(w.length<=8)return 'B1';
  if(w.length<=10)return 'B2';
  if(w.length<=13)return 'C1';
  return 'C2';
}
function estimateFreq(w){
  const top=['the','be','to','of','and','a','in','that','have','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when'];
  const i=top.indexOf(w.toLowerCase());if(i>=0)return i+1;
  if(w.length<=4)return Math.floor(Math.random()*200)+50;
  if(w.length<=6)return Math.floor(Math.random()*800)+200;
  if(w.length<=9)return Math.floor(Math.random()*3000)+800;
  return Math.floor(Math.random()*8000)+3000;
}
function speak(text, lang, btn){
  lang = lang||'en';
  const setBtn=(on)=>{
    if(!btn)return;
    btn.disabled=!on; btn.style.opacity=on?'1':'0.45';
    btn.style.background=on?'':btn.style.background;
  };
  setBtn(false);

  // ── Android native TTS bridge (most reliable) ─────────────────────
  if(window.AndroidTTS && typeof AndroidTTS.speak==='function'){
    try{
      if(lang==='en') AndroidTTS.speak(text);
      else            AndroidTTS.speakEs(text);
      setTimeout(()=>setBtn(true), 500);
      return;
    }catch(e){ console.warn('AndroidTTS error:',e); }
  }

  // ── Web Speech API fallback (Chrome desktop, some WebViews) ───────
  if(!window.speechSynthesis){
    setBtn(true);
    showToast('Activa TTS en Ajustes → Accesibilidad → Texto a voz');
    return;
  }
  const doSpeak=()=>{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang=lang==='en'?'en-US':'es-ES'; u.rate=0.85; u.pitch=1;
    const voices=window.speechSynthesis.getVoices();
    if(voices.length){
      const pick=lang==='en'
        ?voices.find(v=>v.lang==='en-US'&&v.localService)
          ||voices.find(v=>v.lang.startsWith('en-')&&v.localService)
          ||voices.find(v=>v.lang.startsWith('en-'))
        :voices.find(v=>v.lang==='es-ES'&&v.localService)
          ||voices.find(v=>v.lang.startsWith('es-'));
      if(pick)u.voice=pick;
    }
    u.onstart=()=>{ if(btn){btn.style.background='var(--amber-d)';} };
    const reset=()=>setBtn(true);
    u.onend=reset; u.onerror=reset;
    window.speechSynthesis.speak(u);
  };
  const voices=window.speechSynthesis.getVoices();
  if(!voices.length){
    let done=false;
    window.speechSynthesis.onvoiceschanged=()=>{
      if(done)return; done=true;
      window.speechSynthesis.onvoiceschanged=null;
      doSpeak();
    };
    setTimeout(()=>{ if(!done){done=true;doSpeak();} },700);
  }else{ doSpeak(); }
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════
function showToast(msg){
  if(window.Android&&typeof Android.showToast==='function'){Android.showToast(msg);return;}
  let t=document.getElementById('lexo-toast');
  if(!t){
    t=document.createElement('div');t.id='lexo-toast';
    t.style.cssText='position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%) translateY(10px);background:#1e2433;border:0.5px solid var(--border);color:var(--text);font-size:13px;padding:9px 18px;border-radius:20px;z-index:200;opacity:0;transition:opacity .2s,transform .2s;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(t._tid);
  t._tid=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(10px)';},2200);
}

// ══════════════════════════════════════════════════
//  EVENTS & BOOT
// ══════════════════════════════════════════════════
['add-overlay','detail-overlay','settings-overlay'].forEach(id=>{
  document.getElementById(id).addEventListener('click',e=>{if(e.target.id===id)e.target.classList.remove('open');});
});
document.getElementById('new-word').addEventListener('keydown',e=>{if(e.key==='Enter')generateCard();});
init();
