// 도트 그림. 모든 스프라이트는 문자 격자로 평면 색만 적고,
// bake() 가 외곽선과 가장자리 명암을 자동으로 입힌다.

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const OUTLINE = [28, 22, 36];

export function bake(rows, pal, { mirror = false } = {}) {
  if (mirror) rows = rows.map((r) => r + [...r].reverse().join(''));
  const sw = Math.max(...rows.map((r) => r.length)), sh = rows.length;
  const w = sw + 2, h = sh + 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const on = (x, y) => y >= 0 && y < sh && x >= 0 && x < rows[y].length && pal[rows[y][x]] !== undefined;
  for (let y = 0; y < sh; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = pal[rows[y][x]];
    if (!col) continue;
    const k = (!on(x + 1, y) || !on(x, y + 1)) ? 0.78 : (!on(x - 1, y) || !on(x, y - 1)) ? 1.14 : 1;
    const i = ((y + 1) * w + x + 1) * 4, rgb = hex(col);
    d[i] = Math.min(255, rgb[0] * k); d[i + 1] = Math.min(255, rgb[1] * k); d[i + 2] = Math.min(255, rgb[2] * k); d[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x - 1, y - 1)) continue;
    if (on(x - 2, y - 1) || on(x, y - 1) || on(x - 1, y - 2) || on(x - 1, y)) {
      const i = (y * w + x) * 4;
      d[i] = OUTLINE[0]; d[i + 1] = OUTLINE[1]; d[i + 2] = OUTLINE[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- 캐릭터 ----------

const BODY = [ // 왼쪽 절반(8칸). 좌우 대칭으로 펼친다.
  '....HHHH',
  '...HHHHH',
  '...HhSSS',
  '...SSeSS',
  '...SSSSS',
  '....SSSS',
  '...CCCCC',
  '..CCCCCC',
  '..ScCCCC',
  '..ScCCBB',
  '...CCCCC',
  '....CCcc',
];
const LEGS = {
  stand: ['.....PP..PP.....', '.....PP..PP.....', '.....FF..FF.....'],
  stepA: ['.....PP..PP.....', '.....PP..FF.....', '.....FF.........'],
  stepB: ['.....PP..PP.....', '.....FF..PP.....', '.........FF.....'],
};
const HEADROOM = 6;

// 모자: [머리 꼭대기 기준 줄 위치, 줄 내용]
const HATS = {
  crown: [[-1, '....y.yyyy.y....'], [0, '....yyyyyyyy....']],
  wizard: [[-5, '.......WW.......'], [-4, '......WWWW......'], [-3, '......WWWW......'], [-2, '.....WWWWWW.....'], [-1, '....yyyyyyyy....'], [0, '..WWWWWWWWWWWW..']],
  helmet: [[-2, '.......rr.......'], [-1, '......rrrr......']],
  hood: [[-1, '.....HHHHHH.....'], [3, '..H..........H..'], [4, '..H..........H..']],
  headband: [[1, '...RRRRRRRRRR...'], [2, '.............RR.']],
  cap: [[-1, '...KKKKKKKKKK...'], [0, '....KKKKKKKKy...'], [1, '............y...']],
  beret: [[-1, '.....NNNNNN.....'], [0, '...NNNNNNNNNN...'], [3, '..........yy....']],
  goggles: [[-1, '....H.H..H.H....'], [3, '...yOOyyyyOOy...']],
};

// 직업: 모자, 머리색 덮어쓰기, 무기, 공격 방식
export const JOBS = {
  knight: { hat: 'helmet', hair: '#b9c0cc', weapon: 'sword', attack: 'melee' },
  mage: { hat: 'wizard', weapon: 'staff', attack: 'magic' },
  scout: { hat: 'hood', hair: '#3f8a4a', weapon: 'bow', attack: 'arrow' },
  rogue: { hat: 'headband', weapon: 'dagger', attack: 'melee' },
  scholar: { hat: 'cap', weapon: 'book', attack: 'magic' },
  appraiser: { hat: 'beret', weapon: 'lens', attack: 'magic' },
  engineer: { hat: 'goggles', weapon: 'wrench', attack: 'melee' },
};

const HAIRS = ['#4a3226', '#d9b25a', '#8a5230', '#e6e6ee', '#39467a', '#a04848', '#2c2c34'];
const SKINS = ['#f6cfa4', '#eab98a', '#c98f62'];
const heroCache = new Map();

export function hero({ job, color, dark, leader, seed }) {
  const key = [job, color, leader, seed % 21].join();
  if (heroCache.has(key)) return heroCache.get(key);
  const J = JOBS[job] || JOBS.knight;
  const pal = {
    H: J.hair || HAIRS[seed % HAIRS.length], h: '#00000000', S: SKINS[seed % SKINS.length], e: '#20202c',
    C: color, c: dark, B: leader ? '#ffd84a' : '#5a4636', P: leader ? '#3a3550' : '#5b5568', F: '#3a2c24',
    K: job === 'scholar' && !leader ? '#2e3c78' : dark, y: '#ffd84a', W: '#5a3fa8', r: '#e04848', R: '#d83a3a',
    N: '#7a4a2a', O: '#7fe6ff',
  };
  pal.h = pal.H;
  let body = BODY.map((r) => r + [...r].reverse().join(''));
  if (!leader) body = body.filter((_, i) => i !== 7); // 길드원은 한 줄 짧다
  const hats = [...(HATS[J.hat] || [])];
  if (leader && job === 'knight') hats.length = 0, hats.push(...HATS.crown);

  const frames = {};
  for (const [name, legs] of Object.entries(LEGS)) {
    const rows = [...Array(HEADROOM).fill('................'), ...body, ...(leader ? legs : legs.slice(1))].map((r) => [...r]);
    for (const [at, line] of hats) [...line].forEach((ch, x) => { if (ch !== '.') rows[HEADROOM + at][x] = ch; });
    if (leader) { // 망토와 견장
      const top = HEADROOM + 7;
      for (let y = top; y < rows.length - 1; y++) for (let x = 1; x < 15; x++) if (rows[y][x] === '.') rows[y][x] = 'K';
      rows[HEADROOM + 6][2] = rows[HEADROOM + 6][13] = 'y';
    }
    frames[name] = bake(rows.map((r) => r.join('')), pal);
  }
  const out = { ...frames, w: 18, h: frames.stand.height, mouthY: HEADROOM + 6, job: J };
  heroCache.set(key, out);
  return out;
}

const WPAL = { s: '#dfe6f0', y: '#ffd84a', b: '#7a5230', O: '#8fe9ff', w: '#f4efe0', p: '#b58cff' };
export const WEAPONS = {
  sword: bake(['.s.', '.s.', '.s.', '.s.', '.s.', '.s.', 'yyy', '.b.', '.b.'], WPAL),
  staff: bake(['.p.', 'ppp', '.p.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.'], WPAL),
  bow: bake(['.b..', '..b.', '...b', '...b', '...b', '...b', '...b', '..b.', '.b..'], WPAL),
  dagger: bake(['.s.', '.s.', '.s.', 'yyy', '.b.'], WPAL),
  book: bake(['bbbbb', 'bwwwb', 'bwwwb', 'bbbbb'], WPAL),
  lens: bake(['.OO.', 'O..O', 'O..O', '.OO.', '..b.', '..b.', '..b.'], WPAL),
  wrench: bake(['s.s', 'sss', '.s.', '.s.', '.s.', '.s.', '.s.'], WPAL),
};

// ---------- 몬스터 ----------

const M = (rows, pal, name, opt = {}) => ({ name, img: bake(rows, pal, { mirror: true }), flash: bake(rows, Object.fromEntries(Object.keys(pal).map((k) => [k, '#ffffff'])), { mirror: true }), ...opt });

export const MONSTERS = {
  slime: M([
    '......gggg', '....gggggg', '...ggllggg', '..ggllgggg', '.ggggggggg', '.gggggWKgg', '.gggggWKgg',
    'gggggggggg', 'ggggggggmm', 'gggggggggg', 'dggggggggg', '.ddddggggd',
  ], { g: '#6fd35a', l: '#c4f5a8', d: '#3f9a3a', W: '#ffffff', K: '#20202c', m: '#2f6a2c' }, '성능 슬라임'),
  bug: M([
    '...a......', '....a.....', '.....a.hhh', '......hhhh', '.....hhWKh', '..l.bbbbbb', '...lbbsbbb',
    '..bbbbbbbb', 'l.bbbsbbbb', '.lbbbbbbbb', '..bbbbbbsb', '..lbbbbbbb', '.l..bbbbbb', '......bbbb',
  ], { a: '#3a2a3a', h: '#4a3550', W: '#ffe36a', K: '#20202c', b: '#d8483c', s: '#3a2a3a', l: '#3a2a3a' }, '버그벌레'),
  mushroom: M([
    '......rrrr', '....rrrrrr', '...rrwwrrr', '..rrrwwrrr', '.rrrrrrrrw', '.rrrrrrrrw', 'rrwwrrrrrr', 'rrwwrrrrrr',
    '.rrrrrrrrr', '....cccccc', '....ccKccc', '....cccccm', '....cccccc', '.....ccccc',
  ], { r: '#e8643c', w: '#fff3dc', c: '#f4e2bc', K: '#20202c', m: '#a05a3a' }, '기능 버섯'),
  golem: M([
    '.....sssss', '....ssssss', '....sEEsss', '....ssssss', '..ssssssss', '.sssssssss', 'ssssssssCs', 'sss.ssssCC',
    'sss.ssssss', 'sss.ssssss', 'sss..sssss', '.ss..sssss', '.....sss..', '.....sss..', '....ssss..',
  ], { s: '#8f96a3', E: '#7fe6ff', C: '#ffb347' }, '스파게티 골렘'),
  ghost: M([
    '.....wwww', '...wwwwww', '..wwwwwww', '.wwwwwwww', '.wwwwKKww', '.wwwwKKww', '.wwwwwwww', '.wwwwwwwm',
    '.wwwwwwwm', '.wwwwwwww', '.wwwwwwww', '.wwwwwwww', '.ww.www.w', '.w...w...',
  ], { w: '#e9ecff', K: '#3a3f6a', m: '#3a3f6a' }, '문서 유령', { float: 5 }),
  bat: M([
    '.......p....', '........p.pp', 'pp......pppp', 'ppp....ppKpp', 'ppppp.pppppp', 'pppppppppppp',
    '.ppppppppppw', '..pp.ppppppw', '...p..pppp..', '.......pp...',
  ], { p: '#7a5ac8', K: '#ffe36a', w: '#ffffff' }, '테스트 박쥐', { float: 9, flap: true }),
};

const RULES = [
  [/버그|오류|에러|고쳐|깨지|bug|fix|error|crash/i, 'bug'],
  [/리팩터|리팩토|구조|정리|refactor|clean/i, 'golem'],
  [/문서|readme|docs?|주석|설명/i, 'ghost'],
  [/테스트|test|검증|spec/i, 'bat'],
  [/추가|구현|기능|만들|feature|add|implement/i, 'mushroom'],
  [/성능|속도|배포|최적화|perf|deploy|optimi/i, 'slime'],
];
export function monsterFor(text, seed) {
  const hit = RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : Object.keys(MONSTERS)[seed % 6];
}

// ---------- 소품 ----------

export const TREE = bake([
  '....ttt', '..ttttt', '.tttTtt', '.ttTttt', 'ttttttt', 'tttTttt', 'ttttttT', '.tttttt', '.tTtttt', '..ttttt',
  '....ttt', '......b', '......b', '......b', '.....bb',
], { t: '#3f9a4a', T: '#2f7a3c', b: '#6a4a30' }, { mirror: true });

// ---------- 비스듬한 측면 시점 ----------
// 가로는 그대로 두고 깊이(v)만 왼쪽 아래로 기울인다. 그래서 왼쪽 옆벽과 가구의 오른쪽 옆면이 보인다.

export const SK = 0.42, SY = 0.72, DEPTH = 64, WALL_H = 30;
const shade = (c, k) => '#' + hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');

// (ox, by) 는 방 바닥의 뒤쪽 왼쪽 모서리. u=가로, v=깊이, z=높이.
export function oblique(x, ox, by) {
  const T = (u, v, z = 0) => [ox + u - v * SK, by + v * SY - z];
  const quad = (pts, col) => {
    x.fillStyle = col; x.beginPath();
    pts.forEach((p, i) => { const [a, b] = T(...p); i ? x.lineTo(a, b) : x.moveTo(a, b); });
    x.closePath(); x.fill();
  };
  const line = (p, q, col, w = 1) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(...T(...p)); x.lineTo(...T(...q)); x.stroke(); };
  // 윗면·앞면·오른쪽 옆면이 보이는 상자
  const box = (u, v, w, d, h, col, z = 0) => {
    quad([[u + w, v, z], [u + w, v + d, z], [u + w, v + d, z + h], [u + w, v, z + h]], shade(col, 0.68));
    quad([[u, v + d, z], [u + w, v + d, z], [u + w, v + d, z + h], [u, v + d, z + h]], shade(col, 0.86));
    quad([[u, v, z + h], [u + w, v, z + h], [u + w, v + d, z + h], [u, v + d, z + h]], shade(col, 1.1));
  };
  // 뒷벽(정면을 보는 면) 위의 사각형
  const back = (u, z, w, h, col) => quad([[u, 0, z], [u + w, 0, z], [u + w, 0, z + h], [u, 0, z + h]], col);
  // 왼쪽 옆벽 위의 사각형
  const side = (v, z, d, h, col) => quad([[0, v, z], [0, v + d, z], [0, v + d, z + h], [0, v, z + h]], col);
  return { T, quad, line, box, back, side };
}

// 책상과 모니터. 앉은 길드장의 다리를 가리도록 캐릭터보다 나중에 그린다.
export function drawDesk(x, sx, sy) {
  const o = oblique(x, sx, sy);
  o.box(-10, 6, 20, 8, 8, '#b07a48');
  o.box(3, 8, 7, 2, 6, '#3a3f4c', 8);   // 모니터는 얼굴을 가리지 않게 한쪽으로
  o.box(-7, 9, 6, 3, 1, '#e9ecf2', 8);  // 자판
}

// 길드 사무실. 지붕을 들어낸 방으로, 뒷벽 모양·바닥·가구가 길드마다 다르다.
// 반환값: 밤에 불이 켜질 곳 [x, y, 반경, 색] 목록.
export function drawOffice(x, kind, G, ox, by, w) {
  const o = oblique(x, ox, by), { T, quad, line, box, back, side } = o;
  const D = DEPTH, H = WALL_H, lights = [];
  const light = (u, v, z, r, col) => lights.push([...T(u, v, z), r, col]);
  const floor = (a, b, cell) => {
    quad([[0, 0], [w, 0], [w, D], [0, D]], a);
    if (!cell) return;
    for (let v = 0, j = 0; v < D; v += cell, j++) for (let u = (j % 2) * cell; u < w; u += cell * 2) {
      const u1 = Math.min(w, u + cell), v1 = Math.min(D, v + cell);
      quad([[u, v], [u1, v], [u1, v1], [u, v1]], b);
    }
  };
  // 바닥에 드리운 벽 그림자
  x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath();
  [[w, 0], [w + 5, 3], [w + 5, D + 5], [-2, D + 5], [-2, D]].forEach((p, i) => { const [a, b] = T(...p); i ? x.lineTo(a, b) : x.moveTo(a, b); });
  x.fill();

  if (kind === 'claude') { // 목조 길드관
    floor('#c4925e');
    for (let u = 9; u < w; u += 9) line([u, 0], [u, D], '#a87848', 0.6);
    for (let v = 13; v < D; v += 13) line([0, v], [w, v], 'rgba(0,0,0,.08)', 0.6);
    back(0, 0, w, H, '#e8d3a8'); side(0, 0, D, H, '#d2bc90');
    quad([[0, 0, H], [w, 0, H], [w / 2, 0, H + 13]], '#e8d3a8');                       // 박공
    line([0, 0, H], [w / 2, 0, H + 13], G.color, 2.5); line([w, 0, H], [w / 2, 0, H + 13], G.color, 2.5);
    back(w - 17, H + 2, 7, 15, '#8a6a50'); back(w - 18, H + 16, 9, 2, '#5a4636');       // 굴뚝
    for (const u of [1, w / 2, w - 1]) line([u, 0, 0], [u, 0, H], '#7a5230', 1.6);
    line([0, 0, H], [w, 0, H], '#7a5230', 1.6); line([0, 0, 0], [0, D, 0], '#b8a070', 1);
    back(w / 2 - 6, H + 2, 12, 7, '#8fdcff'); line([w / 2, 0, H + 2], [w / 2, 0, H + 9], '#7a5230', 0.8);
    side(20, 12, 20, 12, '#8fdcff'); line([0, 30, 12], [0, 30, 24], '#7a5230', 0.8);
    box(5, 1, 16, 6, 19, '#5a4636'); quad([[8, 7.1, 2], [18, 7.1, 2], [18, 7.1, 13], [8, 7.1, 13]], '#2a2018'); quad([[10, 7.2, 2], [16, 7.2, 2], [16, 7.2, 8], [10, 7.2, 8]], '#ff9a3c');
    light(13, 8, 6, 16, '#ff9a3c'); light(w / 2, 0, H + 5, 12, '#ffe9a8'); light(-2, 30, 18, 14, '#ffe9a8');
    box(w - 24, 1, 19, 6, 25, '#7a5230');
    ['#d8483c', '#46c796', '#6b97ff', '#ffd84a'].forEach((c, i) => { quad([[w - 22 + i * 4, 7.1, 14], [w - 19 + i * 4, 7.1, 14], [w - 19 + i * 4, 7.1, 22], [w - 22 + i * 4, 7.1, 22]], c); quad([[w - 21 + i * 4, 7.1, 3], [w - 18 + i * 4, 7.1, 3], [w - 18 + i * 4, 7.1, 11], [w - 21 + i * 4, 7.1, 11]], c); });
    quad([[w / 2 - 14, 30], [w / 2 + 14, 30], [w / 2 + 14, 50], [w / 2 - 14, 50]], G.dark); quad([[w / 2 - 12, 32], [w / 2 + 12, 32], [w / 2 + 12, 48], [w / 2 - 12, 48]], G.color); // 양탄자
  } else if (kind === 'codex') { // 석조 성채
    floor('#8e97a6', '#9ba4b3', 11);
    back(0, 0, w, H, '#b4bcc9'); side(0, 0, D, H, '#9aa3b2');
    for (let z = 5; z < H; z += 6) for (let u = (z % 12 ? 0 : 6); u < w - 4; u += 12) back(u + 1, z, 7, 1, '#9aa3b2');
    for (let v = 6; v < D; v += 14) for (let z = 6; z < H; z += 10) side(v, z, 7, 1, '#8690a0');
    for (let u = 0; u < w; u += 9) back(u, H, 5, 5, '#b4bcc9');                          // 톱니 성벽
    for (let v = 2; v < D; v += 12) side(v, H, 6, 5, '#9aa3b2');
    for (const u of [-5, w - 7]) {                                                      // 망루
      box(u, -6, 12, 9, H + 16, '#a8b1bf');
      for (const du of [0, 5, 10]) box(u + du, -6, 2, 9, 4, '#a8b1bf', H + 16);
      quad([[u + 3, 3.1, H - 2], [u + 9, 3.1, H - 2], [u + 9, 3.1, H + 9], [u + 3, 3.1, H + 9]], '#2a2e38');
      quad([[u + 2, 3.1, 4], [u + 10, 3.1, 4], [u + 10, 3.1, 20], [u + 2, 3.1, 20]], G.color);
      quad([[u + 2, 3.1, 4], [u + 6, 3.1, 0], [u + 10, 3.1, 4]], G.color);
      light(u + 6, 3, H + 4, 9, '#ffe9a8');
    }
    back(w / 2 - 10, 5, 20, H - 8, '#2a2e38'); back(w / 2 - 8, 7, 16, H - 12, G.color); back(w / 2 - 5, 12, 10, 2, '#ffffff');
    light(w / 2, 0, H / 2, 16, G.color);
    side(24, 10, 14, 14, '#2a2e38'); side(26, 12, 10, 10, '#8fdcff'); light(-2, 31, 17, 12, '#ffe9a8');
    box(w / 2 - 4, 40, 8, 6, 6, '#6a7280'); box(w / 2 - 2, 41, 4, 4, 7, G.color, 6);    // 수정 받침대
    light(w / 2, 43, 10, 12, G.color);
  } else { // 유리 돔 연구소
    floor('#d5dceb', '#e6ebf6', 10);
    for (let u = 10; u < w; u += 20) line([u, 0], [u, D], 'rgba(60,90,160,.18)', 0.6);
    back(0, 0, w, 12, '#e3e9f5'); side(0, 0, D, 12, '#cfd7e8');
    const rx = w / 2, ry = 34;                                                          // 뒷벽의 돔
    x.fillStyle = '#9cc4ff'; x.beginPath();
    for (let i = 0; i <= 24; i++) { const a = Math.PI * i / 24, [px, py] = T(rx - Math.cos(a) * rx, 0, 12 + Math.sin(a) * ry); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.fill();
    for (const k of [0.34, 0.67, 1]) { x.strokeStyle = '#e3e9f5'; x.lineWidth = 1; x.beginPath(); for (let i = 0; i <= 24; i++) { const a = Math.PI * i / 24, [px, py] = T(rx - Math.cos(a) * rx * k, 0, 12 + Math.sin(a) * ry); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    for (const z of [22, 33]) { const half = rx * Math.sqrt(1 - ((z - 12) / ry) ** 2); line([rx - half, 0, z], [rx + half, 0, z], '#e3e9f5', 1); }
    quad([[0, 0, 12], [0, D, 12], [0, D, 30], [0, 0, 46]], '#b4d2ff');                   // 옆 유리벽
    for (const v of [16, 32, 48]) line([0, v, 12], [0, v, 46 - v * 0.25], '#e3e9f5', 1);
    line([0, 0, 12], [w, 0, 12], G.dark, 1.2); line([0, 0, 12], [0, D, 12], G.dark, 1.2);
    line([rx, 0, 12 + ry], [rx, 0, 12 + ry + 11], '#8792a8', 1); back(rx - 1.5, 12 + ry + 10, 3, 3, G.color);
    light(rx, 0, 30, 24, '#9cc4ff'); light(-3, 30, 26, 14, '#9cc4ff');
    box(5, 1, 18, 6, 15, '#3a4664'); quad([[7, 7.1, 8], [21, 7.1, 8], [21, 7.1, 13], [7, 7.1, 13]], '#7fe6ff'); quad([[7, 7.1, 3], [15, 7.1, 3], [15, 7.1, 6], [7, 7.1, 6]], '#46c796');
    box(w - 24, 1, 18, 6, 15, '#3a4664'); quad([[w - 22, 7.1, 8], [w - 16, 7.1, 8], [w - 16, 7.1, 13], [w - 22, 7.1, 13]], '#ffb347'); quad([[w - 14, 7.1, 8], [w - 8, 7.1, 8], [w - 8, 7.1, 13], [w - 14, 7.1, 13]], '#7fe6ff');
    light(14, 7, 10, 10, '#7fe6ff');
    box(rx - 5, 40, 10, 7, 3, '#8792a8'); light(rx, 43, 12, 12, G.color);               // 부유 장치 받침
  }
  // 낮은 앞벽(가운데는 문)과 오른쪽 벽
  box(w, 0, 2.5, D + 2.5, 5, G.dark);
  box(0, D, w / 2 - 10, 2.5, 5, G.dark); box(w / 2 + 10, D, w / 2 - 10, 2.5, 5, G.dark);
  return lights;
}
