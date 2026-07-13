'use strict';

/* ================= constants ================= */
const ROUND_SIZE = 10;
const MAX_TABLE = 12;
const UNIT_COLORS = ['#FF8A3D', '#5B7BD6', '#3BB273', '#E4573D', '#B266C9', '#E8B93D'];
const THEMES = [
  { id: 'sunset', name: 'Sunset', bg: '#FFF8EF', accent: '#FF8A3D', dark: '#D9642A' },
  { id: 'ocean',  name: 'Ocean',  bg: '#EEF5FF', accent: '#4A7DE2', dark: '#33589F' },
  { id: 'forest', name: 'Forest', bg: '#F0F7EC', accent: '#3BA55D', dark: '#2A7A44' },
  { id: 'berry',  name: 'Berry',  bg: '#FDF0F6', accent: '#D6569E', dark: '#A93A78' }
];

/* facts are keyed "a×b" — unit a covers a×1 … a×12 */
const UNITS = [];
for (let a = 1; a <= MAX_TABLE; a++) {
  const facts = [];
  for (let b = 1; b <= MAX_TABLE; b++) facts.push(a + '×' + b);
  UNITS.push({ name: '×' + a + ' table', facts });
}
const ALL_FACTS = UNITS.flatMap(u => u.facts);

function factParts(key) { const [a, b] = key.split('×').map(Number); return { a, b, answer: a * b }; }

const state = {
  screen: 'home',
  queue: [],
  idx: 0,
  tries: 0,
  phase: 'answer',   // answer | wrong | reveal | correct
  input: '',
  results: [],       // 'first' | 'retry' | 'missed'
  lastPool: null,
  lastLabel: '',
  theme: (() => { try { return localStorage.getItem('timesquest_theme') || 'sunset'; } catch (e) { return 'sunset'; } })()
};

const appEl = document.getElementById('app');

/* ================= persistence ================= */
function loadStats() {
  try { return JSON.parse(localStorage.getItem('timesquest_progress_v1')) || {}; } catch (e) { return {}; }
}
function saveStat(fact, firstTry) {
  const s = loadStats();
  const rec = s[fact] || { seen: 0, firstTry: 0 };
  rec.seen += 1;
  if (firstTry) rec.firstTry += 1;
  s[fact] = rec;
  try { localStorage.setItem('timesquest_progress_v1', JSON.stringify(s)); } catch (e) {}
}
function isMastered(fact, stats) { const r = stats[fact]; return !!r && r.firstTry >= 2; }

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
function sfxTap() { tone(880, 0, 0.05, 'sine', 0.06); }

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
  try { localStorage.setItem('timesquest_theme', id); } catch (e) {}
  applyTheme();
  render();
}

/* ================= game flow ================= */
function buildQueue(pool) {
  const stats = loadStats();
  const uniq = [...new Set(pool)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fresh = shuffle(uniq.filter(f => !isMastered(f, stats)));
  const done = shuffle(uniq.filter(f => isMastered(f, stats)));
  return fresh.concat(done).slice(0, Math.min(ROUND_SIZE, uniq.length));
}

function startRound(pool, label) {
  ctx();
  Object.assign(state, {
    screen: 'round', queue: buildQueue(pool), idx: 0, tries: 0,
    phase: 'answer', input: '', results: [], lastPool: pool, lastLabel: label
  });
  render();
}

function pressKey(k) {
  if (state.phase === 'correct') return;
  if (k === 'back') {
    state.input = state.input.slice(0, -1);
  } else if (state.input.length < 3) {
    state.input += k;
    sfxTap();
  }
  if (state.phase === 'wrong') state.phase = 'answer';
  updateRound();
}

function check() {
  if (state.phase === 'correct' || !state.input) return;
  const fact = state.queue[state.idx];
  const { answer } = factParts(fact);

  if (parseInt(state.input, 10) === answer) {
    const firstTry = state.tries === 0 && state.phase !== 'reveal';
    if (state.phase !== 'reveal') saveStat(fact, firstTry);
    state.results.push(state.phase === 'reveal' ? 'missed' : (firstTry ? 'first' : 'retry'));
    state.phase = 'correct';
    sfxCorrect();
    if (firstTry) burst();
    updateRound();
    setTimeout(nextFact, 1400);
  } else {
    state.tries += 1;
    sfxWrong();
    state.input = '';
    if (state.phase !== 'reveal' && state.tries >= 3) {
      saveStat(fact, false);
      state.phase = 'reveal';
    } else if (state.phase !== 'reveal') {
      state.phase = 'wrong';
    }
    updateRound();
    shakeCard();
  }
}

function nextFact() {
  if (state.idx + 1 >= state.queue.length) {
    state.screen = 'done';
    state.phase = 'answer';
    sfxDone();
    render();
    burst();
  } else {
    state.idx += 1;
    state.tries = 0;
    state.phase = 'answer';
    state.input = '';
    updateRound();
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

function render() {
  appEl.innerHTML = '';
  if (state.screen === 'home') renderHome();
  else if (state.screen === 'facts') renderFacts();
  else if (state.screen === 'round') renderRound();
  else if (state.screen === 'done') renderDone();
}

/* ---------- home ---------- */
function renderHome() {
  const stats = loadStats();
  const masteredTotal = ALL_FACTS.filter(f => isMastered(f, stats)).length;
  const pct = Math.round(masteredTotal / ALL_FACTS.length * 100);

  const screen = el(`
    <div class="screen home">
      <a class="back-btn home-back" href="../">← Game Center</a>
      <div class="logo-wrap">
        <div class="logo">Times <span class="quest">Quest</span></div>
        <div class="tagline">Times tables · 1 to ${MAX_TABLE} · ${ALL_FACTS.length} facts</div>
      </div>
      <div class="card hero">
        <button class="play-btn" id="playAll">▶&nbsp; Play ${ROUND_SIZE} Questions</button>
        <div class="theme-row">
          <span class="theme-label">Colors:</span>
        </div>
        <button class="mastery-btn" id="openFacts">
          <div class="mastery-labels">
            <span>Facts mastered <span class="see-list">see list →</span></span>
            <span class="count">${masteredTotal} / ${ALL_FACTS.length}</span>
          </div>
          <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
        </button>
      </div>
      <div>
        <div class="units-heading">Or practice a table</div>
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
    const mastered = u.facts.filter(f => isMastered(f, stats)).length;
    const upct = Math.round(mastered / u.facts.length * 100);
    const color = UNIT_COLORS[i % UNIT_COLORS.length];
    const cardBtn = el(`
      <button class="unit-card" style="box-shadow:0 5px 0 ${color}">
        <div class="unit-head">
          <span class="unit-num" style="background:${color}">×${i + 1}</span>
          <span class="unit-name">${u.name}</span>
        </div>
        <div class="unit-progress">
          <div class="unit-track"><div class="unit-fill" style="width:${upct}%"></div></div>
          <span class="unit-count">${mastered}/${u.facts.length}</span>
        </div>
      </button>`);
    cardBtn.addEventListener('click', () => startRound(u.facts, u.name));
    grid.appendChild(cardBtn);
  });

  screen.querySelector('#playAll').addEventListener('click', () => startRound(ALL_FACTS, 'Mixed round'));
  screen.querySelector('#openFacts').addEventListener('click', () => { state.screen = 'facts'; render(); });
  appEl.appendChild(screen);
}

/* ---------- fact list ---------- */
function renderFacts() {
  const stats = loadStats();
  const screen = el(`
    <div class="screen words">
      <div class="words-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <div class="words-title">Fact List</div>
      </div>
      <div id="factCards"></div>
    </div>`);

  const wrap = screen.querySelector('#factCards');
  UNITS.forEach((u, i) => {
    const mastered = u.facts.filter(f => isMastered(f, stats)).length;
    const card = el(`
      <div class="card word-card" style="margin-bottom:18px">
        <div class="word-card-head">
          <span class="word-card-title" style="color:${UNIT_COLORS[i % UNIT_COLORS.length]}">${u.name}</span>
          <span class="word-card-sub">${mastered}/${u.facts.length} mastered · ◐ = halfway there</span>
        </div>
        <div class="chip-wrap">${u.facts.map(f => {
          const { a, b, answer } = factParts(f);
          if (isMastered(f, stats)) return `<span class="chip mastered">${a}×${b}=${answer}</span>`;
          const half = stats[f] && stats[f].firstTry === 1;
          return `<span class="chip learning${half ? ' half' : ''}">${a}×${b}${half ? ' ◐' : ''}</span>`;
        }).join('')}</div>
      </div>`);
    wrap.appendChild(card);
  });

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
        <div class="equation">
          <span id="factA"></span><span class="op">×</span><span id="factB"></span><span class="op">=</span><span class="answer-box" id="answerBox">?</span>
        </div>
        <div class="reveal" id="revealBox" hidden>
          <div class="reveal-label">The answer is</div>
          <div class="reveal-word" id="revealAnswer"></div>
          <div class="reveal-hint">Now type it!</div>
        </div>
        <div class="feedback" id="feedback"></div>
        <div class="numpad" id="numpad"></div>
        <button class="check-btn" id="checkBtn">Check ✓</button>
      </div>
    </div>`);

  const dots = screen.querySelector('#dots');
  state.queue.forEach(() => dots.appendChild(el('<span class="dot"></span>')));

  const pad = screen.querySelector('#numpad');
  ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', 'back'].forEach(k => {
    const b = el(k === 'back'
      ? '<button class="pad-btn pad-back">⌫</button>'
      : `<button class="pad-btn">${k}</button>`);
    b.addEventListener('click', () => pressKey(k));
    pad.appendChild(b);
  });

  screen.querySelector('#quitBtn').addEventListener('click', goHome);
  screen.querySelector('#checkBtn').addEventListener('click', check);

  appEl.appendChild(screen);
  updateRound();
}

function onKeydown(e) {
  if (state.screen !== 'round') return;
  if (e.key >= '0' && e.key <= '9') pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('back');
  else if (e.key === 'Enter') check();
}

function updateRound() {
  const fact = state.queue[state.idx] || '1×1';
  const { a, b, answer } = factParts(fact);

  document.getElementById('roundContext').textContent =
    `${state.lastLabel} · question ${state.idx + 1} of ${state.queue.length}`;

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

  document.getElementById('factA').textContent = a;
  document.getElementById('factB').textContent = b;

  const box = document.getElementById('answerBox');
  box.textContent = state.phase === 'correct' ? String(answer) : (state.input || '?');
  box.classList.toggle('empty', !state.input && state.phase !== 'correct');
  box.classList.toggle('wrong', state.phase === 'wrong');
  box.classList.toggle('correct', state.phase === 'correct');

  const revealBox = document.getElementById('revealBox');
  revealBox.hidden = state.phase !== 'reveal';
  document.getElementById('revealAnswer').textContent = answer;

  const fb = document.getElementById('feedback');
  const feedback = {
    answer: ['', '#8A93AC'],
    wrong: [state.tries >= 2 ? 'One more try — you can do it!' : 'Not quite — try again!', '#E4573D'],
    reveal: ['Type the answer above', '#8A93AC'],
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
      <div class="done-title">${trophy ? 'Math Star!' : 'Great job!'}</div>
      <div class="card done-stats">
        <div><div class="stat-num first">${stars}</div><div class="stat-label">FIRST TRY</div></div>
        <div><div class="stat-num solved">${solved}</div><div class="stat-label">SOLVED</div></div>
        <div><div class="stat-num total">${state.queue.length}</div><div class="stat-label">QUESTIONS</div></div>
      </div>
      <div class="done-actions">
        <button class="done-btn again" id="againBtn">Play again</button>
        <button class="done-btn home" id="homeBtn">Home</button>
      </div>
    </div>`);

  screen.querySelector('#againBtn').addEventListener('click', () => startRound(state.lastPool || ALL_FACTS, state.lastLabel || 'Mixed round'));
  screen.querySelector('#homeBtn').addEventListener('click', goHome);
  appEl.appendChild(screen);
}

/* ================= bootstrap ================= */
applyTheme();
document.addEventListener('keydown', onKeydown);
render();
