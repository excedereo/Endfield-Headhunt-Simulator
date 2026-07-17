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
  { name: 'Набор «Протокол потока»', amt: 0, price: 2490, dbl: false, img: 'flow_protocol.png', pulls: 10, arsenal: 2000, limit: 1 },
];

// параметры месячного пропуска: 12 ◈ за месяц + 200 оро/день, цена помесячно
const PASS = { price: 449, origPerMonth: 12, oroPerDay: 200, daysPerMonth: 30 };

/* ── ИГРОВОЙ ДЕНЬ ──
   Сутки катятся в 12:00 по Москве (МСК = UTC+3 круглый год, перевода часов нет),
   то есть в 09:00 UTC. До этого момента идёт ещё вчерашний игровой день.
   Считаем через UTC, чтобы часовой пояс машины не влиял на результат. */
const DAY_ROLL_MSK_HOUR = 12;
const MSK_UTC_OFFSET = 3;
const ROLL_UTC_HOUR = DAY_ROLL_MSK_HOUR - MSK_UTC_OFFSET;   // 09:00 UTC

// момент ближайшей смены игрового дня (Date, в реальном времени)
function nextRollAt(from) {
  const now = from || new Date();
  const roll = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), ROLL_UTC_HOUR, 0, 0));
  if (roll <= now) roll.setUTCDate(roll.getUTCDate() + 1);
  return roll;
}
// ключ текущего игрового дня: до 09:00 UTC (12:00 МСК) отдаёт вчерашнюю дату
function todayKey(from) {
  const d = new Date(from || Date.now());
  d.setUTCHours(d.getUTCHours() - ROLL_UTC_HOUR);   // сдвигаем начало суток на момент ролла
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
// сколько целых суток между двумя ключами дат (b − a)
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2]), db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}
// начисляет пропущенные дни (сайт мог быть закрыт несколько суток подряд)
function tickPass() {
  const p = state.pass;
  if (!p.on || !p.lastTick) return;
  const today = todayKey();
  const elapsed = daysBetween(p.lastTick, today);
  if (elapsed <= 0) return;                      // тот же день — ничего не начисляем
  const ticks = Math.min(elapsed, p.daysLeft);   // после истечения дней начисление прекращается
  if (ticks > 0) {
    p.expectedOro += PASS.oroPerDay * ticks;
    p.daysElapsed += ticks;
    p.daysLeft -= ticks;
    // ориджеметрий капает не ежедневно, а разом за каждый отработанный 30-дневный месяц:
    // считаем, сколько полных месяцев набралось всего, и доначисляем недостающие
    const monthsDue = Math.floor(p.daysElapsed / PASS.daysPerMonth);
    if (monthsDue > p.monthsPaid) {
      p.expectedOrig += PASS.origPerMonth * (monthsDue - p.monthsPaid);
      p.monthsPaid = monthsDue;
    }
  }
  p.lastTick = today;
}
// включение пропуска: точка отсчёта — текущий факт обеих валют, в день включения ничего не капает
function activatePass(days) {
  state.pass = {
    on: true,
    daysLeft: Math.max(0, days | 0),
    daysElapsed: 0,           // сколько дней пропуск уже отработал (для месячных начислений)
    monthsPaid: 0,            // сколько 12-ориджевых выплат уже учтено
    lastTick: todayKey(),
    expectedOro: state.oro,   // «якорь»: сегодня ожидаем ровно то, что есть сейчас
    expectedOrig: state.orig,
  };
}
function deactivatePass() {
  state.pass = { on: false, daysLeft: 0, daysElapsed: 0, monthsPaid: 0,
    lastTick: null, expectedOro: 0, expectedOrig: 0 };
}

// состояние
const state = {
  freebies: false,  // «бесплатные пуллы» — вход + талоны АПК, объединено в 1 тумблер
  base: 0,
  orig: 0,
  oro: 0,
  // ── месячный пропуск (живой счётчик реального времени) ──
  // on: активен ли; daysLeft: сколько дней ещё капает; daysElapsed: сколько уже отработал;
  // monthsPaid: сколько месячных выплат (12 ориджи) уже учтено;
  // lastTick: дата последнего начисления (YYYY-MM-DD);
  // expectedOro/expectedOrig: сколько валюты система ожидает увидеть сегодня —
  // факт из inOro/inOrig сверяется с этим, разница = потрачено.
  pass: { on: false, daysLeft: 0, daysElapsed: 0, monthsPaid: 0,
          lastTick: null, expectedOro: 0, expectedOrig: 0 },
  // на каждый пакет: qty (кол-во покупок) и doubled (0/1 — бонус удвоения, даётся 1 раз)
  donates: {},  // index -> { qty, doubled }
};
const FREEBIES_PULLS = 10; // максимум из входа (2+2+1=5) и талонов АПК (5) вместе

/* ── ЦЕНТРАЛИЗОВАННАЯ НАВИГАЦИЯ ── */
// page: 'sim' | 'weapon' | 'calc' | 'simmenu'
function navTo(page) {
  if (!page) return;
  const pages = { sim: 'page-sim', weapon: 'page-weapon', calc: 'page-calc', simmenu: 'page-simmenu' };
  Object.entries(pages).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', key !== page);
  });
  // tabbar: подсвечиваем вкладку, соответствующую текущей странице (simmenu живёт под «Симулятор»)
  const tabForPage = { sim: 'sim', simmenu: 'sim', weapon: 'weapon', calc: 'calc' };
  const activeTab = tabForPage[page] || 'sim';
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === activeTab);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // при показе калькулятора перерисовываем график — пока page-calc был hidden (display:none),
  // histChart имел clientWidth/Height 0, так что viewBox мог быть построен по фолбэк-размеру
  if (page === 'calc' && typeof renderHistory === 'function') renderHistory();
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
      const t = tab.dataset.tab;
      if (t === 'sim') navTo(isMobile() ? 'simmenu' : 'sim');
      else navTo(t); // 'weapon' | 'calc'
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

/* ── ТУМБЛЕР «БЕСПЛАТНЫЕ ПУЛЛЫ» (вход + талоны АПК объединены в один переключатель) ── */
function buildLoginToggles() {
  const host = document.getElementById('loginToggles');
  host.innerHTML = '';
  const t = document.createElement('label');
  t.className = 'toggle';
  t.innerHTML = `
    <input type="checkbox">
    <span class="tg-track"><span class="tg-knob"></span></span>
    <span class="tg-lbl">ПОЛУЧЕНО <b>+${FREEBIES_PULLS}</b></span>`;
  const chk = t.querySelector('input');
  chk.checked = !!state.freebies;
  t.classList.toggle('on', chk.checked);
  chk.addEventListener('change', () => {
    state.freebies = chk.checked;
    t.classList.toggle('on', chk.checked);
    recalc();
  });
  host.appendChild(t);
}

/* ── ДОНАТЫ ── */
// карточка-товар: картинка товара — фон, поверх затемнение и контент.
// счётчик кол-ва + галка удвоения. (Месячный пропуск живёт отдельной плашкой — см. buildPass.)
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
    const img = d.img ? `topup/${d.img}` : 'icons/88px-Origeometry_icon.png';
    // строка «что внутри»
    const amtRow = isPack
      ? `<div class="dc-amt"><span class="dc-base">${d.pulls}</span><span class="dc-cur dc-cur-txt">пуллов</span></div>
         <div class="dc-extra">+ ${d.arsenal.toLocaleString('ru')} билетов арсенала</div>`
      : `<div class="dc-amt"><span class="dc-base">${d.amt}</span><span class="dc-cur">◈</span></div>`;
    const ctrlRow = `<div class="dc-qty-row">
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

/* ── МЕСЯЧНЫЙ ПРОПУСК: отдельная мини-плашка ── */
function buildPass() {
  const chk = document.getElementById('passOn');
  const minus = document.getElementById('passMinus');
  const plus = document.getElementById('passPlus');
  if (!chk) return;

  chk.checked = !!state.pass.on;
  chk.addEventListener('change', () => {
    if (chk.checked) activatePass(state.pass.daysLeft > 0 ? state.pass.daysLeft : PASS.daysPerMonth);
    else deactivatePass();
    recalc();   // recalc сам зовёт renderPass
  });
  const bump = delta => {
    const p = state.pass;
    p.daysLeft = Math.max(0, Math.min(365, p.daysLeft + delta));
    recalc();
  };
  minus.addEventListener('click', () => bump(-1));
  plus.addEventListener('click', () => bump(1));
}

// перерисовка плашки пропуска: дни, ожидаемый ороберил, вывод о тратах
function renderPass() {
  const p = state.pass;
  const box = document.getElementById('passBlock');
  if (!box) return;
  box.classList.toggle('active', p.on);
  document.getElementById('passOn').checked = p.on;
  document.getElementById('passDays').textContent = p.daysLeft;
  const tg = document.getElementById('passToggle');
  if (tg) tg.classList.toggle('on', p.on);

  // шапка: сколько пропуск уже накапал за время работы (справочно, в итог не идёт)
  const out = document.getElementById('outPass');
  if (out) {
    if (!p.on) out.innerHTML = '— <span>выкл</span>';
    else out.innerHTML = `${p.daysElapsed} <span>дн. в работе</span>`;
  }

  const note = document.getElementById('passNote');
  if (!p.on) { note.textContent = '// выключен'; note.className = 'pass-note'; return; }

  // сверка по обеим валютам: ожидаемое против факта в полях
  const dOro = p.expectedOro - state.oro;
  const dOrig = p.expectedOrig - state.orig;
  const bits = [];
  if (dOro > 0) bits.push(`потрачено ${dOro.toLocaleString('ru')} оро`);
  else if (dOro < 0) bits.push(`+${(-dOro).toLocaleString('ru')} оро сверх`);
  if (dOrig > 0) bits.push(`потрачено ${dOrig.toLocaleString('ru')} ориджи`);
  else if (dOrig < 0) bits.push(`+${(-dOrig).toLocaleString('ru')} ориджи сверх`);

  const expired = p.daysLeft === 0;
  const tail = expired ? ' · истёк' : '';
  if (bits.length === 0) {
    note.textContent = `// сходится: ждём ${p.expectedOro.toLocaleString('ru')} оро · ${p.expectedOrig.toLocaleString('ru')} ориджи${tail}`;
    note.className = expired ? 'pass-note pass-exp' : 'pass-note pass-ok';
  } else {
    note.textContent = `// ${bits.join(' · ')}${tail}`;
    note.className = (dOro > 0 || dOrig > 0) ? 'pass-note pass-spent' : 'pass-note pass-gain';
  }
}

/* ── ИТОГОВЫЙ РАСЧЁТ ── */
function recalc() {
  // «бесплатные пуллы» — вход + талоны АПК, объединено в 1 тумблер
  const freebiesPulls = state.freebies ? FREEBIES_PULLS : 0;
  const basePulls = Math.floor(state.base / RATES.BASE_TICKET_PER_PULL);

  // ороберил из ориджеметрия + донатов + имеющегося
  let origTotal = state.orig;
  let donateAmt = 0;     // ориджеметрия из донатов
  let donatePulls = 0;   // готовые пуллы из пакетов (Протокол потока)
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

  // Месячный пропуск в итог не добавляет НИЧЕГО: и ороберил, и ориджеметрий уже сидят в полях,
  // куда игрок вбивает факт с экрана игры. Пропуск только ждёт прироста и считает траты.
  // В расчёт от него идут лишь потраченные рубли — по числу купленных месяцев.
  if (state.pass.on) {
    const monthsBought = Math.max(1, Math.ceil((state.pass.daysElapsed + state.pass.daysLeft) / PASS.daysPerMonth));
    moneySpent += PASS.price * monthsBought;
  }

  origTotal += donateAmt;

  const oroFromOrig = origTotal * RATES.ORIG_TO_OROBERYL;
  const oroTotal = oroFromOrig + state.oro;
  const oroPulls = Math.floor(oroTotal / RATES.OROBERYL_PER_PULL);

  const totalPulls = freebiesPulls + basePulls + oroPulls + donatePulls;

  // пуллы «от доната» = итог минус то, что вышло бы вообще без покупок.
  // Считаем именно так (а не суммой донатных пуллов), потому что ороберил округляется вниз
  // при переводе в пуллы: донат может «дотолкать» остаток до лишнего пулла.
  const oroFree = state.orig * RATES.ORIG_TO_OROBERYL + state.oro;
  const pullsFree = freebiesPulls + basePulls + Math.floor(oroFree / RATES.OROBERYL_PER_PULL);
  const donatedPulls = totalPulls - pullsFree;

  // сохраняем итог пуллов, чтобы симулятор мог его подставить кнопкой «Мои пуллы»
  // (в симулятор идёт полный итог — с донатом; отдельно храним «свои» для графика)
  try {
    localStorage.setItem('endfield_my_pulls', String(totalPulls));
    localStorage.setItem('endfield_my_pulls_free', String(pullsFree));
    localStorage.setItem('endfield_my_oro', String(Math.round(oroTotal)));
    localStorage.setItem('endfield_my_orig', String(Math.round(origTotal)));
  } catch (e) {}
  const mc = document.getElementById('mineCount');
  if (mc) mc.textContent = totalPulls.toLocaleString('ru');

  // обновляем выводы блоков
  setOut('outLogin', freebiesPulls, 'пуллов');
  setOut('outBase', basePulls, 'пуллов');
  // объединённый блок ороберил+ориджеметрий: пуллы от обоих (без донатов)
  const ownOro = state.oro + state.orig * RATES.ORIG_TO_OROBERYL;
  setOut('outOro', Math.floor(ownOro / RATES.OROBERYL_PER_PULL), 'пуллов');
  document.getElementById('outOrig').textContent =
    '= ' + (state.orig * RATES.ORIG_TO_OROBERYL).toLocaleString('ru') + ' ороберила';

  animateTo('totalOro', oroTotal);
  // оранжевый итог — свои крутки (без покупок); зелёный ниже — сколько станет вместе с донатом
  animateTo('totalPulls', pullsFree);

  const dpRow = document.getElementById('ctDonated');
  if (dpRow) {
    dpRow.classList.toggle('open', donatedPulls > 0);
    if (donatedPulls > 0) {
      document.getElementById('ctDonatedVal').textContent = '+' + totalPulls.toLocaleString('ru');
      document.getElementById('ctDonatedFree').textContent = `из них ${donatedPulls.toLocaleString('ru')} за донат`;
    }
  }

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
    ['Бесплатные пуллы', freebiesPulls],
    ['Базовые талоны', basePulls],
    ['Ороберил (всё)', oroPulls],
    ['Пакеты (пуллы)', donatePulls],
  ].filter(p => p[1] > 0);
  bd.innerHTML = parts.map(p => `<span class="bd-item">${p[0]} <b>+${p[1]}</b></span>`).join('')
    || '<span class="bd-item bd-empty">// добавь ресурсы выше</span>';
  // источники ороберила — расшифровка «всего ороберила», чтобы было видно, откуда взялись сотни
  const oroSrc = document.getElementById('oroSources');
  if (oroSrc) {
    const src = [];
    if (state.oro > 0) src.push(['свой', state.oro]);
    if (state.orig > 0) src.push([`ориджи ×${RATES.ORIG_TO_OROBERYL}`, state.orig * RATES.ORIG_TO_OROBERYL]);
    if (donateAmt > 0) src.push([`донат (${donateAmt} ориджи)`, donateAmt * RATES.ORIG_TO_OROBERYL]);
    oroSrc.innerHTML = src.length > 1
      ? src.map(s => `<span class="bd-item">${s[0]} <b>${s[1].toLocaleString('ru')}</b></span>`).join('')
      : '';
  }

  renderPass();   // сверка «ожидалось / факт» живая: поле ороберила меняется → пересчитываем траты
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
    // обратная совместимость: раньше было 3 тумблера входа (login[]) + отдельный слайдер АПК (apc) —
    // если у пользователя сохранён старый формат, переносим в новый единый тумблер freebies
    if (typeof s.freebies === 'boolean') {
      state.freebies = s.freebies;
    } else if (Array.isArray(s.login) || typeof s.apc === 'number') {
      const oldLoginPulls = Array.isArray(s.login) ? s.login.reduce((sum, on, i) => sum + (on ? [2,2,1][i] : 0), 0) : 0;
      const oldApcPulls = typeof s.apc === 'number' ? s.apc : 0;
      state.freebies = (oldLoginPulls + oldApcPulls) >= FREEBIES_PULLS;
    }
    ['base', 'orig', 'oro'].forEach(k => { if (typeof s[k] === 'number') state[k] = s[k]; });
    // пропуск: новый формат — объект с живым счётчиком. Старое поле passDays (просто «куплю N дней»)
    // в новую модель не переносится: там не было точки отсчёта, сверять не с чем.
    if (s.pass && typeof s.pass === 'object') {
      state.pass = {
        on: !!s.pass.on,
        daysLeft: Number(s.pass.daysLeft) || 0,
        daysElapsed: Number(s.pass.daysElapsed) || 0,
        monthsPaid: Number(s.pass.monthsPaid) || 0,
        lastTick: s.pass.lastTick || null,
        expectedOro: Number(s.pass.expectedOro) || 0,
        expectedOrig: Number(s.pass.expectedOrig) || 0,
      };
    }
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
  const withDonate = parseInt(localStorage.getItem('endfield_my_pulls') || '0', 10) || 0;
  const totalPulls = parseInt(localStorage.getItem('endfield_my_pulls_free') || '0', 10) || 0;
  const oro = parseInt(localStorage.getItem('endfield_my_oro') || '0', 10) || 0;
  const orig = parseInt(localStorage.getItem('endfield_my_orig') || '0', 10) || 0;
  const dateKey = todayKey();   // игровой день (сутки катятся в 12:00 МСК), не календарный

  const history = loadHistory();
  const idx = history.findIndex(h => h.date === dateKey);
  // pulls — свои крутки (основная линия графика), pullsDon — итог вместе с донатом (верхняя линия),
  // pass — был ли в этот день активен месячный пропуск
  const entry = { date: dateKey, pulls: totalPulls, pullsDon: withDonate, oro, orig,
                  base: state.base, pass: !!state.pass.on };
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  history.sort((a, b) => a.date.localeCompare(b.date));
  // храним снапшоты за последние ~2 года (по дням, не по числу точек — график теперь месячный)
  const cutoffKey = todayKey(Date.now() - 730 * 86400000);
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
// выбранный день месяца (число 1..31) — под графиком открыт его редактор; null = редактор закрыт
let histSelected = null;

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
  // текст-заглушка только когда снапшотов не сохранено вообще ни одного (не только в этом месяце) —
  // для пустых месяцев с непустой историей показываем просто сетку без точек
  if (empty) empty.style.display = history.length === 0 ? '' : 'none';

  // viewBox = реальный размер контейнера в CSS-пикселях, чтобы stroke-width/радиусы/текст не масштабировались.
  // .hist-chart имеет фиксированную высоту в CSS и не зависит от содержимого, поэтому clientWidth/Height
  // всегда актуальны здесь, даже для пустых месяцев (без единого сохранённого снапшота).
  const W = Math.max(320, chart.clientWidth), H = Math.max(160, chart.clientHeight), padX = 24, padTop = 20, padBottom = 36;
  const stepX = nDays > 1 ? (W - padX * 2) / (nDays - 1) : 0;
  const xAt = day => padX + (day - 1) * stepX;

  // сетка (горизонтальные + вертикальные линии) рисуется всегда — даже для пустого месяца,
  // просто без точек/подписей значений
  let grid = '';
  const GRID_ROWS = 4;
  for (let i = 0; i <= GRID_ROWS; i++) {
    const y = padTop + (i / GRID_ROWS) * (H - padTop - padBottom);
    grid += `<line class="hist-grid-line" x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}"></line>`;
  }
  monthPoints.forEach(p => {
    p.x = xAt(p.day);
    grid += `<line class="hist-grid-line" x1="${p.x}" y1="${padTop}" x2="${p.x}" y2="${H - padBottom}"></line>`;
  });

  let segs = '', dots = '', labels = '';

  // подписи дат рисуем всегда — даже для пустого месяца, чтобы было куда целиться кликом
  const labelStep = Math.max(1, Math.ceil(nDays / 10));
  monthPoints.forEach((p, i) => {
    const showLabel = i === 0 || i === nDays - 1 || p.day % labelStep === 0;
    if (showLabel) labels += `<text class="hist-label" x="${p.x}" y="${H - 14}" text-anchor="${i === 0 ? 'start' : i === nDays - 1 ? 'end' : 'middle'}">${p.day}</text>`;
  });

  if (known.length > 0) {
    // ось Y растягивается ровно между фактическими min и max месяца: нижняя точка ложится на низ
    // графика, верхняя — на верх, поэтому наклон отражает реальный разброс, а не расстояние до нуля.
    // Единственная точка (или все значения равны) — рисуется по низу.
    // В масштаб входят и донатные значения — иначе верхняя линия вылезала бы за поле.
    const donOf = h => (typeof h.pullsDon === 'number' ? h.pullsDon : h.pulls);
    const hasDon = known.some(p => donOf(p.h) > p.h.pulls);
    const vals = known.map(p => p.h.pulls).concat(known.map(p => donOf(p.h)));
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const span = max - min;
    const yAt = span === 0
      ? () => H - padBottom
      : v => H - padBottom - ((v - min) / span) * (H - padTop - padBottom);

    // Пустые дни не рвут линию: им даётся интерполированное значение между соседними известными
    // днями (а за краями — значение ближайшего известного). Точка при этом остаётся «полой»,
    // чтобы визуально отличать реальные снапшоты от достроенных.
    const interp = (day, field) => {
      let before = null, after = null;
      for (const k of known) {
        if (k.day <= day) before = k;
        if (k.day >= day && !after) after = k;
      }
      const vOf = k => (field === 'don' ? donOf(k.h) : k.h.pulls);
      if (before && after && before.day !== after.day) {
        const t = (day - before.day) / (after.day - before.day);
        return vOf(before) + (vOf(after) - vOf(before)) * t;
      }
      return vOf(before || after);
    };

    monthPoints.forEach(p => {
      if (p.h) {
        p.val = p.h.pulls; p.valDon = donOf(p.h);
      } else {
        p.val = interp(p.day, 'pulls'); p.valDon = interp(p.day, 'don');
      }
      p.y = yAt(p.val); p.yDon = yAt(p.valDon);
    });

    // сегменты — сплошная линия по всем дням месяца, цвет по приросту относительно предыдущего дня
    for (let i = 1; i < monthPoints.length; i++) {
      const a = monthPoints[i - 1], b = monthPoints[i];
      if (hasDon) {
        segs += `<line class="hist-seg hist-seg-don" x1="${a.x}" y1="${a.yDon}" x2="${b.x}" y2="${b.yDon}"></line>`;
      }
      const diff = b.val - a.val;
      const cls = diff > 0 ? 'hist-seg-up' : diff < 0 ? 'hist-seg-down' : 'hist-seg-flat';
      segs += `<line class="hist-seg ${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
    }

    // точки на КАЖДЫЙ день: заполненные — реальные снапшоты, полые — достроенные (значений нет)
    monthPoints.forEach((p, i) => {
      const prevKnown = known.filter(k => k.day < p.day).pop();
      const cls = p.h ? 'hist-dot' : 'hist-dot hist-dot-empty';
      const sel = (histSelected === p.day) ? ' hist-dot-sel' : '';
      const tip = p.h ? histTipHtml(p.h, prevKnown ? prevKnown.h : null)
                      : `<div class="ht-date">${String(p.day).padStart(2,'0')}.${String(histCursor.month+1).padStart(2,'0')}</div><div class="ht-row">нет данных — нажми, чтобы задать</div>`;
      dots += `<circle class="${cls}${sel}" cx="${p.x}" cy="${p.y}" r="${p.h ? 4 : 3}" data-day="${p.day}" data-tip='${tip.replace(/'/g, '&#39;')}'></circle>`;
    });
  } else {
    // месяц вообще без снапшотов — точки по низу, чтобы можно было ткнуть и задать день
    monthPoints.forEach(p => {
      p.y = H - padBottom;
      const sel = (histSelected === p.day) ? ' hist-dot-sel' : '';
      dots += `<circle class="hist-dot hist-dot-empty${sel}" cx="${p.x}" cy="${p.y}" r="3" data-day="${p.day}" data-tip='нет данных'></circle>`;
    });
  }

  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="hist-svg">${grid}${segs}${dots}${labels}</svg>`;
  attachHistEdit(chart);

  attachHistTip(chart);
}

/* ── РЕДАКТОР ДНЯ ──
   Клик по точке графика открывает под ним панель с ресурсами этого дня.
   Правятся именно ресурсы (ороберил / ориджеметрий / базовые талоны / донатные пуллы),
   а пуллы пересчитываются по тем же курсам, что и в основном калькуляторе. */
function attachHistEdit(chart) {
  chart.querySelectorAll('circle[data-day]').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      const day = +c.dataset.day;
      histSelected = (histSelected === day) ? null : day;   // повторный клик закрывает
      renderHistory();
      renderHistEditor();
    });
  });
}

// пуллы дня по его ресурсам — та же формула, что в recalc()
function pullsOfEntry(e) {
  const oroTotal = (e.oro || 0) + (e.orig || 0) * RATES.ORIG_TO_OROBERYL;
  return Math.floor(oroTotal / RATES.OROBERYL_PER_PULL)
       + Math.floor((e.base || 0) / RATES.BASE_TICKET_PER_PULL);
}

function renderHistEditor() {
  const box = document.getElementById('histEdit');
  if (!box) return;
  if (histSelected == null) { box.classList.remove('open'); box.innerHTML = ''; return; }

  const key = dateKeyOf(histCursor.year, histCursor.month, histSelected);
  const history = loadHistory();
  const e = history.find(h => h.date === key) || null;
  const v = f => (e && e[f] != null ? e[f] : 0);
  const donPulls = e ? Math.max(0, (e.pullsDon != null ? e.pullsDon : e.pulls) - e.pulls) : 0;

  box.classList.add('open');
  box.innerHTML = `
    <div class="he-head">
      <div class="he-date">// ${String(histSelected).padStart(2,'0')} ${MONTH_NAMES[histCursor.month]} ${histCursor.year}</div>
      <div class="he-actions">
        ${e ? '<button class="he-del" id="heDel">Удалить день</button>' : ''}
        <button class="he-close" id="heClose">✕</button>
      </div>
    </div>
    <div class="he-grid">
      <div class="he-f"><label><img src="icons/88px-Oroberyl_icon.png" class="df-ic">ОРОБЕРИЛ</label>
        <input type="number" id="heOro" min="0" value="${v('oro')}" class="calc-num wide"></div>
      <div class="he-f"><label><img src="icons/88px-Origeometry_icon.png" class="df-ic">ОРИДЖЕМЕТРИЙ</label>
        <input type="number" id="heOrig" min="0" value="${v('orig')}" class="calc-num wide"></div>
      <div class="he-f"><label><img src="icons/88px-Bond_Quota_icon.png" class="df-ic">БАЗОВЫЕ ТАЛОНЫ</label>
        <input type="number" id="heBase" min="0" value="${v('base')}" class="calc-num wide"></div>
      <div class="he-f"><label>ПУЛЛОВ ЗА ДОНАТ</label>
        <input type="number" id="heDon" min="0" value="${donPulls}" class="calc-num wide"></div>
    </div>
    <div class="he-foot">
      <label class="toggle he-pass${e && e.pass ? ' on' : ''}" id="hePassTg">
        <input type="checkbox" id="hePass" ${e && e.pass ? 'checked' : ''}>
        <span class="tg-box"></span><span class="tg-lbl">ПРОПУСК АКТИВЕН</span>
      </label>
      <div class="he-out">= <b id="hePulls">0</b> пуллов<span id="heDonOut"></span></div>
      <button class="he-save" id="heSave">СОХРАНИТЬ ДЕНЬ</button>
    </div>`;

  const read = () => ({
    oro: Math.max(0, parseInt(document.getElementById('heOro').value, 10) || 0),
    orig: Math.max(0, parseInt(document.getElementById('heOrig').value, 10) || 0),
    base: Math.max(0, parseInt(document.getElementById('heBase').value, 10) || 0),
    don: Math.max(0, parseInt(document.getElementById('heDon').value, 10) || 0),
    pass: document.getElementById('hePass').checked,
  });
  // живой пересчёт пуллов при вводе
  const preview = () => {
    const r = read();
    const pulls = pullsOfEntry(r);
    document.getElementById('hePulls').textContent = pulls.toLocaleString('ru');
    document.getElementById('heDonOut').textContent = r.don > 0 ? ` · ${(pulls + r.don).toLocaleString('ru')} с донатом` : '';
    document.getElementById('hePassTg').classList.toggle('on', r.pass);
  };
  ['heOro','heOrig','heBase','heDon','hePass'].forEach(id =>
    document.getElementById(id).addEventListener('input', preview));
  document.getElementById('hePass').addEventListener('change', preview);
  preview();

  document.getElementById('heSave').addEventListener('click', () => {
    const r = read();
    const pulls = pullsOfEntry(r);
    const hist = loadHistory();
    const entry = { date: key, pulls, pullsDon: pulls + r.don,
                    oro: r.oro, orig: r.orig, base: r.base, pass: r.pass };
    const i = hist.findIndex(h => h.date === key);
    if (i >= 0) hist[i] = entry; else hist.push(entry);
    hist.sort((a, b) => a.date.localeCompare(b.date));
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch (err) {}
    renderHistory(); renderHistEditor();
  });

  const del = document.getElementById('heDel');
  if (del) del.addEventListener('click', () => {
    const hist = loadHistory().filter(h => h.date !== key);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch (err) {}
    histSelected = null;
    renderHistory(); renderHistEditor();
  });

  document.getElementById('heClose').addEventListener('click', () => {
    histSelected = null;
    renderHistory(); renderHistEditor();
  });
}

function shiftHistMonth(delta) {
  if (!histCursor) histCursor = latestHistMonth(loadHistory());
  let { year, month } = histCursor;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  histCursor = { year, month };
  histSelected = null;      // при смене месяца редактор закрываем
  renderHistory();
  renderHistEditor();
}

function initHistNav() {
  const prevBtn = document.getElementById('histPrev');
  const nextBtn = document.getElementById('histNext');
  if (prevBtn) prevBtn.addEventListener('click', () => shiftHistMonth(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => shiftHistMonth(1));
  // viewBox завязан на реальные пиксели контейнера — при первом рендере (сразу после снятия
  // прелоадера) clientWidth может быть ещё 0, поэтому перерисовываем следующим тиком.
  // setTimeout вместо requestAnimationFrame — rAF не гарантированно тикает в фоновых/неактивных вкладках.
  setTimeout(renderHistory, 0);
  // перерисовываем и при ресайзе окна (debounce, без ResizeObserver — он зацикливался
  // с перезаписью innerHTML на некоторых движках)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderHistory, 200);
  });
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
  const don = typeof h.pullsDon === 'number' ? h.pullsDon : h.pulls;
  const prevDon = prev ? (typeof prev.pullsDon === 'number' ? prev.pullsDon : prev.pulls) : null;
  const rows = histTipLine('Пуллы', h.pulls, prev ? prev.pulls : null)
    + (don > h.pulls ? histTipLine('С донатом', don, prevDon) : '')
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
  tickPass();               // догоняем пропущенные дни пропуска (сайт мог быть закрыт)
  loadLastSaved();          // снапшот последнего явного сохранения (для индикатора dirty)
  initSaveButton();
  initHistNav();
  renderHistory();
  initPages();
  buildLoginToggles();      // тумблер «бесплатные пуллы», читает state.freebies
  buildDonates();           // читают state.donates
  buildPass();              // мини-плашка месячного пропуска
  initDonateToggle();       // секция донатов свёрнута по умолчанию
  initDayTimer();           // обратный отсчёт до смены игрового дня (12:00 МСК)
  // числовые поля — выставляем сохранённые значения
  bindNumber('inBase', 'base');
  bindNumber('inOrig', 'orig');
  bindNumber('inOro', 'oro');
  document.getElementById('inBase').value = state.base || 0;
  document.getElementById('inOrig').value = state.orig || 0;
  document.getElementById('inOro').value = state.oro || 0;
  recalc();
}

/* ── ТАЙМЕР ДО СМЕНЫ ИГРОВОГО ДНЯ ──
   Игровые сутки катятся в 12:00 МСК (см. todayKey/nextRollAt выше). Показываем обратный
   отсчёт до этого момента; когда он истекает — догоняем пропуск и перерисовываем график,
   т.к. «сегодня» для tickPass() и снапшотов только что сдвинулось на новый день. */
function initDayTimer() {
  const val = document.getElementById('dayTimerVal');
  if (!val) return;
  const tick = () => {
    const ms = nextRollAt() - Date.now();
    if (ms <= 0) {
      tickPass();
      renderHistory();
      recalc();
      return; // следующий interval-тик пересчитает уже от нового дня
    }
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    val.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ждём пока появится #app (прелоадер уберёт hidden)
const _ci = setInterval(() => {
  if (!document.getElementById('app').classList.contains('hidden')) {
    clearInterval(_ci);
    initCalc();
  }
}, 100);
