// 에이전트 마을 뷰어. 프레임워크·엔진 없이 Canvas 2D 한 장으로 그린다.

const GUILDS = {
  claude: { name: 'Claude 길드', color: '#e0825c', dark: '#93492f' },
  codex: { name: 'Codex 길드', color: '#46c796', dark: '#1f7355' },
  antigravity: { name: 'Antigravity 길드', color: '#6b97ff', dark: '#3151a8' },
};
const ORDER = ['claude', 'codex', 'antigravity'];
const guildOf = (id) => GUILDS[id] || GUILDS.claude;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('world'), ctx = cv.getContext('2d'), logEl = $('log');

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ---------- 스프라이트 ----------

function sprite(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
    }
  });
  return c;
}

const HERO_TOP = [
  '...hhhh...',
  '..hhhhhh..',
  '..hsssshh.',
  '..sesses..',
  '..ssssss..',
  '.cccccccc.',
  'scccccccs.',
  '.cccccccc.',
  '..cccccc..',
];
const HERO_LEGS = [
  ['..pp..pp..', '..pp..pp..', '..bb..bb..'],
  ['..pp..pp..', '..bb..pp..', '......bb..'],
];
const CROWN = '..y.yy.y..', NO_CROWN = '..........';
const HAIRS = ['#3b2a20', '#c9a24a', '#7a4a2a', '#d8d8e0', '#2d3a66', '#8a3d3d'];
const heroCache = new Map();

function heroFrames(guild, leader, seed) {
  const hair = HAIRS[seed % HAIRS.length];
  const key = guild + leader + hair;
  if (!heroCache.has(key)) {
    const g = guildOf(guild);
    const pal = { h: hair, s: '#f2c79c', e: '#1c1c28', c: g.color, p: g.dark, b: '#2a2420', y: '#ffd84a' };
    heroCache.set(key, HERO_LEGS.map((legs) => sprite([leader ? CROWN : NO_CROWN, ...HERO_TOP, ...legs], pal)));
  }
  return heroCache.get(key);
}

const SLIME = [
  '....gggg....',
  '..gggggggg..',
  '.gglggggggg.',
  '.ggwkggwkgg.',
  'gggggggggggg',
  'gggggggggggg',
  'gggdggggdggg',
  '.dddddddddd.',
];
const SLIME_COLORS = [['#7ad65a', '#3f8f34', '#c9f5b0'], ['#b07cf0', '#6a3fb0', '#e2ccff'], ['#f06a6a', '#a83434', '#ffc9c9'], ['#5ac8e0', '#2f7f94', '#c4f1fa']];
const slimes = SLIME_COLORS.map(([g, d, l]) => sprite(SLIME, { g, d, l, w: '#ffffff', k: '#1c1c28' }));
const slimeFlash = sprite(SLIME, { g: '#fff', d: '#fff', l: '#fff', w: '#fff', k: '#fff' });

// ---------- 배치 ----------

let L, bg, view = { s: 1, ox: 0, oy: 0 };

function makeLayout(portrait) {
  const l = portrait
    ? { portrait, W: 200, H: 300, field: { x: 6, y: 112, w: 188, h: 182 }, plaza: { x: 4, y: 66, w: 192, h: 40 } }
    : { portrait, W: 320, H: 200, field: { x: 114, y: 8, w: 200, h: 184 }, plaza: { x: 60, y: 4, w: 48, h: 192 } };
  l.guilds = {};
  ORDER.forEach((id, i) => {
    l.guilds[id] = portrait
      ? { x: 36 + i * 64, y: 46, hx: 36 + i * 64, hy: 76 }
      : { x: 34, y: 36 + i * 62, hx: 84, hy: 30 + i * 62 };
  });
  const cols = Math.floor(l.field.w / 66), rows = Math.floor(l.field.h / 56);
  l.slots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    l.slots.push({ x: l.field.x + (c + 0.62) * l.field.w / cols, y: l.field.y + (r + 0.55) * l.field.h / rows });
  }
  return l;
}

function renderBg() {
  const c = document.createElement('canvas');
  c.width = L.W; c.height = L.H;
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const speck = (r, colors, n) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = colors[(rnd() * colors.length) | 0];
      x.fillRect((r.x + rnd() * r.w) | 0, (r.y + rnd() * r.h) | 0, 1 + (rnd() * 2 | 0), 1);
    }
  };
  const all = { x: 0, y: 0, w: L.W, h: L.H };
  x.fillStyle = '#4f9146'; x.fillRect(0, 0, L.W, L.H);
  speck(all, ['#458640', '#5ba050'], 500);

  x.fillStyle = '#cdb27a'; x.fillRect(L.plaza.x, L.plaza.y, L.plaza.w, L.plaza.h);
  speck(L.plaza, ['#bfa46c', '#d9c08c'], 160);

  const f = L.field;
  x.fillStyle = '#2c5a33'; x.fillRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2);
  x.fillStyle = '#3a7040'; x.fillRect(f.x, f.y, f.w, f.h);
  speck(f, ['#33653a', '#447c49', '#2f5e36'], 600);
  for (let i = 0; i < 14; i++) { // 바위
    const rx = (f.x + 4 + rnd() * (f.w - 10)) | 0, ry = (f.y + 4 + rnd() * (f.h - 8)) | 0;
    x.fillStyle = '#7d8590'; x.fillRect(rx, ry, 4, 2);
    x.fillStyle = '#a3abb5'; x.fillRect(rx + 1, ry - 1, 2, 1);
  }

  for (const id of ORDER) {
    const g = L.guilds[id], G = GUILDS[id];
    x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(g.x - 17, g.y + 9, 34, 3);
    x.fillStyle = '#e9dec4'; x.fillRect(g.x - 16, g.y - 8, 32, 18);
    x.fillStyle = '#cfc2a3'; x.fillRect(g.x - 16, g.y + 7, 32, 3);
    x.fillStyle = G.color; x.fillRect(g.x - 18, g.y - 14, 36, 7);
    x.fillStyle = G.dark; x.fillRect(g.x - 13, g.y - 20, 26, 6);
    x.fillRect(g.x - 18, g.y - 8, 36, 1);
    x.fillStyle = '#5a3b22'; x.fillRect(g.x - 3, g.y + 1, 6, 9);
    x.fillStyle = '#ffd84a'; x.fillRect(g.x + 1, g.y + 5, 1, 1);
    x.fillStyle = '#8fdcff';
    x.fillRect(g.x - 12, g.y - 4, 5, 5); x.fillRect(g.x + 7, g.y - 4, 5, 5);
    x.fillStyle = '#5a3b22'; x.fillRect(g.x + 14, g.y - 31, 1, 12);
    x.fillStyle = G.color; x.fillRect(g.x + 15, g.y - 31, 7, 5);
  }
  return c;
}

function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const portrait = r.height > r.width * 1.05;
  if (!L || L.portrait !== portrait) {
    L = makeLayout(portrait);
    bg = renderBg();
    for (const m of monsters.values()) Object.assign(m, slotPos(m.slot));
    for (const a of actors.values()) { setHome(a); [a.x, a.y] = targetOf(a); }
  }
  let s = Math.min(cv.width / L.W, cv.height / L.H);
  if (s >= 2) s = Math.floor(s * 2) / 2;
  view = { s, ox: Math.round((cv.width - L.W * s) / 2), oy: Math.round((cv.height - L.H * s) / 2), dpr };
}

// ---------- 세계 상태 ----------

const actors = new Map();   // actor id → 캐릭터
const monsters = new Map(); // session id → 몬스터
const labels = new Map();   // actor id → { name, guild } (퇴장 후에도 대화창에 이름을 쓰기 위해)
let fx = [];                // 투사체·입자·떠오르는 글자
let wins = 0, now = 0;

function setHome(a) {
  const g = L.guilds[a.guild] || L.guilds.claude;
  a.hx = g.hx + ((a.homeIdx % 3) - 1) * 12;
  a.hy = g.hy + (Math.floor(a.homeIdx / 3) % 3) * 10;
}
const slotPos = (i) => { const s = L.slots[i % L.slots.length]; return { x: s.x, y: s.y }; };

function partyOf(session) {
  const out = [];
  for (const a of actors.values()) if (a.session === session && !a.leaving) out.push(a);
  return out;
}

function targetOf(a) {
  const g = L.guilds[a.guild] || L.guilds.claude;
  if (a.leaving) return [g.x, g.y + 11];
  const m = monsters.get(a.session);
  if (m && !m.dying) {
    const party = partyOf(a.session), k = party.indexOf(a);
    const ang = Math.PI + (k - (party.length - 1) / 2) * 0.6;
    return [m.x + Math.cos(ang) * 25, m.y + Math.sin(ang) * 17 + 3];
  }
  return [a.hx + a.wx, a.hy + a.wy];
}

function addActor(s, leader) {
  const used = new Set();
  for (const b of actors.values()) if (b.guild === s.guild) used.add(b.homeIdx);
  let homeIdx = 0;
  while (used.has(homeIdx)) homeIdx++;
  const g = L.guilds[s.guild] || L.guilds.claude;
  const a = {
    id: s.actor, guild: s.guild, session: s.session, leader, name: s.name || s.role || '모험가', role: s.role || '',
    status: s.status || 'idle', homeIdx, x: g.x, y: g.y + 11, wx: 0, wy: 0, wanderAt: 0,
    frames: heroFrames(s.guild, leader, hash(s.actor)), bubble: null, lungeUntil: 0, hurtUntil: 0, cheerUntil: 0,
    leaving: false, moving: false,
  };
  setHome(a);
  actors.set(a.id, a);
  const boss = actors.get(s.session);
  labels.set(a.id, { name: leader || !boss ? a.name : `${boss.name}/${a.name}`, guild: a.guild });
  return a;
}

function addMonster(session, text, hp = 1) {
  const taken = new Set();
  for (const m of monsters.values()) taken.add(m.slot);
  let slot = 0;
  while (taken.has(slot) && slot < L.slots.length) slot++;
  if (slot >= L.slots.length) slot = hash(session) % L.slots.length;
  const m = { session, slot, ...slotPos(slot), hp, text, kind: hash(text + session) % slimes.length, hitUntil: 0, dying: 0, seed: Math.random() * 6 };
  monsters.set(session, m);
  return m;
}

// ---------- 연출 ----------

const TOOL_COLORS = [[/^(read|grep|glob|ls)/i, '#8fdcff'], [/^(edit|write|notebook|apply)/i, '#ffffff'], [/^(bash|shell|exec)/i, '#ffd84a'], [/^(web|fetch|search)/i, '#c9a3ff']];
const toolColor = (t = '') => (TOOL_COLORS.find(([re]) => re.test(t)) || [0, '#a6f08f'])[1];

function push(e) {
  if (document.hidden) return; // 안 보이는 탭에서는 연출을 쌓지 않는다
  if (fx.length > 240) fx.splice(0, 60);
  fx.push(e);
}
function burst(x, y, colors, n, speed = 40) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = speed * (0.3 + Math.random());
    push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, t0: now, dur: 0.4 + Math.random() * 0.5, color: colors[i % colors.length] });
  }
}
const floatText = (x, y, text, color, size = 5, dur = 1) => push({ type: 'text', x, y, text, color, size, t0: now, dur });
const say = (a, text, dur = 2.5) => { a.bubble = { text: cut(text, 16), until: now + dur }; };

// ---------- 이벤트 처리 ----------

function onEvent(e, live) {
  const a = actors.get(e.actor);
  switch (e.kind) {
    case 'join':
      if (!actors.has(e.actor)) addActor(e, true);
      log(e, 'sys', '마을에 도착했다');
      break;
    case 'hire': {
      if (!actors.has(e.actor)) { const n = addActor(e, false); if (live) say(n, '합류!'); }
      log(e, 'sys', '길드원으로 고용되었다');
      break;
    }
    case 'dismiss':
      if (a) { a.leaving = true; a.bubble = null; }
      break;
    case 'leave':
      for (const b of actors.values()) if (b.session === e.session) b.leaving = true;
      monsters.delete(e.session);
      log(e, 'sys', '마을을 떠났다');
      break;
    case 'quest': {
      const m = addMonster(e.session, e.text || '의뢰');
      if (live) burst(m.x, m.y - 6, ['#ffffff', '#c9c9d9'], 14, 30);
      log(e, '', `의뢰 접수 — ${e.text || ''}`);
      break;
    }
    case 'tool': {
      const m = monsters.get(e.session);
      if (a && live) {
        a.lungeUntil = now + 0.25;
        say(a, e.tool || '공격', 1.2);
        if (m && !m.dying) {
          const color = toolColor(e.tool);
          push({ type: 'shot', x: a.x, y: a.y - 7, tx: m.x, ty: m.y - 7, t0: now, dur: 0.22, color });
          m.hitUntil = now + 0.38;
          floatText(m.x + (Math.random() * 10 - 5), m.y - 20, String(12 + (Math.random() * 80 | 0)), color);
        }
      }
      if (m && !m.dying) m.hp = Math.max(0.12, m.hp - 0.05 - Math.random() * 0.05);
      log(e, '', `${e.tool || '도구'} ▸ ${e.text || ''}`);
      break;
    }
    case 'result':
      if (e.ok === false) {
        if (a && live) { a.hurtUntil = now + 0.6; burst(a.x, a.y - 6, ['#ff6b6b', '#ffb3b3'], 8, 25); }
        log(e, 'bad', '반격을 받았다');
      }
      break;
    case 'say':
      if (a && live) say(a, '…', 1.8);
      log(e, '', e.text || '');
      break;
    case 'status':
      if (a) a.status = e.status;
      if (e.status === 'blocked') log(e, 'bad', '승인을 기다리는 중');
      break;
    case 'victory': {
      wins++;
      const m = monsters.get(e.session);
      if (m && !m.dying) {
        if (live) {
          m.dying = now;
          burst(m.x, m.y - 6, ['#ffd84a', '#ffffff', '#ff9f5a'], 36, 70);
          push({ type: 'ring', x: m.x, y: m.y - 6, t0: now, dur: 0.6 });
          floatText(m.x, m.y - 24, '미션 성공!', '#ffd84a', 8, 2);
          for (const b of partyOf(e.session)) b.cheerUntil = now + 1.6;
        } else monsters.delete(e.session);
      }
      log(e, 'win', '미션 성공!');
      break;
    }
  }
  if (live) stat();
}

function onSnapshot(s) {
  actors.clear(); monsters.clear(); labels.clear(); fx = [];
  logEl.textContent = '';
  wins = 0;
  for (const st of s.actors || []) addActor(st, st.actor === st.session);
  for (const st of s.actors || []) if (st.quest) addMonster(st.session, st.quest, 0.6);
  for (const a of actors.values()) [a.x, a.y] = targetOf(a);
  for (const e of s.recent || []) {
    // 장면은 actors 로 이미 복원했으므로 지난 이벤트는 대화창에만 반영한다.
    const kept = { actors: new Map(actors), monsters: new Map(monsters) };
    onEvent(e, false);
    actors.clear(); kept.actors.forEach((v, k) => actors.set(k, v));
    monsters.clear(); kept.monsters.forEach((v, k) => monsters.set(k, v));
  }
  for (const a of actors.values()) a.leaving = false;
  wins = s.wins || 0;
  stat();
}

// ---------- 대화창 ----------

function log(e, cls, text) {
  const who = labels.get(e.actor) || labels.get(e.session) || { name: e.name || '?', guild: e.guild };
  const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  const row = document.createElement('div');
  row.className = 'row ' + cls;
  row.dataset.actor = e.actor || '';
  const time = document.createElement('time');
  time.textContent = new Date(e.t || Date.now()).toTimeString().slice(0, 8);
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
  const m = monsters.get(a.session);
  $('d-name').textContent = labels.get(a.id)?.name || a.name;
  $('d-name').style.color = guildOf(a.guild).color;
  $('d-meta').textContent = [
    `${guildOf(a.guild).name} · ${a.leader ? '길드장' : '길드원'}`,
    `상태: ${STATUS[a.status] || a.status}`,
    m && !m.dying ? `의뢰: ${m.text}` : '',
  ].filter(Boolean).join('\n');
  const box = $('d-log');
  box.textContent = '';
  const rows = [...logEl.children].filter((r) => r.dataset.actor === a.id).slice(-30);
  for (const r of rows) box.append(r.cloneNode(true));
  $('detail').showModal();
  box.scrollTop = box.scrollHeight;
}
$('d-close').onclick = () => $('detail').close();
$('detail').onclick = (ev) => { if (ev.target === $('detail')) $('detail').close(); };

cv.addEventListener('click', (ev) => {
  const r = cv.getBoundingClientRect();
  const x = ((ev.clientX - r.left) * view.dpr - view.ox) / view.s;
  const y = ((ev.clientY - r.top) * view.dpr - view.oy) / view.s;
  let best = null, bd = 14 * 14;
  for (const a of actors.values()) {
    const d = (a.x - x) ** 2 + (a.y - 7 - y) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) for (const m of monsters.values()) {
    if ((m.x - x) ** 2 + (m.y - 8 - y) ** 2 < 18 * 18) best = actors.get(m.session);
  }
  if (best) openDetail(best);
});

// ---------- 갱신·그리기 ----------

function update(dt) {
  for (const a of actors.values()) {
    if (!monsters.has(a.session) && !a.leaving && now > a.wanderAt) {
      a.wx = Math.random() * 8 - 4; a.wy = Math.random() * 6 - 3;
      a.wanderAt = now + 3 + Math.random() * 4;
    }
    const [tx, ty] = targetOf(a);
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    a.moving = d > 0.8;
    if (a.moving) {
      const step = Math.min(d, 46 * dt);
      a.x += dx / d * step; a.y += dy / d * step;
    } else if (a.leaving) actors.delete(a.id);
    if (a.bubble && now > a.bubble.until) a.bubble = null;
  }
  for (const m of monsters.values()) if (m.dying && now - m.dying > 0.5) monsters.delete(m.session);
  fx = fx.filter((e) => now - e.t0 < e.dur);
  for (const e of fx) if (e.type === 'dot') { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 90 * dt; }
}

function text(str, x, y, color, size = 5, bold = false) {
  ctx.font = `${bold ? '700 ' : ''}${size}px system-ui, "Apple SD Gothic Neo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.75)';
  ctx.fillText(str, x + 0.5, y + 0.5);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0);

  for (const id of ORDER) {
    const g = L.guilds[id];
    text(GUILDS[id].name, g.x, g.y + 19, '#fff', 4.5, true);
  }

  const things = [...actors.values(), ...monsters.values()].sort((p, q) => p.y - q.y);
  for (const t of things) (t.frames ? drawActor : drawMonster)(t);

  for (const e of fx) {
    const k = (now - e.t0) / e.dur;
    if (e.type === 'dot') {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = e.color; ctx.fillRect(e.x, e.y, 1.5, 1.5);
    } else if (e.type === 'shot') {
      ctx.fillStyle = e.color;
      for (let i = 0; i < 3; i++) {
        const j = Math.max(0, k - i * 0.08);
        ctx.globalAlpha = 1 - i * 0.3;
        ctx.fillRect(e.x + (e.tx - e.x) * j - 1, e.y + (e.ty - e.y) * j - 1, 2.5, 2.5);
      }
    } else if (e.type === 'ring') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, 4 + k * 26, 0, 6.283); ctx.stroke();
    } else if (e.type === 'text') {
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
      text(e.text, e.x, e.y - k * 12, e.color, e.size, true);
    }
    ctx.globalAlpha = 1;
  }

  for (const a of actors.values()) {
    const blocked = a.status === 'blocked';
    if (!a.bubble && !blocked) continue;
    const str = blocked ? '!' : a.bubble.text;
    ctx.font = '700 4.5px system-ui, "Apple SD Gothic Neo", sans-serif';
    const w = Math.max(7, ctx.measureText(str).width + 5), bx = a.x - w / 2, by = a.y - 25;
    if (blocked && Math.floor(now * 3) % 2) continue;
    ctx.fillStyle = blocked ? '#ffd84a' : '#ffffff';
    ctx.fillRect(bx, by, w, 8); ctx.fillRect(a.x - 1, by + 8, 2, 2);
    ctx.fillStyle = '#1c1c28'; ctx.textAlign = 'center';
    ctx.fillText(str, a.x, by + 6);
  }
}

function drawActor(a) {
  let x = a.x, y = a.y;
  if (a.hurtUntil > now && Math.floor(now * 14) % 2) return;
  if (a.cheerUntil > now) y -= Math.abs(Math.sin(now * 10)) * 4;
  if (a.lungeUntil > now) {
    const m = monsters.get(a.session);
    if (m) { const d = Math.hypot(m.x - x, m.y - y) || 1; x += (m.x - x) / d * 3; y += (m.y - y) / d * 3; }
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(a.x - 4, a.y - 1, 8, 2);
  const f = a.frames[a.moving ? Math.floor(now * 7) % 2 : 0];
  ctx.drawImage(f, Math.round(x - 5), Math.round(y - 13 - (a.moving ? Math.floor(now * 7) % 2 : 0)));
  if (a.leader) text(cut(a.name, 12), a.x, a.y + 5, '#fff', 4);
}

function drawMonster(m) {
  const dying = m.dying ? Math.min(1, (now - m.dying) / 0.5) : 0;
  const squish = Math.sin(now * 4 + m.seed) * 1;
  const w = 24 * (1 - dying), h = (16 + squish) * (1 - dying);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(m.x - 11, m.y - 1, 22, 3);
  ctx.globalAlpha = 1 - dying;
  const hit = m.hitUntil > now && now > m.hitUntil - 0.16;
  ctx.drawImage(hit ? slimeFlash : slimes[m.kind], Math.round(m.x - w / 2), Math.round(m.y - h), w, h);
  ctx.globalAlpha = 1;
  if (m.dying) return;
  ctx.fillStyle = '#1c1c28'; ctx.fillRect(m.x - 12, m.y - 22, 24, 3);
  ctx.fillStyle = m.hp > 0.4 ? '#6fe06a' : '#ffb347'; ctx.fillRect(m.x - 11, m.y - 21, 22 * m.hp, 1);
  text(cut(m.text, 14), m.x, m.y - 25, '#fff', 4);
}

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (ts - last < 66) return; // 약 15프레임
  const dt = Math.min(0.2, (ts - last) / 1000);
  last = ts; now = ts / 1000;
  update(dt);
  draw();
}

// ---------- 시작 ----------

const year = new Date().getFullYear();
if (year > 2026) $('current-year').textContent = `-${year}`;

new ResizeObserver(resize).observe(stage);
resize();
requestAnimationFrame(frame);

const es = new EventSource('events');
es.onopen = () => { $('dot').className = 'on'; };
es.onerror = () => { $('dot').className = 'off'; $('stat').textContent = '연결 끊김 · 다시 시도 중'; };
es.addEventListener('snapshot', (ev) => onSnapshot(JSON.parse(ev.data)));
es.onmessage = (ev) => onEvent(JSON.parse(ev.data), true);
