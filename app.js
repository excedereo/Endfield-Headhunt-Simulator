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
  detailed: 'ОДНА КРУТКА',
  monte: 'МОНТЕ-КАРЛО',
  reverse: 'СКОЛЬКО ДО ЦЕЛИ',
  prizes: 'ПОДСЧЁТ ПРИЗОВ',
};
const descs = {
  detailed: 'Симулирует <b>один заход</b> на баннер: крутим заданное число пуллов и смотрим, ' +
            'что именно выпало. Каждый 6★, дубликат rate-up оператора и бонусный жетон попадают в лог. ' +
            'Это как «сыграть один раз» — результат случайный, при повторном запуске будет другим. ' +
            'Нужно чтобы почувствовать, как реально идёт банк, а не усреднённую статистику.',
  monte: 'Прогоняет тот же заход <b>тысячи раз</b> и усредняет. Показывает честный шанс взять ' +
         'хотя бы копию 6★ rate-up оператора за это число пуллов, среднее количество копий и жетонов, ' +
         'и полное распределение потенциала (E0–E5). Отвечает на вопрос ' +
         '<b>«какова вероятность, если у меня есть N пуллов»</b>. Чем больше прогонов — тем точнее цифры.',
  reverse: 'Обратная задача: задаёшь <b>цель</b> (E0 — просто копия, до E5 — макс) и движок ищет, ' +
           'сколько пуллов в среднем нужно, чтобы её закрыть. Показывает среднее, медиану, ' +
           'везучие и невезучие 10% и гистограмму разброса. Отвечает на вопрос ' +
           '<b>«сколько копить под нужный потенциал»</b>.',
  prizes: 'Считает <b>какие талоны накапают</b> за прокрутки: базовые талоны (за копии 6★/5★), ' +
          'премиум-талоны и АПК (за лишние жетоны), билеты арсенала. Учитываются бесплатные пуллы ' +
          '(+10 после 30 платных). Галка «вымакшено» — если стандартные операторы у тебя уже на максе, ' +
          'каждое их выпадение идёт в талоны; если нет — первая копия каждого это сам оператор. ' +
          'Можно один прокрут или среднее по тысячам.',
};
function applyDesc() {
  const el = document.getElementById('modeDescText');
  el.style.opacity = 0;
  setTimeout(() => { el.innerHTML = descs[MODE]; el.style.opacity = 1; }, 120);
}
// устанавливает режим симулятора (одна крутка / монте / reverse)
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
  document.getElementById('results').classList.remove('open');
  setTimeout(() => { document.getElementById('resultsInner').innerHTML = ''; }, 200);
  applyDesc();
  // синхронизируем активный пункт сайдбара
  document.querySelectorAll('.sb-item').forEach(i => {
    i.classList.toggle('active', i.dataset.mode === mode);
  });
}
window.setMode = setMode;

document.querySelectorAll('.sb-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.mode) setMode(item.dataset.mode);
    if (window.navTo) window.navTo(item.dataset.page); // page-sim/page-calc
  });
});
// инициализация видимости и описания
document.getElementById('ctrlTrials').style.display = 'none';
document.getElementById('modeDescText').innerHTML = descs.detailed;

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
  res.classList.remove('open', 'shown');  // схлопываем прошлый результат
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

/* ── РЕНДЕР: одна крутка ── */
function renderDetailed(r, p) {
  const consTxt = r.cons === null ? '— НЕТ 6★' : 'E' + r.cons;
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

  const html = `
    <div class="res-head">↘ РЕЗУЛЬТАТ ОДНОЙ КРУТКИ <span class="rh-tech">// ${p.pulls} ПУЛЛОВ</span></div>
    <div class="stat-grid">
      ${statCard('КОПИЙ 6★ RATE-UP', r.copies, {})}
      ${statCard('ЖЕТОНОВ', r.tokens, {})}
      ${statCard('ПОТЕНЦИАЛ', 0, { textTo: consTxt })}
      ${statCard('ПИТИ НА ВЫХОДЕ', r.pityOut, {})}
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
  const html = `
    <div class="res-head">↘ МОНТЕ-КАРЛО <span class="rh-tech">// ${p.pulls} ПУЛЛОВ × ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid">
      ${statCard('ШАНС ≥ E0', r.pE0*100, { decimals: 2, suffix: '%' })}
      ${statCard('СРЕД. КОПИЙ', r.avgCopies, { decimals: 2 })}
      ${statCard('СРЕД. ЖЕТОНОВ', r.avgTokens, { decimals: 2 })}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ ПОТЕНЦИАЛА</div>
    <div class="dist" id="distChart">${bars}</div>`;
  return { html, after: () => { animateStatCards(); animateDist(); attachRowTip(document.getElementById('distChart')); } };
}

/* ── РЕНДЕР: сколько до цели ── */
function renderReverse(r, p) {
  const html = `
    <div class="res-head">↘ СКОЛЬКО ПУЛЛОВ ДО E${p.target} <span class="rh-tech">// ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid four">
      ${statCard('СРЕДНЕЕ', r.mean, { decimals: 1, big: true })}
      ${statCard('МЕДИАНА', r.median, {})}
      ${statCard('ВЕЗУЧИЕ 10%', r.best10, {})}
      ${statCard('НЕВЕЗУЧИЕ 10%', r.worst10, {})}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ (гистограмма)</div>
    <div class="histo-wrap">
      <div class="histo-arcs" id="histoArcs"></div>
      <div class="histo" id="histo"></div>
      <div class="histo-markers" id="histoMarkers"></div>
    </div>
    <div class="res-note">// худший 1% случаев: <b>${r.worst1}</b> пуллов · <span class="rn-hint">Г — гарант, Ж1/Ж2… — гарантированные жетоны</span></div>`;
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
  const sub = single ? `// ОДИН ПРОКРУТ · ${p.pulls} ПУЛЛОВ`
                     : `// ${p.pulls} ПУЛЛОВ × ${r.trials.toLocaleString('ru')} ПРОГОНОВ · СРЕДНЕЕ`;

  const prizeCard = (icon, label, value, hint) => `
    <div class="prize-card">
      <img src="icons/${icon}" class="pz-ic">
      <div class="pz-body">
        <div class="pz-label">${label}</div>
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
      logHtml = '<div class="res-head sub">↘ ЛОГ СОБЫТИЙ</div><div class="evlog"><div class="ev ev-empty">// ни одного события за прокрут</div></div>';
    }
  }

  const html = `
    <div class="res-head">↘ ПОДСЧЁТ ПРИЗОВ <span class="rh-tech">${sub}</span></div>
    <div class="prize-grid four">
      ${prizeCard('Bond_Quota.png', 'БАЗОВЫЕ ТАЛОНЫ', base, 'за копии 6★/5★')}
      ${prizeCard('AIC_Quota.png', 'ТАЛОНЫ АПК', aic, 'за лишние жетоны 5★/4★')}
      ${prizeCard('Endpoint_Quota.png', 'ПРЕМИУМ-ТАЛОНЫ', prem, 'за лишние жетоны 6★')}
      ${prizeCard('Arsenal_Ticket.png', 'БИЛЕТЫ АРСЕНАЛА', arsenal, '2000/200/20 за 6★/5★/4★')}
    </div>
    <div class="res-head sub">↘ ВЫПАЛО ПО РЕДКОСТИ</div>
    <div class="stat-grid">
      ${statCard(rar(6), c6, { decimals: dec })}
      ${statCard(rar(5), c5, { decimals: dec })}
      ${statCard(rar(4), c4, { decimals: dec })}
    </div>
    <div class="res-head sub">↘ 6★ ПОИМЁННО</div>
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
function statCard(label, value, opts) {
  const id = 'sc' + Math.random().toString(36).slice(2, 8);
  const data = JSON.stringify({ value, ...opts });
  return `<div class="stat-card"><div class="sc-label">${label}</div>
    <div class="sc-value" id="${id}" data-anim='${data}'>0</div>
    <div class="sc-line"></div></div>`;
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
    col.dataset.tip = `${i*bucket}–${i*bucket+bucket-1} пуллов · ${c.toLocaleString('ru')} (${pctOfAll}%)`;
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
    { pull: 120, label: 'Г', tip: 'Гарант 120 — если rate-up не выпал за 120 платных пуллов, он гарантирован. Здесь «дозревают» невезучие прогоны.' },
    { pull: 240, label: 'Ж1', tip: '1-й гарантированный жетон (каждый 240-й пулл). Даёт +1 потенциал всем — отсюда ступенька.' },
    { pull: 480, label: 'Ж2', tip: '2-й гарантированный жетон (480-й пулл). Большинство добирает до E5 именно тут — главный пик.' },
    { pull: 720, label: 'Ж3', tip: '3-й гарантированный жетон (720-й пулл). Сюда доходят самые невезучие.' },
    { pull: 960, label: 'Ж4', tip: '4-й гарантированный жетон (960-й пулл).' },
  ].filter(e => e.pull <= maxPull);

  // позиция пулла в % ширины (центр соответствующей колонки)
  const posPct = pull => ((Math.floor(pull / bucket) + 0.5) / nCols) * 100;
  // маркеры снизу (на колонке, содержащей событие)
  events.forEach(e => {
    const m = document.createElement('div');
    m.className = 'hm';
    m.style.left = posPct(e.pull) + '%';
    m.dataset.tip = `${e.label} · ${e.pull} пуллов — ${e.tip}`;
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

// инициализация улучшенных полей (DOM уже готов — скрипт в конце body)
enhanceNumberInputs();
initDropdowns();

// смена под-режима призов (один/Монте) → обновить видимость числа прогонов
document.getElementById('inPrizeMode').addEventListener('change', () => {
  if (MODE === 'prizes') setMode('prizes');
});
