'use strict';

/* ================= constants ================= */
const ROUND_SIZE = 10;
const VOICE_RATE = 0.7;
const UNIT_COLORS = ['#FF8A3D', '#5B7BD6', '#3BB273', '#E4573D', '#B266C9', '#E8B93D'];
const THEMES = [
  { id: 'sunset', name: 'Sunset', bg: '#FFF8EF', accent: '#FF8A3D', dark: '#D9642A' },
  { id: 'ocean',  name: 'Ocean',  bg: '#EEF5FF', accent: '#4A7DE2', dark: '#33589F' },
  { id: 'forest', name: 'Forest', bg: '#F0F7EC', accent: '#3BA55D', dark: '#2A7A44' },
  { id: 'berry',  name: 'Berry',  bg: '#FDF0F6', accent: '#D6569E', dark: '#A93A78' }
];

const SPEAKER_SVG = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#FFFFFF"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';

let UNITS = [];      // [{ name, words }]
let ALL_WORDS = [];

const state = {
  screen: 'home',
  queue: [],
  idx: 0,
  tries: 0,
  phase: 'listen',   // listen | wrong | reveal | correct
  results: [],       // 'first' | 'retry' | 'missed'
  lastPool: null,
  lastLabel: '',
  theme: (() => { try { return localStorage.getItem('spellquest_theme') || 'sunset'; } catch (e) { return 'sunset'; } })()
};

const appEl = document.getElementById('app');

/* ================= persistence ================= */
function loadStats() {
  try { return JSON.parse(localStorage.getItem('spellquest_progress_v1')) || {}; } catch (e) { return {}; }
}
function saveStat(word, firstTry) {
  const s = loadStats();
  const rec = s[word] || { seen: 0, firstTry: 0 };
  rec.seen += 1;
  if (firstTry) rec.firstTry += 1;
  s[word] = rec;
  try { localStorage.setItem('spellquest_progress_v1', JSON.stringify(s)); } catch (e) {}
}
function isMastered(word, stats) { const r = stats[word]; return !!r && r.firstTry >= 2; }

/* ================= sound effects (Web Audio) ================= */
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, t0, dur, type, vol) {
  const c = ctx(), o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.18, c.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
function sfxCorrect() { tone(523, 0, 0.15, 'triangle'); tone(659, 0.1, 0.15, 'triangle'); tone(784, 0.2, 0.3, 'triangle'); }
function sfxWrong() { tone(196, 0, 0.25, 'sawtooth', 0.08); tone(147, 0.12, 0.3, 'sawtooth', 0.08); }
function sfxDone() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle')); }

/* ================= word audio ================= */
let wordAudio = null;   // single reusable element so an iOS gesture-unlock persists
const mp3Ok = {};

function primeAudio() {
  ctx();
  if (!wordAudio) {
    wordAudio = new Audio();
    wordAudio.play().catch(() => {});   // unlock inside the user gesture
  }
}

function speak(word) {
  const btn = document.getElementById('speakerBtn');
  if (btn) {
    btn.classList.remove('speaking');
    void btn.offsetWidth;               // restart the bounce animation
    btn.classList.add('speaking');
    setTimeout(() => btn.classList.remove('speaking'), 950);
  }
  const key = word.toLowerCase().replace(/'/g, '');
  if (mp3Ok[key] === false) { tts(word); return; }
  if (!wordAudio) wordAudio = new Audio();
  wordAudio.src = 'audio/words/' + encodeURIComponent(key) + '.mp3';
  wordAudio.onerror = () => { mp3Ok[key] = false; tts(word); };
  wordAudio.play().then(() => { mp3Ok[key] = true; }).catch(() => { mp3Ok[key] = false; tts(word); });
}

function tts(word) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word.replace(/'/g, '’'));
  u.rate = VOICE_RATE;
  u.pitch = 1.05;
  const voices = speechSynthesis.getVoices();
  const pick = voices.find(v => /Samantha|Google US English|Aria|Jenny/i.test(v.name)) || voices.find(v => v.lang && v.lang.startsWith('en'));
  if (pick) u.voice = pick;
  speechSynthesis.speak(u);
}

/* ================= confetti ================= */
const confettiCanvas = document.getElementById('confetti');
let particles = [];
let rafId = null;

function burst() {
  const cv = confettiCanvas;
  const W = cv.width = cv.offsetWidth, H = cv.height = cv.offsetHeight;
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.45,
      vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10,
      s: 6 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: UNIT_COLORS[i % UNIT_COLORS.length], life: 90 + Math.random() * 40
    });
  }
  if (!rafId) tickConfetti();
}
function tickConfetti() {
  const cv = confettiCanvas;
  if (!particles.length) { rafId = null; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
  const c2d = cv.getContext('2d');
  c2d.clearRect(0, 0, cv.width, cv.height);
  particles = particles.filter(p => p.life > 0 && p.y < cv.height + 20);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += p.vr; p.life -= 1;
    c2d.save(); c2d.translate(p.x, p.y); c2d.rotate(p.r);
    c2d.fillStyle = p.c; c2d.globalAlpha = Math.min(1, p.life / 30);
    c2d.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
    c2d.restore();
  }
  rafId = requestAnimationFrame(tickConfetti);
}

/* ================= theming ================= */
function applyTheme() {
  const t = THEMES.find(x => x.id === state.theme) || THEMES[0];
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-dark', t.dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg);
}
function pickTheme(id) {
  state.theme = id;
  try { localStorage.setItem('spellquest_theme', id); } catch (e) {}
  applyTheme();
  render();
}

/* ================= game flow ================= */
function buildQueue(pool) {
  const stats = loadStats();
  const uniq = [...new Set(pool)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fresh = shuffle(uniq.filter(w => !isMastered(w, stats)));
  const done = shuffle(uniq.filter(w => isMastered(w, stats)));
  return fresh.concat(done).slice(0, Math.min(ROUND_SIZE, uniq.length));
}

function startRound(pool, label) {
  primeAudio();
  Object.assign(state, {
    screen: 'round', queue: buildQueue(pool), idx: 0, tries: 0,
    phase: 'listen', results: [], lastPool: pool, lastLabel: label
  });
  render();
  setTimeout(() => speak(state.queue[0]), 350);
}

function focusInput() {
  setTimeout(() => {
    const el = document.getElementById('spellInput');
    if (el) el.focus();
  }, 50);
}

function normalize(s) { return s.trim().toLowerCase().replace(/[‘’]/g, "'"); }

function check() {
  const input = document.getElementById('spellInput');
  if (!input) return;
  const typed = input.value;
  if (state.phase === 'correct' || !typed.trim()) { focusInput(); return; }
  const word = state.queue[state.idx];

  if (normalize(typed) === normalize(word)) {
    const firstTry = state.tries === 0 && state.phase !== 'reveal';
    if (state.phase !== 'reveal') saveStat(word, firstTry);
    state.results.push(state.phase === 'reveal' ? 'missed' : (firstTry ? 'first' : 'retry'));
    state.phase = 'correct';
    sfxCorrect();
    if (firstTry) burst();
    updateRound();
    setTimeout(nextWord, 1400);
  } else {
    state.tries += 1;
    sfxWrong();
    if (state.phase !== 'reveal' && state.tries >= 3) {
      saveStat(word, false);
      state.phase = 'reveal';
      input.value = '';
      setTimeout(() => speak(word), 400);
    } else if (state.phase !== 'reveal') {
      state.phase = 'wrong';
    }
    updateRound();
    shakeCard();
    focusInput();
  }
}

function nextWord() {
  if (state.idx + 1 >= state.queue.length) {
    state.screen = 'done';
    state.phase = 'listen';
    sfxDone();
    render();
    burst();
  } else {
    state.idx += 1;
    state.tries = 0;
    state.phase = 'listen';
    const input = document.getElementById('spellInput');
    if (input) input.value = '';
    updateRound();
    focusInput();
    setTimeout(() => speak(state.queue[state.idx]), 300);
  }
}

function goHome() {
  state.screen = 'home';
  render();
}

/* ================= rendering ================= */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function render() {
  appEl.innerHTML = '';
  if (state.screen === 'home') renderHome();
  else if (state.screen === 'words') renderWords();
  else if (state.screen === 'round') renderRound();
  else if (state.screen === 'done') renderDone();
}

/* ---------- home ---------- */
function renderHome() {
  const stats = loadStats();
  const masteredTotal = ALL_WORDS.filter(w => isMastered(w, stats)).length;
  const pct = ALL_WORDS.length ? Math.round(masteredTotal / ALL_WORDS.length * 100) : 0;

  const screen = el(`
    <div class="screen home">
      <a class="back-btn home-back" href="../">← Game Center</a>
      <div class="logo-wrap">
        <div class="logo">Spell <span class="quest">Quest</span></div>
        <div class="tagline">Letterland · 2nd Grade · ${ALL_WORDS.length} words</div>
      </div>
      <div class="card hero">
        <button class="play-btn" id="playAll">▶&nbsp; Play ${ROUND_SIZE} Words</button>
        <div class="theme-row">
          <span class="theme-label">Colors:</span>
        </div>
        <button class="mastery-btn" id="openWords">
          <div class="mastery-labels">
            <span>Words mastered <span class="see-list">see list →</span></span>
            <span class="count">${masteredTotal} / ${ALL_WORDS.length}</span>
          </div>
          <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
        </button>
      </div>
      <div>
        <div class="units-heading">Or practice a unit</div>
        <div class="unit-grid" id="unitGrid"></div>
      </div>
    </div>`);

  const themeRow = screen.querySelector('.theme-row');
  THEMES.forEach(t => {
    const b = el(`<button class="swatch${t.id === state.theme ? ' selected' : ''}" title="${t.name}" style="background:${t.accent};${t.id === state.theme ? `box-shadow:0 0 0 3px #FFFFFF, 0 0 0 6px ${t.accent};` : ''}"></button>`);
    b.addEventListener('click', () => pickTheme(t.id));
    themeRow.appendChild(b);
  });

  const grid = screen.querySelector('#unitGrid');
  UNITS.forEach((u, i) => {
    const uniq = [...new Set(u.words)];
    const mastered = uniq.filter(w => isMastered(w, stats)).length;
    const upct = Math.round(mastered / uniq.length * 100);
    const color = UNIT_COLORS[i % UNIT_COLORS.length];
    const cardBtn = el(`
      <button class="unit-card" style="box-shadow:0 5px 0 ${color}">
        <div class="unit-head">
          <span class="unit-num" style="background:${color}">${i + 1}</span>
          <span class="unit-name">${esc(u.name)}</span>
        </div>
        <div class="unit-progress">
          <div class="unit-track"><div class="unit-fill" style="width:${upct}%"></div></div>
          <span class="unit-count">${mastered}/${uniq.length}</span>
        </div>
      </button>`);
    cardBtn.addEventListener('click', () => startRound(u.words, 'Unit ' + (i + 1)));
    grid.appendChild(cardBtn);
  });

  screen.querySelector('#playAll').addEventListener('click', () => startRound(ALL_WORDS, 'Mixed round'));
  screen.querySelector('#openWords').addEventListener('click', () => { state.screen = 'words'; render(); });
  appEl.appendChild(screen);
}

/* ---------- word list ---------- */
function renderWords() {
  const stats = loadStats();
  const sorted = [...ALL_WORDS].sort();
  const mastered = sorted.filter(w => isMastered(w, stats));
  const learning = sorted.filter(w => !isMastered(w, stats));

  const screen = el(`
    <div class="screen words">
      <div class="words-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <div class="words-title">Word List</div>
      </div>
      <div class="card word-card">
        <div class="word-card-head">
          <span class="word-card-title mastered">★ Mastered</span>
          <span class="word-card-sub">${mastered.length} words</span>
        </div>
        ${mastered.length
          ? `<div class="chip-wrap">${mastered.map(w => `<span class="chip mastered">${esc(w)}</span>`).join('')}</div>`
          : '<div class="empty-note">No words mastered yet — spell a word right on the first try in two different rounds to master it!</div>'}
      </div>
      <div class="card word-card">
        <div class="word-card-head">
          <span class="word-card-title learning">Still practicing</span>
          <span class="word-card-sub">${learning.length} words · ◐ = halfway there</span>
        </div>
        <div class="chip-wrap">${learning.map(w => {
          const half = stats[w] && stats[w].firstTry === 1;
          return `<span class="chip learning${half ? ' half' : ''}">${esc(w)}${half ? ' ◐' : ''}</span>`;
        }).join('')}</div>
      </div>
    </div>`);

  screen.querySelector('#backBtn').addEventListener('click', goHome);
  appEl.appendChild(screen);
}

/* ---------- round ---------- */
function renderRound() {
  const screen = el(`
    <div class="screen round">
      <div class="round-bar">
        <button class="back-btn" id="quitBtn">← Quit</button>
        <div class="dots" id="dots"></div>
        <div class="stars" id="stars">★ 0</div>
      </div>
      <div class="card round-card" id="roundCard">
        <div class="round-context" id="roundContext"></div>
        <button class="speaker-btn" id="speakerBtn" title="Hear the word">${SPEAKER_SVG}</button>
        <button class="hear-again" id="hearAgain">Hear it again</button>
        <div class="reveal" id="revealBox" hidden>
          <div class="reveal-label">The word is</div>
          <div class="reveal-word" id="revealWord"></div>
          <div class="reveal-hint">Now type it!</div>
        </div>
        <form id="spellForm" style="width:100%;display:flex;justify-content:center;">
          <input class="spell-input" id="spellInput" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="type here…">
        </form>
        <div class="feedback" id="feedback"></div>
        <button class="check-btn" id="checkBtn">Check ✓</button>
      </div>
    </div>`);

  const dots = screen.querySelector('#dots');
  state.queue.forEach(() => dots.appendChild(el('<span class="dot"></span>')));

  screen.querySelector('#quitBtn').addEventListener('click', goHome);
  screen.querySelector('#speakerBtn').addEventListener('click', () => { primeAudio(); speak(state.queue[state.idx]); });
  screen.querySelector('#hearAgain').addEventListener('click', () => { primeAudio(); speak(state.queue[state.idx]); });
  screen.querySelector('#checkBtn').addEventListener('click', check);
  screen.querySelector('#spellForm').addEventListener('submit', e => { e.preventDefault(); check(); });

  appEl.appendChild(screen);
  updateRound();
  focusInput();
}

function updateRound() {
  const word = state.queue[state.idx] || '';

  document.getElementById('roundContext').textContent =
    `${state.lastLabel} · word ${state.idx + 1} of ${state.queue.length}`;

  document.querySelectorAll('#dots .dot').forEach((d, i) => {
    const r = state.results[i];
    d.style.background =
      r === 'first' ? '#3BB273' :
      r === 'retry' ? '#E8B93D' :
      r === 'missed' ? '#E4573D' :
      i === state.idx ? '#5B7BD6' : '#F0E7D8';
    d.style.transform = i === state.idx && !r ? 'scale(1.3)' : 'scale(1)';
  });

  document.getElementById('stars').textContent = '★ ' + state.results.filter(r => r === 'first').length;

  const revealBox = document.getElementById('revealBox');
  revealBox.hidden = state.phase !== 'reveal';
  document.getElementById('revealWord').textContent = word;

  const input = document.getElementById('spellInput');
  input.classList.toggle('wrong', state.phase === 'wrong');
  input.classList.toggle('correct', state.phase === 'correct');

  const fb = document.getElementById('feedback');
  const feedback = {
    listen: ['', '#8A93AC'],
    wrong: [state.tries >= 2 ? 'One more try — listen again!' : 'Not quite — try again!', '#E4573D'],
    reveal: ['Copy the word above', '#8A93AC'],
    correct: ['★ Awesome! ★', '#3BB273']
  }[state.phase];
  fb.textContent = feedback[0];
  fb.style.color = feedback[1];
}

function shakeCard() {
  const card = document.getElementById('roundCard');
  if (!card) return;
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

/* ---------- done ---------- */
function renderDone() {
  const stars = state.results.filter(r => r === 'first').length;
  const solved = state.results.filter(r => r !== 'missed').length;
  const trophy = stars >= Math.max(1, state.queue.length - 2);

  const screen = el(`
    <div class="screen done">
      <div class="done-badge">${trophy ? '🏆' : '⭐'}</div>
      <div class="done-title">${trophy ? 'Super Speller!' : 'Great job!'}</div>
      <div class="card done-stats">
        <div><div class="stat-num first">${stars}</div><div class="stat-label">FIRST TRY</div></div>
        <div><div class="stat-num solved">${solved}</div><div class="stat-label">SPELLED</div></div>
        <div><div class="stat-num total">${state.queue.length}</div><div class="stat-label">WORDS</div></div>
      </div>
      <div class="done-actions">
        <button class="done-btn again" id="againBtn">Play again</button>
        <button class="done-btn home" id="homeBtn">Home</button>
      </div>
    </div>`);

  screen.querySelector('#againBtn').addEventListener('click', () => startRound(state.lastPool || ALL_WORDS, state.lastLabel || 'Mixed round'));
  screen.querySelector('#homeBtn').addEventListener('click', goHome);
  appEl.appendChild(screen);
}

/* ================= bootstrap ================= */
async function init() {
  applyTheme();
  const res = await fetch('word-list.json');
  UNITS = (await res.json()).map(u => ({ name: u.name, words: u.words }));
  ALL_WORDS = [...new Set(UNITS.flatMap(u => u.words))];
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
