// 에이전트 마을 뷰어. 프레임워크·엔진 없이 Canvas 2D 한 장으로 그린다.
import { bake, hero, WEAPONS, MONSTERS, monsterFor, TREE, sideOf, drawOffice, drawDesk, oblique, SK, SY, DEPTH, WALL_H } from './art.js';

const GUILDS = {
  claude: { name: 'Claude 길드', color: '#e0825c', dark: '#93492f', job: 'knight' },
  codex: { name: 'Codex 길드', color: '#46c796', dark: '#1f7355', job: 'mage' },
  antigravity: { name: 'Antigravity 길드', color: '#6b97ff', dark: '#3151a8', job: 'engineer' },
};
const ORDER = ['claude', 'codex', 'antigravity'];
const guildOf = (id) => GUILDS[id] || GUILDS.claude;

// 서브에이전트 역할 → 직업
const ROLE_JOBS = [
  [/explore|search|scout|find/i, 'scout', '정찰병'], [/plan|architect|design/i, 'scholar', '책사'],
  [/review|audit|verif|test/i, 'appraiser', '감정사'], [/web|fetch|research/i, 'mage', '마법사'],
  [/guide|doc/i, 'scholar', '길잡이'], [/general|claude|default/i, 'knight', '용병'],
];
const OTHER_JOBS = [['mage', '마법사'], ['rogue', '도적'], ['knight', '검사'], ['scout', '궁수'], ['engineer', '기술자']];
const NAMES = ['가람', '다온', '누리', '마루', '보람', '새벽', '아라', '한울', '미르', '나래', '슬기', '이든', '하늘', '가온', '도담', '라온', '여울', '초롱', '솔', '별'];

// 도구 → [길드원 말투, 길드장 말투, 분류]
const VERBS = [
  [/^(read|grep|glob|ls|view|cat)/i, '살펴보겠습니다', '좀 볼게', '#8fdcff'],
  [/^(edit|write|notebook|apply|patch|multi)/i, '수정하겠습니다', '고친다', '#ffffff'],
  [/^(bash|shell|exec|run)/i, '실행하겠습니다', '돌려본다', '#ffd84a'],
  [/^(web|fetch|search)/i, '조사하겠습니다', '알아볼게', '#c9a3ff'],
  [/^(task|agent)/i, '지원을 요청하겠습니다', '도와줄 사람 부른다', '#ffb347'],
];
const verbOf = (tool = '') => VERBS.find(([re]) => re.test(tool)) || [0, '처리하겠습니다', '해본다', '#a6f08f'];

const BANTER = [
  ['오늘 몬스터 좀 세지 않았어?', '그러게, 버그벌레가 제일 싫어.'],
  ['차 한 잔 할래?', '좋지. 컨텍스트가 바닥이야.'],
  ['아까 테스트 박쥐 봤어?', '한 번에 잡히는 법이 없더라.'],
  ['길드원들 요즘 잘하더라.', '응, 보고가 깔끔해.'],
  ['다음 의뢰 언제 오려나.', '쉴 수 있을 때 쉬어 둬.'],
  ['스파게티 골렘은 진짜 단단해.', '조금씩 풀어내는 수밖에.'],
  ['모닥불 좋다.', '이 맛에 일하지.'],
  ['레벨 좀 올랐어?', '아직 멀었어. 너는?'],
];
const MUSING = ['의뢰 없나…', '졸리다…', '불멍 좋네.', '다음엔 뭘 잡지.', '어깨 뻐근해.'];
// 길드원끼리는 서로 존대한다
const CREW_BANTER = [
  ['오늘 길드장님 기분 좋아 보이시죠?', '포상도 주셨잖아요!'],
  ['아까 그 몬스터 무섭지 않았어요?', '다 같이라 괜찮았어요.'],
  ['다음 임무도 같이 가요.', '좋아요, 불러 주세요!'],
  ['여기 볕이 참 좋네요.', '쉬는 게 제일이에요.'],
  ['보고 잘하는 요령이 있어요?', '결론부터 말하면 돼요.'],
  ['장비 새로 맞추셨어요?', '네, 지난 포상으로요.'],
  ['버그벌레는 어디서 나오는 걸까요?', '급하게 짠 코드에서요…'],
  ['간식 좀 드실래요?', '오, 고맙습니다!'],
];
// 길드장이 쉬는 길드원에게 건네는 말
const MENTOR = [
  ['{n}, 요즘 잘하더라.', '감사합니다, 길드장님!'],
  ['힘든 건 없어?', '괜찮습니다. 더 맡겨 주세요!'],
  ['간식 먹고 푹 쉬어.', '잘 먹겠습니다!'],
  ['{n}, 다음 의뢰도 부탁해.', '언제든 불러 주십시오!'],
  ['아까 보고 깔끔하더라.', '더 다듬어 보겠습니다.'],
];
const CREW_MUSING = ['오늘도 무사히 끝났다.', '다음 임무는 언제지…', '조금만 쉬자.', '칭찬받았다. 헤헤.', '장비 손질해야지.'];

const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('world'), ctx = cv.getContext('2d'), logEl = $('log'), hud = $('hud');
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const pick = (xs) => xs[(Math.random() * xs.length) | 0];
const clockNow = () => performance.now() / 1000;

// ---------- 저장되는 값: 경험치, 소리 ----------

const store = (() => { try { return JSON.parse(localStorage.getItem('av-exp')) || {}; } catch { return {}; } })();
const levelOf = (key) => 1 + Math.floor(Math.sqrt(store[key] || 0));
function gain(key, n) {
  const before = levelOf(key);
  store[key] = (store[key] || 0) + n;
  try { localStorage.setItem('av-exp', JSON.stringify(store)); } catch { /* 저장 불가 환경 */ }
  return levelOf(key) > before;
}

let ac = null, soundOn = false;
try { soundOn = localStorage.getItem('av-sound') === '1'; } catch { /* 무시 */ }
function tone(freq, dur, type = 'square', vol = 0.04, when = 0) {
  if (!ac || !soundOn || document.hidden) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
const seq = (notes, dur, type, vol, gap) => notes.forEach((f, i) => tone(f, dur, type, vol, i * gap));
const SFX = {
  hit: () => tone(300 + Math.random() * 140, 0.07),
  magic: () => seq([660, 990], 0.12, 'sine', 0.035, 0.05),
  fail: () => tone(110, 0.22, 'sawtooth', 0.04),
  spawn: () => tone(150, 0.25, 'triangle', 0.06),
  win: () => seq([523, 659, 784, 1047], 0.2, 'square', 0.045, 0.11),
  level: () => seq([784, 988, 1175, 1568], 0.15, 'triangle', 0.06, 0.08),
  alert: () => seq([880, 660, 880], 0.16, 'square', 0.05, 0.18),
  boss: () => seq([196, 185, 165], 0.32, 'sawtooth', 0.05, 0.26),
};

// ---------- 배치 ----------

// BY: 사무실 바닥 뒤쪽 모서리의 화면 y, FRONT: 사무실 앞벽의 화면 y
const HOR = 34, BY = HOR + WALL_H + 22, FRONT = BY + DEPTH * SY, LEAN = DEPTH * SK;
let L, bg, view = { s: 1, ox: 0, oy: 0, dpr: 1 }, props = [], lights = [];

function makeLayout(W, H, portrait, cover) {
  // 세계 크기는 화면에 맞춰 달라진다. cover 는 HUD가 덮는 영역(세계 좌표).
  const cell = W / 3, ow = Math.max(44, Math.min(116, Math.floor(cell - LEAN - 8)));
  const l = { portrait, W, H, ow, cover, plazaY: FRONT + 6, fire: { x: Math.round(W / 2), y: FRONT + 24 }, cliffY: FRONT + 38, guilds: {}, slots: [] };
  l.fieldY = l.cliffY + 8;
  ORDER.forEach((id, i) => {
    const ox = Math.round(cell * i + (cell - ow - LEAN) / 2 + LEAN), n = ow >= 88 ? 3 : ow >= 58 ? 2 : 1;
    const at = (u, v) => ({ x: Math.round(ox + u - v * SK), y: Math.round(BY + v * SY) }); // 방 안 좌표 → 화면
    l.guilds[id] = {
      ox, at, cx: ox + ow / 2 - LEAN, door: at(ow / 2, DEPTH + 3), beacon: at(ow + 5, DEPTH + 6),
      desks: Array.from({ length: n }, (_, k) => at(ow * (k + 1) / (n + 1), 24)),
    };
  });
  const cols = Math.max(2, Math.floor(W / 100));
  for (let y = l.fieldY + 46; y < H - 10; y += 60) for (let c = 0; c < cols; c++) {
    const x = Math.round((c + 0.62) * W / cols);
    if (cover && x - 44 < cover.x1 && x + 18 > cover.x0 && y + 22 > cover.y0 && y - 30 < cover.y1) continue; // HUD 밑은 비운다
    l.slots.push({ x, y });
  }
  if (!l.slots.length) l.slots.push({ x: Math.round(W * 0.7), y: Math.min(H - 10, l.fieldY + 46) });
  l.rest = Array.from({ length: 8 }, (_, k) => ({ x: l.fire.x + Math.cos(k * 0.785 + 0.4) * 22, y: l.fire.y + Math.sin(k * 0.785 + 0.4) * 8 + 2 }));
  for (let k = 0; k < 14; k++) { // 광장 곳곳의 쉼터. 둘씩 마주 서게 붙여 둔다
    const x = W * (Math.floor(k / 2) + 0.5) / 7 + (k % 2 ? 9 : -9), y = l.plazaY + 9 + (Math.floor(k / 2) % 2) * 15;
    if (Math.abs(x - l.fire.x) > 36) l.rest.push({ x, y });
  }
  l.trees = [[5, l.plazaY + 22], [W - 5, l.plazaY + 24], [l.fire.x - 62, l.plazaY + 30], [l.fire.x + 62, l.plazaY + 30]];
  for (let y = l.fieldY + 26, k = 0; y < H + 8; y += 44, k++) l.trees.push([4 + (k % 2) * 4, y], [W - 5 - (k % 2) * 3, y + 9]);
  return l;
}

function renderBg() {
  const c = document.createElement('canvas');
  c.width = L.W; c.height = L.H;
  const x = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  const speck = (y0, y1, colors, n, w = 2) => { for (let i = 0; i < n; i++) R(colors[(rnd() * colors.length) | 0], (rnd() * L.W) | 0, (y0 + rnd() * (y1 - y0)) | 0, 1 + (rnd() * w | 0), 1); };

  // 지평선의 먼 숲과 윗마을 풀밭
  for (let i = 0; i < L.W; i += 3) R('#2f6f4a', i, HOR - 3 - ((rnd() * 4) | 0), 3, 8);
  R('#58a14e', 0, HOR, L.W, L.cliffY - HOR);
  speck(HOR, L.cliffY, ['#4c9345', '#66b05a', '#6fb862'], 420);

  // 광장 돌바닥
  R('#cdb793', 0, L.plazaY, L.W, L.cliffY - L.plazaY - 2);
  for (let j = L.plazaY; j < L.cliffY - 4; j += 6) for (let i = ((j / 6) % 2) * 5 - 5; i < L.W; i += 10) {
    R('#bfa880', i, j + 5, 10, 1);
    x.strokeStyle = '#bfa880'; x.lineWidth = 1; x.beginPath(); x.moveTo(i + 9.5, j); x.lineTo(i + 9.5 - 6 * SK / SY, j + 6); x.stroke();
    if (rnd() < 0.25) R('#d9c6a4', i + 2, j + 1, 5, 3);
  }
  R('#58a14e', 0, L.cliffY - 2, L.W, 2);

  // 절벽과 계단, 아랫마을 토벌장
  R('#6a4f3a', 0, L.cliffY, L.W, 8); R('#8a6a4c', 0, L.cliffY, L.W, 2); R('#4a3628', 0, L.cliffY + 6, L.W, 2);
  for (let i = 0; i < L.W + 8; i += 7) { x.strokeStyle = '#5a4230'; x.lineWidth = 1; x.beginPath(); x.moveTo(i + rnd() * 3, L.cliffY + 2); x.lineTo(i - 3, L.cliffY + 6); x.stroke(); }
  for (let k = 0; k < 4; k++) R(k % 2 ? '#b8a27e' : '#cdb793', L.fire.x - 12, L.cliffY + k * 2, 24, 2);
  R('#3d7646', 0, L.fieldY, L.W, L.H - L.fieldY);
  R('rgba(0,0,0,.18)', 0, L.fieldY, L.W, 3);
  speck(L.fieldY, L.H, ['#356a3e', '#47824f', '#2f6038', '#4f8a55'], 900);
  for (let i = 0; i < 26; i++) {
    const rx = (4 + rnd() * (L.W - 10)) | 0, ry = (L.fieldY + 8 + rnd() * (L.H - L.fieldY - 12)) | 0;
    if (rnd() < 0.6) { R('#7d8590', rx, ry, 5, 3); R('#a3abb5', rx + 1, ry - 1, 3, 1); R('#5c636e', rx, ry + 2, 5, 1); }
    else { R('#e8e2d0', rx, ry, 4, 1); R('#e8e2d0', rx + 1, ry - 1, 1, 3); } // 뼈
  }
  for (let i = 0; i < 40; i++) { const rx = (rnd() * L.W) | 0, ry = (L.fieldY + 6 + rnd() * (L.H - L.fieldY - 8)) | 0; R('#5a9a5c', rx, ry, 1, 2); R('#5a9a5c', rx + 2, ry - 1, 1, 3); }

  lights = [];
  for (const id of ORDER) {
    const g = L.guilds[id];
    for (const [lx, ly, r, col] of drawOffice(x, id, GUILDS[id], g.ox, BY, L.ow)) lights.push({ x: lx, y: ly, r, col });
    const ob = oblique(x, g.beacon.x, g.beacon.y); ob.box(-2.5, -3, 5, 5, 8, '#7a808c'); ob.box(-3.5, -4, 7, 7, 3, '#9aa0ad', 8);
  }
  oblique(x, L.fire.x, L.fire.y).box(-6, -5, 12, 9, 3, '#8d93a0');
  return c;
}

function buildProps() {
  props = [];
  for (const [x, y] of L.trees) props.push({ y, draw: () => { ctx.drawImage(sideOf(TREE), x - 6, y - 16); ctx.drawImage(TREE, x - 8, y - 16); }, shadow: [x, y, 9] });
  for (const id of ORDER) for (const d of L.guilds[id].desks) props.push({ y: d.y + 10, draw: () => drawDesk(ctx, d.x, d.y) });
}

function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const portrait = r.height > r.width * 1.05;
  // 화면을 가득 채운다: 가로 화면은 세로 256칸, 세로 화면은 가로 240칸을 기준으로 배율을 정한다
  let s = portrait ? cv.width / 250 : cv.height / 272;
  if (!portrait && cv.width / s > 640) s = cv.width / 640;
  s = s >= 2 ? Math.round(s * 4) / 4 : s;
  const W = Math.ceil(cv.width / s), H = Math.ceil(cv.height / s);
  const h = hud.getBoundingClientRect(), k = dpr / s;
  const cover = { x0: (h.left - r.left) * k, y0: (h.top - r.top) * k, x1: (h.right - r.left) * k, y1: (h.bottom - r.top) * k };
  const key = [W, H, Math.round(cover.x1), Math.round(cover.y0)].join();
  if (!L || L.key !== key) {
    const first = !L;
    L = makeLayout(W, H, portrait, cover); L.key = key; bg = renderBg(); buildProps();
    for (const m of monsters.values()) Object.assign(m, slotPos(m.slot));
    if (first) for (const a of actors.values()) [a.x, a.y] = targetOf(a);
  }
  view = { s, dpr, ox: 0, oy: 0 };
}

// ---------- 세계 상태 ----------

const actors = new Map();   // actor id → 캐릭터
const monsters = new Map(); // session id → 몬스터
const labels = new Map();   // actor id → 이름표 (퇴장 후에도 대화창에 쓰기 위해)
const timers = [];          // { at, fn } 지연 실행
let fx = [], wins = 0, now = 0, nextBanter = 8, shakeUntil = 0;

const slotPos = (i) => ({ ...L.slots[i % L.slots.length] });
function rest(a, sec) {
  const used = new Set();
  for (const b of actors.values()) if (b !== a && b.mode === 'rest') used.add(b.spot);
  // 길드장은 모닥불 둘레부터, 길드원은 광장 쉼터부터 채운다
  const fire = [0, 4, 2, 6, 1, 5, 3, 7], spots = L.rest.map((_, k) => k).slice(8);
  const order = a.leader ? [...fire, ...spots] : [...spots.slice(a.homeSeed % (spots.length || 1)), ...spots, ...fire];
  a.spot = order.find((k) => !used.has(k)) ?? 0;
  a.mode = 'rest'; a.modeUntil = now + sec;
}
const after = (sec, fn) => timers.push({ at: now + sec, fn });

function register(e) {
  if (e.actor === e.session || e.kind === 'join') {
    labels.set(e.actor, { name: e.name || '모험가', guild: e.guild, leader: true, job: guildOf(e.guild).job, title: '길드장' });
  } else {
    const role = e.role || e.name || '';
    const [, job, title] = ROLE_JOBS.find(([re]) => re.test(role)) || [0, ...OTHER_JOBS[hash(e.actor) % OTHER_JOBS.length]];
    labels.set(e.actor, { name: `${title} ${NAMES[hash(e.actor) % NAMES.length]}`, guild: e.guild, leader: false, job, title, role });
  }
  return labels.get(e.actor);
}

function partyOf(session) {
  const out = [];
  for (const a of actors.values()) if (a.session === session && !a.leaving && !a.linger) out.push(a);
  return out;
}

function targetOf(a) {
  const g = L.guilds[a.guild] || L.guilds.claude;
  if (a.leaving) return [g.door.x, g.door.y - 6];
  const m = a.linger ? null : monsters.get(a.session);
  if (m && !m.dying) {
    if (a.status === 'blocked' && a.leader) return [a.x, a.y];
    const party = partyOf(a.session), k = party.indexOf(a);
    // 세 명씩 안쪽·바깥쪽 줄로 선다
    const ring = Math.floor(k / 3), inRing = Math.min(3, party.length - ring * 3);
    const ang = Math.PI + ((k % 3) - (inRing - 1) / 2) * 0.95, r = 28 + m.stage * 8 + ring * 18;
    return [m.x + Math.cos(ang) * r, m.y + Math.sin(ang) * 21 + 2];
  }
  if (a.mode === 'rest') { const r = L.rest[a.spot % L.rest.length]; return [r.x, r.y]; }
  if (!a.leader) return [a.x, a.y]; // 할 일이 정해지기 전의 길드원은 제자리
  const d = g.desks[a.homeIdx];
  if (d) return [d.x, d.y];
  const p = g.at(10 + (a.homeIdx % 5) * 11, 46);
  return [p.x, p.y];
}

function addActor(s) {
  const lab = labels.get(s.actor) || register(s);
  let homeIdx = 0;
  if (lab.leader) {
    const used = new Set();
    for (const b of actors.values()) if (b.guild === s.guild && b.leader) used.add(b.homeIdx);
    while (used.has(homeIdx)) homeIdx++;
  }
  const G = guildOf(s.guild), g = L.guilds[s.guild] || L.guilds.claude;
  const a = {
    id: s.actor, guild: s.guild, session: s.session, leader: lab.leader, name: lab.name, status: s.status || 'idle',
    art: hero({ job: lab.job, color: G.color, dark: G.dark, leader: lab.leader, seed: hash(s.actor) }),
    homeIdx, x: g.door.x, y: g.door.y - 4, face: 1, seed: Math.random() * 9,
    mode: 'desk', modeUntil: now + 10 + Math.random() * 30, spot: hash(s.actor) % 8,
    bubble: null, talkUntil: 0, swingUntil: 0, hurtUntil: 0, cheerUntil: 0, leaving: false, moving: false,
    homeSeed: hash(s.actor) % 97, linger: false, hits: 0, fails: 0, medals: 0, chatX: 0, chatUntil: 0,
  };
  actors.set(a.id, a);
  return a;
}

function addMonster(session, text, born = now, hits = 0) {
  const taken = new Set();
  for (const m of monsters.values()) taken.add(m.slot);
  let slot = 0;
  while (taken.has(slot) && slot < L.slots.length) slot++;
  if (slot >= L.slots.length) slot = hash(session) % L.slots.length;
  const kind = monsterFor(text, hash(text + session));
  const m = { session, slot, ...slotPos(slot), hp: 1, text, kind, art: MONSTERS[kind], hits, born, stage: 0, hitUntil: 0, dying: 0, seed: Math.random() * 6 };
  m.stage = stageOf(m);
  monsters.set(session, m);
  return m;
}
const stageOf = (m) => (m.hits >= 28 || now - m.born > 240 ? 2 : m.hits >= 12 || now - m.born > 90 ? 1 : 0);
const STAGE = ['', '정예 ', '보스 '];

// ---------- 연출 ----------

function push(e) {
  if (document.hidden) return; // 안 보이는 탭에서는 연출을 쌓지 않는다
  if (fx.length > 320) fx.splice(0, 80);
  fx.push(e);
}
function burst(x, y, colors, n, speed = 40, delay = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = speed * (0.3 + Math.random());
    push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 18, t0: now + delay, dur: 0.4 + Math.random() * 0.6, color: colors[i % colors.length] });
  }
}
const floatText = (x, y, text, color, size = 5, dur = 1, delay = 0) => push({ type: 'text', x, y, text, color, size, t0: now + delay, dur });
function say(a, text, dur = 2.6) { a.bubble = { text: cut(text, 24), until: now + dur }; a.talkUntil = now + Math.min(dur, 1.6); }

function toast(text) {
  const t = $('toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3600);
}

function attack(a, m, color) {
  a.swingUntil = now + 0.3;
  a.face = m.x >= a.x ? 1 : -1;
  const kind = a.art.job.attack, tx = m.x, ty = m.y - 9 - (m.art.float || 0);
  let delay = 0.12;
  if (kind === 'melee') { push({ type: 'slash', x: tx, y: ty, t0: now + 0.1, dur: 0.2, color }); SFX.hit(); }
  else {
    delay = 0.26;
    push({ type: kind === 'arrow' ? 'arrow' : 'orb', x: a.x + a.face * 7, y: a.y - 12, tx, ty, t0: now, dur: delay, color });
    kind === 'arrow' ? SFX.hit() : SFX.magic();
  }
  burst(tx, ty, [color, '#ffffff'], 6, 28, delay);
  m.hitUntil = now + delay + 0.16;
  floatText(tx + Math.random() * 12 - 6, ty - 10, String(12 + (Math.random() * 88 | 0)), color, 5, 0.9, delay);
}

// ---------- 이벤트 처리 ----------

function describe(e) {
  const lab = labels.get(e.actor) || {};
  const polite = !lab.leader;
  switch (e.kind) {
    case 'join': return ['sys', '마을에 도착했다'];
    case 'leave': return ['sys', '마을을 떠났다'];
    case 'hire': return ['', '합류했습니다. 지시해 주십시오!'];
    case 'dismiss': return ['', '보고드립니다. 맡은 일을 마쳤습니다.'];
    case 'quest': return ['quest', `의뢰 접수 — ${e.text || ''}`];
    case 'tool': { const v = verbOf(e.tool); return ['', `${polite ? v[1] : v[2]} ▸ ${e.text || e.tool || ''}`]; }
    case 'result': return e.ok === false ? ['bad', polite ? '죄송합니다, 반격을 받았습니다.' : '윽, 막혔네.'] : null;
    case 'say': return ['', e.text || ''];
    case 'status': return e.status === 'blocked' ? ['bad', polite ? '승인을 기다리고 있습니다.' : '허락이 필요해. 좀 봐줘!'] : null;
    case 'victory': return ['win', '미션 성공!'];
  }
  return null;
}

function onEvent(e, live) {
  now = clockNow();
  if (e.kind === 'join' || e.kind === 'hire') register(e);
  const d = describe(e);
  if (d) log(e, d[0], d[1]);
  if (!live) return; // 지난 이벤트는 대화창에만 반영한다

  const a = actors.get(e.actor), m = monsters.get(e.session), lead = actors.get(e.session);
  switch (e.kind) {
    case 'join':
      if (!a) addActor(e);
      break;
    case 'hire': {
      if (a) { a.linger = a.leaving = false; a.mode = 'desk'; a.hits = a.fails = 0; break; } // 쉬던 길드원이 다시 불려 옴
      const n = addActor(e);
      burst(n.x, n.y - 8, ['#ffffff', guildOf(e.guild).color], 12, 30);
      say(n, '합류했습니다!');
      if (lead) say(lead, `${labels.get(e.actor).title}, 와줘!`, 1.8);
      break;
    }
    case 'dismiss':
      if (a && !a.linger) { say(a, '임무를 마쳤습니다.', 1.6); after(1.3, () => praise(lead, a)); after(4.2, () => linger(a)); }
      break;
    case 'leave':
      for (const b of actors.values()) if (b.session === e.session) b.leaving = true;
      monsters.delete(e.session);
      break;
    case 'quest': {
      if (m && !m.dying) { m.text = e.text || m.text; break; } // 진행 중인 의뢰의 내용만 갱신
      const nm = addMonster(e.session, e.text || '의뢰');
      burst(nm.x, nm.y - 8, ['#3a2a4a', '#8a6ac8', '#ffffff'], 18, 34);
      SFX.spawn();
      if (lead) { lead.mode = 'desk'; say(lead, '의뢰다. 가자!', 1.8); }
      break;
    }
    case 'tool':
      if (m && !m.dying) {
        m.hits++;
        m.hp = Math.max(0.1, m.hp - 0.04 - Math.random() * 0.04);
        const st = stageOf(m);
        if (st > m.stage) {
          m.stage = st; m.hp = 1;
          burst(m.x, m.y - 10, ['#ff4a4a', '#ffb347', '#3a2a4a'], 30, 60);
          floatText(m.x, m.y - 34, st === 2 ? '보스 출현!' : '정예로 변했다!', '#ff6a5a', 7, 1.8);
          if (st === 2) { shakeUntil = now + 0.6; SFX.boss(); toast(`보스 출현 — ${m.text}`); }
        }
        if (a) { a.hits++; attack(a, m, verbOf(e.tool)[3]); say(a, cut(a.leader ? verbOf(e.tool)[2] : verbOf(e.tool)[1], 12), 1.3); }
      }
      break;
    case 'result':
      if (e.ok === false && a) {
        a.fails++;
        a.hurtUntil = now + 0.7;
        burst(a.x, a.y - 8, ['#ff6b6b', '#ffb3b3'], 10, 28);
        say(a, a.leader ? '윽!' : '죄송합니다!', 1.2);
        SFX.fail();
      }
      break;
    case 'say':
      if (a) say(a, e.text || '…', 3);
      break;
    case 'status':
      if (a) {
        const was = a.status;
        a.status = e.status;
        if (e.status === 'blocked' && was !== 'blocked') alertBlocked(a);
      }
      break;
    case 'victory':
      wins++;
      if (m && !m.dying) victory(m, lead);
      break;
  }
  stat();
}

function alertBlocked(a) {
  SFX.alert();
  toast(`${a.name} — 승인을 기다리는 중`);
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('에이전트 마을', { body: `${a.name}이(가) 승인을 기다리고 있어요.` });
  } catch { /* 알림 불가 환경 */ }
}

const given = (a) => a.name.split(' ').pop(); // '정찰병 가람' → '가람'
const tell = (a, text) => log({ actor: a.id, session: a.session, guild: a.guild, t: Date.now() }, '', text);

// 길드장이 일을 마친 길드원을 격려한다. 실수 없이 해냈으면 포상도 준다.
function praise(lead, a) {
  if (!lead || !actors.has(a.id) || a.leaving) return;
  lead.face = a.x >= lead.x ? 1 : -1;
  if (a.hits > 0 && a.fails === 0) {
    const line = pick([`${given(a)}, 잘했어! 포상이다.`, `역시 ${given(a)}! 훌륭해.`, `${given(a)}, 완벽했어. 받아 둬.`]);
    say(lead, line, 2.6); tell(lead, line);
    award(lead, a, '★ 포상');
    after(1.3, () => { say(a, pick(['감사합니다, 길드장님!', '영광입니다!', '더 열심히 하겠습니다!']), 2); a.cheerUntil = now + 1.2; });
  } else {
    const line = pick([`${given(a)}, 고생했어.`, '수고했어. 다음엔 더 잘할 거야.', `${given(a)}, 애썼다. 좀 쉬어.`]);
    say(lead, line, 2.4); tell(lead, line);
    after(1.3, () => say(a, pick(['더 노력하겠습니다.', '다음엔 꼭 해내겠습니다.', '감사합니다.']), 2));
  }
}

function award(from, a, label) {
  a.medals++;
  push({ type: 'orb', x: from.x, y: from.y - 14, tx: a.x, ty: a.y - 12, t0: now + 0.4, dur: 0.5, color: '#ffd84a' });
  burst(a.x, a.y - 12, ['#ffd84a', '#fff3b0', '#ffffff'], 16, 34, 0.9);
  floatText(a.x, a.y - a.art.h - 6, label, '#ffd84a', 6, 1.8, 0.9);
  after(0.9, () => SFX.level());
}

// 일을 마친 길드원은 바로 떠나지 않고 광장에서 한동안 쉰다.
function linger(a) {
  if (!actors.has(a.id) || a.leaving || a.linger) return;
  a.linger = true; a.status = 'idle';
  rest(a, 70 + Math.random() * 90);
  const resting = [...actors.values()].filter((b) => b.linger && !b.leaving).sort((p, q) => p.modeUntil - q.modeUntil);
  for (const old of resting.slice(0, Math.max(0, resting.length - 10))) old.leaving = true; // 너무 붐비면 먼저 쉰 순서로 귀가
}

function victory(m, lead) {
  m.dying = now;
  const y = m.y - 10, exp = [1, 2, 4][m.stage];
  burst(m.x, y, ['#ffd84a', '#ffffff', '#ff9f5a', '#8fdcff', '#ff7ab0'], 46 + m.stage * 20, 78);
  push({ type: 'ring', x: m.x, y, t0: now, dur: 0.7 });
  push({ type: 'ring', x: m.x, y, t0: now + 0.15, dur: 0.7 });
  push({ type: 'flash', t0: now, dur: 0.5 });
  floatText(m.x, y - 16, '미션 성공!', '#ffd84a', 9, 2.4);
  floatText(m.x, y - 4, `+${exp} EXP`, '#8ff0a8', 5, 1.8, 0.4);
  if (m.stage === 2) shakeUntil = now + 0.5;
  SFX.win();

  const party = partyOf(m.session);
  const crew = [...actors.values()].filter((b) => b.session === m.session && !b.leader && !b.leaving && b.hits > 0);
  if (lead && crew.length) { // 함께한 길드원이 있으면 치하하고 가장 활약한 이를 뽑는다
    const mvp = crew.reduce((p, q) => (q.hits - q.fails > p.hits - p.fails ? q : p));
    after(1.6, () => { say(lead, '모두 고생했어!', 2); tell(lead, '모두 고생했어!'); });
    after(3.8, () => {
      if (!actors.has(mvp.id)) return;
      const line = `이번 MVP는 ${given(mvp)}!`;
      say(lead, line, 2.6); tell(lead, line);
      award(lead, mvp, 'MVP');
      after(1.4, () => say(mvp, '감사합니다!', 2));
    });
  }
  party.forEach((b, i) => {
    b.cheerUntil = now + 2.6;
    after(0.3 + i * 0.35, () => say(b, b.leader ? pick(['해치웠다!', '이겼다!', '좋았어!']) : pick(['해냈습니다!', '성공입니다!', '수고하셨습니다!']), 2));
  });
  if (lead) {
    rest(lead, 22 + Math.random() * 14);
    const up = gain(`h:${lead.guild}/${lead.name}`, exp), gup = gain(`g:${lead.guild}`, exp);
    if (up || gup) after(1.4, () => {
      floatText(lead.x, lead.y - 30, '레벨 업!', '#8fdcff', 7, 2);
      burst(lead.x, lead.y - 10, ['#8fdcff', '#ffffff'], 20, 40);
      SFX.level();
    });
    toast(`${lead.name} — ${STAGE[m.stage]}${m.art.name} 토벌 완료`);
  }
}

function onSnapshot(s) {
  now = clockNow();
  actors.clear(); monsters.clear(); labels.clear(); fx = []; timers.length = 0;
  logEl.textContent = '';
  for (const st of s.actors || []) { register({ ...st, kind: st.actor === st.session ? 'join' : 'hire' }); addActor(st); }
  for (const st of s.actors || []) {
    if (st.quest) addMonster(st.session, st.quest, now - (Date.now() - (st.questT || Date.now())) / 1000, st.hits || 0).hp = 0.6;
  }
  for (const a of actors.values()) [a.x, a.y] = targetOf(a);
  for (const e of s.recent || []) onEvent(e, false);
  wins = s.wins || 0;
  stat();
}

// ---------- HUD ----------

function log(e, cls, text) {
  const who = labels.get(e.actor) || labels.get(e.session) || { name: e.name || '?', guild: e.guild };
  const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  const row = document.createElement('div');
  row.className = `row ${cls} ${who.leader ? 'lead' : ''}`;
  row.dataset.actor = e.actor || '';
  const time = document.createElement('time');
  time.textContent = new Date(e.t || Date.now()).toTimeString().slice(0, 5);
  const b = document.createElement('b');
  b.textContent = who.name;
  b.style.color = guildOf(who.guild).color;
  const span = document.createElement('span');
  span.textContent = text;
  row.append(time, b, span);
  logEl.append(row);
  while (logEl.childElementCount > 200) logEl.firstElementChild.remove();
  if (stick) logEl.scrollTop = logEl.scrollHeight;
}

function stat() {
  let fights = 0;
  for (const m of monsters.values()) if (!m.dying) fights++;
  $('stat').textContent = `전투 ${fights} · 모험가 ${actors.size} · 처치 ${wins}`;
}

const STATUS = { idle: '대기', working: '작업 중', blocked: '승인 대기', done: '완료' };
function openDetail(a) {
  const m = monsters.get(a.session), lab = labels.get(a.id) || {};
  $('d-name').textContent = a.name;
  $('d-name').style.color = guildOf(a.guild).color;
  $('d-meta').textContent = [
    `${guildOf(a.guild).name} Lv.${levelOf(`g:${a.guild}`)} · ${lab.title || ''}${lab.role ? ` (${lab.role})` : ''}`,
    a.leader ? `레벨 ${levelOf(`h:${a.guild}/${a.name}`)}` : '',
    `상태: ${STATUS[a.status] || a.status}`,
    m && !m.dying ? `상대: ${STAGE[m.stage]}${m.art.name} — ${m.text}` : '',
  ].filter(Boolean).join('\n');
  const box = $('d-log');
  box.textContent = '';
  for (const r of [...logEl.children].filter((r) => r.dataset.actor === a.id).slice(-30)) box.append(r.cloneNode(true));
  $('detail').showModal();
  box.scrollTop = box.scrollHeight;
}
$('d-close').onclick = () => $('detail').close();
$('detail').onclick = (ev) => { if (ev.target === $('detail')) $('detail').close(); };

cv.addEventListener('click', (ev) => {
  const r = cv.getBoundingClientRect();
  const x = ((ev.clientX - r.left) * view.dpr - view.ox) / view.s, y = ((ev.clientY - r.top) * view.dpr - view.oy) / view.s;
  let best = null, bd = 13 * 13;
  for (const a of actors.values()) { const d = (a.x - x) ** 2 + (a.y - 9 - y) ** 2; if (d < bd) { bd = d; best = a; } }
  if (!best) for (const m of monsters.values()) if ((m.x - x) ** 2 + (m.y - 10 - y) ** 2 < 20 * 20) best = actors.get(m.session);
  if (best) openDetail(best);
});

const setBtn = (id, on) => $(id).classList.toggle('on', on);
$('b-sound').onclick = () => {
  soundOn = !soundOn;
  if (soundOn && !ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  try { localStorage.setItem('av-sound', soundOn ? '1' : '0'); } catch { /* 무시 */ }
  setBtn('b-sound', soundOn);
  if (soundOn) SFX.level();
};
$('b-alarm').onclick = async () => {
  if (!('Notification' in window)) return toast('이 브라우저는 알림을 지원하지 않아요');
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  setBtn('b-alarm', p === 'granted');
  toast(p === 'granted' ? '승인 대기 알림이 켜졌어요' : '알림 권한이 꺼져 있어요');
};
$('b-fold').onclick = () => { hud.classList.toggle('fold'); $('b-fold').textContent = hud.classList.contains('fold') ? '펼치기' : '접기'; resize(); };
new ResizeObserver(resize).observe(hud);
setBtn('b-sound', soundOn);
setBtn('b-alarm', 'Notification' in window && Notification.permission === 'granted');
addEventListener('pointerdown', () => { if (soundOn && !ac) ac = new (window.AudioContext || window.webkitAudioContext)(); }, { once: true });

// ---------- 시간과 하늘 ----------

const hourParam = new URLSearchParams(location.search).get('hour');
const hourNow = () => { if (hourParam !== null) return +hourParam; const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
// [시각, 하늘 위, 하늘 아래, 땅에 곱할 색, 어둠 정도]
const SKY = [
  [0, '#0b1030', '#1b2450', '#6a78b8', 1], [4.5, '#141a44', '#34386a', '#7480ba', 0.9], [6.5, '#6a7fc8', '#ffb48a', '#ffd6bc', 0.3],
  [8.5, '#6fb4ee', '#c4e6ff', '#ffffff', 0], [16.5, '#6fb4ee', '#c4e6ff', '#ffffff', 0], [18.5, '#5a6ac0', '#ff9a6a', '#ffc4a4', 0.3],
  [20.5, '#141a44', '#34386a', '#7480ba', 0.9], [24, '#0b1030', '#1b2450', '#6a78b8', 1],
];
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
let sky = null;
function updateSky() {
  const h = ((hourNow() % 24) + 24) % 24;
  let i = 0;
  while (h >= SKY[i + 1][0] && i < SKY.length - 2) i++;
  const A = SKY[i], B = SKY[i + 1], k = (h - A[0]) / (B[0] - A[0]);
  const day = h >= 6 && h < 19.5, t = day ? (h - 6) / 13.5 : ((h - 19.5 + 24) % 24) / 10.5;
  sky = { top: mix(A[1], B[1], k), bottom: mix(A[2], B[2], k), tint: mix(A[3], B[3], k), dark: A[4] + (B[4] - A[4]) * k, day, t, shadow: (0.5 - t) * 18 };
}
const STARS = Array.from({ length: 60 }, (_, i) => [(hash('sx' + i) % 1000) / 1000, hash('sy' + i) % 28, i % 3]);

// ---------- 갱신 ----------

function update(dt) {
  for (let i = timers.length - 1; i >= 0; i--) if (now >= timers[i].at) timers.splice(i, 1)[0].fn();

  for (const a of actors.values()) {
    const fighting = !a.linger && monsters.has(a.session) && !monsters.get(a.session).dying;
    if (a.linger && !a.leaving && now > a.modeUntil) { a.leaving = true; if (!a.bubble) say(a, '먼저 들어가 보겠습니다.', 1.6); }
    if (a.leader && !fighting && now > a.modeUntil) {
      if (a.mode === 'desk') rest(a, 16 + Math.random() * 14);
      else { a.mode = 'desk'; a.modeUntil = now + 25 + Math.random() * 40; }
    }
    const [tx, ty] = targetOf(a);
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    a.moving = d > 0.8;
    if (a.moving) {
      const step = Math.min(d, (a.leader ? 48 : 56) * dt);
      a.x += dx / d * step; a.y += dy / d * step;
      if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1;
    } else if (a.leaving) { actors.delete(a.id); stat(); }
    else if (fighting) a.face = monsters.get(a.session).x >= a.x ? 1 : -1;
    a.atDesk = a.leader && !fighting && !a.moving && a.mode === 'desk' && a.homeIdx < (L.guilds[a.guild] || L.guilds.claude).desks.length;
    a.resting = !fighting && !a.moving && !a.leaving && a.mode === 'rest' && (a.leader || a.linger);
    if (a.resting) a.face = (a.chatUntil > now ? a.chatX : L.fire.x) >= a.x ? 1 : -1;
    if (a.bubble && now > a.bubble.until) a.bubble = null;
  }

  if (now > nextBanter) { // 쉬는 이들끼리의 잡담
    const idle = [...actors.values()].filter((a) => a.resting && !a.bubble);
    nextBanter = now + (idle.length > 3 ? 3 : 5.5) + Math.random() * 4;
    const p = idle.length ? pick(idle) : null;
    // 말 상대는 가까이 있는 사람
    const q = p && idle.filter((b) => b !== p).sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
    if (q && Math.hypot(q.x - p.x, q.y - p.y) < 70) {
      const [first, second] = p.leader || !q.leader ? [p, q] : [q, p]; // 길드장이 끼면 길드장이 먼저 말을 건다
      const pool = first.leader ? (second.leader ? BANTER : MENTOR) : CREW_BANTER;
      const [l1, l2] = pick(pool).map((t) => t.replace('{n}', given(second)));
      first.chatX = second.x; second.chatX = first.x; first.chatUntil = second.chatUntil = now + 5.5;
      say(first, l1, 2.6);
      after(2.4, () => { if (second.resting) say(second, l2, 2.6); });
    } else if (p && Math.random() < 0.6) {
      if (Math.random() < 0.3) floatText(p.x + 4, p.y - p.art.h, 'Zzz', '#cfe0ff', 4.5, 2.2);
      else say(p, pick(p.leader ? MUSING : CREW_MUSING), 2.4);
    }
  }

  for (const m of monsters.values()) if (m.dying && now - m.dying > 0.6) { monsters.delete(m.session); stat(); }
  fx = fx.filter((e) => now - e.t0 < e.dur);
  for (const e of fx) if (e.type === 'dot' && now >= e.t0) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 95 * dt; }
}

// ---------- 그리기 ----------

function text(str, x, y, color, size = 5, bold = true) {
  ctx.font = `${bold ? '700 ' : ''}${size}px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(16,14,24,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function shadow(x, y, r) {
  const dx = sky.shadow * (0.4 + r / 14), a = 0.26 * (1 - sky.dark * 0.6);
  ctx.fillStyle = `rgba(10,14,24,${a})`;
  ctx.beginPath(); ctx.ellipse(x + dx / 2, y, r + Math.abs(dx) / 2, r * 0.36, 0, 0, 6.283); ctx.fill();
}
function glow(x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
function flame(x, y, size) {
  const f = Math.floor(now * 9);
  const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + a), Math.round(y + b), w, h); };
  for (let i = 0; i < size; i++) {
    const w = size - i, sway = ((f + i * 3) % 3) - 1;
    R(i < size * 0.4 ? '#ff7a2a' : i < size * 0.75 ? '#ffb347' : '#ffe36a', -w / 2 + (i > 1 ? sway : 0), -i * 1.6 - 2, Math.max(1, w), 2);
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const shake = shakeUntil > now ? [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3] : [0, 0];
  ctx.setTransform(view.s, 0, 0, view.s, view.ox + shake[0] * view.s, view.oy + shake[1] * view.s);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, L.W, L.H); ctx.clip();

  // 하늘, 해와 달
  const g = ctx.createLinearGradient(0, 0, 0, HOR + 4);
  g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, HOR + 6);
  if (sky.dark > 0.4) for (const [sx, sy, k] of STARS) {
    ctx.globalAlpha = (sky.dark - 0.4) * 1.6 * (0.5 + 0.5 * Math.sin(now * (1 + k) + sx * 50));
    ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(sx * L.W), sy, 1, 1);
  }
  ctx.globalAlpha = 1;
  const cxs = 10 + sky.t * (L.W - 20), cys = HOR - 4 - Math.sin(sky.t * Math.PI) * (HOR - 12);
  glow(cxs, cys, 18, sky.day ? '#fff3b0' : '#c8d4ff', 0.5);
  ctx.fillStyle = sky.day ? '#ffe36a' : '#eef2ff';
  ctx.beginPath(); ctx.arc(cxs, cys, sky.day ? 5 : 4, 0, 6.283); ctx.fill();
  if (!sky.day) { ctx.fillStyle = sky.top; ctx.beginPath(); ctx.arc(cxs + 2, cys - 1, 3.2, 0, 6.283); ctx.fill(); }

  ctx.drawImage(bg, 0, 0);

  // 그림자
  for (const p of props) if (p.shadow) shadow(...p.shadow);
  for (const a of actors.values()) if (!a.atDesk) shadow(a.x, a.y, 5);
  for (const m of monsters.values()) if (!m.dying) shadow(m.x, m.y, 9 * (m.stage === 2 ? 2 : 1));

  // 깊이 순서대로
  const things = [...props, ...actors.values(), ...monsters.values()].sort((p, q) => p.y - q.y);
  for (const t of things) t.draw ? t.draw() : t.art.job ? drawActor(t) : drawMonster(t);
  flame(L.fire.x, L.fire.y - 2, 6);
  for (const id of ORDER) {
    const b = L.guilds[id].beacon;
    if (beaconLit(id)) { flame(b.x + 0.5, b.y - 11, 7); if (Math.floor(now * 2) % 2) text('!', b.x + 0.5, b.y - 26, '#ffd84a', 8); }
    const lv = Math.min(5, levelOf(`g:${id}`) - 1); // 길드 레벨만큼 늘어나는 금빛 깃발
    for (let i = 0; i < lv; i++) { const p = L.guilds[id].at(4 + i * 6, DEPTH + 1); ctx.fillStyle = '#b8862a'; ctx.fillRect(p.x, p.y - 12, 1, 8); ctx.fillStyle = '#ffd84a'; ctx.fillRect(p.x + 1, p.y - 12, 4, 3); }
  }

  // 연출
  for (const e of fx) {
    if (now < e.t0) continue;
    const k = (now - e.t0) / e.dur;
    if (e.type === 'dot') { ctx.globalAlpha = 1 - k; ctx.fillStyle = e.color; ctx.fillRect(e.x, e.y, 1.6, 1.6); }
    else if (e.type === 'orb' || e.type === 'arrow') {
      const px = e.x + (e.tx - e.x) * k, py = e.y + (e.ty - e.y) * k - Math.sin(k * 3.14) * (e.type === 'arrow' ? 6 : 2);
      if (e.type === 'orb') { glow(px, py, 7, e.color, 0.8); ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 1, 2, 2); }
      else { ctx.strokeStyle = '#f4efe0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - (e.tx - e.x) / 12, py - (e.ty - e.y) / 12 - 1); ctx.stroke(); }
    } else if (e.type === 'slash') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x - 4, e.y + 2, 11, -1.2 + k * 1.4, 0.2 + k * 1.4); ctx.stroke();
    } else if (e.type === 'ring') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(e.x, e.y, 4 + k * 34, 0, 6.283); ctx.stroke();
    } else if (e.type === 'flash') { ctx.globalAlpha = 0.28 * (1 - k); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(0, 0, L.W, L.H); }
    ctx.globalAlpha = 1;
  }

  // 시간대 색조와 밤의 불빛
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = sky.tint; ctx.fillRect(0, HOR - 6, L.W, L.H);
  ctx.globalCompositeOperation = 'lighter';
  const fl = 0.85 + Math.sin(now * 7) * 0.15;
  if (sky.dark > 0.15) {
    for (const l of lights) glow(l.x, l.y, l.r, l.col, sky.dark * 0.5);
    for (const a of actors.values()) if (a.atDesk) glow(a.x, a.y - 8, 12, '#9cd0ff', sky.dark * 0.45);
  }
  glow(L.fire.x, L.fire.y - 6, 34, '#ff9a3c', (0.12 + sky.dark * 0.5) * fl);
  for (const id of ORDER) if (beaconLit(id)) { const b = L.guilds[id].beacon; glow(b.x, b.y - 16, 30, '#ffb347', (0.3 + sky.dark * 0.4) * fl); }
  ctx.globalCompositeOperation = 'source-over';

  // 글자는 색조 위에 그린다
  for (const id of ORDER) {
    const gd = L.guilds[id];
    text(`${GUILDS[id].name} Lv.${levelOf(`g:${id}`)}`, gd.door.x, FRONT + 15, '#fff', L.portrait ? 4 : 4.6);
  }
  for (const m of monsters.values()) {
    if (m.dying) continue;
    const sc = m.stage === 2 ? 2 : 1, top = m.y - m.art.img.height * sc - (m.art.float || 0) - 4, bw = 26 * sc;
    ctx.fillStyle = '#1c1624'; ctx.fillRect(m.x - bw / 2 - 1, top - 1, bw + 2, 4);
    ctx.fillStyle = m.stage ? '#ff5a4a' : m.hp > 0.4 ? '#6fe06a' : '#ffb347'; ctx.fillRect(m.x - bw / 2, top, bw * m.hp, 2);
    text(STAGE[m.stage] + cut(m.text, 14), m.x, top - 3, m.stage ? '#ffb0a0' : '#fff', 4.2);
  }
  for (const a of actors.values()) {
    if (a.leader) text(`Lv.${levelOf(`h:${a.guild}/${a.name}`)} ${cut(a.name, 12)}`, a.x, a.y + 6, '#ffe9a8', 4.2);
    else {
      text(a.name, a.x, a.y + 5.5, a.linger ? '#d8e4ff' : '#fff', 3.6, false);
      if (a.medals) text('★'.repeat(Math.min(3, a.medals)), a.x, a.y - a.art.h + 1, '#ffd84a', 4);
    }
  }
  for (const e of fx) if (e.type === 'text' && now >= e.t0) {
    const k = (now - e.t0) / e.dur;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
    text(e.text, e.x, e.y - k * 12, e.color, e.size);
    ctx.globalAlpha = 1;
  }
  for (const a of actors.values()) {
    const blocked = a.status === 'blocked';
    if (!a.bubble && !blocked) continue;
    const str = a.bubble ? a.bubble.text : '!';
    ctx.font = '700 4.4px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    const w = Math.max(8, ctx.measureText(str).width + 6), by = a.y - a.art.h - 9;
    const bx = Math.max(1, Math.min(L.W - w - 1, a.x - w / 2));
    ctx.fillStyle = '#1c1624'; ctx.fillRect(bx - 1, by - 1, w + 2, 10);
    ctx.fillStyle = blocked ? '#ffd84a' : a.leader ? '#fff6dc' : '#ffffff'; ctx.fillRect(bx, by, w, 8); ctx.fillRect(a.x - 1, by + 8, 2, 2);
    ctx.fillStyle = '#1c1624'; ctx.textAlign = 'center';
    ctx.fillText(str, bx + w / 2, by + 6);
  }
  ctx.restore();
}

const beaconLit = (guild) => { for (const a of actors.values()) if (a.guild === guild && a.status === 'blocked') return true; return false; };

function drawActor(a) {
  if (a.hurtUntil > now && Math.floor(now * 14) % 2) return;
  const A = a.art, cheer = a.cheerUntil > now, swing = a.swingUntil > now;
  const walk = a.moving ? Math.floor(now * 9 + a.seed) % 4 : 0;
  const frame = [A.stand, A.stepA, A.stand, A.stepB][walk];
  let bob = a.moving ? walk % 2 : 0;
  if (a.atDesk) bob = Math.floor(now * 5 + a.seed) % 4 === 0 ? 1 : 0; // 타이핑
  if (a.talkUntil > now) bob = Math.floor(now * 6) % 2;
  let y = a.y - (cheer ? Math.abs(Math.sin(now * 9 + a.seed)) * 6 : 0), x = a.x;
  if (swing) x += a.face * 3 * Math.sin((1 - (a.swingUntil - now) / 0.3) * Math.PI);

  if (a.leader && !a.atDesk) { // 길드장 발밑의 문장
    ctx.strokeStyle = guildOf(a.guild).color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(a.x, a.y, 8, 3, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(a.face, 1);
  const top = -A.h + 2 + bob;
  ctx.drawImage(sideOf(frame), -9 + 2 * a.face, top); // 옆면은 항상 화면 오른쪽
  ctx.drawImage(frame, -9, top);
  if (a.talkUntil > now && Math.floor(now * 8) % 2) { ctx.fillStyle = '#7a3028'; ctx.fillRect(-1, top + A.mouthY, 2, 1); }
  if (!a.atDesk) {
    const wp = WEAPONS[A.job.weapon];
    let ang = 0.15, lift = 0;
    if (swing) ang = -1.5 + (1 - (a.swingUntil - now) / 0.3) * 2.4;
    else if (cheer) { ang = -0.25; lift = 5; }
    else if (a.moving) ang = 0.15 + (walk % 2) * 0.2;
    ctx.translate(8, -7 - lift + bob); ctx.rotate(ang);
    ctx.drawImage(wp, -wp.width / 2, -wp.height + 2);
  }
  ctx.restore();
}

function drawMonster(m) {
  const A = m.art, dying = m.dying ? Math.min(1, (now - m.dying) / 0.6) : 0;
  const sc = (m.stage === 2 ? 2 : 1) * (1 - dying * 0.6);
  const breathe = Math.sin(now * 3.4 + m.seed);
  const w = A.img.width * sc * (A.flap ? 0.82 + Math.abs(Math.sin(now * 9)) * 0.18 : 1 + breathe * 0.03);
  const h = A.img.height * sc * (1 - breathe * 0.04);
  const lift = (A.float || 0) + (A.float ? Math.sin(now * 2.4 + m.seed) * 2 : 0);
  if (m.stage && !m.dying) { // 정예·보스의 붉은 기운
    ctx.globalAlpha = 0.35 + Math.sin(now * 5) * 0.15; ctx.strokeStyle = m.stage === 2 ? '#ff4a4a' : '#ff9a3c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 13 * sc, 4.5 * sc, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1 - dying;
  const hit = m.hitUntil > now && m.hitUntil - now < 0.16;
  const jx = hit ? 2 : 0;
  const flashing = hit || (m.dying && Math.floor(now * 20) % 2);
  if (!flashing) ctx.drawImage(sideOf(A.img), Math.round(m.x - w / 2 + jx + 2.5 * sc), Math.round(m.y - h - lift + 1), Math.round(w), Math.round(h));
  ctx.drawImage(flashing ? A.flash : A.img, Math.round(m.x - w / 2 + jx), Math.round(m.y - h - lift + 1), Math.round(w), Math.round(h));
  if (m.stage === 2 && !m.dying) ctx.drawImage(CROWN, Math.round(m.x - 6), Math.round(m.y - h - lift - 5));
  ctx.globalAlpha = 1;
}
const CROWN = bake(['y..y..y..y', 'yyyyyyyyyy', 'yryyryyryy', 'yyyyyyyyyy'], { y: '#ffd84a', r: '#e04848' });

let last = 0, skyAt = -99;
function frame(ts) {
  requestAnimationFrame(frame);
  if (ts - last < 48) return; // 약 20프레임
  const dt = Math.min(0.2, (ts - last) / 1000);
  last = ts; now = ts / 1000;
  if (now - skyAt > 20) { updateSky(); skyAt = now; }
  update(dt);
  draw();
}

// ---------- 시작 ----------

const year = new Date().getFullYear();
if (year > 2026) $('current-year').textContent = `-${year}`;

updateSky();
new ResizeObserver(resize).observe(stage);
resize();
requestAnimationFrame(frame);

const es = new EventSource('events');
es.onopen = () => { $('dot').className = 'on'; };
es.onerror = () => { $('dot').className = 'off'; $('stat').textContent = '연결 끊김 · 다시 시도 중'; };
es.addEventListener('snapshot', (ev) => onSnapshot(JSON.parse(ev.data)));
es.onmessage = (ev) => onEvent(JSON.parse(ev.data), true);

window.agentVillage = { actors, monsters }; // 콘솔에서 상태를 들여다보기 위한 창구
