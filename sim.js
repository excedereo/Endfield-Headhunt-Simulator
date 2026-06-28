/* ============================================================
   ENDFIELD // Headhunting Simulation Engine
   Порт механики баннера спец-найма (rate-up 6★ оператор).

   Шансы:   6★ 0.8% | 5★ 8% | 4★ 91.2%
   Пити:    софт после 65 (+5%/пулл), хард на 80; переносится между баннерами
   Rate-up: 50% что 6★ это Камиль; гарант Камиля на 120 (1 раз/баннер)
   Жетоны:  каждый дубликат Камиля + каждый 240-й пулл
   Потенциал: E0 = первая копия; +1 уровень за жетон (макс E5 = E0 + 5 жетонов)
   ============================================================ */

const CFG = {
  BASE_6: 0.008,
  BASE_5: 0.08,
  SOFT_START: 65,
  SOFT_STEP: 0.05,
  HARD_6: 80,
  RATEUP: 0.50,
  RATEUP_GUARANTEE: 120,
  TOKEN_EVERY: 240,
  MAX_CONS: 5,      // максимальный потенциал оператора — E5 (5 жетонов)
  FREE_AFTER: 30,   // после 30 платных пуллов
  FREE_COUNT: 10,   // даётся 10 бесплатных (вне счётчиков пити/гаранта/240)
};

// ── пул операторов баннера (для подсчёта призов) ──
// 6★: 1 текущий rate-up + 7 прочих. Имена нейтральные — не зависят от баннера,
// сайт не нужно обновлять каждый апдейт игры.
const RATEUP_NAME = 'Текущий rate-up';
// прочие 6★: 2 бывших rate-up + 5 стандартных (нейтрально)
const SIX_OTHER_NAMES = [
  'Прошлый rate-up', 'Позапрошлый rate-up',
  'Стандартный 6★ #1', 'Стандартный 6★ #2', 'Стандартный 6★ #3',
  'Стандартный 6★ #4', 'Стандартный 6★ #5',
];
const POOL = { six: 8, sixOther: SIX_OTHER_NAMES.length, five: 9, four: 5 };
// полный список имён 6★ для отображения (rate-up первый)
const NAMES_6 = [RATEUP_NAME, ...SIX_OTHER_NAMES];

// правила обмена талонов
const PRIZE = {
  BASE_PER_6: 50,   // базовых талонов за копию 6★
  BASE_PER_5: 10,   // базовых талонов за копию 5★
  PREMIUM_PER_6: 10, // премиум-талонов за лишний жетон 6★
  AIC_PER_5: 20,     // АПК за лишний жетон 5★
  AIC_PER_4: 5,      // АПК за лишний жетон 4★
  // билеты арсенала за КАЖДОЕ выпадение (фикс по редкости, без условий)
  ARSENAL_6: 2000,
  ARSENAL_5: 200,
  ARSENAL_4: 20,
};

function sixStarChance(pity) {
  // pity = число пуллов подряд без 6★
  if (pity + 1 >= CFG.HARD_6) return 1.0;
  if (pity >= CFG.SOFT_START) {
    return Math.min(1.0, CFG.BASE_6 + (pity - CFG.SOFT_START + 1) * CFG.SOFT_STEP);
  }
  return CFG.BASE_6;
}

class Banner {
  constructor(pityStart = 0) {
    this.pity = pityStart;          // счётчик до любого 6★ (софт/хард-пити)
    this.paidCount = 0;             // ВСЕГО платных пуллов баннера (для гаранта 120 и жетонов 240)
    this.guaranteeUsed = false;     // гарант-предохранитель снят (Камиль получен платно ИЛИ форс на 120)
    this.copies = 0;                // копий Камиля (реальные выпадения)
    this.tokens = 0;                // жетоны (потенциал)
    this.token240Copies = 0;        // жетоны за 240 — считаются как копии rate-up (для базовых талонов)
  }

  constellation() {
    if (this.copies === 0) return null;
    return Math.min(CFG.MAX_CONS, this.tokens);
  }

  // платный пулл
  pull() {
    this.paidCount++;
    this.pity++;

    // жетон за каждый 240-й платный пулл = полноценная копия rate-up:
    // +1 потенциал (tokens) И считается копией для базовых талонов (token240Copies)
    let tokenBonus = false;
    if (this.paidCount % CFG.TOKEN_EVERY === 0) {
      this.tokens++; this.token240Copies++; tokenBonus = true;
    }

    const chance = sixStarChance(this.pity - 1);
    let got6 = Math.random() < chance;

    // гарант: одноразовый, на 120-м платном пулле если Камиль ещё не получен платно
    const force = (!this.guaranteeUsed && this.paidCount >= CFG.RATEUP_GUARANTEE);
    if (force) got6 = true;

    if (got6) {
      this.pity = 0;
      const isCamille = force || (Math.random() < CFG.RATEUP);
      if (isCamille) {
        this.guaranteeUsed = true;   // Камиль получен платно → гарант снят насовсем
        this.copies++;
        let dup = false;
        if (this.copies >= 2) { this.tokens++; dup = true; }
        return { rarity: 6, camille: true, dup, tokenBonus, forced: force };
      }
      return { rarity: 6, camille: false, dup: false, tokenBonus };
    }
    if (Math.random() < CFG.BASE_5 / (1 - CFG.BASE_6)) {
      return { rarity: 5, camille: false, dup: false, tokenBonus };
    }
    return { rarity: 4, camille: false, dup: false, tokenBonus };
  }

  // бесплатный пулл (экстренная вербовка): НЕ идёт в счёт гаранта, пити, жетонов-240.
  // Камиль на бесплатном НЕ снимает гарант (счётчик платных продолжает висеть).
  // guaranteeFive — гарант 5★+ на последнем пулле десятки.
  freePull(guaranteeFive) {
    let got6 = Math.random() < CFG.BASE_6;
    if (got6) {
      const isCamille = Math.random() < CFG.RATEUP;
      if (isCamille) {
        this.copies++;
        let dup = false;
        if (this.copies >= 2) { this.tokens++; dup = true; } // дубликат → жетон (потенциал)
        // гарант НЕ трогаем — бесплатные не в счёт
        return { rarity: 6, camille: true, dup, free: true };
      }
      return { rarity: 6, camille: false, dup: false, free: true };
    }
    const five = guaranteeFive || (Math.random() < CFG.BASE_5 / (1 - CFG.BASE_6));
    if (five) return { rarity: 5, camille: false, dup: false, free: true };
    return { rarity: 4, camille: false, dup: false, free: true };
  }
}

/* ── Режим 1: одна подробная крутка ── */
function detailedRun(nPulls, pityStart) {
  const b = new Banner(pityStart);
  const events = [];
  for (let i = 1; i <= nPulls; i++) {
    const r = b.pull();
    if (r.rarity === 6 || r.tokenBonus) {
      events.push({ pull: i, ...r });
    }
  }
  return {
    events,
    copies: b.copies,
    tokens: b.tokens,
    cons: b.constellation(),
    pityOut: b.pity,
  };
}

/* ── Режим 2: Монте-Карло ── */
function monteCarlo(nPulls, trials, pityStart, onProgress) {
  const consDist = [0, 0, 0, 0, 0, 0]; // E0..E5
  let noCamille = 0, gotE0 = 0;
  let sumCopies = 0, sumTokens = 0;
  const chunk = Math.max(1, Math.floor(trials / 100));

  for (let t = 0; t < trials; t++) {
    const b = new Banner(pityStart);
    for (let i = 0; i < nPulls; i++) b.pull();
    sumCopies += b.copies;
    sumTokens += b.tokens;
    const c = b.constellation();
    if (c === null) noCamille++;
    else { gotE0++; consDist[c]++; }
    if (onProgress && t % chunk === 0) onProgress(t / trials);
  }
  return {
    trials,
    pE0: gotE0 / trials,
    avgCopies: sumCopies / trials,
    avgTokens: sumTokens / trials,
    noCamille: noCamille / trials,
    consDist: consDist.map(x => x / trials), // E0..E5
  };
}

/* ── Режим 3: сколько пуллов до цели ── */
function pullsUntil(targetCons, trials, pityStart, onProgress, maxPulls = 2500) {
  const results = [];
  const chunk = Math.max(1, Math.floor(trials / 100));
  for (let t = 0; t < trials; t++) {
    const b = new Banner(pityStart);
    let n = 0;
    while (n < maxPulls) {
      b.pull(); n++;
      const c = b.constellation();
      if (c !== null && c >= targetCons) break;
    }
    results.push(n);
    if (onProgress && t % chunk === 0) onProgress(t / trials);
  }
  results.sort((a, b) => a - b);
  const pick = q => results[Math.min(results.length - 1, Math.floor(trials * q))];
  const mean = results.reduce((a, b) => a + b, 0) / trials;
  return {
    trials,
    mean,
    median: pick(0.50),
    best10: pick(0.10),
    worst10: pick(0.90),
    worst1: pick(0.99),
    raw: results,
  };
}

/* ── ПОДСЧЁТ ПРИЗОВ ──
   maxed: true  — все стандартные операторы вымакшены → каждое выпадение = копия
          false — первое выпадение каждого оператора = он сам (0 талонов), дальше копии
   Лишние жетоны (сверх E5 у rate-up; все у прочих) → АПК/премиум талоны. */
function prizesOneRun(nPulls, maxed, keepLog, freebies) {
  const b = new Banner(0);
  let copies6 = 0, copies5 = 0;
  let tokens6other = 0, tokens5 = 0, tokens4 = 0;
  let count6 = 0, count5 = 0, count4 = 0;
  const seen6 = new Set(), seen5 = new Set(), seen4 = new Set();
  const rint = n => Math.floor(Math.random() * n);

  const byName = { [RATEUP_NAME]: 0 };
  SIX_OTHER_NAMES.forEach(n => byName[n] = 0);
  const log6 = [];

  // обработка одного выпадения (платного или бесплатного)
  const handle = (r, pullNo, isFree) => {
    if (r.rarity === 6) {
      count6++;
      let name;
      if (r.camille) {
        name = RATEUP_NAME;
      } else {
        const id = rint(POOL.sixOther);
        name = SIX_OTHER_NAMES[id];
        const isCopy = maxed || seen6.has(id);
        seen6.add(id);
        if (isCopy) { copies6++; tokens6other++; }
      }
      byName[name]++;
      if (keepLog) log6.push({ pull: pullNo, name, rateup: r.camille, forced: r.forced, free: isFree });
    } else if (r.rarity === 5) {
      count5++;
      const id = rint(POOL.five);
      const isCopy = maxed || seen5.has(id);
      seen5.add(id);
      if (isCopy) { copies5++; tokens5++; }
    } else {
      count4++;
      const id = rint(POOL.four);
      const isCopy = maxed || seen4.has(id);
      seen4.add(id);
      if (isCopy) { tokens4++; }
    }
    // жетон за 240-й платный пулл — отдельным событием лога
    if (keepLog && r.tokenBonus) {
      log6.push({ pull: pullNo, token240: true });
    }
  };

  let freeGiven = false;
  for (let i = 0; i < nPulls; i++) {
    handle(b.pull(), i + 1, false);
    // после 30 платных — один раз +10 бесплатных (вне счётчиков)
    if (freebies && !freeGiven && (i + 1) >= CFG.FREE_AFTER) {
      freeGiven = true;
      for (let f = 0; f < CFG.FREE_COUNT; f++) {
        const guaranteeFive = (f === CFG.FREE_COUNT - 1); // гарант 5★+ на десятке
        handle(b.freePull(guaranteeFive), `FREE+${f + 1}`, true);
      }
    }
  }

  const rateupCopies = Math.max(0, b.copies - (maxed ? 0 : 1));
  copies6 += rateupCopies;
  copies6 += b.token240Copies;       // жетоны за 240 = копии rate-up → базовые талоны
  const rateupExtraTokens = Math.max(0, b.tokens - CFG.MAX_CONS);

  const baseTickets = copies6 * PRIZE.BASE_PER_6 + copies5 * PRIZE.BASE_PER_5;
  const premium = (tokens6other + rateupExtraTokens) * PRIZE.PREMIUM_PER_6;
  const aic = tokens5 * PRIZE.AIC_PER_5 + tokens4 * PRIZE.AIC_PER_4;
  // билеты арсенала — за каждое выпадение по редкости
  const arsenal = count6 * PRIZE.ARSENAL_6 + count5 * PRIZE.ARSENAL_5 + count4 * PRIZE.ARSENAL_4;

  return { baseTickets, premium, aic, arsenal, count6, count5, count4,
    camilleCopies: b.copies, camilleTokens: b.tokens, byName, log6 };
}

function prizesMonte(nPulls, trials, maxed, onProgress, freebies) {
  let sBase = 0, sPrem = 0, sAic = 0, sArs = 0, s6 = 0, s5 = 0, s4 = 0;
  const sumName = { [RATEUP_NAME]: 0 };
  SIX_OTHER_NAMES.forEach(n => sumName[n] = 0);
  const chunk = Math.max(1, Math.floor(trials / 100));
  for (let t = 0; t < trials; t++) {
    const r = prizesOneRun(nPulls, maxed, false, freebies);
    sBase += r.baseTickets; sPrem += r.premium; sAic += r.aic; sArs += r.arsenal;
    s6 += r.count6; s5 += r.count5; s4 += r.count4;
    for (const k in r.byName) sumName[k] += r.byName[k];
    if (onProgress && t % chunk === 0) onProgress(t / trials);
  }
  const avgName = {};
  for (const k in sumName) avgName[k] = sumName[k] / trials;
  return { trials,
    avgBase: sBase / trials, avgPrem: sPrem / trials, avgAic: sAic / trials, avgArs: sArs / trials,
    avg6: s6 / trials, avg5: s5 / trials, avg4: s4 / trials, avgName };
}
