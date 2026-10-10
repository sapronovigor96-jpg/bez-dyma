// Личный скин: файл с картинками, шрифтом и звуками из своей копии Stardew Valley.
// Хранится только на этом телефоне (IndexedDB). В репозиторий и на сайт не попадает.
// Без скина приложение рисуется своими средствами и звучит синтезом.
// Собирается на компьютере: node tools/make-skin.mjs (см. README).

const DB = 'bezdyma-skin';
export let pack = null; // { img: [...], snd: {...}, fonts: [...] }
let sounds = {}; // ключ → [base64 wav]

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('no idb'));
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

const b64buf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

async function use(p) {
  if (!p || p.format !== 'bezdyma-skin' || !p.img) throw new Error('not a skin');
  const fonts = [];
  for (const [name, data] of Object.entries(p.fonts || {})) {
    try {
      const face = new FontFace(name, b64buf(data), { display: 'block' });
      await face.load();
      document.fonts.add(face);
      fonts.push(name);
    } catch {
      /* телефон не принял шрифт — картинки и звуки всё равно ставим */
    }
  }
  const root = document.documentElement;
  for (const [k, data] of Object.entries(p.img)) root.style.setProperty(`--g-${k}`, `url("data:image/png;base64,${data}")`);
  sounds = p.snd || {};
  pack = { fonts, img: Object.keys(p.img), snd: Object.keys(sounds) };
  root.classList.add('has-skin');
}

export async function loadSkin() {
  try {
    const txt = await idb('readonly', (s) => s.get('pack'));
    if (txt) await use(JSON.parse(txt));
  } catch {
    /* нет скина или он испорчен — работаем без него */
  }
}

export async function installSkin(file) {
  const txt = await file.text();
  await use(JSON.parse(txt)); // сначала проверить, что файл правильный
  await idb('readwrite', (s) => s.put(txt, 'pack'));
}

export async function removeSkin() {
  await idb('readwrite', (s) => s.delete('pack'));
  location.reload();
}

/* ---------- звук ---------- */

let ctx = null;
const decoded = {};
let soundOn = true;
export const setSound = (v) => { soundOn = v; if (!v) crackle(false); };

// iPhone даёт играть звук только после касания: создаём контекст на первом тапе.
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
addEventListener('pointerdown', () => audio(), { once: true });

async function buffer(b64) {
  if (!decoded[b64]) decoded[b64] = await new Promise((ok, bad) => ctx.decodeAudioData(b64buf(b64), ok, bad));
  return decoded[b64];
}

// Короткий «пиксельный» звук на случай, если скина нет.
const TUNES = {
  cat: [[880, 0.06], [1175, 0.08]],
  dog: [[330, 0.07], [247, 0.09]],
  day: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.16]],
  money: [[1319, 0.05], [1760, 0.09]],
  magic: [[784, 0.07], [988, 0.07], [1175, 0.07], [1568, 0.14]],
  tap: [[660, 0.03]],
};
function beep(key) {
  let t = ctx.currentTime;
  for (const [f, d] of TUNES[key] || TUNES.tap) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + d);
    t += d * 0.9;
  }
}

export async function play(key) {
  if (!soundOn || !audio()) return;
  const list = sounds[key];
  if (!list || !list.length) return beep(key);
  try {
    const src = ctx.createBufferSource();
    src.buffer = await buffer(list[Math.floor(Math.random() * list.length)]);
    const g = ctx.createGain();
    g.gain.value = 0.7;
    src.connect(g).connect(ctx.destination);
    src.start();
  } catch {
    beep(key);
  }
}

// Треск костра: синтез, без файлов. Шум с редкими щелчками.
let fire = null;
export function crackle(on) {
  if (!on) {
    if (fire) { fire.stop(); fire = null; }
    return;
  }
  if (fire || !soundOn || !audio()) return;
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let low = 0;
  for (let i = 0; i < len; i++) {
    low = low * 0.97 + (Math.random() * 2 - 1) * 0.03; // мягкий гул
    d[i] = low * 0.6;
    if (Math.random() < 0.0004) { // щелчок
      const n = 60 + Math.random() * 200, a = 0.3 + Math.random() * 0.5;
      for (let j = 0; j < n && i + j < len; j++) d[i + j] += (Math.random() * 2 - 1) * a * (1 - j / n);
    }
  }
  const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  src.buffer = buf;
  src.loop = true;
  f.type = 'lowpass';
  f.frequency.value = 2400;
  g.gain.value = 0.5;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
  fire = src;
}
