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
  try { localStorage.setItem('endfield_my_pulls', String(totalPulls)); } catch (e) {}
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
const SAVE_KEY = 'endfield_calc_v1';
function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
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
