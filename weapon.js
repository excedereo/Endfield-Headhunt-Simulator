/* ============================================================
   ENDFIELD // Arsenal Supply Simulation Engine
   Порт механики баннера поставки арсенала (оружие).

   Единица броска — ПОСТАВКА (10 предметов оружия), не отдельный пулл.
   Шансы на предмет: 6★ 4% | 5★ 15% | 4★ 81%
   Внутри 6★: 25% rate-up, 75% делится поровну между стандартными 6★ баннера
   Гарантия: минимум 1 предмет ≥5★ на поставку (если все 10 бросков дали 4★ —
     последний слот форсируется в 5★, равновероятно между группами 5★)

   Три независимых счётчика на баннер:
   1. Общий 6★-пити: 3 поставки без 6★ подряд → гарант на 4-й
   2. Rate-up-пити:   7 поставок без rate-up подряд → гарант на 8-й, но не более
                       одного форса за баннер, обнуляется при ЛЮБОМ получении rate-up
   3. Milestone:      начиная с 10-й поставки, шаг +8, чередуя:
                       ящик выбора (10, 26, 42…) / гарант rate-up (18, 34, 50…)
   Все три сбрасываются на нуле при смене баннера (не переносятся).
   ============================================================ */

const WCFG = {
  BASE_6: 0.04,
  BASE_5: 0.15,
  BASE_4: 0.81,
  RATEUP_SHARE: 0.25,   // доля rate-up среди всех выпавших 6★
  ITEMS_PER_SUPPLY: 10,
  PITY6_LIMIT: 3,        // 3 поставки без 6★ подряд → гарант на 4-й
  PITY_RATEUP_LIMIT: 7,  // 7 поставок без rate-up подряд → гарант на 8-й
  MILESTONE_START: 10,   // первая награда
  MILESTONE_STEP: 8,     // далее каждые +8
  PRICE_TICKETS: 1980,   // билетов арсенала за 1 поставку
  ORIG_TO_TICKETS: 25,   // курс: 1 ориджеметрий = 25 билетов арсенала
  AIC_PER_6: 50,         // талонов АПК за 6★ предмет
  AIC_PER_5: 10,         // талонов АПК за 5★ предмет
  MAX_POTENTIAL: 5,      // потенциал rate-up оружия: E0 (1-я копия) .. E5 (5 доп. копий)
  PREMIUM_PER_EXTRA: 10, // талонов премиум-валюты за лишнюю копию rate-up сверх E5
};

// нейтральный пул (не завязан на конкретный баннер/патч)
const WRATEUP_NAME = 'Rate-up оружие';
const WSTD6_NAMES = [
  'Стандартное 6★ #1', 'Стандартное 6★ #2', 'Стандартное 6★ #3',
  'Стандартное 6★ #4', 'Стандартное 6★ #5', 'Стандартное 6★ #6',
];
const WPOOL = { std6: WSTD6_NAMES.length, five: 5, four: 5 };
const WNAMES_6 = [WRATEUP_NAME, ...WSTD6_NAMES];

class ArsenalBanner {
  constructor() {
    this.supplyCount = 0;      // всего совершённых поставок в этом баннере
    this.pity6 = 0;            // поставок подряд без 6★
    this.pityRateup = 0;       // поставок подряд без rate-up
    this.rateupForceUsed = false; // гарант rate-up (8-я после провала) уже сработал в этом баннере
    this.rateupCopies = 0;
    this.std6Copies = 0;
    this.fiveCopies = 0;
    this.fourCopies = 0;
    this.aicTickets = 0;
    this.premiumTickets = 0;  // за лишние копии rate-up сверх E5
    // накопленный счётчик milestone-порогов уже выданных наград
    this.milestonesGiven = 0;
  }

  // потенциал rate-up оружия: null пока копий нет, иначе E0..E5 (1-я копия = E0, дальше +1 за копию)
  potential() {
    if (this.rateupCopies === 0) return null;
    return Math.min(WCFG.MAX_POTENTIAL, this.rateupCopies - 1);
  }

  // единичный бросок предмета (без учёта гарантий поставки) — {rarity, rateup}
  _rollItem() {
    const r = Math.random();
    if (r < WCFG.BASE_6) {
      const isRateup = Math.random() < WCFG.RATEUP_SHARE;
      return { rarity: 6, rateup: isRateup };
    }
    if (r < WCFG.BASE_6 + WCFG.BASE_5) return { rarity: 5, rateup: false };
    return { rarity: 4, rateup: false };
  }

  // один гарантированный ≥5★ бросок (для случая когда обычные 10 не дали ни одного 5★+)
  _rollGuaranteedFive() {
    // всегда 5★, без rate-up 6★ через этот слот
    return { rarity: 5, rateup: false };
  }

  // одна поставка = 10 предметов + два гаранта поставки (общий 6★, rate-up 6★)
  supply() {
    this.supplyCount++;
    const items = [];
    for (let i = 0; i < WCFG.ITEMS_PER_SUPPLY; i++) items.push(this._rollItem());

    // гарантия «минимум 1 из 10 ≥ 5★»
    if (!items.some(it => it.rarity >= 5)) {
      items[items.length - 1] = this._rollGuaranteedFive();
    }

    let got6 = items.some(it => it.rarity === 6);
    let gotRateup = items.some(it => it.rateup);

    // гарант общего 6★: 3 поставки подряд без 6★ → форс на 4-й
    let forced6 = false;
    if (!got6 && this.pity6 + 1 >= WCFG.PITY6_LIMIT) {
      // форсируем один предмет (последний 4★/5★ слот) в обычный 6★ (без rate-up)
      const idx = items.findIndex(it => it.rarity < 6);
      if (idx >= 0) { items[idx] = { rarity: 6, rateup: false }; got6 = true; forced6 = true; }
    }

    // гарант rate-up: 7 поставок подряд без rate-up → форс на 8-й, один раз за баннер
    let forcedRateup = false;
    if (!gotRateup && !this.rateupForceUsed && this.pityRateup + 1 >= WCFG.PITY_RATEUP_LIMIT) {
      const idx = items.findIndex(it => !it.rateup);
      if (idx >= 0) {
        items[idx] = { rarity: 6, rateup: true };
        got6 = true; gotRateup = true; forcedRateup = true;
        this.rateupForceUsed = true;
      }
    }

    // обновляем счётчики пити ПОСЛЕ применения гарантов этой же поставки
    this.pity6 = got6 ? 0 : this.pity6 + 1;
    this.pityRateup = gotRateup ? 0 : this.pityRateup + 1;
    if (gotRateup) this.rateupForceUsed = false; // натуральное/форс попадание снимает флаг — гарант снова может копиться

    // подсчёт по редкости + талоны АПК
    let name6 = null;
    for (const it of items) {
      if (it.rarity === 6) {
        this.aicTickets += WCFG.AIC_PER_6;
        if (it.rateup) { this.rateupCopies++; name6 = WRATEUP_NAME; }
        else { this.std6Copies++; }
      } else if (it.rarity === 5) {
        this.aicTickets += WCFG.AIC_PER_5;
        this.fiveCopies++;
      } else {
        this.fourCopies++;
      }
    }

    // milestone-награды: считаем сколько порогов пройдено к этой поставке
    // 10, 18, 26, 34… (шаг 8 начиная с 10)
    const milestonesNow = this.supplyCount >= WCFG.MILESTONE_START
      ? Math.floor((this.supplyCount - WCFG.MILESTONE_START) / WCFG.MILESTONE_STEP) + 1
      : 0;
    const milestoneEvents = [];
    while (this.milestonesGiven < milestonesNow) {
      // чётный индекс (0,2,4…) = ящик выбора; нечётный (1,3,5…) = гарант rate-up
      const isBox = this.milestonesGiven % 2 === 0;
      milestoneEvents.push(isBox ? 'box' : 'rateup');
      if (!isBox) { this.rateupCopies++; } // гарант rate-up из milestone тоже копия
      this.milestonesGiven++;
    }

    return { items, got6, gotRateup, forced6, forcedRateup, milestoneEvents };
  }

  // премиум-талоны за копии rate-up сверх E5 (вызывать один раз в конце захода)
  finalizePremium() {
    const extra = Math.max(0, this.rateupCopies - 1 - WCFG.MAX_POTENTIAL);
    this.premiumTickets = extra * WCFG.PREMIUM_PER_EXTRA;
    return this.premiumTickets;
  }
}

/* ── Режим 1: одна подробная поставка (или несколько подряд с логом) ── */
function weaponDetailedRun(nSupplies) {
  const b = new ArsenalBanner();
  const events = [];
  for (let i = 1; i <= nSupplies; i++) {
    const r = b.supply();
    if (r.got6 || r.milestoneEvents.length) {
      events.push({ supply: i, ...r });
    }
  }
  b.finalizePremium();
  return {
    events,
    rateupCopies: b.rateupCopies,
    potential: b.potential(),
    std6Copies: b.std6Copies,
    fiveCopies: b.fiveCopies,
    fourCopies: b.fourCopies,
    aicTickets: b.aicTickets,
    premiumTickets: b.premiumTickets,
    pity6Out: b.pity6,
    pityRateupOut: b.pityRateup,
  };
}

/* ── Режим 2: Монте-Карло по фиксированному числу поставок ── */
function weaponMonteCarlo(nSupplies, trials, onProgress) {
  let sumRateup = 0, sumStd6 = 0, sumFive = 0, sumFour = 0, sumAic = 0, sumPremium = 0;
  let gotAtLeastOneRateup = 0;
  const potDist = [0, 0, 0, 0, 0, 0]; // E0..E5
  let noRateup = 0;
  const chunk = Math.max(1, Math.floor(trials / 100));

  for (let t = 0; t < trials; t++) {
    const b = new ArsenalBanner();
    for (let i = 0; i < nSupplies; i++) b.supply();
    b.finalizePremium();
    sumRateup += b.rateupCopies;
    sumStd6 += b.std6Copies;
    sumFive += b.fiveCopies;
    sumFour += b.fourCopies;
    sumAic += b.aicTickets;
    sumPremium += b.premiumTickets;
    if (b.rateupCopies > 0) gotAtLeastOneRateup++;
    const pot = b.potential();
    if (pot === null) noRateup++;
    else potDist[pot]++;
    if (onProgress && t % chunk === 0) onProgress(t / trials);
  }
  return {
    trials,
    pRateup: gotAtLeastOneRateup / trials,
    avgRateup: sumRateup / trials,
    avgStd6: sumStd6 / trials,
    avgFive: sumFive / trials,
    avgFour: sumFour / trials,
    avgAic: sumAic / trials,
    avgPremium: sumPremium / trials,
    noRateup: noRateup / trials,
    potDist: potDist.map(x => x / trials), // E0..E5
  };
}

/* ── Режим 3: сколько поставок нужно до целевого потенциала EX rate-up оружия ──
   targetPotential: 0..5 (E0 — просто получить оружие, E5 — максимум) */
function weaponSuppliesUntil(targetPotential, trials, onProgress, maxSupplies = 500) {
  const results = [];
  const chunk = Math.max(1, Math.floor(trials / 100));
  for (let t = 0; t < trials; t++) {
    const b = new ArsenalBanner();
    let n = 0;
    while (n < maxSupplies) {
      b.supply(); n++;
      const pot = b.potential();
      if (pot !== null && pot >= targetPotential) break;
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
