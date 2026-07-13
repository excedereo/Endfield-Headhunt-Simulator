/* ENDFIELD // UI-контроллер симулятора поставки арсенала (оружие) */
/* potentialIconHtml и ICON.* — общие хелперы, см. ui-common.js */

let WMODE = 'detailed';
const wTitles = {
  detailed: 'ОДНА ПОСТАВКА',
  monte: 'МОНТЕ-КАРЛО',
  reverse: 'СКОЛЬКО ДО ЦЕЛИ',
};
const wDescs = {
  detailed: 'Симулирует <b>один заход</b> на баннер поставки арсенала: крутим заданное число поставок ' +
            '(по 10 предметов оружия каждая) и смотрим, что выпало. Каждый 6★ и milestone-награда попадают в лог. ' +
            'Результат случайный — при повторном запуске будет другим.',
  monte: 'Прогоняет тот же заход <b>тысячи раз</b> и усредняет. Показывает честный шанс получить хотя бы одну копию ' +
         'rate-up оружия за это число поставок, среднее число копий rate-up/стандартных 6★/5★/4★ и накопленные талоны АПК.',
  reverse: 'Обратная задача: задаёшь <b>сколько копий</b> rate-up оружия нужно набрать, движок ищет, сколько поставок ' +
           'в среднем понадобится. Показывает среднее, медиану, везучие и невезучие 10% и гистограмму разброса.',
};

function wApplyDesc() {
  const el = document.getElementById('wModeDescText');
  if (!el) return;
  el.style.opacity = 0;
  setTimeout(() => { el.innerHTML = wDescs[WMODE]; el.style.opacity = 1; }, 120);
}

// кэш результатов по режимам (держится до перезагрузки страницы)
const WRES_KEY = 'endfield_weapon_results';
function wLoadResultsCache() {
  try { return JSON.parse(sessionStorage.getItem(WRES_KEY) || '{}'); } catch (e) { return {}; }
}
function wSaveResult(mode, html) {
  const c = wLoadResultsCache();
  c[mode] = html;
  try { sessionStorage.setItem(WRES_KEY, JSON.stringify(c)); } catch (e) {}
}

function wRebindTips(container) {
  const histo = container.querySelector('#wHisto');
  if (histo) attachHistoTip(histo);
  const markers = container.querySelector('#wHistoMarkers');
  if (markers) attachMarkerTip(markers);
}

function wRestoreResult(mode) {
  const res = document.getElementById('wResults');
  const resInner = document.getElementById('wResultsInner');
  if (!res || !resInner) return;
  const html = wLoadResultsCache()[mode];
  if (!html) { res.classList.remove('open', 'shown', 'no-anim'); resInner.innerHTML = ''; return; }
  res.classList.add('no-anim');
  resInner.innerHTML = html;
  wRebindTips(resInner);
  res.classList.add('open', 'shown');
  requestAnimationFrame(() => requestAnimationFrame(() => res.classList.remove('no-anim')));
}

function setWeaponMode(mode) {
  WMODE = mode;
  document.getElementById('wModeTitle').textContent = wTitles[WMODE];
  document.getElementById('wCtrlTrials').style.display = (mode === 'monte' || mode === 'reverse') ? '' : 'none';
  document.getElementById('wCtrlTarget').style.display = mode === 'reverse' ? '' : 'none';
  document.getElementById('wCtrlSupplies').style.display = mode === 'reverse' ? 'none' : '';
  wRestoreResult(mode);
  wApplyDesc();
  document.querySelectorAll('.sb-item').forEach(i => {
    if (i.dataset.wmode) i.classList.toggle('active', i.dataset.wmode === mode);
    else if (i.dataset.mode) i.classList.remove('active');
  });
  document.querySelectorAll('.np-btn').forEach(i => {
    if (i.dataset.wmode) i.classList.toggle('active', i.dataset.wmode === mode);
    else if (i.dataset.mode) i.classList.remove('active');
  });
}
window.setWeaponMode = setWeaponMode;

function wClampInt(id, lo, hi) {
  let v = parseInt(document.getElementById(id).value, 10);
  if (isNaN(v)) v = lo;
  v = Math.max(lo, Math.min(hi, v));
  document.getElementById(id).value = v;
  return v;
}

/* ── кнопка «Мои поставки»: сколько поставок можно себе позволить по билетам арсенала ── */
(function mineSuppliesBtn() {
  const btn = document.getElementById('wUseMineBtn');
  const cnt = document.getElementById('wMineCount');
  const inp = document.getElementById('wInSupplies');
  if (!btn) return;
  const read = () => {
    const tickets = parseInt(localStorage.getItem('endfield_arsenal_tickets') || '0', 10) || 0;
    return Math.floor(tickets / WCFG.PRICE_TICKETS);
  };
  cnt.textContent = read().toLocaleString('ru');
  btn.addEventListener('click', () => {
    const my = read();
    if (my < 1) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 400); return; }
    inp.value = Math.min(my, 500);
    inp.classList.add('flash');
    setTimeout(() => inp.classList.remove('flash'), 500);
  });
})();

/* ── Web Worker для тяжёлых режимов ── */
let weaponWorker = null;
function getWeaponWorker() {
  if (!weaponWorker) {
    try { weaponWorker = new Worker('weapon.worker.js'); }
    catch (e) { weaponWorker = null; }
  }
  return weaponWorker;
}
function runWeaponInWorker(mode, params, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWeaponWorker();
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

function runWeaponMode(mode, p) {
  if (mode === 'detailed') {
    return new Promise(resolve => requestAnimationFrame(() => {
      const r = weaponDetailedRun(p.supplies);
      p.setProg(1);
      resolve(renderWeaponDetailed(r, p));
    }));
  }
  const params = { supplies: p.supplies, trials: p.trials, target: p.target };
  const workerMode = mode === 'monte' ? 'wmonte' : 'wreverse';
  return runWeaponInWorker(workerMode, params, p.setProg)
    .then(r => mode === 'monte' ? renderWeaponMonte(r, p) : renderWeaponReverse(r, p))
    .catch(err => {
      if (err.message === 'no-worker') {
        return new Promise(resolve => requestAnimationFrame(() => {
          if (mode === 'monte') resolve(renderWeaponMonte(weaponMonteCarlo(p.supplies, p.trials, p.setProg), p));
          else resolve(renderWeaponReverse(weaponSuppliesUntil(p.target, p.trials, p.setProg), p));
        }));
      }
      throw err;
    });
}

/* ── РЕНДЕР: одна поставка ── */
function renderWeaponDetailed(r, p) {
  let rows = '';
  for (const e of r.events) {
    if (e.got6 || e.milestoneEvents.length) {
      const items6 = e.items.filter(it => it.rarity === 6);
      items6.forEach(it => {
        const label = it.rateup
          ? (e.forcedRateup ? 'RATE-UP · ГАРАНТ (8)' : 'RATE-UP · ВЫПАЛО')
          : (e.forced6 ? 'СТАНДАРТНОЕ 6★ · ГАРАНТ (4)' : 'СТАНДАРТНОЕ 6★');
        const cls = it.rateup ? 'ev-rateup' : 'ev-six';
        rows += `<div class="ev ${cls}"><span class="ev-n">#${String(e.supply).padStart(3,'0')}</span>
          <span class="ev-l">${label}</span></div>`;
      });
      e.milestoneEvents.forEach(m => {
        const label = m === 'box' ? 'Пополнение арсенала (выбор 6★)' : 'Гарант rate-up (milestone)';
        rows += `<div class="ev ev-token-row"><span class="ev-n">#${String(e.supply).padStart(3,'0')}</span>
          <span class="ev-l"><img src="icons/88px-Arsenal_Ticket_icon.png" class="ev-ic"> ${label}</span></div>`;
      });
    }
  }
  if (!rows) rows = '<div class="ev ev-empty">// ни одного 6★ за этот заход</div>';

  const potCard = `<div class="stat-card">
      <div class="sc-label">ПОТЕНЦИАЛ<span class="info" tabindex="0" data-info="Итоговый потенциал rate-up оружия на конец захода. E0 — первая копия (само оружие), E5 — максимум (5 копий сверху). Закрашенные клинки = набранные уровни.">?</span></div>
      <div class="sc-value">${potentialIconHtml(r.potential, { accent: true })}</div>
      <div class="sc-line"></div>
    </div>`;

  const html = `
    <div class="res-head">↘ РЕЗУЛЬТАТ ПОСТАВКИ <span class="rh-tech">// ${p.supplies} ПОСТАВОК · ${p.supplies * 10} ПРЕДМЕТОВ</span></div>
    <div class="stat-grid">
      ${potCard}
      ${statCard('КОПИЙ RATE-UP', r.rateupCopies, { icon: ICON.layers, info: 'Сколько раз за этот заход выпало именно rate-up оружие (натурально + гаранты).' })}
      ${statCard('СТАНДАРТНЫХ 6★', r.std6Copies, { icon: ICON.hashtag, info: 'Сколько раз выпало 6★ оружие без высокого шанса (не rate-up).' })}
      ${statCard('ТАЛОНОВ АПК', r.aicTickets, { icon: 'icons/88px-AIC_Quota_icon.png', info: 'Талоны АПК за все 5★/6★ предметы этого захода: 6★ → 50, 5★ → 10.' })}
    </div>
    <div class="res-head sub">↘ ЛОГ СОБЫТИЙ</div>
    <div class="evlog">${rows}</div>`;

  return { html, after: () => animateStatCards() };
}

/* ── РЕНДЕР: Монте-Карло ── */
function renderWeaponMonte(r, p) {
  const dist = r.potDist;
  let bars = `<div class="dist-row" data-tip="Нет rate-up: ${(r.noRateup*100).toFixed(2)}% прогонов"><span class="dr-l">НЕТ RATE-UP</span>
    <div class="dr-track"><div class="dr-fill neg" data-pct="${(r.noRateup*100).toFixed(2)}"></div></div>
    <span class="dr-v">${(r.noRateup*100).toFixed(2)}%</span></div>`;
  for (let e = 0; e <= 5; e++) {
    bars += `<div class="dist-row" data-tip="Потенциал E${e}: ${(dist[e]*100).toFixed(2)}% прогонов"><span class="dr-l">E${e}</span>
      <div class="dr-track"><div class="dr-fill" data-pct="${(dist[e]*100).toFixed(2)}"></div></div>
      <span class="dr-v">${(dist[e]*100).toFixed(2)}%</span></div>`;
  }
  const likely = mostLikelyPotential(r.noRateup, dist);
  const potCard = `<div class="stat-card">
      <div class="sc-label">САМЫЙ ВЕРОЯТНЫЙ ПОТЕНЦИАЛ<span class="info" tabindex="0" data-info="Уровень потенциала rate-up оружия, который выпадает чаще всего среди всех прогонов (мода распределения). Шанс именно этого исхода — ${(likely.chance*100).toFixed(1)}%.">?</span></div>
      <div class="sc-value">${potentialIconHtml(likely.level, { accent: true })}</div>
      <div class="sc-line"></div>
    </div>`;

  const html = `
    <div class="res-head">↘ МОНТЕ-КАРЛО <span class="rh-tech">// ${p.supplies} ПОСТАВОК × ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid">
      ${potCard}
      ${statCard('ШАНС ≥1 RATE-UP', r.pRateup*100, { decimals: 2, suffix: '%', icon: ICON.percent, pctColor: true, info: 'Доля прогонов, где выпала хотя бы одна копия rate-up оружия за указанное число поставок.' })}
      ${statCard('СРЕД. КОПИЙ RATE-UP', r.avgRateup, { decimals: 2, icon: ICON.layers, info: 'Среднее число копий rate-up оружия по всем прогонам.' })}
      ${dualStatCard(
          'СРЕД. ТАЛОНОВ АПК', r.avgAic.toFixed(1), 'icons/88px-AIC_Quota_icon.png',
          'СРЕД. ПРЕМИУМ-ТАЛОНОВ', r.avgPremium.toFixed(1), 'icons/88px-Endpoint_Quota_icon.png', { icon2Native: true })}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ ПОТЕНЦИАЛА<span class="info" tabindex="0" data-info="Какая доля прогонов закончилась на каждой фазе потенциала E0–E5 rate-up оружия (и сколько вообще не получили его). Показывает не «сколько в среднем», а весь разброс исходов.">?</span></div>
    <div class="dist" id="wDistChart">${bars}</div>
    <div class="res-head sub">↘ СРЕДНЕЕ ПО РЕДКОСТИ</div>
    <div class="stat-card-solo">
      ${multiStatCard([
          { label: 'СТАНДАРТНЫХ 6★', value: r.avgStd6.toFixed(2), icon: 'icons/32px-Rarity_6.webp' },
          { label: '5★', value: r.avgFive.toFixed(2), icon: 'icons/32px-Rarity_5.webp' },
          { label: '4★', value: r.avgFour.toFixed(2), icon: 'icons/32px-Rarity_4.webp' },
        ], { title: 'РЕДКОСТЬ ПРЕДМЕТОВ', info: `Средние числа выпавших предметов по редкости за заход (за ${p.supplies} поставок × 10 предметов).` })}
    </div>`;
  return { html, after: () => { animateStatCards(); animateDist(); attachRowTip(document.getElementById('wDistChart')); } };
}

/* ── РЕНДЕР: сколько до цели ── */
function renderWeaponReverse(r, p) {
  const html = `
    <div class="res-head">↘ СКОЛЬКО ПОСТАВОК ДО E${p.target} RATE-UP <span class="rh-tech">// ${r.trials.toLocaleString('ru')} ПРОГОНОВ</span></div>
    <div class="stat-grid four">
      ${statCard('СРЕДНЕЕ', r.mean, { decimals: 1, big: true, icon: ICON.chartLine, info: 'Среднее число поставок до цели по всем прогонам.' })}
      ${statCard('МЕДИАНА', r.median, { icon: ICON.chartBar, info: 'Половина прогонов уложится в это число поставок или меньше.' })}
      ${dualStatCard(
          'ВЕЗУЧИЕ 10%', r.best10, ICON.trendUp,
          'НЕВЕЗУЧИЕ 10%', r.worst10, ICON.trendDown,
          {
            topInfo: 'Если бы 100 разных игроков делали поставки до этой цели, 10 самых везучих из них закрыли бы её за это число поставок или даже быстрее. Это твой «повезло» сценарий — на него рассчитывать не стоит, но шанс есть.',
            botInfo: 'Если бы 100 разных игроков делали поставки до этой цели, 10 самых невезучих из них потратили бы на неё это число поставок или даже больше. Закладывай именно эту цифру в бюджет билетов, если не хочешь остаться без ресурсов на середине пути.',
          })}
    </div>
    <div class="res-head sub">↘ РАСПРЕДЕЛЕНИЕ (гистограмма)</div>
    <div class="histo-wrap">
      <div class="histo" id="wHisto"></div>
    </div>
    <div class="res-note">// худший 1% случаев: <b>${r.worst1}</b> поставок</div>`;
  return { html, after: () => { animateStatCards(); wDrawHisto(r); } };
}

function wDrawHisto(r) {
  let bucket, counts;
  if (r.histo) { bucket = r.histo.bucket; counts = r.histo.counts; }
  else return;
  const peak = Math.max(...counts, 1);
  const total = counts.reduce((a, b) => a + b, 0);
  const host = document.getElementById('wHisto');
  if (!host) return;
  host.innerHTML = '';
  counts.forEach((c, i) => {
    const col = document.createElement('div');
    col.className = 'hb-col';
    const pctOfAll = total ? (c / total * 100).toFixed(1) : 0;
    col.dataset.tip = `${i*bucket}–${i*bucket+bucket-1} поставок · ${c.toLocaleString('ru')} (${pctOfAll}%)`;
    const bar = document.createElement('div');
    bar.className = 'hb';
    col.appendChild(bar);
    host.appendChild(col);
    setTimeout(() => { bar.style.height = (c / peak * 100) + '%'; }, i * 14);
  });
  attachHistoTip(host);
}

/* ── запуск ── */
document.addEventListener('DOMContentLoaded', wInitRunButton);
if (document.readyState !== 'loading') wInitRunButton();

function wInitRunButton() {
  const runBtn = document.getElementById('wRunBtn');
  if (!runBtn || runBtn.dataset.wInit) return;
  runBtn.dataset.wInit = '1';

  runBtn.addEventListener('click', () => {
    const supplies = wClampInt('wInSupplies', 1, 500);
    const trials = wClampInt('wInTrials', 1000, 300000);
    const targetRaw = parseInt(document.getElementById('wInTarget').value, 10);
    const target = isNaN(targetRaw) ? 0 : targetRaw;

    const res = document.getElementById('wResults');
    const resInner = document.getElementById('wResultsInner');
    res.classList.remove('open', 'shown', 'no-anim');
    setTimeout(() => { resInner.innerHTML = ''; }, 200);

    const simbar = document.getElementById('wSimbar');
    const fill = document.getElementById('wSimFill');
    const pct = document.getElementById('wSimPct');
    const status = document.getElementById('wSimStatus');
    simbar.classList.remove('hidden');
    fill.style.width = '0%';
    pct.textContent = '0%';
    runBtn.disabled = true;
    runBtn.classList.add('loading');
    runBtn.style.setProperty('--prog', '0%');

    const setProg = f => {
      const p = Math.floor(f * 100);
      fill.style.width = p + '%';
      pct.textContent = p + '%';
      runBtn.style.setProperty('--prog', p + '%');
    };

    status.textContent = 'INITIALIZING ENGINE…';
    setTimeout(() => {
      status.textContent = 'COMPUTING…';
      runWeaponMode(WMODE, { supplies, trials, target, setProg }).then(html => {
        setProg(1);
        status.textContent = 'DONE ✓';
        setTimeout(() => {
          simbar.classList.add('hidden');
          runBtn.classList.remove('loading');
          runBtn.style.setProperty('--prog', '0%');
          runBtn.disabled = false;
          resInner.innerHTML = html.html;
          requestAnimationFrame(() => requestAnimationFrame(() => res.classList.add('open')));
          res.addEventListener('transitionend', function onEnd(e) {
            if (e.propertyName === 'grid-template-rows') {
              res.classList.add('shown');
              res.removeEventListener('transitionend', onEnd);
            }
          });
          html.after && html.after();
          const cols = resInner.querySelectorAll('.hb, .hb-col').length;
          setTimeout(() => wSaveResult(WMODE, resInner.innerHTML), Math.max(1400, cols * 14 + 600));
        }, 350);
      });
    }, 500);
  });

  // инициализация видимости и описания при первой загрузке
  document.getElementById('wCtrlTrials').style.display = 'none';
  document.getElementById('wModeDescText').innerHTML = wDescs.detailed;
  wRestoreResult(WMODE);
}
