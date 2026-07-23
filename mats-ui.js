/* ENDFIELD // UI вкладки «Подсчёт ресурсов развития» */

function buildMatGrids() {
  const hosts = {
    op: document.getElementById('matGridOp'),
    weapon: document.getElementById('matGridWeapon'),
    both: document.getElementById('matGridBoth'),
    other: document.getElementById('matGridOther'),
  };
  if (!hosts.op) return;
  Object.values(hosts).forEach(h => { h.innerHTML = ''; });

  MATERIALS.forEach(m => {
    const host = hosts[m.group];
    if (!host) return;
    const cell = document.createElement('div');
    cell.className = 'mat-cell';
    // подпись «сколько опыта даёт» — только у EXP-предметов
    const expTag = m.exp ? `<span class="mc-exp">${m.exp.toLocaleString('ru')} EXP</span>` : '';
    cell.innerHTML = `
      <img src="${m.icon}" class="mc-ic" alt="">
      <div class="mc-body">
        <div class="mc-name">${m.name}${expTag}</div>
        <input type="number" class="mc-input" id="mat_${m.id}" min="0" value="0" placeholder="0">
      </div>`;
    host.appendChild(cell);

    const input = cell.querySelector('.mc-input');
    input.value = matState[m.id] || 0;
    cell.classList.toggle('filled', (matState[m.id] || 0) > 0);
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10);
      matState[m.id] = isNaN(v) || v < 0 ? 0 : v;
      cell.classList.toggle('filled', matState[m.id] > 0);
      saveMats();
      renderMats();
    });
  });
}

// «2.4» → показываем и целое, и дробную часть: важно понимать, что до третьего чуть-чуть
function fmtCapacity(n) {
  if (!isFinite(n) || n <= 0) return '0';
  return n >= 10 ? String(Math.floor(n)) : (Math.floor(n * 10) / 10).toFixed(1);
}

function renderMats() {
  const r = matsCompute();

  document.getElementById('mtOpVal').textContent = fmtCapacity(r.op.full);
  document.getElementById('mtWpVal').textContent = fmtCapacity(r.wp.full);
  document.getElementById('mtOpLim').textContent = r.op.full > 0 || anyMatFilled()
    ? 'ограничивает: ' + r.op.limiter : '';
  document.getElementById('mtWpLim').textContent = r.wp.full > 0 || anyMatFilled()
    ? 'ограничивает: ' + r.wp.limiter : '';

  document.getElementById('mtOp').classList.toggle('empty', !(r.op.full >= 1));
  document.getElementById('mtWp').classList.toggle('empty', !(r.wp.full >= 1));

  // Т-кредиты общие для операторов и оружия — оценки нельзя складывать
  const note = document.getElementById('matTcredNote');
  note.textContent = r.tcredsShared
    ? '// Т-кредиты тратятся и на операторов, и на оружие — обе оценки считаются независимо, вместе столько не выйдет'
    : '';

  renderShortage();
}

function anyMatFilled() {
  return MATERIALS.some(m => (matState[m.id] || 0) > 0);
}

// компактные числа, как в игре: 280 480 → «280 480», 1 800 000 → «1,8 млн»
function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1000000) return (Math.round(n / 100000) / 10).toLocaleString('ru') + ' млн';
  if (a >= 10000) return (Math.round(n / 100) / 10).toLocaleString('ru') + 'K';
  return Math.round(n).toLocaleString('ru');
}

// единый список ресурсов под каждой колонкой: иконка, название, всего, разница
function renderShortage() {
  shortageInto('mtOpShort', 'op', 'оператора');
  shortageInto('mtWpShort', 'wp', 'единицы оружия');
}

function shortageInto(hostId, target, unitWord) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const b = matsBreakdown(target);

  const title = b.missing.length === 0
    ? `<div class="mts-title ok">✓ хватает на ${b.target}-го ${unitWord}</div>`
    : `<div class="mts-title">// НЕ ХВАТАЕТ ДО ${b.target}-го ${unitWord.toUpperCase()}</div>`;

  host.innerHTML = title + b.rows.map(row => {
    // всё, кроме Т-кредитов, — штуки: показываем целыми. Т-кредиты сокращаем (их миллионы).
    const asPieces = row.id !== 'tcreds';
    const fmt = val => asPieces ? Math.floor(val).toLocaleString('ru') : fmtShort(val);
    const sign = row.diff < 0 ? '−' : '+';
    // из чего собран опыт: «20×подробные записи боя + 300×промежуточные…»
    const from = row.from ? `<span class="mts-from">${row.from}</span>` : '';
    // запас сверх цели, выраженный в единицах: «+600 (18)» — хватит ещё на 18
    const spare = row.spare > 0 ? `<span class="mts-spare">(${row.spare})</span>` : '';
    return `
    <div class="mts-row${row.diff < 0 ? ' lack' : ''}">
      <img class="mts-ic" src="${row.icon}" alt="">
      <span class="mts-name">${row.name}${from}</span>
      <span class="mts-have">${fmt(row.have)}</span>
      <span class="mts-diff ${row.diff < 0 ? 'neg' : 'pos'}">${sign}${fmt(Math.abs(row.diff))}${spare}</span>
    </div>`;
  }).join('');
}

// справка: во что обходится одна полная прокачка
function renderMatRef() {
  const host = document.getElementById('matRef');
  if (!host) return;
  const R = MAT_RATES;
  const rows = [
    ['ОПЕРАТОР 1→90', [
      ['EXP записей боя (ур. 1-60)', R.OP_EXP_TO_60],
      ['EXP когнитивных носителей (ур. 61-90)', R.OP_EXP_60_TO_90],
      ['Т-кредиты (прокачка + повышения)', R.OP_TCREDS_LEVEL + R.OP_TCREDS_PROMO],
      ['Протодиски', R.OP_PROTODISK],
      ['Протонаборы', R.OP_PROTOSET],
    ]],
    ['ОРУЖИЕ 1→90', [
      ['EXP тест-материалов', R.WP_EXP],
      ['Т-кредиты (прокачка + настройка)', R.WP_TCREDS_LEVEL + R.WP_TCREDS_TUNING],
      ['Литейные формы', R.WP_CAST_DIE],
      ['Тяжёлые литейные формы', R.WP_HEAVY_CAST_DIE],
    ]],
  ];
  host.innerHTML = rows.map(([title, items]) => `
    <div class="mr-block">
      <div class="mr-title">// ${title}</div>
      ${items.map(([n, v]) => `<div class="mr-row"><span>${n}</span><b>${v.toLocaleString('ru')}</b></div>`).join('')}
    </div>`).join('') +
    `<div class="mr-src">// данные: endfield.wiki.gg · повышения также требуют материалов,
      которых нет в списке (болеты, грибы, минералы) — они в расчёт не входят</div>`;
}

function initMats() {
  if (!document.getElementById('matGridOp')) return;
  loadMats();
  buildMatGrids();
  renderMatRef();
  renderMats();
}
