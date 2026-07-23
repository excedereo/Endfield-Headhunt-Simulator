/* ENDFIELD // Подсчёт ресурсов развития
   Данные по стоимости прокачки взяты с Endfield Talos Wiki (endfield.wiki.gg):
   страницы Operator, Weapon и страницы самих материалов.

   Ключевая механика: у операторов EXP разделён на ДВА непересекающихся пула —
   записи боя работают только на уровнях 1-60, когнитивные носители только на 61-90.
   У оружия такого деления нет: все три материала идут на весь диапазон 1-90. */

const MAT_RATES = {
  // ── операторы ──
  OP_EXP_TO_60: 747110,          // накопительно EXP до 60 ур. (только записи боя)
  OP_EXP_60_TO_90: 1045180,      // 1 792 290 − 747 110 (только когнитивные носители)
  OP_TCREDS_LEVEL: 385420,       // T-креды за прокачку 1→90
  OP_TCREDS_PROMO: 126100,       // T-креды за все 4 повышения (1600+6500+18000+100000)
  OP_PROTODISK: 33,              // 8 + 25 (повышения I и II)
  OP_PROTOSET: 60,               // 24 + 36 (повышения III и IV)

  // ── оружие ──
  WP_EXP: 2524080,               // накопительно EXP до 90 ур. (материалы не делятся по уровням)
  WP_TCREDS_LEVEL: 341390,       // T-креды за прокачку 1→90
  WP_TCREDS_TUNING: 125700,      // T-креды за все 4 настройки (2200+8500+25000+90000)
  WP_CAST_DIE: 23,               // 5 + 18 (настройки 1 и 2)
  WP_HEAVY_CAST_DIE: 50,         // 20 + 30 (настройки 3 и 4)
};

/* Поля ввода. group — к чему относится ресурс, exp — сколько EXP даёт единица.
   pool: 'op160' | 'op6190' | 'wp' | null (не EXP-предмет) */
const MATERIALS = [
  // оружейные материалы прокачки
  { id: 'castDie',      name: 'Литейная форма',            icon: 'icons/mat/Cast_Die.png',                    group: 'weapon' },
  { id: 'heavyCastDie', name: 'Тяжёлая литейная форма',    icon: 'icons/mat/Heavy_Cast_Die.png',              group: 'weapon' },
  { id: 'armsSet',      name: 'Тест-комплект для оружия',  icon: 'icons/mat/Arms_INSP_Set.png',               group: 'weapon', exp: 10000, pool: 'wp' },
  { id: 'armsKit',      name: 'Тест-набор для оружия',     icon: 'icons/mat/Arms_INSP_Kit.png',               group: 'weapon', exp: 1000,  pool: 'wp' },
  { id: 'armsInsp',     name: 'Тестер оружия',             icon: 'icons/mat/Arms_Inspector.png',              group: 'weapon', exp: 200,   pool: 'wp' },
  // операторские: когнитивные носители (61-90)
  { id: 'cogAdv',       name: 'Улучшенный когнитивный носитель', icon: 'icons/mat/Advanced_Cognitive_Carrier.png',   group: 'op', exp: 10000, pool: 'op6190' },
  { id: 'cogElem',      name: 'Базовый когнитивный носитель',    icon: 'icons/mat/Elementary_Cognitive_Carrier.png', group: 'op', exp: 1000,  pool: 'op6190' },
  // операторские: записи боя (1-60)
  { id: 'recAdv',       name: 'Подробные записи боя',      icon: 'icons/mat/Advanced_Combat_Record.png',      group: 'op', exp: 10000, pool: 'op160' },
  { id: 'recInt',       name: 'Промежуточные записи боя',  icon: 'icons/mat/Intermediate_Combat_Record.png',  group: 'op', exp: 1000,  pool: 'op160' },
  { id: 'recElem',      name: 'Базовые записи боя',        icon: 'icons/mat/Elementary_Combat_Record.png',    group: 'op', exp: 200,   pool: 'op160' },
  // прото-материалы (повышения операторов)
  { id: 'protoset',     name: 'Протонабор',                icon: 'icons/mat/Protoset.png',                    group: 'op' },
  { id: 'protodisk',    name: 'Протодиск',                 icon: 'icons/mat/Protodisk.png',                   group: 'op' },
  { id: 'protohedron',  name: 'Протоэдр',                  icon: 'icons/mat/Protohedron.png',                 group: 'other' },
  { id: 'protoprism',   name: 'Протопризма',               icon: 'icons/mat/Protoprism.png',                  group: 'other' },
  // валюта
  { id: 'tcreds',       name: 'Т-кредиты',                 icon: 'icons/mat/T-Creds.png',                     group: 'both' },
];

const MATS_KEY = 'endfield_mats_v1';
const matState = {};

function loadMats() {
  try {
    const raw = JSON.parse(localStorage.getItem(MATS_KEY) || '{}');
    MATERIALS.forEach(m => { matState[m.id] = Number(raw[m.id]) || 0; });
  } catch (e) {
    MATERIALS.forEach(m => { matState[m.id] = 0; });
  }
}
function saveMats() {
  try { localStorage.setItem(MATS_KEY, JSON.stringify(matState)); } catch (e) {}
  // в облако пишем с задержкой: ввод числа шлёт событие на каждый символ
  if (window.Cloud && Cloud.isSignedIn) {
    clearTimeout(saveMats._t);
    saveMats._t = setTimeout(() => Cloud.pushMaterials(matState), 800);
  }
}

/* Подтягивание ресурсов при входе в аккаунт.
   Облако — источник истины, если там что-то есть; если пусто, а локально данные набраны —
   заливаем их наверх. При ошибке чтения локальное не трогаем (см. историю с 403). */
async function syncMaterials() {
  if (!window.Cloud || !Cloud.isSignedIn) return false;
  const cloud = await Cloud.pullMaterials();
  if (cloud === null) return false;                    // ошибка — работаем на локальных

  const cloudHasData = Object.values(cloud).some(v => Number(v) > 0);
  if (cloudHasData) {
    MATERIALS.forEach(m => { matState[m.id] = Number(cloud[m.id]) || 0; });
    try { localStorage.setItem(MATS_KEY, JSON.stringify(matState)); } catch (e) {}
    return true;
  }
  const localHasData = MATERIALS.some(m => (matState[m.id] || 0) > 0);
  if (localHasData) await Cloud.pushMaterials(matState);
  return false;
}

/* ── РАСЧЁТ ──
   «На скольких хватит» считаем по-простому: суммарный EXP делим на потребность.
   Излишек EXP сверх лимита уровня в игре сгорает, но это зависит от того, как игрок
   скармливает предметы, поэтому в расчёт не закладывается. */
function matsCompute() {
  const v = id => matState[id] || 0;

  // EXP по пулам
  const expOp160 = v('recAdv') * 10000 + v('recInt') * 1000 + v('recElem') * 200;
  const expOp6190 = v('cogAdv') * 10000 + v('cogElem') * 1000;
  const expWp = v('armsSet') * 10000 + v('armsKit') * 1000 + v('armsInsp') * 200;

  // сколько операторов можно довести до 90: ограничение по худшему из ресурсов
  const opByExp160 = expOp160 / MAT_RATES.OP_EXP_TO_60;
  const opByExp6190 = expOp6190 / MAT_RATES.OP_EXP_60_TO_90;
  const opByDisk = v('protodisk') / MAT_RATES.OP_PROTODISK;
  const opBySet = v('protoset') / MAT_RATES.OP_PROTOSET;
  const opTcredsEach = MAT_RATES.OP_TCREDS_LEVEL + MAT_RATES.OP_TCREDS_PROMO;
  const opByTcreds = v('tcreds') / opTcredsEach;
  const opFull = Math.min(opByExp160, opByExp6190, opByDisk, opBySet, opByTcreds);

  // сколько единиц оружия можно довести до 90
  const wpByExp = expWp / MAT_RATES.WP_EXP;
  const wpByDie = v('castDie') / MAT_RATES.WP_CAST_DIE;
  const wpByHeavy = v('heavyCastDie') / MAT_RATES.WP_HEAVY_CAST_DIE;
  const wpTcredsEach = MAT_RATES.WP_TCREDS_LEVEL + MAT_RATES.WP_TCREDS_TUNING;
  const wpByTcreds = v('tcreds') / wpTcredsEach;
  const wpFull = Math.min(wpByExp, wpByDie, wpByHeavy, wpByTcreds);

  // дефицит до ближайшей целой единицы (сколько не хватает на ещё одного/одну)
  const need = (have, per, count) => Math.max(0, Math.ceil(per * count) - have);
  const opNext = Math.floor(opFull) + 1;
  const wpNext = Math.floor(wpFull) + 1;

  return {
    expOp160, expOp6190, expWp,
    op: {
      full: opFull,
      limiter: limiterName([
        [opByExp160, 'записи боя (1-60)'], [opByExp6190, 'когнитивные носители (61-90)'],
        [opByDisk, 'протодиски'], [opBySet, 'протонаборы'], [opByTcreds, 'Т-кредиты'],
      ]),
      nextTarget: opNext,
      missing: [
        { name: 'EXP записей боя (1-60)',        need: need(expOp160, MAT_RATES.OP_EXP_TO_60, opNext) },
        { name: 'EXP когнитивных носителей',     need: need(expOp6190, MAT_RATES.OP_EXP_60_TO_90, opNext) },
        { name: 'Протодиски',                    need: need(v('protodisk'), MAT_RATES.OP_PROTODISK, opNext) },
        { name: 'Протонаборы',                   need: need(v('protoset'), MAT_RATES.OP_PROTOSET, opNext) },
        { name: 'Т-кредиты',                     need: need(v('tcreds'), opTcredsEach, opNext) },
      ].filter(x => x.need > 0),
    },
    wp: {
      full: wpFull,
      limiter: limiterName([
        [wpByExp, 'тест-материалы'], [wpByDie, 'литейные формы'],
        [wpByHeavy, 'тяжёлые литейные формы'], [wpByTcreds, 'Т-кредиты'],
      ]),
      nextTarget: wpNext,
      missing: [
        { name: 'EXP тест-материалов',           need: need(expWp, MAT_RATES.WP_EXP, wpNext) },
        { name: 'Литейные формы',                need: need(v('castDie'), MAT_RATES.WP_CAST_DIE, wpNext) },
        { name: 'Тяжёлые литейные формы',        need: need(v('heavyCastDie'), MAT_RATES.WP_HEAVY_CAST_DIE, wpNext) },
        { name: 'Т-кредиты',                     need: need(v('tcreds'), wpTcredsEach, wpNext) },
      ].filter(x => x.need > 0),
    },
    tcredsShared: v('tcreds') > 0,
  };
}

// что именно ограничивает — ресурс с наименьшим покрытием
function limiterName(pairs) {
  let best = null, min = Infinity;
  pairs.forEach(([val, name]) => { if (val < min) { min = val; best = name; } });
  return best;
}

/* Построчная сводка «всего / нужно / разница» для панели дефицита.
   target: 'op' | 'wp' — до следующей целой единицы соответствующего типа.
   diff < 0 — нехватка (красным), diff >= 0 — запас (зелёным). */
function matsBreakdown(target) {
  const v = id => matState[id] || 0;
  const r = matsCompute();
  const n = target === 'op' ? r.op.nextTarget : r.wp.nextTarget;
  const R = MAT_RATES;

  // EXP-строки показываем в штуках самого крупного предмета пула (10 000 EXP):
  // «не хватает 70 подробных записей» понятнее, чем «не хватает 700 000 EXP».
  const TOP = 10000;
  const inTop = exp => exp / TOP;

  // из чего сложился опыт пула — чтобы цифра «70 подробных» не выглядела взятой с потолка
  const parts = ids => ids
    .filter(id => v(id) > 0)
    .map(id => v(id) + '×' + MATERIALS.find(m => m.id === id).name.toLowerCase())
    .join(' + ');

  const rows = target === 'op' ? [
    { id: 'expOp160',  name: 'Подробные записи боя (ур. 1-60)', icon: 'icons/mat/Advanced_Combat_Record.png',
      have: inTop(r.expOp160),  need: inTop(R.OP_EXP_TO_60 * n),    piece: true,
      from: parts(['recAdv', 'recInt', 'recElem']), perUnit: inTop(R.OP_EXP_TO_60) },
    { id: 'expOp6190', name: 'Улучшенные носители (ур. 61-90)',  icon: 'icons/mat/Advanced_Cognitive_Carrier.png',
      have: inTop(r.expOp6190), need: inTop(R.OP_EXP_60_TO_90 * n), piece: true,
      from: parts(['cogAdv', 'cogElem']), perUnit: inTop(R.OP_EXP_60_TO_90) },
    { id: 'protodisk', name: 'Протодиски',                   icon: 'icons/mat/Protodisk.png',
      have: v('protodisk'), need: R.OP_PROTODISK * n, perUnit: R.OP_PROTODISK },
    { id: 'protoset',  name: 'Протонаборы',                  icon: 'icons/mat/Protoset.png',
      have: v('protoset'),  need: R.OP_PROTOSET * n, perUnit: R.OP_PROTOSET },
    { id: 'tcreds',    name: 'Т-кредиты',                    icon: 'icons/mat/T-Creds.png',
      have: v('tcreds'), need: (R.OP_TCREDS_LEVEL + R.OP_TCREDS_PROMO) * n,
      perUnit: R.OP_TCREDS_LEVEL + R.OP_TCREDS_PROMO },
  ] : [
    { id: 'expWp',        name: 'Тест-комплекты для оружия', icon: 'icons/mat/Arms_INSP_Set.png',
      have: inTop(r.expWp), need: inTop(R.WP_EXP * n), piece: true,
      from: parts(['armsSet', 'armsKit', 'armsInsp']), perUnit: inTop(R.WP_EXP) },
    { id: 'castDie',      name: 'Литейные формы',            icon: 'icons/mat/Cast_Die.png',
      have: v('castDie'), need: R.WP_CAST_DIE * n, perUnit: R.WP_CAST_DIE },
    { id: 'heavyCastDie', name: 'Тяжёлые литейные формы',    icon: 'icons/mat/Heavy_Cast_Die.png',
      have: v('heavyCastDie'), need: R.WP_HEAVY_CAST_DIE * n, perUnit: R.WP_HEAVY_CAST_DIE },
    { id: 'tcreds',       name: 'Т-кредиты',                 icon: 'icons/mat/T-Creds.png',
      have: v('tcreds'), need: (R.WP_TCREDS_LEVEL + R.WP_TCREDS_TUNING) * n,
      perUnit: R.WP_TCREDS_LEVEL + R.WP_TCREDS_TUNING },
  ];

  rows.forEach(row => {
    row.diff = row.have - row.need;
    // в штуках дефицит округляем вверх: «не хватает 0.3 записи» = нужна ещё 1 целая
    if (row.piece && row.diff < 0) row.diff = -Math.ceil(-row.diff);
    // на сколько ещё единиц хватит запаса сверх текущей цели
    row.spare = row.diff > 0 && row.perUnit > 0 ? Math.floor(row.diff / row.perUnit) : 0;
  });
  return { target: n, rows, missing: rows.filter(x => x.diff < 0) };
}
