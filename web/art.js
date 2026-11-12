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

export const DESK = bake([
  '....mmmmmm....', '....mMMMMm....', '....mMMMMm....', '....mmmmmm....', '......kk......',
  'dddddddddddddd', 'dddddddddddddd', 'DDDDDDDDDDDDDD', 'D............D', 'D............D',
], { m: '#3a3f4c', M: '#2a2e38', k: '#3a3f4c', d: '#b07a48', D: '#7a5230' });

// 길드 사무실. 지붕을 들어낸 단면으로, 뒷벽 모양과 바닥이 길드마다 다르다.
// 반환값: 밤에 불이 켜질 창문 위치 목록.
export function drawOffice(x, kind, G, ox, oy, w, h, wallH) {
  const lights = [], fy = oy + wallH, cx = ox + w / 2;
  const R = (c, a, b, ww, hh) => { x.fillStyle = c; x.fillRect(Math.round(a), Math.round(b), Math.round(ww), Math.round(hh)); };
  R('rgba(0,0,0,.22)', ox + 3, oy + h, w, 4);

  if (kind === 'claude') { // 목조 길드관: 박공 지붕 벽, 벽난로, 책장
    for (let i = 0; i < w; i += 8) R(i % 16 ? '#b98654' : '#c4925e', ox + i, fy, 8, h - wallH);
    for (let j = fy + 7; j < oy + h; j += 8) R('rgba(0,0,0,.08)', ox, j, w, 1);
    R('#e8d3a8', ox, oy, w, wallH);
    R('#8a6a50', ox + w - 14, oy - 20, 7, 20); R('#5a4636', ox + w - 15, oy - 21, 9, 2);
    for (let i = 0; i <= 12; i++) R('#e8d3a8', cx - i * (w / 26), oy - 12 + i, i * (w / 13), 1);
    for (let i = 0; i <= 13; i++) R(G.color, cx - i * (w / 26) - 2, oy - 14 + i, 4, 2), R(G.color, cx + i * (w / 26) - 2, oy - 14 + i, 4, 2);
    R(G.dark, ox - 2, oy - 1, w + 4, 2);
    for (const bx of [ox, cx - 1, ox + w - 2]) R('#7a5230', bx, oy, 2, wallH);
    R('#5a4636', ox + 6, oy + 6, 12, wallH - 6); R('#2a2018', ox + 8, oy + 10, 8, wallH - 10); R('#ff9a3c', ox + 10, oy + wallH - 5, 4, 4);
    lights.push([ox + 12, oy + wallH - 3, 16, '#ff9a3c']);
    R('#7a5230', ox + w - 22, oy + 5, 16, wallH - 5);
    ['#d8483c', '#46c796', '#6b97ff', '#ffd84a'].forEach((c, i) => { R(c, ox + w - 20 + i * 3, oy + 7, 2, 5); R(c, ox + w - 19 + i * 3, oy + 14, 2, 5); });
    R('#8fdcff', cx - 5, oy - 7, 10, 7); R('#7a5230', cx - 1, oy - 7, 1, 7);
    lights.push([cx, oy - 3, 12, '#ffe9a8']);
  } else if (kind === 'codex') { // 석조 탑: 톱니 성벽, 모서리 망루
    for (let j = 0; j < h - wallH; j += 8) for (let i = 0; i < w; i += 8) R((i + j) % 16 ? '#8e97a6' : '#9aa3b2', ox + i, fy + j, 8, 8);
    R('#b4bcc9', ox, oy, w, wallH);
    for (let j = oy + 4; j < fy; j += 5) for (let i = (j % 10 ? 0 : 5); i < w; i += 10) R('#9aa3b2', ox + i, j, 6, 1);
    for (let i = 0; i < w; i += 8) R('#b4bcc9', ox + i, oy - 5, 5, 5);
    for (const tx of [ox - 4, ox + w - 8]) {
      R('#a3acba', tx, oy - 16, 12, wallH + 18); R('#8e97a6', tx + 9, oy - 16, 3, wallH + 18);
      for (let i = 0; i < 12; i += 5) R('#a3acba', tx + i, oy - 20, 3, 4);
      R(G.color, tx + 2, oy - 2, 8, 12); R(G.dark, tx + 2, oy + 8, 8, 2);
      R('#2a2e38', tx + 4, oy - 12, 4, 6); lights.push([tx + 6, oy - 9, 9, '#ffe9a8']);
    }
    R('#2a2e38', cx - 8, oy + 4, 16, wallH - 6); R(G.color, cx - 6, oy + 6, 12, wallH - 11);
    lights.push([cx, oy + wallH / 2, 14, G.color]);
    R(G.dark, ox - 4, fy - 1, w + 8, 1);
  } else { // 부유 연구소: 유리 돔 벽, 안테나, 떠 있는 고리
    for (let j = 0; j < h - wallH; j += 10) for (let i = 0; i < w; i += 10) R((i + j) % 20 ? '#d5dceb' : '#e3e9f5', ox + i, fy + j, 10, 10);
    for (let i = 0; i < w; i += 10) R('rgba(60,90,160,.14)', ox + i, fy, 1, h - wallH);
    R('#e3e9f5', ox, oy + 6, w, wallH - 6);
    const rx = w / 2, ry = 20;
    for (let i = 0; i <= ry; i++) { const half = rx * Math.sqrt(1 - ((ry - i) / ry) ** 2); R(i < 3 ? '#e3e9f5' : '#9cc4ff', cx - half, oy + 6 - ry + i, half * 2, 1); }
    for (let i = 3; i <= ry; i += 6) { const half = rx * Math.sqrt(1 - ((ry - i) / ry) ** 2); R('#e3e9f5', cx - half, oy + 6 - ry + i, half * 2, 1); }
    for (const k of [-0.55, 0, 0.55]) R('#e3e9f5', cx + k * rx, oy + 6 - ry, 1, ry);
    lights.push([cx, oy - 4, 22, '#9cc4ff']);
    R('#8792a8', cx - 1, oy - 26, 1, 12); R(G.color, cx - 2, oy - 28, 3, 3);
    R(G.dark, ox, oy + 6, w, 1);
    R('#3a4664', ox + 6, oy + 10, 14, wallH - 12); R('#7fe6ff', ox + 8, oy + 12, 10, 3); R('#46c796', ox + 8, oy + 16, 6, 2);
    lights.push([ox + 13, oy + 14, 10, '#7fe6ff']);
    R('#3a4664', ox + w - 20, oy + 10, 14, wallH - 12); R('#ffb347', ox + w - 18, oy + 12, 4, 4); R('#7fe6ff', ox + w - 12, oy + 12, 4, 4);
  }
  // 옆벽과 낮은 앞벽(가운데는 문)
  R(G.dark, ox - 2, fy, 2, h - wallH + 2); R(G.dark, ox + w, fy, 2, h - wallH + 2);
  R(G.dark, ox - 2, oy + h, w / 2 - 6, 3); R(G.dark, cx + 8, oy + h, w / 2 - 6, 3);
  R('rgba(255,255,255,.18)', ox - 2, oy + h, w / 2 - 6, 1); R('rgba(255,255,255,.18)', cx + 8, oy + h, w / 2 - 6, 1);
  return lights;
}
