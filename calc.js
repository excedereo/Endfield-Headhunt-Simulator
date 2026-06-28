/* ENDFIELD // Калькулятор ресурсов → пуллов */

const RATES = {
  OROBERYL_PER_PULL: 500,
  ORIG_TO_OROBERYL: 75,
  BASE_TICKET_PER_PULL: 25,
};

// пакеты доната: name, amt (ориджеметрия), price (€ число), dbl (есть ли удвоение)
const DONATES = [
  { name: 'Особая скидка', amt: 12, price: 1.99, dbl: false },
  { name: 'Комплект', amt: 21, price: 8.99, dbl: true },
  { name: 'Горка', amt: 34, price: 12.99, dbl: true },
  { name: 'Мешок', amt: 57, price: 20.99, dbl: true },
  { name: 'Коробка', amt: 92, price: 33.99, dbl: true },
  { name: 'Ящик', amt: 194, price: 69.99, dbl: true },
];

// состояние
const state = {
  login: [false, false, false],   // три дня
  apc: 0,
  base: 0,
  orig: 0,
  oro: 0,
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
// один счётчик количества + галка удвоения.
// удвоение (если включено и кол-во≥1) даёт +amt РОВНО ОДИН РАЗ. при кол-ве 0 удвоение снимается.
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
    const doubledRow = d.dbl ? `
      <label class="dc-dbl">
        <input type="checkbox" data-kind="doubled">
        <span class="dcb-box"></span>
        <span class="dc-dbl-text">Удвоение первой покупки <b>+${d.amt} ◈</b></span>
      </label>` : '';
    card.innerHTML = `
      <div class="dc-tag">${d.dbl ? 'УДВОЕНИЕ ДОСТУПНО' : 'ОСОБАЯ СКИДКА'}</div>
      <div class="dc-img"><img src="icons/Origeometry.png"></div>
      <div class="dc-name">${d.name}</div>
      <div class="dc-amt"><span class="dc-base">${d.amt}</span><span class="dc-cur">◈</span></div>
      <div class="dc-price">€${d.price.toFixed(2)}</div>
      <div class="dc-qty-row">
        <span class="dc-qty-lbl">Количество</span>
        <div class="dc-qty">
          <button class="dq-btn" data-d="-">−</button>
          <span class="dq-val">0</span>
          <button class="dq-btn" data-d="+">+</button>
        </div>
      </div>
      ${doubledRow}`;
    if (!d.dbl) card.classList.add('special');

    const dblRow = card.querySelector('.dc-dbl');
    const dchk = card.querySelector('input[data-kind="doubled"]');

    const refresh = () => {
      const st = state.donates[i];
      card.classList.toggle('active', st.qty > 0 || st.doubled > 0);
      card.querySelector('.dq-val').textContent = st.qty;
      if (dblRow) {
        // удвоение доступно только при кол-ве ≥1
        const avail = st.qty >= 1;
        dblRow.classList.toggle('disabled', !avail);
        dchk.disabled = !avail;
        dblRow.classList.toggle('on', st.doubled > 0);
      }
    };

    // количество +/-
    card.querySelectorAll('.dq-btn').forEach(b => {
      b.addEventListener('click', () => {
        const st = state.donates[i];
        st.qty = Math.max(0, st.qty + (b.dataset.d === '+' ? 1 : -1));
        // при нуле — удвоение снимается
        if (st.qty === 0 && dchk) { st.doubled = 0; dchk.checked = false; }
        refresh(); recalc();
      });
    });
    // удвоение — галка
    if (dchk) dchk.addEventListener('change', () => {
      if (state.donates[i].qty < 1) { dchk.checked = false; return; }
      state.donates[i].doubled = dchk.checked ? 1 : 0;
      refresh(); recalc();
    });

    // восстановление визуала
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
  let donateAmt = 0;   // ориджеметрия из донатов
  let moneySpent = 0;  // € потрачено
  DONATES.forEach((d, i) => {
    const st = state.donates[i] || { qty: 0, doubled: 0 };
    if (st.qty > 0) {
      donateAmt += d.amt * st.qty;       // базовое за все купленные
      moneySpent += d.price * st.qty;
      if (st.doubled) donateAmt += d.amt; // бонус удвоения — РОВНО ОДИН РАЗ
    }
  });
  origTotal += donateAmt;

  const oroFromOrig = origTotal * RATES.ORIG_TO_OROBERYL;
  const oroTotal = oroFromOrig + state.oro;
  const oroPulls = Math.floor(oroTotal / RATES.OROBERYL_PER_PULL);

  const totalPulls = loginPulls + apcPulls + basePulls + oroPulls;

  // сохраняем итог пуллов, чтобы симулятор мог его подставить кнопкой «Мои пуллы»
  try { localStorage.setItem('endfield_my_pulls', String(totalPulls)); } catch (e) {}
  const mc = document.getElementById('mineCount');
  if (mc) mc.textContent = totalPulls.toLocaleString('ru');

  // обновляем выводы блоков
  setOut('outLogin', loginPulls, 'пуллов');
  setOut('outApc', apcPulls, 'пуллов');
  setOut('outBase', basePulls, 'пуллов');
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
    document.getElementById('checkoutVal').textContent = '€' + moneySpent.toFixed(2);
    const pp = totalPulls > 0 ? (moneySpent / totalPulls) : 0;
    document.getElementById('checkoutPer').textContent = pp > 0 ? '≈ €' + pp.toFixed(2) + ' / пулл' : '';
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
    ['apc', 'base', 'orig', 'oro'].forEach(k => { if (typeof s[k] === 'number') state[k] = s[k]; });
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
  document.querySelectorAll('#page-calc .slider').forEach(buildSlider); // слайдер АПК читает state.apc
  // числовые поля — выставляем сохранённые значения
  bindNumber('inBase', 'base');
  bindNumber('inOrig', 'orig');
  bindNumber('inOro', 'oro');
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
