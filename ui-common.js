/* ENDFIELD // Общие UI-хелперы, используемые несколькими симуляторами (операторы + оружие) */

/* ── Иконка потенциала (переиспользуемая, глобальная) ──
   5 клинков-«лезвий», порядок E1→E5 закреплён вручную по дизайну:
   E1=верх, E2=верх-лево, E3=низ-лево, E4=низ-право, E5=верх-право.
   level: null/0..5. null или 0 — все клинки погашены (#555), N — первые N закрашены белым. */
const POT_BLADE_PATHS = [
  'M315.55 159.5L94.5496 0L117.55 64L340.05 226L315.55 159.5Z',                                  // E1
  'M219.038 87.8458L0 250.029L67.9615 247.533L289.837 84.6791L219.038 87.8458Z',                 // E2
  'M117.816 160.075L204.352 418.518L222.985 353.113L136.688 91.7648L117.816 160.075Z',           // E3
  'M159.926 275.585L432.471 274.947L376.277 236.643L101.05 236.137L159.926 275.585Z',            // E4
  'M275.996 275.211L360.205 16L306.315 57.4837L220.186 318.888L275.996 275.211Z',                // E5
];
function potentialIconSvg(level) {
  const n = Math.max(0, Math.min(5, level || 0));
  const paths = POT_BLADE_PATHS.map((d, i) =>
    `<path class="pot-blade${i < n ? ' on' : ''}" d="${d}"></path>`).join('');
  return `<svg viewBox="0 0 435 419">${paths}</svg>`;
}
// готовая обёртка с подписью EN — level: null (нет копий) или 0..5
function potentialIconHtml(level, opts) {
  const accent = opts && opts.accent ? ' pot-accent' : '';
  const label = level === null ? '— НЕТ' : 'E' + level;
  return `<span class="pot-icon${accent}">${potentialIconSvg(level)}<span class="pot-label">${label}</span></span>`;
}
window.potentialIconHtml = potentialIconHtml;

/* находит наиболее вероятный исход потенциала: null («нет rate-up/6★») либо 0..5 (E0..E5).
   noRateup — доля прогонов без единой копии, dist — массив долей [E0..E5]. */
function mostLikelyPotential(noRateup, dist) {
  let best = null, bestP = noRateup;
  for (let e = 0; e <= 5; e++) {
    if (dist[e] > bestP) { bestP = dist[e]; best = e; }
  }
  return { level: best, chance: bestP };
}
window.mostLikelyPotential = mostLikelyPotential;

/* ── Пути к FontAwesome-иконкам для статкарточек (icons/ui/*.svg) ── */
const ICON = {
  layers: 'icons/ui/layers.svg',
  hashtag: 'icons/ui/hashtag.svg',
  clock: 'icons/ui/clock.svg',
  percent: 'icons/ui/percent.svg',
  chartLine: 'icons/ui/chart-line.svg',
  chartBar: 'icons/ui/chart-bar.svg',
  trendUp: 'icons/ui/trend-up.svg',
  trendDown: 'icons/ui/trend-down.svg',
};
window.ICON = ICON;

/* ── Справка «как устроен баннер» — модалка, официальный язык, визуально структурировано ── */
const BANNER_INFO = {
  sim: {
    title: '// СВЕДЕНИЯ О НАЙМЕ',
    html: `
      <h3>Базовые шансы на один прогон</h3>
      <div class="bi-rates">
        <div class="bi-rate bi-rate-6"><span class="bi-rate-label">6★</span><span class="bi-rate-val">0.8%</span></div>
        <div class="bi-rate bi-rate-5"><span class="bi-rate-label">5★</span><span class="bi-rate-val">8%</span></div>
        <div class="bi-rate bi-rate-4"><span class="bi-rate-label">4★</span><span class="bi-rate-val">91.2%</span></div>
      </div>
      <p>Указанные значения — вероятность каждого отдельного прогона найма. Результат каждого прогона
      независим: итоговая частота выпадений приближается к этим показателям только на больших объёмах.</p>

      <h3>Система пити</h3>
      <p>Начиная с <span class="bi-hl">65-го</span> прогона без 6★ вероятность выпадения 6★ возрастает
      с каждым последующим прогоном. На <span class="bi-hl bi-hl-strong">80-м</span> прогоне без 6★
      вероятность достигает <span class="bi-hl bi-hl-strong">100%</span> — 6★ гарантирован. Счётчик
      сохраняется между баннерами и не обнуляется при их смене.</p>

      <h3>Целевой оператор баннера (rate-up)</h3>
      <p>При выпадении 6★ вероятность того, что это оператор повышенного шанса (rate-up) данного баннера,
      составляет <span class="bi-hl">50%</span>. С равной вероятностью может выпасть другой доступный
      оператор редкости 6★.</p>

      <h3>Гарантия на 120-м прогоне</h3>
      <p>Если целевой оператор баннера не был получен платно в течение
      <span class="bi-hl bi-hl-strong">120</span> прогонов, на <span class="bi-hl bi-hl-strong">120-м</span>
      прогоне он гарантируется. Действует один раз за баннер: после получения целевого оператора
      (естественным образом или по гарантии) счётчик обнуляется.</p>

      <h3>Жетоны и потенциал (E0–E5)</h3>
      <p>Первая полученная копия целевого оператора соответствует уровню потенциала <b>E0</b>. Каждая
      последующая копия предоставляет жетон, повышающий потенциал на 1 уровень — до максимального
      <b>E5</b> (требуется 6 копий). Жетон дополнительно выдаётся за каждый
      <span class="bi-hl">240-й</span> прогон найма независимо от результата.</p>`,
  },
  weapon: {
    title: '// СВЕДЕНИЯ О ПОСТАВКЕ АРСЕНАЛА',
    html: `
      <h3>Единица поставки</h3>
      <p>Одна поставка оружия содержит <span class="bi-hl bi-hl-strong">10</span> предметов. Указанные ниже
      вероятности применяются к каждому предмету поставки независимо.</p>
      <div class="bi-rates">
        <div class="bi-rate bi-rate-6"><span class="bi-rate-label">6★</span><span class="bi-rate-val">4%</span></div>
        <div class="bi-rate bi-rate-5"><span class="bi-rate-label">5★</span><span class="bi-rate-val">15%</span></div>
        <div class="bi-rate bi-rate-4"><span class="bi-rate-label">4★</span><span class="bi-rate-val">81%</span></div>
      </div>
      <p>Каждая поставка гарантированно содержит не менее одного предмета редкости 5★ или выше. Если
      случайным образом такой предмет не выпал, последняя позиция поставки принудительно заменяется на 5★.</p>

      <h3>Целевое оружие баннера (rate-up)</h3>
      <p>При выпадении 6★ предмета вероятность того, что это целевое оружие баннера (rate-up), составляет
      <span class="bi-hl">25%</span>. Оставшиеся 75% распределяются между доступными стандартными
      предметами редкости 6★.</p>

      <h3>Гарантии поставки</h3>
      <p>Действуют два независимых счётчика, отсчитываемых поставками (не отдельными предметами):</p>
      <ul>
        <li><b>Гарантия 6★.</b> Если 3 поставки подряд не содержали ни одного предмета 6★, на
        <span class="bi-hl bi-hl-strong">4-й</span> поставке 6★ гарантируется (без привязки к rate-up).</li>
        <li><b>Гарантия rate-up.</b> Если 7 поставок подряд не содержали целевое оружие, на
        <span class="bi-hl bi-hl-strong">8-й</span> поставке оно гарантируется. После срабатывания —
        естественного или по гарантии — счётчик обнуляется.</li>
      </ul>

      <h3>Пороговые награды</h3>
      <p>Начиная с <span class="bi-hl">10-й</span> поставки и далее каждые <span class="bi-hl">8</span>
      поставок (18-я, 26-я, 34-я и т.д.) начисляется гарантированная награда. Тип награды чередуется:</p>
      <ul>
        <li>Право выбора одного стандартного предмета 6★ (без rate-up).</li>
        <li>Гарантированная копия целевого оружия баннера (rate-up).</li>
      </ul>

      <h3>Потенциал целевого оружия (E0–E5)</h3>
      <p>Первая полученная копия целевого оружия соответствует уровню потенциала <b>E0</b>. Каждая
      последующая копия повышает потенциал на 1 уровень — до максимального <b>E5</b> (требуется 6 копий,
      включая первую).</p>`,
  },
};

function openBannerInfo(key) {
  const info = BANNER_INFO[key];
  if (!info) return;
  document.getElementById('bannerInfoTitle').textContent = info.title;
  document.getElementById('bannerInfoBody').innerHTML = info.html;
  document.getElementById('bannerInfoOverlay').classList.remove('hidden');
}
function closeBannerInfo() {
  document.getElementById('bannerInfoOverlay').classList.add('hidden');
}
document.addEventListener('DOMContentLoaded', initBannerInfo);
if (document.readyState !== 'loading') initBannerInfo();
function initBannerInfo() {
  const overlay = document.getElementById('bannerInfoOverlay');
  if (!overlay || overlay.dataset.init) return;
  overlay.dataset.init = '1';
  document.querySelectorAll('[data-banner-info]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openBannerInfo(btn.dataset.bannerInfo);
    });
  });
  document.getElementById('bannerInfoClose').addEventListener('click', closeBannerInfo);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeBannerInfo(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeBannerInfo();
  });
}
