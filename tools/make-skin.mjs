// Собирает личный скин «Без дыма» из общей папки ассетов (файлы игры Stardew Valley).
//
//   node tools/make-skin.mjs ["C:\Claude code\_assets"] [куда положить]
//
// Результат — bez-dyma-skin.json (по умолчанию в _assets\packs). Это файлы игры: в git и на сайт
// его не класть (.gitignore это проверяет). Файл переносится на телефон и загружается
// в «Настройки → Личный скин». Зависимостей нет, нужен только Node 18+.

import fs from 'node:fs/promises';
import path from 'node:path';

const A = process.argv[2] || 'C:\\Claude code\\_assets';
const OUT = process.argv[3] || path.join(A, 'packs', 'bez-dyma-skin.json');
const b64 = async (rel) => (await fs.readFile(path.join(A, rel))).toString('base64');

// Звуки по номерам из витрины (sounds/game/sfx/wb-NNN.wav), выбранные Игорем.
const SOUNDS = {
  cat: [332, 333, 405, 406],
  dog: [316, 330, 331],
  day: [213], // «+1 день», новый этап
  money: [241], // копилка пополнилась
  magic: [202], // волшебное мерцание
};

// WAV 16 бит → моно, вдвое реже: файл в 4 раза меньше, на телефоне звучит так же.
function shrink(buf) {
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) return buf;
  const frames = Math.floor(data.length / (2 * fmt.ch)), step = fmt.rate > 30000 ? 2 : 1;
  const n = Math.floor(frames / step), out = Buffer.alloc(44 + n * 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * step * fmt.ch + c) * 2);
    out.writeInt16LE(Math.round(s / fmt.ch), 44 + i * 2);
  }
  const rate = Math.round(fmt.rate / step);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  return out;
}

const snd = {};
for (const [k, list] of Object.entries(SOUNDS)) {
  snd[k] = [];
  for (const n of list) {
    const f = path.join(A, 'sounds', 'game', 'sfx', `wb-${String(n).padStart(3, '0')}.wav`);
    snd[k].push(shrink(await fs.readFile(f)).toString('base64'));
  }
}

const pack = {
  format: 'bezdyma-skin',
  v: 1,
  source: 'Stardew Valley (личная копия)',
  fonts: { 'Stardew RU Title': await b64('fonts/game/Stardew RU Title.otf') },
  img: {
    cat: await b64('animations/game/pets/cat.png'), // рыжий кот: сидит (ряд 5), спит (ряд 7)
    fire: await b64('animations/game/effects/animations.png'), // костёр: ряд y=1920, 4 кадра по 64
  },
  snd,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(pack));
console.log(`Готово: ${path.resolve(OUT)} (${Math.round((await fs.stat(OUT)).size / 1024)} КБ)`);
