// «Без дыма»: всё хранится только в телефоне (localStorage).
import { HOUR, STAGES, LIFETIME, EXPECT, TASKS, TAGS, TIPS, MESSAGES, HELP } from './data.js';
import { pack, loadSkin, installSkin, removeSkin, play, crackle, setSound } from './skin.js';

const KEY = 'bezdyma.v1';
const app = document.getElementById('app');
const DAY = 24 * HOUR;

/* ---------- данные ---------- */

const DEFAULTS = {
  setup: false,
  quitAt: Date.now(),
  perDay: 20,
  packPrice: 250,
  packSize: 20,
  reasons: [],
  goal: { name: '', price: 0 },
  past: [], // прошлые попытки { start, end } — их дни и деньги не теряются
  cravings: [], // { at, where, who: [], what: [], level }
  slips: [], // { at, what: [], amount }
  plan: [], // что сделаю в следующий раз
  sound: true,
  fire: true,
  seen: { day: 0, done: 0, money: 0, d28: 0 },
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return { ...DEFAULTS, ...s, seen: { ...DEFAULTS.seen, ...s.seen }, goal: { ...DEFAULTS.goal, ...s.goal } };
  } catch { /* испорчено — начнём заново */ }
  return structuredClone(DEFAULTS);
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Не получилось сохранить'); }
}

/* ---------- расчёты ---------- */

const now = () => Date.now();
const streakMs = () => Math.max(0, now() - S.quitAt);
const streakH = () => streakMs() / HOUR;
const pastMs = () => S.past.reduce((a, p) => a + Math.max(0, p.end - p.start), 0);
const totalMs = () => pastMs() + streakMs();
const perDayMoney = () => (S.perDay / S.packSize) * S.packPrice;
const money = () => (totalMs() / DAY) * perDayMoney();
const cigs = () => Math.floor((totalMs() / DAY) * S.perDay);
const dayNo = () => Math.floor(streakMs() / DAY) + 1;

const stageState = (st, h) => (h >= st.e ? 'done' : h >= st.s ? 'go' : 'ahead');

function expectNow(h) {
  const cur = EXPECT.filter((x) => h >= x.s && h < x.e);
  const main = cur.filter((x) => !x.risk).sort((a, b) => a.e - a.s - (b.e - b.s))[0];
  return { main, risk: cur.find((x) => x.risk) };
}

function messageNow() {
  const d = dayNo(), top = topTags(7)[0]?.[0];
  const wd = new Date().getDay();
  const pool = MESSAGES.filter((m) =>
    (m.day && d >= m.day[0] && d <= m.day[1]) || (m.tag && m.tag === top) || (m.weekend && (wd === 5 || wd === 6)));
  if (!pool.length) return null;
  // одно сообщение на половину дня, чтобы не прыгало при каждом открытии
  const seed = Math.floor(now() / (12 * HOUR));
  return pool[seed % pool.length].text;
}

function recentCravings(days) {
  const from = now() - days * DAY;
  return S.cravings.filter((c) => c.at >= from);
}
function topTags(days) {
  const n = {};
  for (const c of recentCravings(days)) for (const t of [c.where, ...c.who, ...c.what]) if (t) n[t] = (n[t] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}

/* ---------- формат ---------- */

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateStr = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm(d)}`; };
function plural(n, one, few, many) {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const rub = (n) => Math.floor(n).toLocaleString('ru-RU') + ' ₽';
function dur(h) {
  if (h < 1) { const m = Math.max(1, Math.round(h * 60)); return `${m} мин`; }
  if (h < 48) { const n = Math.round(h); return `${n} ${plural(n, 'час', 'часа', 'часов')}`; }
  if (h < 60 * 24) { const n = Math.round(h / 24); return `${n} ${plural(n, 'день', 'дня', 'дней')}`; }
  if (h < 2 * 8760) { const n = Math.round(h / 730); return `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`; }
  const n = Math.round(h / 8760); return `${n} ${plural(n, 'год', 'года', 'лет')}`;
}
const days = (ms) => { const n = Math.floor(ms / DAY); return `${n} ${plural(n, 'день', 'дня', 'дней')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hm(d)}`; };

let toastTimer;
function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

/* ---------- значки ---------- */

const svg = (d, vb = 10) => `<svg viewBox="0 0 ${vb} ${vb}"><path d="${d}"/></svg>`;
const I = {
  flame: svg('M4 0h2v1h1v2h1v2h1v3H8v1H7v1H3V9H2V8H1V5h1V3h1V2h1z'),
  close: svg('M1 1h2v1h1v1h2V2h1V1h2v2H8v1H7v2h1v1h1v2H7V8H6V7H4v1H3v1H1V7h1V6h1V4H2V3H1z'),
  back: svg('M5 1h1v1H5v1H4v1h5v2H4v1h1v1h1v1H5V8H4V7H3V6H2V4h1V3h1V2h1z'),
  gear: svg('M4 0h2v2h1V1h2v2H8v1h2v2H8v1h1v2H7V8H6v2H4V8H3v1H1V7h1V6H0V4h2V3H1V1h2v1h1zM4 4v2h2V4z'),
  plus: svg('M4 0h2v4h4v2H6v4H4V6H0V4h4z'),
  ok: svg('M6 1h1v2H6v1H5v1H4v1H3v1H2V6H1V5H0V3h1v1h1v1h1V4h1V3h1V2h1z', 7),
  dot: svg('M2 1h3v1h1v3H5v1H2V5H1V2h1z', 7),
  clock: svg('M3 0h1v3h2v1H3z', 7),
  x: svg('M0 0h2v1h1v1h1V1h1V0h2v2H6v1H5v1h1v1h1v2H5V6H4V5H3v1H2v1H0V5h1V4h1V3H1V2H0z', 7),
};
const TABS = [
  ['today', 'Сегодня', 'M1 4h1V3h1V2h1V1h2v1h1v1h1v1h1v5H6V6H4v3H1z'],
  ['diary', 'Дневник', 'M2 1h6v8H2zM3 2v6h4V2zM4 3h2v1H4zM4 5h2v1H4z'],
  ['health', 'Здоровье', 'M1 2h3v1h2V2h3v3H8v1H7v1H6v1H4V7H3V6H2V5H1z'],
  ['money', 'Копилка', 'M2 3h6v1h1v4H8v1H2V8H1V4h1zM4 2h2v1H4zM3 5h1v1H3z'],
  ['help', 'Помощь', 'M4 1h2v3h3v2H6v3H4V6H1V4h3z'],
];

const cat = (cls = '') => (pack?.img.includes('cat') ? `<div class="pet ${cls}" aria-hidden="true"></div>` : `<img class="cat px" src="icons/cat.png" alt="">`);
const fireSprite = () => (pack?.img.includes('fire') ? '<div class="fire" aria-hidden="true"></div>' : '');

/* ---------- экраны ---------- */

let tab = 'today';
let overlay = null; // { name, ... }

function go(t) { tab = t; overlay = null; render(); window.scrollTo(0, 0); }
function open(o) { overlay = o; render(); window.scrollTo(0, 0); }
function close() { overlay = null; crackle(false); stopSos(); render(); }

function render() {
  if (!S.setup) overlay = overlay?.name === 'setup' ? overlay : { name: 'setup', step: 0 };
  if (overlay) return renderOverlay();
  const html = { today, diary, health, moneyView, help }[tab === 'money' ? 'moneyView' : tab]();
  app.innerHTML = `<div class="screen">${html}</div>${tabs()}`;
  bind();
  tick();
}

function tabs() {
  return `<nav class="tabs">${TABS.map(([k, n, d]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${svg(d)}<span>${n}</span></button>`).join('')}</nav>`;
}

function top(title, sub = '', left = '', right = '', small = false) {
  return `<header class="top">${left}<div class="titles"><h1 class="${small ? 'small' : ''}">${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>${right}</header>`;
}

const timerCells = () => '<div class="timer" data-timer></div>';

function today() {
  const h = streakH(), ex = expectNow(h), msg = messageNow();
  const next = STAGES.filter((s) => stageState(s, h) === 'ahead').sort((a, b) => a.s - b.s)[0];
  return `
    ${top('Без дыма', `с ${dateStr(S.quitAt)}`, `<button class="catbtn" data-act="meow" aria-label="Котик">${cat()}</button>`, `<button class="ib" data-act="settings" aria-label="Настройки">${I.gear}</button>`)}
    <main class="body">
      <div class="card timer-card">${fireSprite()}${timerCells()}<div class="since">без сигарет${S.past.length ? ` · всего <b data-total></b>` : ''}</div></div>
      <button class="big" data-act="sos">${I.flame} Тянет курить</button>
      ${ex.main ? `<button class="card lilac expect" data-act="expect"><span class="label">Чего ждать сейчас <span>день ${dayNo()}</span></span><span>${esc(ex.main.what)}</span>${ex.main.help ? `<span class="help">Помогает: ${esc(ex.main.help)}</span>` : ''}</button>` : ''}
      ${ex.risk ? `<div class="card hot"><b class="warn">${ex.risk.t}: самое опасное время</b><p>${esc(ex.risk.what)}</p></div>` : ''}
      ${msg ? `<div class="card msg">${cat('small sleep')}<p>${esc(msg)}</p></div>` : ''}
      <div class="pair">
        <button class="card stat" data-tab="money"><b class="hl" data-money></b><span>сэкономлено</span></button>
        <div class="card stat"><b data-cigs></b><span>не выкурено</span></div>
      </div>
      ${next ? `<button class="card" data-tab="health"><span class="muted">Следующее улучшение: через ${dur(next.s - h)}</span><span class="line">${esc(next.what)}</span></button>` : ''}
      <button class="ghost" data-act="slip">Я закурил</button>
    </main>`;
}

function diary() {
  const week = recentCravings(7), tags = topTags(7).slice(0, 5), max = tags[0]?.[1] || 1;
  const heat = Array(8).fill(0);
  for (const c of week) heat[Math.floor(((new Date(c.at).getHours() + 18) % 24) / 3)]++; // с 6 утра
  const hmax = Math.max(1, ...heat);
  const perDay = [];
  for (let i = 6; i >= 0; i--) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const from = d0.getTime() - i * DAY;
    perDay.push(S.cravings.filter((c) => c.at >= from && c.at < from + DAY).length);
  }
  const tip = tags[0] && TIPS[tags[0][0]];
  const list = [...S.cravings].sort((a, b) => b.at - a.at).slice(0, 15);
  return `
    ${top('Дневник', `${week.length} ${plural(week.length, 'приступ', 'приступа', 'приступов')} тяги за 7 дней`)}
    <main class="body">
      <button class="big lilac" data-act="log">${I.plus} Записать тягу</button>
      ${week.length < 3 ? `<div class="card muted">Записывайте каждый приступ тяги: где были, с кем, что было. Через неделю здесь появятся ваши главные триггеры.</div>` : `
      <div class="card">
        <div class="label">Чаще всего тянет</div>
        <div class="trgs">${tags.map(([t, n]) => `<div class="trg"><span>${esc(t)}</span><div class="bar ${t === 'Алкоголь' ? 'red' : t === tags[0][0] ? 'or' : ''}"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="label">Когда</div>
        <div class="heat">${heat.map((n) => `<i class="l${n ? Math.ceil((n / hmax) * 4) : 0}"></i>`).join('')}</div>
        <div class="heatlbl"><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>0</span><span>3</span></div>
      </div>
      ${tip ? `<div class="card lilac"><b class="hl2">Совет на эту неделю</b><p>${esc(tip)}</p></div>` : ''}
      <div class="card"><span class="muted">Приступов по дням</span><p class="mono">${perDay.join(' → ')}</p></div>`}
      ${list.length ? `<div class="label">Последние записи</div>${list.map((c) => `
        <div class="card entry"><div><span class="muted">${dateStr(c.at)}${c.level ? ` · сила ${c.level}` : ''}</span><p>${esc([c.where, ...c.who, ...c.what].filter(Boolean).join(', ') || 'без пометок')}</p></div><button class="ib small" data-del="${c.at}" aria-label="Удалить запись">${I.x}</button></div>`).join('')}` : ''}
    </main>`;
}

function stageCard(st, h) {
  const state = stageState(st, h);
  const eta = state === 'ahead' ? ` · через ${dur(st.s - h)}` : state === 'go' ? ' · идёт' : '';
  const icon = state === 'done' ? I.ok : state === 'go' ? I.dot : I.clock;
  return `<details class="ms ${state}"><summary><span class="badge">${icon}</span><span><span class="t">${st.t}${eta}</span><span class="w">${esc(st.what)}</span></span></summary>
    <div class="more"><p>${esc(st.gives)}</p><span class="small">Доказательность: ${st.ev}</span><span class="small">Источник: ${st.src.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(', ')}</span></div></details>`;
}

function health() {
  const h = streakH(), done = STAGES.filter((s) => stageState(s, h) === 'done').length;
  return `
    ${top('Здоровье', `${done} из ${STAGES.length} уже случилось`)}
    <main class="body">
      <div class="card">
        <div class="meter"><span>Никотин ушёл</span><b data-nic></b></div><div class="segs" data-nics></div>
        <div class="meter"><span>Угарный газ ушёл</span><b data-co></b></div><div class="segs" data-cos></div>
        <p class="small">Примерно, по скорости выведения из крови</p>
      </div>
      <p class="small">Нажмите на этап, чтобы узнать, что это даёт вам.</p>
      <div class="stages">${STAGES.map((s) => stageCard(s, h)).join('')}</div>
      <div class="card lifetime"><b>На всю жизнь</b><p>${LIFETIME}</p></div>
      <p class="small">Этапы считаются от последней сигареты. Источники: ВОЗ, CDC, ACS, Cochrane и исследования из отчёта.</p>
    </main>`;
}

function moneyView() {
  const m = money(), g = S.goal, pd = perDayMoney();
  const left = g.price > m ? Math.ceil((g.price - m) / pd) : 0;
  return `
    ${top('Копилка', `${S.perDay} ${plural(S.perDay, 'сигарета', 'сигареты', 'сигарет')} в день · пачка ${rub(S.packPrice)}`)}
    <main class="body">
      <div class="card money"><canvas id="pig" width="20" height="16"></canvas><b data-money></b><span class="muted">уже не потрачено на сигареты</span></div>
      <div class="label">Моя цель</div>
      ${g.name && g.price ? `
      <div class="card">
        <div class="goal"><b>${esc(g.name)}</b><span class="muted"><span data-money></span> из ${rub(g.price)}</span></div>
        <div class="bar gold"><i data-goal style="width:0"></i></div>
        <p class="small">${left ? `Ещё ${left} ${plural(left, 'день', 'дня', 'дней')} без сигарет` : 'Цель накоплена! Купите её себе по-настоящему.'}</p>
      </div>` : `<div class="card muted">Поставьте цель: то, что вы правда купите на эти деньги. Награда работает, если она настоящая.</div>`}
      <div class="card form">
        <label>На что коплю<input id="goalName" value="${esc(g.name)}" placeholder="Например, кроссовки"></label>
        <label>Сколько стоит, ₽<input id="goalPrice" type="number" inputmode="numeric" value="${g.price || ''}" placeholder="9000"></label>
        <button class="ghost" data-act="goal">Сохранить цель</button>
      </div>
      <div class="label">Сколько это за</div>
      <div class="card rows">
        <div><span>Месяц</span><b>${rub(pd * 30)}</b></div>
        <div><span>Год</span><b>${rub(pd * 365)}</b></div>
        <div><span>5 лет</span><b>${rub(pd * 365 * 5)}</b></div>
      </div>
    </main>`;
}

function help() {
  return `
    ${top('Помощь', 'лекарства удваивают шансы')}
    <main class="body">
      <p class="muted">Из 100 человек не курят через полгода:</p>
      <div class="cmp">${HELP.map(([n, v]) => `<div><div class="cmp-h"><span>${n}</span><b>${v} из 100</b></div><div class="people">${Array.from({ length: 100 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
      <div class="card hot doc"><span class="ico">${svg('M4 1h2v3h3v2H6v3H4V6H1V4h3z')}</span><div><b>Обсудите с врачом</b><p>У Табекса и варениклина есть противопоказания. При беременности, болезнях сердца и психики свои правила. Препарат, дозу и сочетание подбирает врач.</p></div></div>
      <div class="card"><b>Бросать сразу, а не постепенно</b><p>22 против 16 из 100 через полгода. Лучше назначить дату и начать лекарство заранее.</p></div>
      <div class="card"><b>Само приложение не волшебное</b><p>Помогает то, что в нём есть: кнопка тяги, дневник, сообщения, копилка и лекарство. Пользуйтесь кнопкой «Тянет курить» каждый раз.</p></div>
      <div class="card"><b>Если очень тяжело на душе</b><p>Если плохое настроение держится дольше пары недель или появились мысли навредить себе, обратитесь к врачу. В опасной ситуации звоните 112.</p></div>
      <p class="small">Справка, а не назначение. Источники: Cochrane 2023, ВОЗ 2024, российские клинические рекомендации.</p>
    </main>`;
}

/* ---------- окна поверх ---------- */

function renderOverlay() {
  const o = overlay;
  const html = { setup, sos, log, slip, settings, expect, d28 }[o.name](o);
  app.innerHTML = `<div class="screen over">${html}</div>`;
  bind();
  tick();
}

const chips = (name, list, sel, multi = true) =>
  `<div class="chips" data-chips="${name}" data-multi="${multi ? 1 : ''}">${list.map((t) => `<button class="chip ${sel.includes(t) ? 'on' : ''} ${t === 'Алкоголь' ? 'alc' : ''}" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;

function setup() {
  return `
    ${top('Давайте начнём', 'один раз, потом можно поменять в настройках', '', '', true)}
    <main class="body">
      <div class="hero">${cat()}<p class="ask">Когда вы выкурили последнюю сигарету?</p></div>
      ${chips('when', ['Только что', 'Час назад', 'Вчера вечером'], [], false)}
      <label class="field">Или точное время<input id="quitAt" type="datetime-local" value="${toLocalInput(S.quitAt)}"></label>
      <div class="pair">
        <label class="field">Сигарет в день<input id="perDay" type="number" inputmode="numeric" value="${S.perDay}"></label>
        <label class="field">Пачка стоит, ₽<input id="packPrice" type="number" inputmode="numeric" value="${S.packPrice}"></label>
      </div>
      <label class="field">Зачем я бросаю (каждая причина с новой строки)<textarea id="reasons" rows="4" placeholder="Хочу легко подниматься по лестнице">${esc(S.reasons.join('\n'))}</textarea></label>
      <p class="small">Причины покажутся, когда нажмёте «Тянет курить».</p>
      <button class="big" data-act="setupDone">Начать</button>
    </main>`;
}

// «Тянет курить»: 1 — движение 5 минут, 2 — дыхание, 3 — причины
let sosTimer = null;
function stopSos() { clearInterval(sosTimer); sosTimer = null; }

function sos(o) {
  const t = TASKS[o.task % TASKS.length];
  const steps = ['Двигаться 5 минут', 'Дыхание: вдох на 4, выдох на 6', 'Вспомнить, зачем я бросаю'];
  const list = `<div class="steps">${steps.map((s, i) => `<div class="step ${i + 1 < o.step ? 'done' : i + 1 === o.step ? 'now' : ''}"><span class="k">${i + 1 < o.step ? '✓' : i + 1}</span><span>${s}</span></div>`).join('')}</div>`;
  let body = '';
  if (o.step === 1) {
    body = `
      <div class="ring"><canvas id="ring" width="50" height="50"></canvas><div class="ring-t"><b data-sos>5:00</b><span>осталось</span></div></div>
      <div class="card task"><b>${t[0]}</b><p>${t[1]}</p></div>
      ${list}
      <div class="pair"><button class="ghost" data-act="task">Другое задание</button><button class="ghost" data-act="next">Дальше</button></div>
      <p class="small">Короткая нагрузка снижает тягу, эффект держится до 50 минут. Приступ обычно проходит за несколько минут.</p>`;
  } else if (o.step === 2) {
    body = `
      <div class="breath"><div class="breath-box" id="breath">${cat('sleep')}</div><b id="breathT">Вдох</b><span class="muted" id="breathN">1 из 6</span></div>
      ${list}
      <button class="ghost" data-act="next">Дальше</button>`;
  } else {
    const reasons = S.reasons.length ? S.reasons : ['Добавьте свои причины в настройках'];
    body = `
      ${list}
      <div class="card lilac"><ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}<li>Уже не потрачено: <b class="hl" data-money></b></li></ul></div>
      <div class="card"><span class="muted">Тяга сейчас?</span><div class="scale" data-scale>${[1, 2, 3, 4, 5].map((n) => `<button class="${o.level === n ? 'on' : ''}" data-level="${n}">${n}</button>`).join('')}</div></div>
      <button class="big" data-act="beat">Справился</button>
      <button class="ghost" data-act="again">Всё равно тянет: ещё 5 минут</button>`;
  }
  return `${top('Тянет курить', o.step === 3 ? 'почти всё' : 'это пройдёт', `<button class="ib" data-act="close" aria-label="Закрыть">${I.close}</button>`, '', true)}<main class="body sos">${body}</main>`;
}

function log(o) {
  const alc = o.what.includes('Алкоголь');
  return `
    ${top('Что было?', `сегодня, ${hm(new Date())}`, `<button class="ib" data-act="close" aria-label="Закрыть">${I.close}</button>`, '', true)}
    <main class="body">
      <div class="label">Где</div>${chips('where', TAGS.where, [o.where], false)}
      <div class="label">С кем</div>${chips('who', TAGS.who, o.who)}
      <div class="label">Что ещё</div>${chips('what', TAGS.what, o.what)}
      <div class="label">Сила тяги</div>
      <div class="scale" data-scale>${[1, 2, 3, 4, 5].map((n) => `<button class="${o.level === n ? 'on' : ''}" data-level="${n}">${n}</button>`).join('')}</div>
      ${alc ? `<div class="card hot"><b class="warn">Осторожно с алкоголем</b><p>Он повышает риск сорваться в 2–4 раза. В первые недели лучше пропустить или держать план: что делаете, когда предложат сигарету.</p></div>` : ''}
      <button class="big" data-act="saveLog">Сохранить</button>
    </main>`;
}

function slip(o) {
  if (o.step === 1) {
    return `
      ${top('Бывает', '', `<button class="ib" data-act="close" aria-label="Закрыть">${I.close}</button>`, '', true)}
      <main class="body">
        <p class="ask">Хорошо, что вы отметили.</p>
        <p class="muted">Одна сигарета не стирает то, что вы прошли. Это сигнал собраться прямо сейчас.</p>
        <div class="kept"><div><b>${days(totalMs())}</b><span>всего без сигарет, сохранятся</span></div><div><b>${rub(money())}</b><span>в копилке, сохранятся</span></div></div>
        <div class="label">Что было</div>${chips('swhat', ['Стресс', 'Алкоголь', 'Курят рядом', 'Сильная тяга', 'Кофе', 'Скука', 'Другое'], o.what)}
        <div class="label">Сколько</div>${chips('amount', ['1 сигарета', 'Несколько', 'Снова курю'], [o.amount], false)}
        <button class="big lilac" data-act="slipNext">Дальше</button>
      </main>`;
  }
  const early = streakH() < 14 * 24, alc = o.what.includes('Алкоголь'), near = o.what.includes('Курят рядом');
  const plans = ['Не пить первые 2 недели', 'Сказать друзьям, что бросаю', 'Отходить, когда курят', 'Не держать сигарет дома', 'Сразу жать «Тянет курить»'];
  return `
    ${top('Начинаем снова', '', `<button class="ib" data-act="close" aria-label="Закрыть">${I.close}</button>`, '', true)}
    <main class="body">
      ${alc || near ? `<div class="card hot"><b class="warn">${alc && near ? 'Алкоголь и курящие рядом' : alc ? 'Алкоголь' : 'Курящие рядом'}</b><p>${alc ? 'Алкоголь повышает риск сорваться в 2–4 раза.' : 'Когда курят рядом, тянет сильнее всего.'} Решите заранее, что будете делать в следующий раз.</p></div>` : ''}
      ${early ? `<div class="card"><p>Первые 2 недели особенно важны: даже одна сигарета в это время часто ведёт обратно к курению. Поэтому так хорошо, что вы остановились сейчас.</p></div>` : ''}
      <div class="label">Что сделаю в следующий раз</div>
      ${chips('plan', plans, S.plan)}
      <div class="label">Последняя сигарета была</div>
      ${chips('slipWhen', ['Только что', 'Час назад'], [o.when || 'Только что'], false)}
      <div class="card lilac"><p>Лекарство вдвое повышает шансы. Загляните во вкладку «Помощь».</p></div>
      <button class="big" data-act="restart">Начать заново</button>
    </main>`;
}

function expect() {
  const h = streakH();
  return `
    ${top('Чего ждать', `вы на ${dayNo()} дне`, `<button class="ib" data-act="close" aria-label="Назад">${I.back}</button>`, '', true)}
    <main class="body">
      <p class="small">У многих бывает так, но не у всех: примерно у каждого восьмого симптомы слабые.</p>
      <div class="tl">${EXPECT.map((x) => {
        const st = h >= x.e ? 'done' : h >= x.s ? 'now' : 'ahead';
        return `<div class="it ${st} ${x.risk ? 'risk' : ''} ${x.gold ? 'gold' : ''}"><span class="dot"></span><div class="${st === 'now' ? 'card' : ''}"><span class="t">${x.t}${st === 'now' ? ' · сейчас' : st === 'ahead' ? ` · через ${dur(x.s - h)}` : ''}</span><p>${esc(x.what)}</p>${x.help && st !== 'done' ? `<span class="help">Помогает: ${esc(x.help)}</span>` : ''}</div></div>`;
      }).join('')}</div>
    </main>`;
}

function d28() {
  const n = cigs();
  return `
    <main class="body center">
      <canvas id="trophy" width="24" height="20"></canvas>
      <div class="d28">28 дней</div>
      <p class="ask">Важный рубеж. Кто продержался 28 дней, в 5 раз чаще бросает навсегда.</p>
      <p class="muted">по данным NHS</p>
      <div class="card"><span class="muted">За это время</span><p>${rub(money())} в копилке · ${n} ${plural(n, 'сигарета', 'сигареты', 'сигарет')} не выкурено · ${S.cravings.length} ${plural(S.cravings.length, 'приступ', 'приступа', 'приступов')} тяги пережито</p></div>
      <button class="big" data-act="close">Дальше</button>
    </main>`;
}

function settings() {
  return `
    ${top('Настройки', '', `<button class="ib" data-act="close" aria-label="Назад">${I.back}</button>`, '', true)}
    <main class="body">
      <div class="card form">
        <label>Последняя сигарета<input id="quitAt" type="datetime-local" value="${toLocalInput(S.quitAt)}"></label>
        <div class="pair">
          <label>Сигарет в день<input id="perDay" type="number" inputmode="numeric" value="${S.perDay}"></label>
          <label>Пачка, ₽<input id="packPrice" type="number" inputmode="numeric" value="${S.packPrice}"></label>
        </div>
        <label>Сигарет в пачке<input id="packSize" type="number" inputmode="numeric" value="${S.packSize}"></label>
        <label>Зачем я бросаю (с новой строки)<textarea id="reasons" rows="4">${esc(S.reasons.join('\n'))}</textarea></label>
        <button class="big" data-act="saveSettings">Сохранить</button>
      </div>
      <div class="label">Звук</div>
      <div class="card rows">
        <label class="sw"><span>Звуки</span><input type="checkbox" id="sound" ${S.sound ? 'checked' : ''}></label>
        <label class="sw"><span>Треск костра в «Тянет курить»</span><input type="checkbox" id="fire" ${S.fire ? 'checked' : ''}></label>
      </div>
      <div class="label">Личный скин</div>
      <div class="card">
        <p>${pack ? `Скин загружен: ${pack.img.length} картинок, ${Object.values(pack.snd).length} звуков${pack.fonts.length ? ', шрифт' : ''}.` : 'Файл со своим котиком, костром, шрифтом и звуками. Хранится только в этом телефоне.'}</p>
        <label class="ghost file">${pack ? 'Заменить скин' : 'Загрузить скин'}<input type="file" id="skinFile" accept=".json,application/json"></label>
        ${pack ? '<button class="ghost" data-act="noSkin">Убрать скин</button>' : ''}
      </div>
      <div class="label">Сообщения поддержки</div>
      <div class="card"><p>Сейчас сообщения показываются на главной, меняются дважды в день и знают ваш день отказа и триггеры. Чтобы они приходили на экран блокировки, нужен маленький сервер: это следующий шаг.</p></div>
      <div class="label">Копия данных</div>
      <div class="card">
        <p class="small">Всё хранится только в этом телефоне. Сохраните копию в файл, чтобы не потерять.</p>
        <div class="pair"><button class="ghost" data-act="export">Сохранить копию</button><label class="ghost file">Загрузить копию<input type="file" id="importFile" accept=".json,application/json"></label></div>
      </div>
      <button class="ghost danger" data-act="wipe">Стереть все данные</button>
    </main>`;
}

/* ---------- кнопки ---------- */

function bind() {
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  app.querySelectorAll('[data-act]').forEach((b) => (b.onclick = (e) => act(b.dataset.act, e)));
  app.querySelectorAll('[data-chips]').forEach((box) => {
    box.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      if (box.dataset.multi) b.classList.toggle('on');
      else box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      chipChanged(box.dataset.chips, b.dataset.v);
    };
  });
  app.querySelectorAll('[data-level]').forEach((b) => (b.onclick = () => {
    overlay.level = +b.dataset.level;
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    if (!b.classList.contains('sure')) { b.classList.add('sure'); toast('Нажмите ещё раз, чтобы удалить'); return; }
    S.cravings = S.cravings.filter((c) => c.at !== +b.dataset.del);
    save(); render();
  }));
  app.querySelector('#skinFile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await installSkin(f); toast('Скин загружен'); play('magic'); render(); } catch { toast('Это не файл скина'); }
  });
  app.querySelector('#importFile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || d.app !== 'bez-dyma' || !d.data) throw 0;
      S = { ...structuredClone(DEFAULTS), ...d.data };
      save(); toast('Копия загружена'); close();
    } catch { toast('Это не копия «Без дыма»'); }
  });
  if (document.getElementById('pig')) drawPig();
  if (document.getElementById('trophy')) drawTrophy();
}

const selected = (name) => [...app.querySelectorAll(`[data-chips="${name}"] .chip.on`)].map((b) => b.dataset.v);

function chipChanged(name, v) {
  const o = overlay;
  if (!o) return;
  if (o.name === 'log') {
    o.where = selected('where')[0] || '';
    o.who = selected('who');
    o.what = selected('what');
    if (name === 'what' && v === 'Алкоголь') renderOverlay();
  }
  if (o.name === 'slip') {
    if (name === 'swhat') o.what = selected('swhat');
    if (name === 'amount') o.amount = selected('amount')[0];
    if (name === 'plan') { S.plan = selected('plan'); save(); }
    if (name === 'slipWhen') o.when = selected('slipWhen')[0];
  }
  if (o.name === 'setup' && name === 'when') {
    const d = new Date();
    if (v === 'Час назад') d.setHours(d.getHours() - 1);
    if (v === 'Вчера вечером') { d.setDate(d.getDate() - 1); d.setHours(21, 0, 0, 0); }
    document.getElementById('quitAt').value = toLocalInput(d.getTime());
  }
}

const num = (id, min, max, def) => { const n = Math.round(+document.getElementById(id)?.value); return n >= min && n <= max ? n : def; };
function readQuitAt() {
  const v = document.getElementById('quitAt')?.value;
  const t = v ? new Date(v).getTime() : NaN;
  return isNaN(t) ? S.quitAt : Math.min(t, now());
}
const readReasons = () => document.getElementById('reasons').value.split('\n').map((s) => s.trim()).filter(Boolean);

function act(a) {
  const o = overlay;
  switch (a) {
    case 'close': return close();
    case 'settings': return open({ name: 'settings' });
    case 'expect': return open({ name: 'expect' });
    case 'meow': return play('cat');
    case 'sos': return startSos();
    case 'log': {
      const last = S.cravings[S.cravings.length - 1];
      return open({ name: 'log', where: last?.where || '', who: last?.who || [], what: [], level: 0 });
    }
    case 'slip': return open({ name: 'slip', step: 1, what: [], amount: '1 сигарета' });
    case 'setupDone':
      S.quitAt = readQuitAt();
      S.perDay = num('perDay', 1, 100, 20);
      S.packPrice = num('packPrice', 1, 100000, 250);
      S.reasons = readReasons();
      S.setup = true;
      S.seen = { day: dayNo(), done: STAGES.filter((s) => stageState(s, streakH()) === 'done').length, money: money(), d28: streakH() >= 672 ? S.quitAt : 0 };
      save(); play('day'); overlay = null; return go('today');
    case 'saveSettings': {
      const q = readQuitAt();
      if (q !== S.quitAt) S.seen.done = 0;
      S.quitAt = q;
      S.perDay = num('perDay', 1, 100, S.perDay);
      S.packPrice = num('packPrice', 1, 100000, S.packPrice);
      S.packSize = num('packSize', 1, 100, S.packSize);
      S.reasons = readReasons();
      S.sound = document.getElementById('sound').checked;
      S.fire = document.getElementById('fire').checked;
      setSound(S.sound);
      save(); toast('Сохранено'); return close();
    }
    case 'goal':
      S.goal = { name: document.getElementById('goalName').value.trim(), price: num('goalPrice', 0, 100000000, 0) };
      save(); toast('Цель сохранена'); return render();
    case 'noSkin': return removeSkin();
    case 'export': return exportData();
    case 'wipe':
      if (o.wipe !== 2) { o.wipe = 2; toast('Нажмите ещё раз, чтобы стереть всё'); return; }
      localStorage.removeItem(KEY); location.reload(); return;
    // «Тянет курить»
    case 'task': o.task++; return renderOverlay();
    case 'next': return sosStep(o.step + 1);
    case 'again': return startSos();
    case 'beat': {
      crackle(false); stopSos(); play('magic');
      const last = S.cravings[S.cravings.length - 1];
      return open({ name: 'log', where: last?.where || '', who: last?.who || [], what: [], level: o.level || 0, fromSos: true });
    }
    case 'saveLog':
      S.cravings.push({ at: now(), where: o.where, who: o.who, what: o.what, level: o.level || 0 });
      save(); play('cat'); toast(o.fromSos ? 'Справились и записали' : 'Записано');
      overlay = null; return go('diary');
    // «Я закурил»
    case 'slipNext': o.step = 2; return renderOverlay();
    case 'restart': {
      const at = now() - (o.when === 'Час назад' ? HOUR : 0);
      if (at > S.quitAt) S.past.push({ start: S.quitAt, end: at });
      S.slips.push({ at, what: o.what, amount: o.amount });
      S.quitAt = at;
      S.seen.day = 1; S.seen.done = 0; S.seen.d28 = 0;
      save(); play('dog'); toast('Новый отсчёт пошёл. Вы справитесь.');
      overlay = null; return go('today');
    }
  }
}

function startSos() {
  overlay = { name: 'sos', step: 1, task: Math.floor(Math.random() * TASKS.length), endAt: now() + 5 * 60e3, level: 0 };
  if (S.fire) crackle(true);
  renderOverlay();
  stopSos();
  sosTimer = setInterval(sosTick, 250);
}

function sosStep(n) {
  const o = overlay;
  o.step = n;
  if (n === 2) { o.breathAt = now(); play('magic'); }
  if (n === 3) crackle(false);
  renderOverlay();
}

function sosTick() {
  const o = overlay;
  if (!o || o.name !== 'sos') return stopSos();
  if (o.step === 1) {
    const left = Math.max(0, o.endAt - now());
    const el = app.querySelector('[data-sos]');
    if (el) el.textContent = `${Math.floor(left / 60e3)}:${pad(Math.floor(left / 1000) % 60)}`;
    drawRing(1 - left / 300e3);
    if (!left) sosStep(2);
  } else if (o.step === 2) {
    // 6 циклов: вдох 4 секунды, выдох 6
    const t = (now() - o.breathAt) / 1000, cyc = Math.floor(t / 10), ph = t % 10;
    const box = document.getElementById('breath');
    if (cyc >= 6) return sosStep(3);
    if (box) {
      const k = ph < 4 ? ph / 4 : 1 - (ph - 4) / 6;
      box.style.transform = `scale(${0.7 + k * 0.5})`;
      document.getElementById('breathT').textContent = ph < 4 ? `Вдох ${4 - Math.floor(ph)}` : `Выдох ${6 - Math.floor(ph - 4)}`;
      document.getElementById('breathN').textContent = `${cyc + 1} из 6`;
    }
  }
}

function drawRing(p) {
  const c = document.getElementById('ring')?.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, 50, 50);
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
    const x = Math.round(25 + Math.cos(a) * 21 - 2), y = Math.round(25 + Math.sin(a) * 21 - 2);
    c.fillStyle = '#120f17'; c.fillRect(x - 1, y - 1, 6, 6);
    c.fillStyle = i / 40 < p ? '#f08a62' : '#322d38'; c.fillRect(x, y, 4, 4);
  }
}

function sprite(id, rows, pal) {
  const c = document.getElementById(id).getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
}
function drawPig() {
  sprite('pig', ['....................', '........kkkk........', '.......kggggk.......', '....kkkkkkkkkkkk....', '..kkppppppppppppkk..', '.kppppppppppppppppk.', 'kppppwkppppppppppppk', 'kppppkkppppppppppnnk', 'kpppppppppppppppnnnk', 'kppppppppppppppppppk', '.kpppppppppppppppdk.', '..kkppppppppppppkk..', '...kpk.kkkkkk.kpk...', '...kpk........kpk...', '...kkk........kkk...'],
    { k: '#120f17', p: '#f08a62', n: '#b85a3a', w: '#f3e9dc', d: '#b85a3a', g: '#f2c95c' });
}
function drawTrophy() {
  sprite('trophy', ['.....kkkkkkkkkkkkkk.....', '...kkkggggggggggggkkk...', '..kgk.kggggggggggk.kgk..', '..kgk.kggwgggggggk.kgk..', '..kgk.kggwgggggggk.kgk..', '...kgkkggwgggggggkkgk...', '....kkkggggggggggkkk....', '.......kggggggggk.......', '........kggggggk........', '.........kggggk.........', '..........kggk..........', '..........kggk..........', '.........kggggk.........', '.......kkkkkkkkkk.......', '.......kddddddddk.......', '.......kddddddddk.......', '.......kkkkkkkkkk.......'],
    { k: '#120f17', g: '#f2c95c', w: '#fff3c4', d: '#b85a3a' });
}

/* ---------- каждую секунду ---------- */

function segs(el, p) {
  if (!el) return;
  const n = p > 0.995 ? 10 : p * 10;
  el.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${n >= i + 1 ? 'on' : n >= i + 0.5 ? 'half' : ''}"></i>`).join('');
}

function tick() {
  const ms = streakMs(), s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = ms / HOUR;
  const cells = `<div class="cell d"><b>${d}</b><small>${plural(d, 'день', 'дня', 'дней')}</small></div><div class="cell"><b>${pad(Math.floor(s / 3600) % 24)}</b><small>час</small></div><div class="cell"><b>${pad(Math.floor(s / 60) % 60)}</b><small>мин</small></div><div class="cell"><b>${pad(s % 60)}</b><small>сек</small></div>`;
  app.querySelectorAll('[data-timer]').forEach((e) => (e.innerHTML = cells));
  const m = money();
  app.querySelectorAll('[data-money]').forEach((e) => (e.textContent = rub(m)));
  app.querySelectorAll('[data-cigs]').forEach((e) => (e.textContent = cigs()));
  app.querySelectorAll('[data-total]').forEach((e) => (e.textContent = days(totalMs())));
  app.querySelectorAll('[data-goal]').forEach((e) => (e.style.width = Math.min(100, (m / S.goal.price) * 100).toFixed(1) + '%'));
  const nic = 1 - 0.5 ** (h / 2), co = 1 - 0.5 ** (h / 4.5);
  const pct = (p) => (p > 0.995 ? 100 : Math.floor(p * 100)) + '%';
  app.querySelectorAll('[data-nic]').forEach((e) => (e.textContent = pct(nic)));
  app.querySelectorAll('[data-co]').forEach((e) => (e.textContent = pct(co)));
  segs(app.querySelector('[data-nics]'), nic);
  segs(app.querySelector('[data-cos]'), co);
}

// Раз в минуту: новые этапы, новый день, рубеж 28 дней.
function checkEvents() {
  if (!S.setup) return;
  const h = streakH(), done = STAGES.filter((s) => stageState(s, h) === 'done').length;
  let changed = false;
  if (h >= 672 && S.seen.d28 !== S.quitAt) {
    S.seen.d28 = S.quitAt; save();
    if (!overlay) { open({ name: 'd28' }); soon('day'); }
    return;
  }
  if (dayNo() > S.seen.day) { S.seen.day = dayNo(); changed = true; toast(`Новый день без сигарет: ${dayNo()}`); soon('day'); }
  else if (done > S.seen.done) { if (S.seen.done) { toast(`Новое улучшение: ${STAGES.filter((s) => stageState(s, h) === 'done').pop().what}`); soon('magic'); } S.seen.done = done; changed = true; }
  const packs = Math.floor(money() / S.packPrice);
  if (packs > Math.floor(S.seen.money / S.packPrice)) { S.seen.money = money(); changed = true; if (tab === 'money') soon('money'); }
  if (changed) { save(); if (!overlay && !document.activeElement?.matches('input,textarea')) render(); }
}

// Звук можно играть только после касания экрана: если касания ещё не было, ждём его.
let touched = false;
addEventListener('pointerdown', () => { touched = true; if (queued) { play(queued); queued = null; } }, { once: true });
let queued = null;
function soon(key) { if (touched) play(key); else queued = key; }

/* ---------- копия в файл ---------- */

async function exportData() {
  const d = new Date();
  const name = `Без дыма ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  const file = new File([JSON.stringify({ app: 'bez-dyma', v: 1, at: now(), data: S })], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch { /* закрыл меню */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- запуск ---------- */

setSound(S.sound);
render();
loadSkin().then(() => { if (pack) render(); });
setInterval(tick, 1000);
setInterval(checkEvents, 60e3);
setTimeout(checkEvents, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkEvents(); } });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
