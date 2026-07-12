'use strict';

/* ================= constants ================= */
const ROUND_SIZE = 10;
const MASTER_TARGET = 15;   // first-try correct answers to master a skill
const UNIT_COLORS = ['#FF8A3D', '#5B7BD6', '#3BB273', '#E4573D', '#B266C9', '#E8B93D'];
const THEMES = [
  { id: 'sunset', name: 'Sunset', bg: '#FFF8EF', accent: '#FF8A3D', dark: '#D9642A' },
  { id: 'ocean',  name: 'Ocean',  bg: '#EEF5FF', accent: '#4A7DE2', dark: '#33589F' },
  { id: 'forest', name: 'Forest', bg: '#F0F7EC', accent: '#3BA55D', dark: '#2A7A44' },
  { id: 'berry',  name: 'Berry',  bg: '#FDF0F6', accent: '#D6569E', dark: '#A93A78' }
];

/* ================= helpers ================= */
function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[ri(0, arr.length - 1)]; }

/* ================= curriculum =================
   Each unit generates question objects:
   { q: display text, speak: text read aloud, a: answer string,
     mode: 'type' | 'choice', choices: [..] (choice mode only) }   */

const NAMES = ['Maya', 'Leo', 'Ava', 'Sam', 'Zoe', 'Max', 'Lily', 'Ben', 'Mia', 'Jack'];
const THINGS = ['stickers', 'marbles', 'crayons', 'blocks', 'shells', 'cards', 'coins', 'balloons'];

function qType(q, a, speak) { return { q, a: String(a), mode: 'type', speak: speak || q.replace(/=\s*\?/, 'equals what?').replace(/\+/g, ' plus ').replace(/−/g, ' minus ') }; }
function qChoice(q, a, choices, speak) { return { q, a: String(a), mode: 'choice', choices, speak: speak || q }; }

function genAdd20() {
  const a = ri(2, 18), b = ri(1, 20 - a);
  return qType(`${a} + ${b} = ?`, a + b);
}
function genSub20() {
  const c = ri(5, 20), b = ri(1, c - 1);
  return qType(`${c} − ${b} = ?`, c - b);
}
function genDoubles() {
  const n = ri(3, 10);
  if (Math.random() < 0.5) return qType(`${n} + ${n} = ?`, n + n);
  return qType(`${n} + ${n + 1} = ?`, n + n + 1);
}
function genMakeTen() {
  if (Math.random() < 0.4) {
    const a = ri(1, 9);
    return qType(`${a} + ? = 10`, 10 - a, `${a} plus what makes 10?`);
  }
  const a = pick([7, 8, 9]), b = ri(11 - a, 9);   // bridges past ten
  return qType(`${a} + ${b} = ?`, a + b);
}
function genMissing() {
  const form = ri(0, 2);
  if (form === 0) { const a = ri(3, 40), x = ri(2, 30); return qType(`${a} + ? = ${a + x}`, x, `${a} plus what equals ${a + x}?`); }
  if (form === 1) { const b = ri(3, 40), x = ri(2, 30); return qType(`? + ${b} = ${b + x}`, x, `What plus ${b} equals ${b + x}?`); }
  const c = ri(20, 60), x = ri(3, c - 5); return qType(`${c} − ? = ${c - x}`, x, `${c} minus what equals ${c - x}?`);
}
function genAdd100() {
  const a = ri(11, 88), b = ri(11, 99 - a);
  return qType(`${a} + ${b} = ?`, a + b);
}
function genSub100() {
  const c = ri(25, 99), b = ri(11, c - 10);
  return qType(`${c} − ${b} = ?`, c - b);
}
function genPlaceValue() {
  const h = ri(1, 9), t = ri(0, 9), o = ri(0, 9);
  const n = h * 100 + t * 10 + o;
  const form = ri(0, 3);
  if (form === 0) return qType(`${h} hundreds + ${t} tens + ${o} ones = ?`, n, `${h} hundreds plus ${t} tens plus ${o} ones makes what number?`);
  if (form === 1) return qType(`${h * 100} + ${t * 10} + ${o} = ?`, n);
  if (form === 2) {
    const places = [['ones', o], ['tens', t], ['hundreds', h]];
    const p = pick(places);
    return qType(`Which digit is in the ${p[0]} place?\n${n}`, p[1], `Which digit is in the ${p[0]} place of ${n}?`);
  }
  const t2 = ri(1, 9), o2 = ri(0, 9);
  return qType(`How many tens are in ${t2 * 10 + o2}?`, t2);
}
function genCompare() {
  let a = ri(100, 999), b = ri(100, 999);
  if (Math.random() < 0.2) b = a;
  else if (Math.abs(a - b) > 400) b = a + ri(-99, 99);   // keep some close calls
  const ans = a < b ? '<' : a > b ? '>' : '=';
  return qChoice(`${a} ⬤ ${b}`, ans, ['<', '=', '>'], `Which sign goes between ${a} and ${b}? Less than, equal, or greater than?`);
}
function genSkipCount() {
  const step = pick([5, 10, 100]);
  const start = step === 100 ? ri(1, 5) * 100 : ri(2, 8) * step + (step === 10 && Math.random() < 0.5 ? ri(1, 9) : 0);
  const seq = [start, start + step, start + step * 2];
  return qType(`${seq.join(', ')}, ?`, start + step * 3, `Skip count: what comes after ${seq.join(', ')}?`);
}
function genTenHundred() {
  const n = ri(110, 890);
  const step = pick([10, 100]);
  if (Math.random() < 0.5) return qType(`${n} + ${step} = ?`, n + step);
  return qType(`${n} − ${step} = ?`, n - step);
}
function genEvenOdd() {
  const n = ri(1, 20);
  return qChoice(`Is ${n} even or odd?`, n % 2 === 0 ? 'Even' : 'Odd', ['Even', 'Odd']);
}
function genWordProblem() {
  const name = pick(NAMES), name2 = pick(NAMES.filter(n => n !== name)), thing = pick(THINGS);
  const form = ri(0, 3);
  let text, ans;
  if (form === 0) {          // add to, result unknown
    const a = ri(12, 60), b = ri(5, 30);
    text = `${name} has ${a} ${thing}. ${name2} gives ${name} ${b} more. How many ${thing} does ${name} have now?`;
    ans = a + b;
  } else if (form === 1) {   // take from, result unknown
    const a = ri(20, 80), b = ri(5, a - 5);
    text = `${name} has ${a} ${thing}. ${name} gives ${b} away. How many ${thing} are left?`;
    ans = a - b;
  } else if (form === 2) {   // change unknown
    const a = ri(10, 40), x = ri(5, 30);
    text = `${name} has ${a} ${thing}. After finding some more, ${name} has ${a + x}. How many did ${name} find?`;
    ans = x;
  } else {                   // compare, difference unknown
    const a = ri(15, 60), b = ri(5, a - 3);
    text = `${name} has ${a} ${thing}. ${name2} has ${b}. How many more does ${name} have?`;
    ans = a - b;
  }
  return { q: text, a: String(ans), mode: 'type', speak: text, story: true };
}
function genBigAddSub() {
  if (Math.random() < 0.5) {
    const a = ri(110, 540), b = ri(100, 999 - a);
    return qType(`${a} + ${b} = ?`, a + b);
  }
  const c = ri(300, 999), b = ri(100, c - 100);
  return qType(`${c} − ${b} = ?`, c - b);
}

const GRADES = {
  g2: {
    label: '2nd Grade',
    units: [
      { id: 'add20',    name: 'Addition to 20',        gen: genAdd20 },
      { id: 'sub20',    name: 'Subtraction to 20',     gen: genSub20 },
      { id: 'doubles',  name: 'Doubles & Near Doubles', gen: genDoubles },
      { id: 'maketen',  name: 'Make a Ten',            gen: genMakeTen },
      { id: 'missing',  name: 'Missing Numbers',       gen: genMissing },
      { id: 'add100',   name: 'Adding to 100',         gen: genAdd100 },
      { id: 'sub100',   name: 'Subtracting to 100',    gen: genSub100 },
      { id: 'place',    name: 'Place Value',           gen: genPlaceValue },
      { id: 'compare',  name: 'Comparing Numbers',     gen: genCompare },
      { id: 'skip',     name: 'Skip Counting',         gen: genSkipCount },
      { id: 'mental',   name: 'Plus/Minus 10 & 100',   gen: genTenHundred },
      { id: 'evenodd',  name: 'Even or Odd',           gen: genEvenOdd },
      { id: 'story',    name: 'Word Problems',         gen: genWordProblem },
      { id: 'big',      name: 'Big Number Add & Sub',  gen: genBigAddSub }
    ]
  }
};

/* ================= state ================= */
const state = {
  screen: 'home',
  queue: [],          // question objects
  idx: 0,
  tries: 0,
  phase: 'ask',       // ask | wrong | reveal | correct
  results: [],        // 'first' | 'retry' | 'missed'
  lastUnit: null,     // unit id or 'mixed'
  lastLabel: '',
  grade: (() => { try { return localStorage.getItem('mathquest_grade') || 'g2'; } catch (e) { return 'g2'; } })(),
  theme: (() => { try { return localStorage.getItem('mathquest_theme') || 'sunset'; } catch (e) { return 'sunset'; } })()
};

const appEl = document.getElementById('app');

function grade() { return GRADES[state.grade] || GRADES.g2; }
function unitById(id) { return grade().units.find(u => u.id === id); }

/* ================= persistence ================= */
function loadStats() {
  try { return JSON.parse(localStorage.getItem('mathquest_progress_v1')) || {}; } catch (e) { return {}; }
}
function saveStat(unitId, firstTry) {
  const s = loadStats();
  const key = state.grade + ':' + unitId;
  const rec = s[key] || { seen: 0, firstTry: 0 };
  rec.seen += 1;
  if (firstTry) rec.firstTry += 1;
  s[key] = rec;
  try { localStorage.setItem('mathquest_progress_v1', JSON.stringify(s)); } catch (e) {}
}
function unitProgress(unitId, stats) {
  const rec = stats[state.grade + ':' + unitId];
  return Math.min(rec ? rec.firstTry : 0, MASTER_TARGET);
}
function isMastered(unitId, stats) { return unitProgress(unitId, stats) >= MASTER_TARGET; }

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

/* ================= read aloud (TTS) ================= */
function speakQuestion() {
  const item = state.queue[state.idx];
  if (!item || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(item.speak);
  u.rate = 0.85;
  u.pitch = 1.05;
  const voices = speechSynthesis.getVoices();
  const pickV = voices.find(v => /Samantha|Google US English|Aria|Jenny/i.test(v.name)) || voices.find(v => v.lang && v.lang.startsWith('en'));
  if (pickV) u.voice = pickV;
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
  try { localStorage.setItem('mathquest_theme', id); } catch (e) {}
  applyTheme();
  render();
}
function pickGrade(id) {
  if (!GRADES[id]) return;
  state.grade = id;
  try { localStorage.setItem('mathquest_grade', id); } catch (e) {}
  render();
}

/* ================= game flow ================= */
function buildQueue(unitId) {
  const qs = [];
  const units = grade().units;
  for (let i = 0; i < ROUND_SIZE; i++) {
    const u = unitId === 'mixed' ? pick(units) : unitById(unitId);
    const item = u.gen();
    item.unitId = u.id;
    qs.push(item);
  }
  return qs;
}

function startRound(unitId, label) {
  ctx();   // unlock audio inside the user gesture
  Object.assign(state, {
    screen: 'round', queue: buildQueue(unitId), idx: 0, tries: 0,
    phase: 'ask', results: [], lastUnit: unitId, lastLabel: label
  });
  render();
}

function focusInput() {
  setTimeout(() => {
    const el = document.getElementById('answerInput');
    if (el) el.focus();
  }, 50);
}

function normalize(s) { return String(s).trim().toLowerCase(); }

function handleAnswer(given) {
  const item = state.queue[state.idx];
  if (!item || state.phase === 'correct') return;

  if (normalize(given) === normalize(item.a)) {
    const firstTry = state.tries === 0 && state.phase !== 'reveal';
    if (state.phase !== 'reveal') saveStat(item.unitId, firstTry);
    state.results.push(state.phase === 'reveal' ? 'missed' : (firstTry ? 'first' : 'retry'));
    state.phase = 'correct';
    sfxCorrect();
    if (firstTry) burst();
    updateRound();
    setTimeout(nextQuestion, 1400);
  } else {
    state.tries += 1;
    sfxWrong();
    if (state.phase !== 'reveal' && state.tries >= 3) {
      saveStat(item.unitId, false);
      state.phase = 'reveal';
      const input = document.getElementById('answerInput');
      if (input) input.value = '';
    } else if (state.phase !== 'reveal') {
      state.phase = 'wrong';
    }
    updateRound();
    shakeCard();
    if (item.mode === 'type') focusInput();
  }
}

function check() {
  const input = document.getElementById('answerInput');
  if (!input || !input.value.trim()) { focusInput(); return; }
  handleAnswer(input.value);
}

function nextQuestion() {
  if (state.idx + 1 >= state.queue.length) {
    state.screen = 'done';
    state.phase = 'ask';
    sfxDone();
    render();
    burst();
  } else {
    state.idx += 1;
    state.tries = 0;
    state.phase = 'ask';
    render();       // re-render: question mode may change between type/choice
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
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function render() {
  appEl.innerHTML = '';
  if (state.screen === 'home') renderHome();
  else if (state.screen === 'skills') renderSkills();
  else if (state.screen === 'round') renderRound();
  else if (state.screen === 'done') renderDone();
}

/* ---------- home ---------- */
function renderHome() {
  const stats = loadStats();
  const units = grade().units;
  const masteredTotal = units.filter(u => isMastered(u.id, stats)).length;
  const pct = units.length ? Math.round(masteredTotal / units.length * 100) : 0;

  const gradeOptions = Object.keys(GRADES)
    .map(id => `<option value="${id}"${id === state.grade ? ' selected' : ''}>${esc(GRADES[id].label)}</option>`)
    .join('');

  const screen = el(`
    <div class="screen home">
      <div class="logo-wrap">
        <div class="logo">Math <span class="quest">Quest</span></div>
        <div class="tagline">NC Curriculum ·
          <select class="grade-select" id="gradeSelect">${gradeOptions}</select>
          · ${units.length} skills</div>
      </div>
      <div class="card hero">
        <button class="play-btn" id="playAll">▶&nbsp; Play ${ROUND_SIZE} Problems</button>
        <div class="theme-row">
          <span class="theme-label">Colors:</span>
        </div>
        <button class="mastery-btn" id="openSkills">
          <div class="mastery-labels">
            <span>Skills mastered <span class="see-list">see list →</span></span>
            <span class="count">${masteredTotal} / ${units.length}</span>
          </div>
          <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
        </button>
      </div>
      <div>
        <div class="units-heading">Or practice a skill</div>
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
  units.forEach((u, i) => {
    const prog = unitProgress(u.id, stats);
    const upct = Math.round(prog / MASTER_TARGET * 100);
    const color = UNIT_COLORS[i % UNIT_COLORS.length];
    const cardBtn = el(`
      <button class="unit-card" style="box-shadow:0 5px 0 ${color}">
        <div class="unit-head">
          <span class="unit-num" style="background:${color}">${i + 1}</span>
          <span class="unit-name">${esc(u.name)}</span>
        </div>
        <div class="unit-progress">
          <div class="unit-track"><div class="unit-fill" style="width:${upct}%"></div></div>
          <span class="unit-count">${prog >= MASTER_TARGET ? '★' : prog + '/' + MASTER_TARGET}</span>
        </div>
      </button>`);
    cardBtn.addEventListener('click', () => startRound(u.id, u.name));
    grid.appendChild(cardBtn);
  });

  screen.querySelector('#gradeSelect').addEventListener('change', e => pickGrade(e.target.value));
  screen.querySelector('#playAll').addEventListener('click', () => startRound('mixed', 'Mixed round'));
  screen.querySelector('#openSkills').addEventListener('click', () => { state.screen = 'skills'; render(); });
  appEl.appendChild(screen);
}

/* ---------- skills list ---------- */
function renderSkills() {
  const stats = loadStats();
  const units = grade().units;
  const mastered = units.filter(u => isMastered(u.id, stats));
  const learning = units.filter(u => !isMastered(u.id, stats));

  const chip = u => {
    const prog = unitProgress(u.id, stats);
    const done = prog >= MASTER_TARGET;
    return `<span class="chip ${done ? 'mastered' : 'learning'}">${esc(u.name)}${done ? ' ★' : ` ${prog}/${MASTER_TARGET}`}</span>`;
  };

  const screen = el(`
    <div class="screen words">
      <div class="words-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <div class="words-title">Skill List</div>
      </div>
      <div class="card word-card">
        <div class="word-card-head">
          <span class="word-card-title mastered">★ Mastered</span>
          <span class="word-card-sub">${mastered.length} skills</span>
        </div>
        ${mastered.length
          ? `<div class="chip-wrap">${mastered.map(chip).join('')}</div>`
          : '<div class="empty-note">No skills mastered yet — answer a problem right on the first try 15 times to master its skill!</div>'}
      </div>
      <div class="card word-card">
        <div class="word-card-head">
          <span class="word-card-title learning">Still practicing</span>
          <span class="word-card-sub">${learning.length} skills</span>
        </div>
        <div class="chip-wrap">${learning.map(chip).join('')}</div>
      </div>
    </div>`);

  screen.querySelector('#backBtn').addEventListener('click', goHome);
  appEl.appendChild(screen);
}

/* ---------- round ---------- */
function renderRound() {
  const item = state.queue[state.idx];

  const answerArea = item.mode === 'choice'
    ? `<div class="choice-row" id="choiceRow">
         ${item.choices.map(c => `<button class="choice-btn" data-val="${esc(c)}">${esc(c)}</button>`).join('')}
       </div>`
    : `<form id="answerForm" style="width:100%;display:flex;justify-content:center;">
         <input class="answer-input" id="answerInput" autocomplete="off" inputmode="numeric" pattern="[0-9]*" enterkeyhint="go" placeholder="?">
       </form>
       <button class="check-btn" id="checkBtn">Check ✓</button>`;

  const screen = el(`
    <div class="screen round">
      <div class="round-bar">
        <button class="back-btn" id="quitBtn">← Quit</button>
        <div class="dots" id="dots"></div>
        <div class="stars" id="stars">★ 0</div>
      </div>
      <div class="card round-card" id="roundCard">
        <div class="round-context" id="roundContext"></div>
        <div class="problem${item.story ? ' story' : ''}" id="problemBox"></div>
        <button class="hear-again" id="readBtn">🔊 Read it to me</button>
        <div class="reveal" id="revealBox" hidden>
          <div class="reveal-label">The answer is</div>
          <div class="reveal-word" id="revealWord"></div>
          <div class="reveal-hint" id="revealHint">Now type it!</div>
        </div>
        ${answerArea}
        <div class="feedback" id="feedback"></div>
      </div>
    </div>`);

  const dots = screen.querySelector('#dots');
  state.queue.forEach(() => dots.appendChild(el('<span class="dot"></span>')));

  screen.querySelector('#quitBtn').addEventListener('click', goHome);
  screen.querySelector('#readBtn').addEventListener('click', speakQuestion);

  if (item.mode === 'choice') {
    screen.querySelectorAll('.choice-btn').forEach(b => {
      b.addEventListener('click', () => handleAnswer(b.dataset.val));
    });
  } else {
    screen.querySelector('#checkBtn').addEventListener('click', check);
    screen.querySelector('#answerForm').addEventListener('submit', e => { e.preventDefault(); check(); });
  }

  appEl.appendChild(screen);
  updateRound();
  if (item.mode === 'type') focusInput();
}

function updateRound() {
  const item = state.queue[state.idx];
  if (!item) return;

  document.getElementById('roundContext').textContent =
    `${state.lastLabel} · problem ${state.idx + 1} of ${state.queue.length}`;

  document.getElementById('problemBox').textContent = item.q;

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
  document.getElementById('revealWord').textContent = item.a;
  document.getElementById('revealHint').textContent = item.mode === 'choice' ? 'Now tap it!' : 'Now type it!';

  const input = document.getElementById('answerInput');
  if (input) {
    input.classList.toggle('wrong', state.phase === 'wrong');
    input.classList.toggle('correct', state.phase === 'correct');
  }
  document.querySelectorAll('.choice-btn').forEach(b => {
    b.classList.toggle('correct', state.phase === 'correct' && normalize(b.dataset.val) === normalize(item.a));
  });

  const fb = document.getElementById('feedback');
  const feedback = {
    ask: ['', '#8A93AC'],
    wrong: [state.tries >= 2 ? 'One more try — you can do it!' : 'Not quite — try again!', '#E4573D'],
    reveal: [item.mode === 'choice' ? 'Tap the answer above' : 'Copy the answer above', '#8A93AC'],
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
      <div class="done-title">${trophy ? 'Math Champion!' : 'Great job!'}</div>
      <div class="card done-stats">
        <div><div class="stat-num first">${stars}</div><div class="stat-label">FIRST TRY</div></div>
        <div><div class="stat-num solved">${solved}</div><div class="stat-label">SOLVED</div></div>
        <div><div class="stat-num total">${state.queue.length}</div><div class="stat-label">PROBLEMS</div></div>
      </div>
      <div class="done-actions">
        <button class="done-btn again" id="againBtn">Play again</button>
        <button class="done-btn home" id="homeBtn">Home</button>
      </div>
    </div>`);

  screen.querySelector('#againBtn').addEventListener('click', () => startRound(state.lastUnit || 'mixed', state.lastLabel || 'Mixed round'));
  screen.querySelector('#homeBtn').addEventListener('click', goHome);
  appEl.appendChild(screen);
}

/* ================= bootstrap ================= */
applyTheme();
render();
