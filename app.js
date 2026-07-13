/* ENDFIELD // UI controller */

// ── кастомные дропдауны (пишут значение в скрытый input[data-for]) ──
function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    if (dd.dataset.init) return;
    dd.dataset.init = '1';
    const hidden = document.getElementById(dd.dataset.for);
    const trigger = dd.querySelector('.dd-trigger');
    const label = dd.querySelector('.dd-label');
    const opts = dd.querySelectorAll('.dd-opt');

    const markSel = () => opts.forEach(o => o.classList.toggle('sel', o.dataset.value === hidden.value));
    markSel();

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = dd.classList.contains('open');
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
      if (!wasOpen) dd.classList.add('open');
    });

    opts.forEach(o => o.addEventListener('click', () => {
      hidden.value = o.dataset.value;
      label.textContent = o.textContent;
      markSel();
      dd.classList.remove('open');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  });
}

// ── улучшение числовых полей: стрелки, плейсхолдер-лимиты, клампинг ──
function enhanceNumberInputs() {
  document.querySelectorAll('input[type=number]').forEach(inp => {
    if (inp.dataset.enhanced) return;
    inp.dataset.enhanced = '1';

    const min = inp.hasAttribute('min') ? parseFloat(inp.min) : -Infinity;
    const max = inp.hasAttribute('max') ? parseFloat(inp.max) : Infinity;
    const step = inp.step && inp.step !== 'any' ? parseFloat(inp.step) : 1;

    // плейсхолдер с лимитами, если не задан
    if (!inp.placeholder) {
      if (max !== Infinity && min !== -Infinity) inp.placeholder = `${min}–${max}`;
      else if (min !== -Infinity) inp.placeholder = `от ${min}`;
      else if (max !== Infinity) inp.placeholder = `до ${max}`;
    }

    // оборачиваем и добавляем стрелки
    const wrap = document.createElement('div');
    wrap.className = 'num-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const steppers = document.createElement('div');
    steppers.className = 'num-steppers';
    steppers.innerHTML = `<button type="button" class="num-step" data-dir="up">▲</button>
      <button type="button" class="num-step" data-dir="down">▼</button>`;
    wrap.appendChild(steppers);

    const clamp = v => Math.max(min, Math.min(max, v));
    const fireInput = () => inp.dispatchEvent(new Event('input', { bubbles: true }));

    steppers.querySelectorAll('.num-step').forEach(btn => {
      btn.addEventListener('click', () => {
        let v = parseFloat(inp.value);
        if (isNaN(v)) v = (btn.dataset.dir === 'up') ? min === -Infinity ? 0 : min : min === -Infinity ? 0 : min;
        else v = clamp(v + (btn.dataset.dir === 'up' ? step : -step));
        inp.value = v;
        fireInput();
      });
    });

    // клампинг: на blur/change приводим в границы (-1 → min, огромное → max)
    const fix = () => {
      if (inp.value === '') return;
      let v = parseFloat(inp.value);
      if (isNaN(v)) { inp.value = min === -Infinity ? 0 : min; fireInput(); return; }
      const c = clamp(v);
      if (c !== v) { inp.value = c; fireInput(); }
    };
    inp.addEventListener('blur', fix);
    inp.addEventListener('change', fix);
    // верхний предел ловим сразу при вводе (чтобы 999999999 не висело), нижний — на blur (даёт печатать)
    inp.addEventListener('input', () => {
      if (inp.value === '' || inp.value === '-') return;
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v > max) { inp.value = max; }
    });
  });
}

// ── ПРЕЛОАДЕР ──
(function preloader() {
  const num = document.getElementById('plNum');
  const pre = document.getElementById('preloader');
  const app = document.getElementById('app');
  const accent = pre.querySelector('.pl-accent');
  const progress = pre.querySelector('.pl-progress');

  // топографическая карта на фоне (генерится в canvas, без ассетов)
  const map = document.getElementById('plMap');
  try {
    drawTopoMap(map, { scale: 0.065 / 3 }); // карта крупнее в 3 раза
    requestAnimationFrame(() => map.classList.add('show')); // плавное проявление
  } catch (e) {}

  // прогрузка декоративная (сайт — статика, реальной загрузки нет),
  // поэтому делаем плавную кривую по времени: медленно → быстрее → плавно к концу
  let finished = false;
  const TEXT_MAX = 88;    // блок с числом не уезжает ниже этого % (чтобы не обрезался)
  const DURATION = 2600;  // мс на всю прогрузку
  let startTime = null;

  // easing с переменной скоростью без рывков: ease-in-out + лёгкая «дышащая» добавка
  function easeProgress(t) {
    // основная плавная S-кривая
    const s = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // мягкая синусоида сверху — лёгкое «то быстрее, то медленнее», но непрерывно
    const breathe = Math.sin(t * Math.PI * 3) * 0.018 * (1 - t);
    return Math.max(0, Math.min(1, s + breathe));
  }

  function render(now) {
    if (startTime === null) startTime = now;
    const t = Math.min(1, (now - startTime) / DURATION);
    const v = easeProgress(t) * 100;

    num.textContent = Math.round(v);
    accent.style.height = v + '%';                          // полоска сверху вниз по проценту
    progress.style.top = Math.min(v, TEXT_MAX) + '%';       // текст следует за концом полоски

    if (t >= 1 && !finished) {
      finished = true;
      num.textContent = '100';
      accent.style.height = '100%';
      progress.style.top = TEXT_MAX + '%';
      finishSequence();
      return;
    }
    requestAnimationFrame(render);
  }

  // финал: линия закрывает экран → ТОЛЬКО ТОГДА рендерим интерфейс → фейд линии
  const WIPE_MS = 550; // должно совпадать с transition .pl-accent.wipe
  function finishSequence() {
    const wipeStart = 260;
    // 1) прячем контент прелоадера, запускаем свайп жёлтой линии слева направо
    setTimeout(() => {
      pre.classList.add('swiping');
      requestAnimationFrame(() => accent.classList.add('wipe'));
    }, wipeStart);

    // 2) КОГДА линия полностью закрыла экран — рендерим основную страницу (под линией, её не видно)
    setTimeout(() => {
      app.classList.remove('hidden');
      requestAnimationFrame(() => app.classList.add('enter'));
    }, wipeStart + WIPE_MS);

    // 3) даём кадр на отрисовку, затем фейдим весь оверлей (линию + тёмный фон) → виден интерфейс
    setTimeout(() => {
      accent.classList.add('wipe-out');
      pre.classList.add('fade');
    }, wipeStart + WIPE_MS + 120);

    // 4) убираем оверлей прелоадера
    setTimeout(() => pre.remove(), wipeStart + WIPE_MS + 120 + 600);
  }

  requestAnimationFrame(render);
})();

// ── анимация счёта числа ──
function animateNumber(el, to, opts = {}) {
  const { dur = 900, decimals = 0, suffix = '', prefix = '' } = opts;
  const start = performance.now();
  const from = 0;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const v = from + (to - from) * easeOut(t);
    el.textContent = prefix + v.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = prefix + to.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(frame);
}

// ── анимация полоски (распределение / бар) ──
function animateBar(fillEl, pct, delay = 0) {
  fillEl.style.width = '0%';
  setTimeout(() => { fillEl.style.width = pct + '%'; }, delay);
}

// ── переключение режимов ──
let MODE = 'detailed';
const titles = {
  detailed: 'ОДИН ПРОГОН НАЙМА',
  monte: 'МОНТЕ-КАРЛО',
  reverse: 'СКОЛЬКО ДО ЦЕЛИ',
  prizes: 'ПОДСЧЁТ ПРИЗОВ',
};
const descs = {
  detailed: 'Симулирует <b>один заход</b> на баннер: совершаем заданное число прогонов найма и смотрим, ' +
            'что именно выпало. Каждый 6★, дубликат rate-up оператора и бонусный жетон попадают в лог. ' +
            'Это как «сыграть один раз» — результат случайный, при повторном запуске будет другим. ' +
            'Нужно чтобы почувствовать, как реально идёт банк, а не усреднённую статистику.',
  monte: 'Прогоняет тот же заход <b>тысячи раз</b> и усредняет. Показывает честный шанс взять ' +
         'хотя бы копию 6★ rate-up оператора за это число прогонов найма, среднее количество копий и жетонов, ' +
         'и полное распределение потенциала (E0–E5). Отвечает на вопрос ' +
         '<b>«какова вероятность, если у меня есть N прогонов найма»</b>. Чем больше прогонов — тем точнее цифры.',
  reverse: 'Обратная задача: задаёшь <b>цель</b> (E0 — просто копия, до E5 — макс) и движок ищет, ' +
           'сколько прогонов найма в среднем нужно, чтобы её закрыть. Показывает среднее, медиану, ' +
           'везучие и невезучие 10% и гистограмму разброса. Отвечает на вопрос ' +
           '<b>«сколько копить под нужный потенциал»</b>.',
  prizes: 'Считает <b>какие талоны накапают</b> за прогоны найма: базовые талоны (за копии 6★/5★), ' +
          'премиум-талоны и АПК (за лишние жетоны), билеты арсенала. Учитываются бесплатные прогоны ' +
          '(+10 после 30 платных). Галка «вымакшено» — если стандартные операторы у тебя уже на максе, ' +
          'каждое их выпадение идёт в талоны; если нет — первая копия каждого это сам оператор. ' +
          'Можно один прогон или среднее по тысячам.',
};
function applyDesc() {
  const el = document.getElementById('modeDescText');
  el.style.opacity = 0;
  setTimeout(() => { el.innerHTML = descs[MODE]; el.style.opacity = 1; }, 120);
}
// ── кэш результатов по режимам (держится до перезагрузки страницы) ──
const RES_KEY = 'endfield_results';
function loadResultsCache() {
  try { return JSON.parse(sessionStorage.getItem(RES_KEY) || '{}'); } catch (e) { return {}; }
}
function saveResult(mode, html) {
  const c = loadResultsCache();
  c[mode] = html;
  try { sessionStorage.setItem(RES_KEY, JSON.stringify(c)); } catch (e) {}
}

// перевешивает тултипы графиков на восстановленный DOM (слушатели в HTML не сохраняются)
function rebindTips(container) {
  const dist = container.querySelector('#distChart');
  if (dist) attachRowTip(dist);
  const histo = container.querySelector('#histo');
  if (histo) { attachHistoTip(histo); }
  const markers = container.querySelector('#histoMarkers');
  if (markers) attachMarkerTip(markers);
}

// восстанавливает сохранённый результат режима без анимаций (финальное состояние сразу)
function restoreResult(mode) {
  const res = document.getElementById('results');
  const resInner = document.getElementById('resultsInner');
  const html = loadResultsCache()[mode];
  if (!html) { res.classList.remove('open', 'shown', 'no-anim'); resInner.innerHTML = ''; return; }
  res.classList.add('no-anim');     // подавляем transition на время вставки
  resInner.innerHTML = html;        // уже полностью отрисованный HTML (с финальными стилями)
  rebindTips(resInner);
  res.classList.add('open', 'shown'); // показать сразу раскрытым, без раскрывающей анимации
  // снимаем no-anim следующим кадром, чтобы будущие изменения снова анимировались
  requestAnimationFrame(() => requestAnimationFrame(() => res.classList.remove('no-anim')));
}

// устанавливает режим симулятора (один прогон найма / монте / reverse)
function setMode(mode) {
  MODE = mode;
  document.getElementById('modeTitle').textContent = titles[MODE];
  const isPrizes = mode === 'prizes';
  // у призов число прогонов нужно только в под-режиме «Монте»
  const prizeMonte = isPrizes && document.getElementById('inPrizeMode').value === 'monte';
  document.getElementById('ctrlTrials').style.display =
    (mode === 'monte' || mode === 'reverse' || prizeMonte) ? '' : 'none';
  document.getElementById('ctrlTarget').style.display = mode === 'reverse' ? '' : 'none';
  document.getElementById('ctrlPulls').style.display = mode === 'reverse' ? 'none' : '';
  document.getElementById('ctrlPrizeMode').style.display = isPrizes ? '' : 'none';
  document.getElementById('ctrlMaxed').style.display = isPrizes ? '' : 'none';
  // восстанавливаем сохранённый результат этого режима (или прячем, если его нет)
  restoreResult(mode);
  applyDesc();
  // синхронизируем активный пункт сайдбара (и обычные строки, и нампад-плашки)
  document.querySelectorAll('.sb-item').forEach(i => {
    i.classList.toggle('active', i.dataset.mode === mode);
  });
  document.querySelectorAll('.np-btn[data-mode]').forEach(i => {
    i.classList.toggle('active', i.dataset.mode === mode);
  });
}
window.setMode = setMode;

// .sb-item (обычные строки, напр. «Сколько у меня пуллов») + .np-btn (нампад-плашки режимов)
document.querySelectorAll('.sb-item, .np-btn').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.mode) setMode(item.dataset.mode);
    if (item.dataset.wmode && window.setWeaponMode) window.setWeaponMode(item.dataset.wmode);
    if (window.navTo) window.navTo(item.dataset.page); // page-sim/page-weapon/page-calc
    // подсветка активного пункта сайдбара — единая точка истины, не зависит от того,
    // есть ли у пункта data-mode/data-wmode (у «Сколько у меня пуллов» их нет вообще).
    // .sb-item и .np-btn — разные визуальные группы, подсвечиваем каждую независимо.
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i === item));
    document.querySelectorAll('.np-btn').forEach(i => i.classList.toggle('active', i === item));
  });
});
// инициализация видимости и описания
document.getElementById('ctrlTrials').style.display = 'none';
document.getElementById('modeDescText').innerHTML = descs.detailed;
// восстановить сохранённый результат стартового режима (если есть в сессии)
restoreResult(MODE);

// ── запуск ──
const runBtn = document.getElementById('runBtn');
runBtn.addEventListener('click', () => {
  const pulls = clampInt('inPulls', 1, 2000);
  const pity = 0; // старт пити всегда с нуля (свежий баннер)
  const trials = clampInt('inTrials', 1000, 300000);
  const target = parseInt(document.getElementById('inTarget').value, 10);
  const maxed = document.getElementById('inMaxed').checked;
  const freebies = true; // бесплатные пуллы всегда учитываются (правило баннера)
  const prizeMode = document.getElementById('inPrizeMode').value; // 'monte' | 'single'

  const res = document.getElementById('results');
  const resInner = document.getElementById('resultsInner');
  res.classList.remove('open', 'shown', 'no-anim');  // схлопываем прошлый результат
  setTimeout(() => { resInner.innerHTML = ''; }, 200);

  const simbar = document.getElementById('simbar');
  const fill = document.getElementById('simFill');
  const pct = document.getElementById('simPct');
  const status = document.getElementById('simStatus');
  simbar.classList.remove('hidden');
  fill.style.width = '0%';
  pct.textContent = '0%';
  runBtn.disabled = true;
  runBtn.classList.add('loading');
  runBtn.style.setProperty('--prog', '0%');

  // прогресс двигает и текстовый бар, и чёрную заливку кнопки
  const setProg = f => {
    const p = Math.floor(f * 100);
    fill.style.width = p + '%';
    pct.textContent = p + '%';
    runBtn.style.setProperty('--prog', p + '%');
  };

  // короткая «загрузка скрипта» перед вычислением — для ощущения
  status.textContent = 'INITIALIZING ENGINE…';
  setTimeout(() => {
    status.textContent = 'COMPUTING…';
    runMode(MODE, { pulls, pity, trials, target, maxed, freebies, prizeMode, setProg }).then(html => {
      setProg(1);
      status.textContent = 'DONE ✓';
      setTimeout(() => {
        simbar.classList.add('hidden');
        runBtn.classList.remove('loading');
        runBtn.style.setProperty('--prog', '0%');
        runBtn.disabled = false;
        // вставляем результат и плавно раскрываем
        resInner.innerHTML = html.html;
        requestAnimationFrame(() => requestAnimationFrame(() => res.classList.add('open')));
        // после анимации раскрытия — снимаем grid-слой (чтобы текст не мылился)
        res.addEventListener('transitionend', function onEnd(e) {
          if (e.propertyName === 'grid-template-rows') {
            res.classList.add('shown');
            res.removeEventListener('transitionend', onEnd);
          }
        });
        html.after && html.after();
        // сохраняем результат в сессию ПОСЛЕ завершения анимаций (финальные стили в DOM).
        // запас на анимацию чисел (900мс) + лесенку столбцов гистограммы (i*14мс)
        const cols = resInner.querySelectorAll('.hb, .hb-col').length;
        setTimeout(() => saveResult(MODE, resInner.innerHTML), Math.max(1400, cols * 14 + 600));
      }, 350);
    });
  }, 500);
});

function clampInt(id, lo, hi) {
  let v = parseInt(document.getElementById(id).value, 10);
  if (isNaN(v)) v = lo;
  v = Math.max(lo, Math.min(hi, v));
  document.getElementById(id).value = v;
  return v;
}

// ── кнопка «Мои пуллы»: подставляет итог из калькулятора ──
(function minePullsBtn() {
  const btn = document.getElementById('useMineBtn');
  const cnt = document.getElementById('mineCount');
  const inp = document.getElementById('inPulls');
  if (!btn) return;
  const read = () => parseInt(localStorage.getItem('endfield_my_pulls') || '0', 10) || 0;
  // показать сохранённое число при загрузке
  cnt.textContent = read().toLocaleString('ru');
  btn.addEventListener('click', () => {
    const my = read();
    if (my < 1) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 400); return; }
    inp.value = Math.min(my, 2000); // потолок поля
    inp.classList.add('flash');
    setTimeout(() => inp.classList.remove('flash'), 500);
  });
})();

// ── Web Worker для тяжёлых режимов (UI не виснет даже на 300k) ──
let simWorker = null;
function getWorker() {
  if (!simWorker) {
    try { simWorker = new Worker('sim.worker.js'); }
    catch (e) { simWorker = null; } // file:// в некоторых браузерах может блокировать воркер
  }
  return simWorker;
}

// один прогон в воркере, прогресс через колбэк
function runInWorker(mode, params, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) { reject(new Error('no-worker')); return; }
    const handler = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.value);
      else if (m.type === 'done') { w.removeEventListener('message', handler); resolve(m.result); }
      else if (m.type === 'error') { w.removeEventListener('message', handler); reject(new Error(m.message)); }
    };
    w.addEventListener('message', handler);
    w.postMessage({ mode, params });
  });
}

// detailed и prizes-single — мгновенные, синхронно. monte/reverse/prizes-monte — в воркере.
function runMode(mode, p) {
  if (mode === 'detailed') {
    return new Promise(resolve => requestAnimationFrame(() => {
      const r = detailedRun(p.pulls, p.pity);
      p.setProg(1);
      resolve(renderDetailed(r, p));
    }));
  }
  if (mode === 'prizes' && p.prizeMode === 'single') {
    return new Promise(resolve => requestAnimationFrame(() => {
      const r = prizesOneRun(p.pulls, p.maxed, true, p.freebies); // keepLog + бесплатные
      p.setProg(1);
      resolve(renderPrizes(r, p, true));
    }));
  }
  const params = { pulls: p.pulls, pity: p.pity, trials: p.trials, target: p.target, maxed: p.maxed, freebies: p.freebies };
  return runInWorker(mode, params, p.setProg)
    .then(r => {
      if (mode === 'monte') return renderMonte(r, p);
      if (mode === 'reverse') return renderReverse(r, p);
      return renderPrizes(r, p, false); // prizes-monte
    })
    .catch(err => {
      // fallback: если воркер недоступен (например открыто как file:// в строгом браузере) — синхронно
      if (err.message === 'no-worker') {
        return new Promise(resolve => requestAnimationFrame(() => {
          if (mode === 'monte') resolve(renderMonte(monteCarlo(p.pulls, p.trials, p.pity, p.setProg), p));
          else if (mode === 'reverse') resolve(renderReverse(pullsUntil(p.target, p.trials, p.pity, p.setProg), p));
          else resolve(renderPrizes(prizesMonte(p.pulls, p.trials, p.maxed, p.setProg, p.freebies), p, false));
        }));
      }
      throw err;
    });
}

/* ── РЕНДЕР: один прогон найма ── */
function renderDetailed(r, p) {
  let rows = '';
  for (const e of r.events) {
    let label, cls;
    if (e.camille) {
      label = e.dup ? '6★ RATE-UP · ДУБЛИКАТ +жетон'
            : (e.forced ? '6★ RATE-UP · ГАРАНТ 120!' : '6★ RATE-UP · НОВЫЙ');
      cls = 'ev-rateup';
    } else if (e.rarity === 6) {
      label = '6★ другой оператор'; cls = 'ev-six';
    } else {
      label = ''; cls = '';
    }
    let extra = e.tokenBonus ? ' <span class="ev-token">+жетон за 240</span>' : '';
    if (label || e.tokenBonus) {
      rows += `<div class="ev ${cls}"><span class="ev-n">#${String(e.pull).padStart(4,'0')}</span>
        <span class="ev-l">${label}${extra}</span></div>`;
    }
  }
  if (!rows) rows = '<div class="ev ev-empty">// ни одного 6★ за этот прогон</div>';

  const potCard = `<div class="stat-card">
      <div class="sc-label">ПОТЕНЦИАЛ<span class="info" tabindex="0" data-info="Итоговая фаза потенциала на конец захода. E0 — одна копия, E5 — максимум (5 жетонов сверху). Закрашенные клинки = набранные уровни.">?</span></div>
      <div class="sc-value">${potentialIconHtml(r.cons, { accent: true })}</div>
      <div class="sc-line"></div>
    </div>`;

  const html = `
    <div class="res-head">↘ РЕЗУЛЬТАТ ПРОГОНА НАЙМА <span class="rh-tech">// ${p.pulls} ПРОГОНОВ</span></div>
    <div class="stat-grid">
      ${potCard}
      ${statCard('КОПИЙ 6★ RATE-UP', r.copies, { icon: ICON.layers, info: 'Сколько раз за этот заход выпал именно rate-up оператор (новый + дубликаты + гарант). Каждая копия сверх первой даёт жетон.' })}
      ${statCard('ЖЕТОНОВ', r.tokens, { icon: ICON.hashtag, info: 'Жетоны потенциала rate-up оператора: за дубликаты (со 2-й копии) и за каждый 240-й прогон найма. Нужны для прокачки E1–E5.' })}
      ${statCard('ПИТИ НА ВЫХОДЕ', r.pityOut, { icon: ICON.clock, info: 'Сколько прогонов найма без 6★ накоплено к концу захода. Софт-пити растит шанс после 65, хард-гарант 6★ на 80-м. Счётчик переносится на следующий баннер.' })}
    </div>
    <div class="res-head sub">↘ ЛОГ СОБЫТИЙ</div>
    <div class="evlog">${rows}</div>`;

  return { html, after: () => animateStatCards() };
}

/* ── РЕНДЕР: Монте-Карло ── */
function renderMonte(r, p) {
  const dist = r.consDist;
  let bars = `<div class="dist-row" data-tip="Нет 6★ rate-up: ${(r.noCamille*100).toFixed(2)}% прогонов"><span class="dr-l">НЕТ 6★</span>
    <div class="dr-track"><div class="dr-fill neg" data-pct="${(r.noCamille*100).toFixed(2)}"></div></div>
    <span class="dr-v">${(r.noCamille*100).toFixed(2)}%</span></div>`;
  for (let e = 0; e <= 5; e++) {
    bars += `<div class="dist-row" data-tip="Потенциал E${e}: ${(dist[e]*100).toFixed(2)}% прогонов"><span class="dr-l">E${e}</span>
      <div class="dr-track"><div class="dr-fill" data-pct="${(dist[e]*100).toFixed(2)}"></div></div>
      <span class="dr-v">${(dist[e]*100).toFixed(2)}%</span></div>`;
  }
  const likely = mostLikelyPotential(r.noCamille, dist);
  const potCard = `<div class="stat-card">
      <div class="sc-label">САМЫЙ ВЕРОЯТНЫЙ ПОТЕНЦИАЛ<span class="info" tabindex="0" data-info="Уровень потенциала rate-up оператора, который выпадает чаще всего среди всех прогонов (мода распределения). Шанс именно этого исхода — ${(likely.chance*100).toFixed(1)}%.">?</span></div>
      <div class="sc-value">${potentialIconHtml(likely.level, { accent: true })}</div>
      <div class="sc-line"></div>
    </div>`;

  const html = `
    <div class="res-head">↘ МОНТЕ-КАРЛО <span class="rh-tech">// ${p.pulls} ПРОГОНОВ НАЙМА × ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid">
      ${potCard}
      ${statCard('ШАНС ≥ E0', r.pE0*100, { decimals: 2, suffix: '%', icon: ICON.percent, pctColor: true, info: 'Доля прогонов, где выпала хотя бы одна копия rate-up оператора. Это вероятность «получить его вообще» за указанное число прогонов найма.' })}
      ${statCard('СРЕД. КОПИЙ', r.avgCopies, { decimals: 2, icon: ICON.layers, info: 'Среднее число копий rate-up оператора по всем прогонам. Может быть дробным: усреднение, а не один заход.' })}
      ${statCard('СРЕД. ЖЕТОНОВ', r.avgTokens, { decimals: 2, icon: ICON.hashtag, info: 'Среднее число жетонов потенциала за заход (дубликаты + жетоны за 240). Косвенно показывает, до какого E в среднем добираешься.' })}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ ПОТЕНЦИАЛА<span class="info" tabindex="0" data-info="Какая доля прогонов закончилась на каждой фазе E0–E5 (и сколько вообще не взяли 6★). Наведись на строку — точный процент. Показывает не «сколько в среднем», а весь разброс исходов.">?</span></div>
    <div class="dist" id="distChart">${bars}</div>`;
  return { html, after: () => { animateStatCards(); animateDist(); attachRowTip(document.getElementById('distChart')); } };
}

/* ── РЕНДЕР: сколько до цели ── */
function renderReverse(r, p) {
  const html = `
    <div class="res-head">↘ СКОЛЬКО ПРОГОНОВ НАЙМА ДО E${p.target} <span class="rh-tech">// ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid four">
      ${statCard('СРЕДНЕЕ', r.mean, { decimals: 1, big: true, icon: ICON.chartLine, info: 'Среднее число прогонов найма до цели по всем прогонам симуляции. Удобно для общей прикидки, но «хвост» невезения тянет его вверх — медиана честнее.' })}
      ${statCard('МЕДИАНА', r.median, { icon: ICON.chartBar, info: 'Половина игроков закроет цель быстрее этого числа, половина — медленнее. Самый честный ориентир «по середине».' })}
      ${dualStatCard(
          'ВЕЗУЧИЕ 10%', r.best10, ICON.trendUp,
          'НЕВЕЗУЧИЕ 10%', r.worst10, ICON.trendDown,
          {
            topInfo: 'Если бы 100 разных игроков делали прогоны найма до этой цели, 10 самых везучих из них закрыли бы её за это число прогонов или даже быстрее. Это твой «повезло» сценарий — на него рассчитывать не стоит, но шанс есть.',
            botInfo: 'Если бы 100 разных игроков делали прогоны найма до этой цели, 10 самых невезучих из них потратили бы на неё это число прогонов или даже больше. Закладывай именно эту цифру в бюджет, если не хочешь остаться без валюты на середине пути.',
          })}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ (гистограмма)<span class="info" tabindex="0" data-info="Сколько прогонов симуляции закрыли цель за то или иное число прогонов найма. Высокий столбец — частый исход. Метки Г/Ж1/Ж2 снизу — гарант и гарантированные жетоны, на них видны пики «дозревания». Дуги сверху — суммарный % в участке.">?</span></div>
    <div class="histo-wrap">
      <div class="histo-arcs" id="histoArcs"></div>
      <div class="histo" id="histo"></div>
      <div class="histo-markers" id="histoMarkers"></div>
    </div>
    <div class="res-note">// худший 1% случаев: <b>${r.worst1}</b> прогонов найма · <span class="rn-hint">Г — гарант, Ж1/Ж2… — гарантированные жетоны</span></div>`;
  return { html, after: () => { animateStatCards(); drawHisto(r); } };
}

/* ── РЕНДЕР: подсчёт призов ── */
function renderPrizes(r, p, single) {
  // single: {baseTickets, premium, aic, count6,count5,count4, camilleCopies, camilleTokens}
  // monte:  {avgBase, avgPrem, avgAic, avg6,avg5,avg4, trials}
  const base = single ? r.baseTickets : r.avgBase;
  const prem = single ? r.premium : r.avgPrem;
  const aic = single ? r.aic : r.avgAic;
  const arsenal = single ? r.arsenal : r.avgArs;
  const c6 = single ? r.count6 : r.avg6;
  const c5 = single ? r.count5 : r.avg5;
  const c4 = single ? r.count4 : r.avg4;
  const dec = single ? 0 : 1;     // в Монте дробные средние
  const sub = single ? `// ОДИН ЗАХОД · ${p.pulls} ПРОГОНОВ НАЙМА`
                     : `// ${p.pulls} ПРОГОНОВ НАЙМА × ${r.trials.toLocaleString('ru')} ПРОГОНОВ · СРЕДНЕЕ`;

  const prizeCard = (icon, label, value, hint, info) => `
    <div class="prize-card">
      <img src="icons/${icon}" class="pz-ic">
      <div class="pz-body">
        <div class="pz-label">${label}${info ? ` <span class="info" tabindex="0" data-info="${info.replace(/"/g, '&quot;')}">?</span>` : ''}</div>
        <div class="pz-val" data-anim='${JSON.stringify({ value, decimals: dec })}'>0</div>
        <div class="pz-hint">${hint}</div>
      </div>
    </div>`;

  // иконка редкости
  const rar = n => `<img src="icons/32px-Rarity_${n}.webp" class="rar-ic" alt="${n}★">`;

  // поимённая разбивка 6★ (имена нейтральные, приходят из движка)
  const byName = single ? r.byName : r.avgName;
  const fmtN = v => single ? Math.round(v) : v.toFixed(2);
  let opRows = '';
  NAMES_6.forEach((name, i) => {
    const v = byName[name] || 0;
    const isRateup = (i === 0);
    opRows += `<div class="op-row${v > 0 ? ' has' : ''}${isRateup ? ' rateup' : ''}">
      <span class="op-name">${rar(6)} ${name}</span>
      <span class="op-count">${fmtN(v)}</span></div>`;
  });

  // лог событий: 6★ + жетоны за 240 (только single)
  let logHtml = '';
  if (single && r.log6) {
    if (r.log6.length) {
      logHtml = '<div class="res-head sub">↘ ЛОГ СОБЫТИЙ</div><div class="evlog">' +
        r.log6.map(e => {
          const num = (typeof e.pull === 'number') ? '#' + String(e.pull).padStart(4, '0') : 'FREE';
          if (e.token240) {
            // жетон за 240-й пулл
            return `<div class="ev ev-token-row">
              <span class="ev-n">${num}</span>
              <span class="ev-l">⬡ +1 жетон за 240-й пулл</span></div>`;
          }
          const tag = e.forced ? ' · ГАРАНТ 120' : (e.free ? ' · бесплатный' : (e.rateup ? ' · rate-up' : ''));
          return `<div class="ev${e.rateup ? ' ev-rateup' : ' ev-six'}">
            <span class="ev-n">${num}</span>
            <span class="ev-l">${rar(6)} ${e.name}${tag}</span></div>`;
        }).join('') + '</div>';
    } else {
      logHtml = '<div class="res-head sub">↘ ЛОГ СОБЫТИЙ</div><div class="evlog"><div class="ev ev-empty">// ни одного события за заход</div></div>';
    }
  }

  const html = `
    <div class="res-head">↘ ПОДСЧЁТ ПРИЗОВ <span class="rh-tech">${sub}</span></div>
    <div class="prize-grid four">
      ${prizeCard('Bond_Quota.png', 'БАЗОВЫЕ ТАЛОНЫ', base, 'за копии 6★/5★', 'Капают за дубликаты операторов: копия 6★ → 50 талонов, копия 5★ → 10. Жетоны за 240 тоже считаются полноценной копией. 25 базовых талонов = 1 пулл.')}
      ${prizeCard('AIC_Quota.png', 'ТАЛОНЫ АПК', aic, 'за лишние жетоны 5★/4★', 'Обмен ЛИШНИХ жетонов (сверх макс. потенциала): жетон 5★ → 20 АПК, жетон 4★ → 5 АПК. У 4★ потенциал копится быстро, так что лишних жетонов много.')}
      ${prizeCard('Endpoint_Quota.png', 'ПРЕМИУМ-ТАЛОНЫ', prem, 'за лишние жетоны 6★', 'Премиум-валюта за обмен лишних жетонов 6★ (сверх E5): 1 жетон → 10 премиум-талонов. Капает только если 6★ уже вымакшен.')}
      ${prizeCard('Arsenal_Ticket.png', 'БИЛЕТЫ АРСЕНАЛА', arsenal, '2000/200/20 за 6★/5★/4★', 'Капают за КАЖДОЕ выпадение оператора без условий: 6★ → 2000, 5★ → 200, 4★ → 20. Тратятся на оружие в обменнике арсенала.')}
    </div>
    <div class="res-head sub">↘ ВЫПАЛО ПО РЕДКОСТИ<span class="info" tabindex="0" data-info="Сколько операторов каждой редкости выпало за заход (включая бесплатные пуллы). Базовые шансы: 6★ 0.8%, 5★ 8%, 4★ 91.2%, плюс гаранты редкости.">?</span></div>
    <div class="stat-grid">
      ${statCard(rar(6), c6, { decimals: dec })}
      ${statCard(rar(5), c5, { decimals: dec })}
      ${statCard(rar(4), c4, { decimals: dec })}
    </div>
    <div class="res-head sub">↘ 6★ ПОИМЁННО<span class="info" tabindex="0" data-info="Разбивка выпавших 6★ по операторам. Первый — текущий rate-up (50% всех 6★), остальные — прошлые rate-up и стандартный пул (делят оставшиеся 50% поровну). Имена обезличены, чтобы не зависеть от баннера.">?</span></div>
    <div class="op-table">${opRows}</div>
    ${logHtml}
    <div class="res-note">// ${p.maxed ? 'стандартные операторы вымакшены — все копии в талоны' : 'первая копия каждого оператора = он сам, дальше в талоны'}</div>`;

  return {
    html,
    after: () => {
      animateStatCards();
      // анимируем карточки призов
      document.querySelectorAll('.pz-val[data-anim]').forEach((el, i) => {
        const d = JSON.parse(el.dataset.anim);
        el.removeAttribute('data-anim');
        setTimeout(() => animateNumber(el, d.value, { decimals: d.decimals }), 80 * i);
      });
    },
  };
}

/* ── вспомогательные ── */
// opts.icon — путь к SVG-иконке (FontAwesome и т.п.), вставляется перед числом внутри .sc-value
function statCard(label, value, opts) {
  const id = 'sc' + Math.random().toString(36).slice(2, 8);
  const { info, icon, ...rest } = opts;
  const data = JSON.stringify({ value, ...rest });
  const badge = info ? ` <span class="info" tabindex="0" data-info="${info.replace(/"/g, '&quot;')}">?</span>` : '';
  // webp/png (валютные иконки-предметы) не перекрашиваем фильтром — они уже цветные; SVG (FontAwesome) красим в белый
  const nativeCls = icon && /\.(webp|png|jpg)$/i.test(icon) ? ' native' : '';
  const iconHtml = icon ? `<img src="${icon}" class="sc-val-ic${nativeCls}" alt="">` : '';
  const pctCls = rest.pctColor ? ' pct-color' : '';
  return `<div class="stat-card"><div class="sc-label">${label}${badge}</div>
    <div class="sc-value-row">${iconHtml}<span class="sc-value${pctCls}" id="${id}" data-anim='${data}'>0</span></div>
    <div class="sc-line${pctCls}" id="${id}-line"></div></div>`;
}

// цвет по проценту (0–100): красный → оранжевый → жёлто-зелёный → зелёный, приглушённая палитра
function pctToColor(pct) {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  // три опорные точки в HSL: 0%=мягкий красный(4,70%,58%), 50%=янтарный(38,85%,55%), 100%=спокойный зелёный(140,55%,48%)
  const stops = [
    { p: 0, h: 4, s: 70, l: 58 },
    { p: 0.5, h: 38, s: 85, l: 55 },
    { p: 1, h: 140, s: 55, l: 48 },
  ];
  let a = stops[0], b = stops[1];
  if (p > 0.5) { a = stops[1]; b = stops[2]; }
  const t = (p - a.p) / (b.p - a.p);
  const h = a.h + (b.h - a.h) * t;
  const s = a.s + (b.s - a.s) * t;
  const l = a.l + (b.l - a.l) * t;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}
window.pctToColor = pctToColor;

// двухстрочная плашка (везучие/невезучие, пары родственных значений): одна карточка,
// два значения друг под другом. opts.native — иконки уже цветные (валюты/предметы),
// не красить фильтром вверх-зелёный/вниз-оранжевый — оставить как есть.
function dualStatCard(topLabel, topValue, topIcon, botLabel, botValue, botIcon, opts) {
  const native = opts && opts.icon2Native;
  const upCls = native ? 'native' : 'dual-ic-up';
  const downCls = native ? 'native' : 'dual-ic-down';
  const topInfo = opts && opts.topInfo
    ? ` <span class="info" tabindex="0" data-info="${opts.topInfo.replace(/"/g, '&quot;')}">?</span>` : '';
  const botInfo = opts && opts.botInfo
    ? ` <span class="info" tabindex="0" data-info="${opts.botInfo.replace(/"/g, '&quot;')}">?</span>` : '';
  return `<div class="stat-card stat-card-dual">
    <div class="dual-row">
      <img src="${topIcon}" class="sc-val-ic ${upCls}" alt="">
      <span class="dual-val">${topValue}</span>
      <span class="dual-lbl">${topLabel}${topInfo}</span>
    </div>
    <div class="dual-sep"></div>
    <div class="dual-row">
      <img src="${botIcon}" class="sc-val-ic ${downCls}" alt="">
      <span class="dual-val">${botValue}</span>
      <span class="dual-lbl">${botLabel}${botInfo}</span>
    </div>
  </div>`;
}

// N-строчная плашка: массив [{label, value, icon}] друг под другом в одной карточке —
// для «водянистой» родственной статистики (например среднее число предметов по редкости)
function multiStatCard(rows, opts) {
  const title = opts && opts.title
    ? `<div class="sc-label">${opts.title}${opts.info ? ` <span class="info" tabindex="0" data-info="${opts.info.replace(/"/g, '&quot;')}">?</span>` : ''}</div>`
    : '';
  const body = rows.map((row, i) => `
    <div class="dual-row">
      <img src="${row.icon}" class="sc-val-ic native multi-ic" alt="">
      <span class="dual-val">${row.value}</span>
      <span class="dual-lbl">${row.label}</span>
    </div>
    ${i < rows.length - 1 ? '<div class="dual-sep"></div>' : ''}`).join('');
  return `<div class="stat-card stat-card-dual">${title}${body}</div>`;
}
function animateStatCards() {
  document.querySelectorAll('.sc-value[data-anim]').forEach((el, i) => {
    const d = JSON.parse(el.dataset.anim);
    el.removeAttribute('data-anim');
    setTimeout(() => {
      if (d.textTo !== undefined) {
        el.textContent = d.textTo;
        el.classList.add('pop');
      } else {
        animateNumber(el, d.value, { decimals: d.decimals || 0, suffix: d.suffix || '' });
      }
      if (d.pctColor) {
        const color = pctToColor(d.value);
        el.style.color = color;
        const line = document.getElementById(el.id + '-line');
        if (line) line.style.background = color;
      }
    }, 80 * i);
  });
}
function animateDist() {
  document.querySelectorAll('.dr-fill').forEach((el, i) => {
    const pct = parseFloat(el.dataset.pct);
    animateBar(el, Math.min(100, pct), 60 * i);
  });
}
function drawHisto(r) {
  // counts либо готовы из воркера (r.histo), либо строим из сырого массива (fallback)
  let bucket, counts;
  if (r.histo) {
    bucket = r.histo.bucket;
    counts = r.histo.counts;
  } else {
    bucket = 10;
    const raw = r.raw;
    const max = raw[raw.length - 1];
    counts = new Array(Math.ceil((max + 1) / bucket)).fill(0);
    for (const v of raw) counts[Math.floor(v / bucket)]++;
  }
  const peak = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const nCols = counts.length;
  const host = document.getElementById('histo');
  host.innerHTML = '';
  counts.forEach((c, i) => {
    // обёртка на всю высоту — ховер ловится и над столбцом
    const col = document.createElement('div');
    col.className = 'hb-col';
    const pctOfAll = total ? (c / total * 100).toFixed(1) : 0;
    col.dataset.tip = `${i*bucket}–${i*bucket+bucket-1} прогонов найма · ${c.toLocaleString('ru')} (${pctOfAll}%)`;
    const bar = document.createElement('div');
    bar.className = 'hb';
    col.appendChild(bar);
    host.appendChild(col);
    setTimeout(() => { bar.style.height = (c / peak * 100) + '%'; }, i * 14);
  });
  attachHistoTip(host);
  drawHistoMarkers(counts, bucket, nCols, total);
}

// позиционирование тултипа с клампом по краям окна (не вылезает за экран)
function placeTip(tip, x, y) {
  // нужна ширина — показываем, меряем, клампим
  tip.style.left = '-9999px';
  tip.style.top = (y - 14) + 'px';
  const w = tip.offsetWidth;
  const half = w / 2;
  const pad = 8;
  let left = Math.max(half + pad, Math.min(window.innerWidth - half - pad, x));
  tip.style.left = left + 'px';
  // если у верхнего края — показать снизу курсора
  if (y - tip.offsetHeight - 14 < 0) {
    tip.style.top = (y + 22) + 'px';
    tip.style.transform = 'translate(-50%, 0)';
  } else {
    tip.style.transform = 'translate(-50%, -100%)';
  }
}

// маркеры событий (Г-120, Ж1-240, Ж2-480…) + дуги с суммой % между ними
function drawHistoMarkers(counts, bucket, nCols, total) {
  const markersEl = document.getElementById('histoMarkers');
  const arcsEl = document.getElementById('histoArcs');
  if (!markersEl || !arcsEl) return;
  markersEl.innerHTML = '';
  arcsEl.innerHTML = '';

  const maxPull = nCols * bucket;
  // ключевые события (только те что в диапазоне)
  const events = [
    { pull: 120, label: 'Г', tip: 'Гарант 120 — если rate-up не выпал за 120 платных прогонов найма, он гарантирован. Здесь «дозревают» невезучие прогоны.' },
    { pull: 240, label: 'Ж1', tip: '1-й гарантированный жетон (каждый 240-й прогон найма). Даёт +1 потенциал всем — отсюда ступенька.' },
    { pull: 480, label: 'Ж2', tip: '2-й гарантированный жетон (480-й прогон найма). Большинство добирает до E5 именно тут — главный пик.' },
    { pull: 720, label: 'Ж3', tip: '3-й гарантированный жетон (720-й прогон найма). Сюда доходят самые невезучие.' },
    { pull: 960, label: 'Ж4', tip: '4-й гарантированный жетон (960-й прогон найма).' },
  ].filter(e => e.pull <= maxPull);

  // позиция прогона найма в % ширины (центр соответствующей колонки)
  const posPct = pull => ((Math.floor(pull / bucket) + 0.5) / nCols) * 100;
  // маркеры снизу (на колонке, содержащей событие)
  events.forEach(e => {
    const m = document.createElement('div');
    m.className = 'hm';
    m.style.left = posPct(e.pull) + '%';
    m.dataset.tip = `${e.label} · ${e.pull} прогонов найма — ${e.tip}`;
    m.innerHTML = `<span class="hm-dot"></span><span class="hm-label">${e.label}</span>`;
    markersEl.appendChild(m);
  });

  // ── дуги по индексам бакетов ──
  // событие на пулле P попадает в бакет bi = floor(P/bucket). Столбец этого бакета
  // (напр. 480-489) — РЕЗУЛЬТАТ жетона, поэтому он ЗАВЕРШАЕТ участок, ведущий к событию.
  // edge(bi) = левый край бакета bi в %.
  const edge = bi => (bi / nCols) * 100;
  // сумма % по бакетам [biFrom, biTo] включительно
  const sumBuckets = (biFrom, biTo) => {
    let s = 0;
    for (let i = Math.max(0, biFrom); i <= biTo && i < counts.length; i++) s += counts[i];
    return total ? (s / total * 100) : 0;
  };
  // границы-бакеты: 0, бакет(120), бакет(240), бакет(480)... и последний бакет
  const evBuckets = events.map(e => Math.floor(e.pull / bucket));
  const segStarts = [0];                 // индекс бакета, с которого начинается участок
  const segEnds = [];                    // индекс бакета, которым участок заканчивается (включительно)
  evBuckets.forEach(bi => { segEnds.push(bi); segStarts.push(bi + 1); });
  segEnds.push(counts.length - 1);       // последний участок до конца

  for (let i = 0; i < segStarts.length; i++) {
    const biFrom = segStarts[i], biTo = segEnds[i];
    if (biTo < biFrom) continue;
    const left = edge(biFrom);
    const right = edge(biTo + 1);        // правый край последнего бакета участка
    const width = right - left;
    if (width <= 0) continue;
    const pct = sumBuckets(biFrom, biTo);
    const arc = document.createElement('div');
    arc.className = 'harc';
    arc.style.left = left + '%';
    arc.style.width = width + '%';
    arc.innerHTML = `<span class="harc-line"></span><span class="harc-val">${pct.toFixed(1)}%</span>`;
    arcsEl.appendChild(arc);
  }

  // ховер для маркеров (переиспользуем общий тултип)
  attachMarkerTip(markersEl);
}

function attachMarkerTip(host) {
  let tip = document.getElementById('histoTip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'histoTip'; tip.className = 'histo-tip'; document.body.appendChild(tip); }
  host.addEventListener('mousemove', e => {
    const m = e.target.closest('.hm');
    if (!m) { tip.classList.remove('show'); return; }
    tip.textContent = m.dataset.tip;
    tip.classList.add('show');
    placeTip(tip, e.clientX, e.clientY);
  });
  host.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

// единый тултип для гистограммы (следует за курсором)
function attachHistoTip(host) {
  let tip = document.getElementById('histoTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'histoTip';
    tip.className = 'histo-tip';
    document.body.appendChild(tip);
  }
  host.addEventListener('mousemove', (e) => {
    const col = e.target.closest('.hb-col');
    if (!col) { tip.classList.remove('show'); return; }
    tip.textContent = col.dataset.tip;
    tip.classList.add('show');
    placeTip(tip, e.clientX, e.clientY);
  });
  host.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

// тултип для горизонтальных строк распределения (Монте-Карло)
function attachRowTip(host) {
  if (!host) return;
  let tip = document.getElementById('histoTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'histoTip';
    tip.className = 'histo-tip';
    document.body.appendChild(tip);
  }
  host.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.dist-row');
    if (!row) { tip.classList.remove('show'); return; }
    tip.textContent = row.dataset.tip;
    tip.classList.add('show');
    placeTip(tip, e.clientX, e.clientY);
  });
  host.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

// ── инфо-значки (?) рядом с лейблами: тултип по наведению / тапу ──
(function infoTips() {
  // СВОЙ элемент тултипа, не общий с графиками (#histoTip) — чтобы их mousemove его не перетирал
  const tip = document.createElement('div');
  tip.id = 'infoTip';
  tip.className = 'histo-tip info-tip';
  document.body.appendChild(tip);
  let pinned = null; // активный по тапу значок (мобайл)

  const show = (el) => {
    tip.textContent = el.dataset.info;
    // позиционируем ещё невидимым, потом показываем (без мелькания)
    const r = el.getBoundingClientRect();
    placeTip(tip, r.left + r.width / 2, r.top);
    tip.classList.add('show');
  };
  const hideInfo = () => tip.classList.remove('show');
  const hide = () => { hideInfo(); pinned = null; };

  // hover (десктоп)
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('.info');
    if (el) show(el);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('.info') && !pinned) hideInfo();
  });

  // tap / click (мобайл + клавиатура): toggle, не даём всплыть к закрытию дропдаунов
  document.addEventListener('click', e => {
    const el = e.target.closest('.info');
    if (el) {
      e.stopPropagation();
      e.preventDefault();
      if (pinned === el) { hide(); }
      else { pinned = el; show(el); }
    } else if (pinned) {
      hide();
    }
  });
  // фокус с клавиатуры
  document.addEventListener('focusin', e => {
    if (e.target.classList && e.target.classList.contains('info')) show(e.target);
  });
  document.addEventListener('focusout', e => {
    if (e.target.classList && e.target.classList.contains('info') && !pinned) hideInfo();
  });
  // прячем инфо-тултип при скролле/ресайзе (позиция привязана к элементу)
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
})();

// инициализация улучшенных полей (DOM уже готов — скрипт в конце body)
enhanceNumberInputs();
initDropdowns();

// смена под-режима призов (один/Монте) → обновить видимость числа прогонов
document.getElementById('inPrizeMode').addEventListener('change', () => {
  if (MODE === 'prizes') setMode('prizes');
});
