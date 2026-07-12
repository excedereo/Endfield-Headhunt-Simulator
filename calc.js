/* ENDFIELD // Калькулятор ресурсов → пуллов */

const RATES = {
  OROBERYL_PER_PULL: 500,
  ORIG_TO_OROBERYL: 75,
  BASE_TICKET_PER_PULL: 25,
};

// формат рублёвой цены: «5 990 ₽» (целое, тысячи через пробел)
function fmtRub(v) { return Math.round(v).toLocaleString('ru-RU') + ' ₽'; }

// пакеты доната: name, amt (ориджеметрия), price (₽, РУ-регион), dbl (есть ли удвоение),
// img (картинка из topup/), pulls (готовые пуллы), arsenal (билеты арсенала — справочно),
// limit (макс. покупок; нет поля = без лимита)
const DONATES = [
  { name: 'Особая скидка', amt: 12, price: 199, dbl: false, img: 'orid_1.png' },
  { name: 'Комплект', amt: 21, price: 799, dbl: true, img: 'orid_2.png' },
  { name: 'Горка', amt: 34, price: 999, dbl: true, img: 'orid_3.png' },
  { name: 'Мешок', amt: 57, price: 1990, dbl: true, img: 'orid_4.png' },
  { name: 'Коробка', amt: 92, price: 2990, dbl: true, img: 'orid_5.png' },
  { name: 'Ящик', amt: 194, price: 5990, dbl: true, img: 'orid_6.png' },
  { name: 'Штабель', amt: 320, bonus: 80, price: 9990, dbl: true, img: 'orid_7.png' },
  { name: 'Месячный пропуск', price: 449, dbl: false, img: 'monthly_pass.png', pass: true },
  { name: 'Набор «Протокол потока»', amt: 0, price: 2490, dbl: false, img: 'flow_protocol.png', pulls: 10, arsenal: 2000, limit: 1 },
];

// параметры месячного пропуска: 12 ◈ за месяц + 200 оро/день, цена помесячно
const PASS = { price: 449, origPerMonth: 12, oroPerDay: 200, daysPerMonth: 30 };

// состояние
const state = {
  login: [false, false, false],   // три дня
  apc: 0,
  base: 0,
  orig: 0,
  oro: 0,
  passDays: 0,  // дней месячного пропуска
  // на каждый пакет: qty (кол-во покупок) и doubled (0/1 — бонус удвоения, даётся 1 раз)
  donates: {},  // index -> { qty, doubled }
};
const LOGIN_DAYS = [2, 2, 1]; // пуллов по дням

/* ── ЦЕНТРАЛИЗОВАННАЯ НАВИГАЦИЯ ── */
// page: 'sim' | 'calc' | 'simmenu'
function navTo(page) {
  if (!page) return;
  const pages = { sim: 'page-sim', calc: 'page-calc', simmenu: 'page-simmenu' };
  Object.entries(pages).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', key !== page);
  });
  // tabbar: «Симулятор» подсвечен для sim и simmenu
  document.querySelectorAll('.tab').forEach(t => {
    const isSimTab = t.dataset.tab === 'sim';
    const active = (page === 'calc') ? !isSimTab : isSimTab;
    t.classList.toggle('active', active);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navTo = navTo;

function isMobile() { return window.matchMedia('(max-width:760px)').matches; }

// сворачивание секции донатов (по умолчанию свёрнута)
function initDonateToggle() {
  const block = document.getElementById('donateBlock');
  const head = document.getElementById('donateToggle');
  if (!block || !head) return;
  const toggle = () => block.classList.toggle('collapsed');
  head.addEventListener('click', e => {
    if (e.target.closest('.info')) return;  // клик по «?» не сворачивает
    toggle();
  });
  head.addEventListener('keydown', e => {
    if (e.target.closest('.info')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
}

function initPages() {
  // нижний бар (мобайл)
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'sim') navTo(isMobile() ? 'simmenu' : 'sim');
      else navTo('calc');
    });
  });
  // плашки меню симулятора → выбор режима + переход
  document.querySelectorAll('.sm-card').forEach(card => {
    card.addEventListener('click', () => {
      if (window.setMode) window.setMode(card.dataset.go);
      navTo('sim');
    });
  });
  // на старте: десктоп — обычная sim-страница; мобайл — меню
  navTo(isMobile() ? 'simmenu' : 'sim');
  // при ресайзе через границу подстраиваем (если ушли на узкий и были на page-sim без выбора — оставляем)
}

/* ── КАСТОМНЫЕ СЛАЙДЕРЫ ── */
function buildSlider(el) {
  const min = +el.dataset.min, max = +el.dataset.max;
  const step = +el.dataset.step || 1;
  const target = el.dataset.target;
  // восстановление из state, иначе из data-val
  let val = (typeof state[target] === 'number') ? state[target] : (+el.dataset.val || 0);
  const unit = el.dataset.unit || '';
  const linkId = el.dataset.link;

  el.innerHTML = `
    <div class="sl-track"><div class="sl-fill"></div><div class="sl-knob" tabindex="0"></div></div>
    <div class="sl-readout"><span class="sl-val">0</span> <span class="sl-unit">${unit}</span></div>`;
  const track = el.querySelector('.sl-track');
  const fill = el.querySelector('.sl-fill');
  const knob = el.querySelector('.sl-knob');
  const valEl = el.querySelector('.sl-val');

  function setVal(v, fromInput) {
    v = Math.round(v / step) * step;
    v = Math.max(min, Math.min(max, v));
    val = v;
    const pct = (v - min) / (max - min) * 100;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    valEl.textContent = v.toLocaleString('ru');
    state[target] = v;
    if (!fromInput && linkId) document.getElementById(linkId).value = v;
    recalc();
  }
  el._setVal = setVal;

  function posToVal(clientX) {
    const r = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return min + p * (max - min);
  }
  let dragging = false;
  const onDown = e => { dragging = true; knob.classList.add('drag'); move(e); e.preventDefault(); };
  const onUp = () => { dragging = false; knob.classList.remove('drag'); };
  const move = e => {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    setVal(posToVal(x));
  };
  track.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', onUp);
  track.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', onUp);
  knob.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') setVal(val - step);
    if (e.key === 'ArrowRight') setVal(val + step);
  });

  // связь с числовым полем
  if (linkId) {
    const input = document.getElementById(linkId);
    input.addEventListener('input', () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) v = 0;
      setVal(v, true);
    });
  }
  setVal(val);
}

/* ── ТУМБЛЕРЫ ВХОДА ── */
function buildLoginToggles() {
  const host = document.getElementById('loginToggles');
  host.innerHTML = '';
  LOGIN_DAYS.forEach((p, i) => {
    const t = document.createElement('label');
    t.className = 'toggle';
    t.innerHTML = `
      <input type="checkbox" data-day="${i}">
      <span class="tg-track"><span class="tg-knob"></span></span>
      <span class="tg-lbl">ДЕНЬ ${i + 1} <b>+${p}</b></span>`;
    const chk = t.querySelector('input');
    // восстановление сохранённого
    chk.checked = !!state.login[i];
    t.classList.toggle('on', chk.checked);
    chk.addEventListener('change', () => {
      state.login[i] = chk.checked;
      t.classList.toggle('on', chk.checked);
      recalc();
    });
    host.appendChild(t);
  });
}

/* ── ДОНАТЫ ── */
// карточка-товар: картинка товара — фон, поверх затемнение и контент.
// обычные — счётчик кол-ва + галка удвоения; пропуск — поле «дней».
function buildDonates() {
  const host = document.getElementById('donateGrid');
  host.innerHTML = '';
  DONATES.forEach((d, i) => {
    // восстановление сохранённого, иначе ноль
    const saved = state.donates[i];
    state.donates[i] = {
      qty: saved ? (saved.qty || 0) : 0,
      doubled: saved && d.dbl ? (saved.doubled || 0) : 0,
    };
    const card = document.createElement('div');
    card.className = 'donate-card';
    const bonusAmt = d.bonus != null ? d.bonus : d.amt;   // бонус удвоения (у штабеля он другой)
    const isPack = d.pulls > 0;   // пакет с готовыми пуллами (Протокол потока)
    const isPass = !!d.pass;      // месячный пропуск
    const img = d.img ? `topup/${d.img}` : 'icons/Origeometry.png';
    const tag = d.dbl ? 'УДВОЕНИЕ ДОСТУПНО'
      : (isPack ? 'ВЫГОДНО · 1 РАЗ ЗА БАННЕР' : (isPass ? 'PRIME ACCESS · ПОМЕСЯЧНО' : 'ОСОБАЯ СКИДКА'));
    // строка «что внутри»
    const amtRow = isPass
      ? `<div class="dc-amt"><span class="dc-base">12</span><span class="dc-cur">◈</span><span class="dc-cur dc-cur-txt">/ мес + 200 оро/день</span></div>`
      : isPack
      ? `<div class="dc-amt"><span class="dc-base">${d.pulls}</span><span class="dc-cur dc-cur-txt">пуллов</span></div>
         <div class="dc-extra">+ ${d.arsenal.toLocaleString('ru')} билетов арсенала</div>`
      : `<div class="dc-amt"><span class="dc-base">${d.amt}</span><span class="dc-cur">◈</span></div>`;
    // нижний контрол: пропуск — поле дней; остальные — счётчик +/-
    const ctrlRow = isPass
      ? `<div class="dc-qty-row">
           <span class="dc-qty-lbl">Дней <span class="dc-pass-months" id="passMonths"></span></span>
           <input type="number" id="inPassDays" class="dc-days" value="0" min="0" max="3650" placeholder="0">
         </div>`
      : `<div class="dc-qty-row">
           <span class="dc-qty-lbl">Количество</span>
           <div class="dc-qty">
             <button class="dq-btn" data-d="-">−</button>
             <span class="dq-val">0</span>
             <button class="dq-btn" data-d="+">+</button>
           </div>
         </div>`;
    const doubledRow = d.dbl ? `
      <label class="dc-dbl">
        <input type="checkbox" data-kind="doubled">
        <span class="dcb-box"></span>
        <span class="dc-dbl-text">Удвоение первой покупки <b>+${bonusAmt} ◈</b></span>
      </label>` : '';
    card.innerHTML = `
      <div class="dc-tag">${tag}</div>
      <div class="dc-bg" style="background-image:url('${img}')"></div>
      <div class="dc-content">
        <div class="dc-name">${d.name}</div>
        ${amtRow}
        <div class="dc-price">${fmtRub(d.price)}</div>
        ${ctrlRow}
        ${doubledRow}
      </div>`;
    if (!d.dbl) card.classList.add('special');
    if (isPack) card.classList.add('pack');
    if (isPass) card.classList.add('pass');

    // ── пропуск: поле дней привязываем к state.passDays, qty карточки не используется ──
    if (isPass) {
      const days = card.querySelector('#inPassDays');
      days.value = state.passDays || 0;
      const syncActive = () => card.classList.toggle('active', (state.passDays || 0) > 0);
      days.addEventListener('input', () => {
        let v = parseInt(days.value, 10);
        state.passDays = isNaN(v) || v < 0 ? 0 : v;
        syncActive(); recalc();
      });
      syncActive();
      host.appendChild(card);
      return;
    }

    const dblRow = card.querySelector('.dc-dbl');
    const dchk = card.querySelector('input[data-kind="doubled"]');
    const plusBtn = card.querySelector('.dq-btn[data-d="+"]');
    const refresh = () => {
      const st = state.donates[i];
      card.classList.toggle('active', st.qty > 0 || st.doubled > 0);
      card.querySelector('.dq-val').textContent = st.qty;
      if (d.limit != null) plusBtn.disabled = st.qty >= d.limit;  // лимит: гасим «+»
      if (dblRow) {
        const avail = st.qty >= 1;   // удвоение доступно только при кол-ве ≥1
        dblRow.classList.toggle('disabled', !avail);
        dchk.disabled = !avail;
        dblRow.classList.toggle('on', st.doubled > 0);
      }
    };

    card.querySelectorAll('.dq-btn').forEach(b => {
      b.addEventListener('click', () => {
        const st = state.donates[i];
        let next = st.qty + (b.dataset.d === '+' ? 1 : -1);
        if (d.limit != null) next = Math.min(d.limit, next);
        st.qty = Math.max(0, next);
        if (st.qty === 0 && dchk) { st.doubled = 0; dchk.checked = false; }
        refresh(); recalc();
      });
    });
    if (dchk) dchk.addEventListener('change', () => {
      if (state.donates[i].qty < 1) { dchk.checked = false; return; }
      state.donates[i].doubled = dchk.checked ? 1 : 0;
      refresh(); recalc();
    });

    if (dchk && state.donates[i].doubled) dchk.checked = true;
    refresh();
    host.appendChild(card);
  });
}

/* ── ИТОГОВЫЙ РАСЧЁТ ── */
function recalc() {
  // пуллы из прямых источников
  let loginPulls = 0;
  state.login.forEach((on, i) => { if (on) loginPulls += LOGIN_DAYS[i]; });
  const apcPulls = state.apc;
  const basePulls = Math.floor(state.base / RATES.BASE_TICKET_PER_PULL);

  // ороберил из ориджеметрия + донатов + имеющегося
  let origTotal = state.orig;
  let donateAmt = 0;     // ориджеметрия из донатов
  let donatePulls = 0;   // готовые пуллы из пакетов (Протокол потока)
  let donateOro = 0;     // ороберил из донатов (месячный пропуск)
  let moneySpent = 0;    // ₽ потрачено
  DONATES.forEach((d, i) => {
    const st = state.donates[i] || { qty: 0, doubled: 0 };
    if (st.qty > 0) {
      donateAmt += (d.amt || 0) * st.qty;       // базовое за все купленные
      donatePulls += (d.pulls || 0) * st.qty;   // готовые пуллы
      moneySpent += d.price * st.qty;
      if (st.doubled) donateAmt += (d.bonus != null ? d.bonus : d.amt); // бонус первой покупки — ОДИН РАЗ
    }
  });

  // месячный пропуск: дни → месяцы (цена), ориджи × месяцы, ороберил × дни
  const passDays = state.passDays || 0;
  if (passDays > 0) {
    const months = Math.ceil(passDays / PASS.daysPerMonth);
    donateAmt += PASS.origPerMonth * months;   // 12 ориджи за каждый начатый месяц
    donateOro += PASS.oroPerDay * passDays;    // 200 ороберила в день
    moneySpent += PASS.price * months;
  }

  origTotal += donateAmt;

  const oroFromOrig = origTotal * RATES.ORIG_TO_OROBERYL;
  const oroTotal = oroFromOrig + state.oro + donateOro;   // + ороберил месячного пропуска
  const oroPulls = Math.floor(oroTotal / RATES.OROBERYL_PER_PULL);

  const totalPulls = loginPulls + apcPulls + basePulls + oroPulls + donatePulls;

  // сохраняем итог пуллов, чтобы симулятор мог его подставить кнопкой «Мои пуллы»
  try {
    localStorage.setItem('endfield_my_pulls', String(totalPulls));
    localStorage.setItem('endfield_my_oro', String(Math.round(oroTotal)));
    localStorage.setItem('endfield_my_orig', String(Math.round(origTotal)));
  } catch (e) {}
  const mc = document.getElementById('mineCount');
  if (mc) mc.textContent = totalPulls.toLocaleString('ru');

  // обновляем выводы блоков
  setOut('outLogin', loginPulls, 'пуллов');
  setOut('outApc', apcPulls, 'пуллов');
  setOut('outBase', basePulls, 'пуллов');
  // месячный пропуск: подпись месяцев в карточке
  const pm = document.getElementById('passMonths');
  if (pm) pm.textContent = passDays > 0
    ? `· ${Math.ceil(passDays / PASS.daysPerMonth)} мес · ${fmtRub(PASS.price * Math.ceil(passDays / PASS.daysPerMonth))}`
    : '';
  // объединённый блок ороберил+ориджеметрий: пуллы от обоих (без донатов)
  const ownOro = state.oro + state.orig * RATES.ORIG_TO_OROBERYL;
  setOut('outOro', Math.floor(ownOro / RATES.OROBERYL_PER_PULL), 'пуллов');
  document.getElementById('outOrig').textContent =
    '= ' + (state.orig * RATES.ORIG_TO_OROBERYL).toLocaleString('ru') + ' ороберила';

  animateTo('totalOro', oroTotal);
  animateTo('totalPulls', totalPulls);

  // чекаут — потрачено реальных денег
  const checkout = document.getElementById('checkout');
  if (moneySpent > 0) {
    document.getElementById('checkoutVal').textContent = fmtRub(moneySpent);
    const pp = totalPulls > 0 ? (moneySpent / totalPulls) : 0;
    document.getElementById('checkoutPer').textContent = pp > 0 ? '≈ ' + fmtRub(Math.round(pp)) + ' / пулл' : '';
    checkout.classList.add('open');   // плавное раскрытие
  } else {
    checkout.classList.remove('open');
  }

  // разбивка
  const bd = document.getElementById('breakdown');
  const parts = [
    ['Вход', loginPulls],
    ['АПК', apcPulls],
    ['Базовые талоны', basePulls],
    ['Ороберил (всё)', oroPulls],
    ['Пакеты (пуллы)', donatePulls],
  ].filter(p => p[1] > 0);
  bd.innerHTML = parts.map(p => `<span class="bd-item">${p[0]} <b>+${p[1]}</b></span>`).join('')
    || '<span class="bd-item bd-empty">// добавь ресурсы выше</span>';

  saveState();
}

/* ── СОХРАНЕНИЕ / ЗАГРУЗКА (localStorage = постоянный файл браузера) ── */
// автосохранение состояния полей (черновик — переживает перезагрузку, но не считается «снапшотом»)
const SAVE_KEY = 'endfield_calc_v1';
function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  markDirty();
}
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.login)) state.login = s.login;
    ['apc', 'base', 'orig', 'oro', 'passDays'].forEach(k => { if (typeof s[k] === 'number') state[k] = s[k]; });
    if (s.donates) state.donates = s.donates;
  } catch (e) {}
}

/* ── ЯВНОЕ СОХРАНЕНИЕ СНАПШОТА (кнопка «Сохранить») + ИСТОРИЯ ПО ДНЯМ ── */
const HISTORY_KEY = 'endfield_history_v1';
const LAST_SAVED_KEY = 'endfield_last_saved_v1';
let lastSavedSnapshot = null; // JSON.stringify(state) на момент последнего явного сохранения

function loadLastSaved() {
  try { lastSavedSnapshot = localStorage.getItem(LAST_SAVED_KEY); } catch (e) { lastSavedSnapshot = null; }
  // первый визит: ещё не было явных сохранений — берём стартовое состояние за точку отсчёта,
  // чтобы кнопка не подсвечивалась «грязной» пока пользователь ничего не менял
  if (lastSavedSnapshot === null) lastSavedSnapshot = JSON.stringify(state);
}

function isDirty() {
  return lastSavedSnapshot !== JSON.stringify(state);
}

function markDirty() {
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('saveStatus');
  if (!btn || !status) return;
  if (isDirty()) {
    btn.classList.add('dirty'); btn.classList.remove('saved');
    status.textContent = '// есть несохранённые изменения';
    status.className = 'save-status dirty';
  } else {
    btn.classList.remove('dirty'); btn.classList.add('saved');
    status.textContent = '// сохранено';
    status.className = 'save-status saved';
  }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

// сохраняет снапшот: фиксирует состояние + записывает точку в историю по дню (перезаписывая сегодняшнюю)
function saveSnapshot() {
  const totalPulls = parseInt(localStorage.getItem('endfield_my_pulls') || '0', 10) || 0;
  const oro = parseInt(localStorage.getItem('endfield_my_oro') || '0', 10) || 0;
  const orig = parseInt(localStorage.getItem('endfield_my_orig') || '0', 10) || 0;
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const history = loadHistory();
  const idx = history.findIndex(h => h.date === dateKey);
  const entry = { date: dateKey, pulls: totalPulls, oro, orig };
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  history.sort((a, b) => a.date.localeCompare(b.date));
  // храним снапшоты за последние ~2 года (по дням, не по числу точек — график теперь месячный)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 730);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const trimmed = history.filter(h => h.date >= cutoffKey);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    lastSavedSnapshot = JSON.stringify(state);
    localStorage.setItem(LAST_SAVED_KEY, lastSavedSnapshot);
  } catch (e) {}

  // показываем месяц только что сохранённой точки
  const [y, m] = dateKey.split('-').map(Number);
  histCursor = { year: y, month: m - 1 };

  markDirty();
  renderHistory();
}

function fmtHistDate(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}.${m}`;
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// текущий показываемый месяц графика: {year, month} (month: 0-11). null → вычисляется динамически при первом рендере
let histCursor = null;

// самый свежий месяц, для которого есть хоть один снапшот (или текущий месяц, если истории ещё нет)
function latestHistMonth(history) {
  if (!history.length) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  const last = history[history.length - 1].date; // история отсортирована по дате
  const [y, m] = last.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

function dateKeyOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ломаная линия «пуллы по дням»: сегмент зелёный (рост), красный (падение), жёлтый (без изменений).
// ось X — все дни выбранного месяца; дни без снапшота дают разрыв линии (не соединяются).
function renderHistory() {
  const chart = document.getElementById('histChart');
  const empty = document.getElementById('histEmpty');
  const monthLabel = document.getElementById('histMonthLabel');
  const prevBtn = document.getElementById('histPrev');
  const nextBtn = document.getElementById('histNext');
  if (!chart) return;

  const history = loadHistory();
  if (!histCursor) histCursor = latestHistMonth(history);

  if (monthLabel) monthLabel.textContent = `${MONTH_NAMES[histCursor.month]} ${histCursor.year}`;
  // запрещаем листать вперёд дальше месяца с последним снапшотом (нет смысла показывать пустое будущее)
  if (nextBtn) {
    const latest = latestHistMonth(history);
    const atLatest = histCursor.year === latest.year && histCursor.month === latest.month;
    nextBtn.disabled = atLatest;
  }

  const byDate = {};
  history.forEach(h => { byDate[h.date] = h; });

  const nDays = daysInMonth(histCursor.year, histCursor.month);
  const monthPoints = [];
  for (let d = 1; d <= nDays; d++) {
    const key = dateKeyOf(histCursor.year, histCursor.month, d);
    monthPoints.push({ day: d, h: byDate[key] || null });
  }
  const known = monthPoints.filter(p => p.h);

  if (known.length === 0) {
    chart.innerHTML = '';
    if (empty) { empty.style.display = ''; empty.textContent = '// нет сохранённых снапшотов за этот месяц'; }
    return;
  }
  if (empty) empty.style.display = 'none';

  const W = 1000, H = 240, padX = 24, padTop = 20, padBottom = 36;
  const max = Math.max(...known.map(p => p.h.pulls), 1);
  const min = Math.min(...known.map(p => p.h.pulls), 0);
  const range = Math.max(1, max - min);
  const stepX = nDays > 1 ? (W - padX * 2) / (nDays - 1) : 0;
  const xAt = day => padX + (day - 1) * stepX;
  const yAt = v => H - padBottom - ((v - min) / range) * (H - padTop - padBottom);

  monthPoints.forEach(p => { p.x = xAt(p.day); p.y = p.h ? yAt(p.h.pulls) : null; });

  // сетка: 4 горизонтальные линии по значению + вертикальная под каждым днём с данными
  let grid = '';
  const GRID_ROWS = 4;
  for (let i = 0; i <= GRID_ROWS; i++) {
    const y = padTop + (i / GRID_ROWS) * (H - padTop - padBottom);
    grid += `<line class="hist-grid-line" x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}"></line>`;
  }
  monthPoints.forEach(p => {
    grid += `<line class="hist-grid-line" x1="${p.x}" y1="${padTop}" x2="${p.x}" y2="${H - padBottom}"></line>`;
  });

  // сегменты только между СОСЕДНИМИ известными точками (пропуски рвут линию, не соединяют её)
  let segs = '';
  for (let i = 1; i < known.length; i++) {
    const a = known[i - 1], b = known[i];
    const diff = b.h.pulls - a.h.pulls;
    const cls = diff > 0 ? 'hist-seg-up' : diff < 0 ? 'hist-seg-down' : 'hist-seg-flat';
    segs += `<line class="hist-seg ${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-dasharray="1" stroke-dashoffset="1" pathLength="1"></line>`;
  }

  let dots = '';
  let labels = '';
  known.forEach((p, i) => {
    const prev = i > 0 ? known[i - 1].h : null;
    dots += `<circle class="hist-dot" cx="${p.x}" cy="${p.y}" r="4" data-tip='${histTipHtml(p.h, prev)}'></circle>`;
  });
  // подписи дат: прореживаем по всем дням месяца, чтобы не наезжали друг на друга
  const labelStep = Math.max(1, Math.ceil(nDays / 10));
  monthPoints.forEach((p, i) => {
    const showLabel = i === 0 || i === nDays - 1 || p.day % labelStep === 0;
    if (showLabel) labels += `<text class="hist-label" x="${p.x}" y="${H - 14}" text-anchor="${i === 0 ? 'start' : i === nDays - 1 ? 'end' : 'middle'}">${p.day}</text>`;
  });

  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="hist-svg">${grid}${segs}${dots}${labels}</svg>`;

  // анимация «дорисовки» линии слева направо
  requestAnimationFrame(() => {
    chart.querySelectorAll('.hist-seg').forEach((el, i) => {
      setTimeout(() => { el.style.strokeDashoffset = '0'; }, i * 60);
    });
  });

  attachHistTip(chart);
}

function shiftHistMonth(delta) {
  if (!histCursor) histCursor = latestHistMonth(loadHistory());
  let { year, month } = histCursor;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  histCursor = { year, month };
  renderHistory();
}

function initHistNav() {
  const prevBtn = document.getElementById('histPrev');
  const nextBtn = document.getElementById('histNext');
  if (prevBtn) prevBtn.addEventListener('click', () => shiftHistMonth(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => shiftHistMonth(1));
}

// строит HTML тултипа: дата + пуллы/ороберил/ориджеметрий с цветной дельтой к предыдущему снапшоту
function histTipLine(label, value, prevValue) {
  const diff = prevValue === null || prevValue === undefined ? null : value - prevValue;
  let diffHtml = '';
  if (diff !== null) {
    const cls = diff > 0 ? 'ht-up' : diff < 0 ? 'ht-down' : 'ht-flat';
    const sign = diff > 0 ? '+' : '';
    diffHtml = ` <span class="${cls}">(${sign}${diff.toLocaleString('ru')})</span>`;
  }
  return `<div class="ht-row"><span class="ht-label">${label}</span> ${value.toLocaleString('ru')}${diffHtml}</div>`;
}
function histTipHtml(h, prev) {
  const date = `<div class="ht-date">${fmtHistDate(h.date)}</div>`;
  const rows = histTipLine('Пуллы', h.pulls, prev ? prev.pulls : null)
    + histTipLine('Ороберил', h.oro || 0, prev ? (prev.oro || 0) : null)
    + histTipLine('Ориджеметрий', h.orig || 0, prev ? (prev.orig || 0) : null);
  // экранируем для безопасной вставки в data-атрибут (одинарные кавычки в разметке уже не используются внутри)
  return (date + rows).replace(/'/g, '&#39;');
}

// тултип для точек графика истории (переиспользует общий #histoTip)
function attachHistTip(host) {
  let tip = document.getElementById('histoTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'histoTip';
    tip.className = 'histo-tip';
    document.body.appendChild(tip);
  }
  host.addEventListener('mousemove', e => {
    const dot = e.target.closest('.hist-dot');
    if (!dot) { tip.classList.remove('show'); return; }
    tip.innerHTML = dot.dataset.tip;
    tip.classList.add('show', 'hist-tip-rich');
    placeTip(tip, e.clientX, e.clientY);
  });
  host.addEventListener('mouseleave', () => { tip.classList.remove('show', 'hist-tip-rich'); });
}

function initSaveButton() {
  const btn = document.getElementById('saveBtn');
  if (!btn) return;
  btn.addEventListener('click', saveSnapshot);
  // предупреждение при уходе со страницы, если есть несохранённые изменения
  window.addEventListener('beforeunload', e => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
}

function setOut(id, val, unit) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val.toLocaleString('ru') + ' <span>' + unit + '</span>';
}

const _animState = {};
function animateTo(id, to) {
  const el = document.getElementById(id);
  const from = _animState[id] || 0;
  _animState[id] = to;
  const start = performance.now(), dur = 500;
  const ease = t => 1 - Math.pow(1 - t, 3);
  function fr(now) {
    const t = Math.min(1, (now - start) / dur);
    const v = Math.round(from + (to - from) * ease(t));
    el.textContent = v.toLocaleString('ru');
    if (t < 1) requestAnimationFrame(fr);
  }
  requestAnimationFrame(fr);
}

// привязка простого числового поля к state
function bindNumber(id, key) {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    let v = parseInt(input.value, 10);
    state[key] = isNaN(v) || v < 0 ? 0 : v;
    recalc();
  });
}

/* ── ИНИЦИАЛИЗАЦИЯ (после прелоадера) ── */
function initCalc() {
  loadState();              // сначала поднимаем сохранённое
  loadLastSaved();          // снапшот последнего явного сохранения (для индикатора dirty)
  initSaveButton();
  initHistNav();
  renderHistory();
  initPages();
  buildLoginToggles();      // читают state.login
  buildDonates();           // читают state.donates
  initDonateToggle();       // секция донатов свёрнута по умолчанию
  document.querySelectorAll('#page-calc .slider').forEach(buildSlider); // слайдер АПК читает state.apc
  // числовые поля — выставляем сохранённые значения
  bindNumber('inBase', 'base');
  bindNumber('inOrig', 'orig');
  bindNumber('inOro', 'oro');
  // inPassDays привязан внутри buildDonates (карточка пропуска)
  document.getElementById('inBase').value = state.base || 0;
  document.getElementById('inOrig').value = state.orig || 0;
  document.getElementById('inOro').value = state.oro || 0;
  recalc();
}

// ждём пока появится #app (прелоадер уберёт hidden)
const _ci = setInterval(() => {
  if (!document.getElementById('app').classList.contains('hidden')) {
    clearInterval(_ci);
    initCalc();
  }
}, 100);
