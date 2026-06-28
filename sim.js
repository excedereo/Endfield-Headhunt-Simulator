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
    this.pity = pityStart;          // счётчик до 6★ (переносится)
    this.sinceRateup = 0;           // счётчик до гаранта Камиля
    this.total = 0;                 // всего пуллов на баннере (240-механика)
    this.guaranteeUsed = false;
    this.copies = 0;                // копий Камиля
    this.tokens = 0;                // жетоны
  }

  constellation() {
    if (this.copies === 0) return null;
    return Math.min(CFG.MAX_CONS, this.tokens);
  }

  // один пулл; возвращает {rarity, camille, dup, tokenBonus}
  pull() {
    this.total++;
    this.pity++;
    this.sinceRateup++;

    let tokenBonus = false;
    if (this.total % CFG.TOKEN_EVERY === 0) { this.tokens++; tokenBonus = true; }

    const chance = sixStarChance(this.pity - 1);
    let got6 = Math.random() < chance;

    const force = (!this.guaranteeUsed && this.sinceRateup >= CFG.RATEUP_GUARANTEE);
    if (force) got6 = true;

    if (got6) {
      this.pity = 0;
      const isCamille = force || (Math.random() < CFG.RATEUP);
      if (isCamille) {
        this.sinceRateup = 0;
        if (force) this.guaranteeUsed = true;
        this.copies++;
        let dup = false;
        if (this.copies >= 2) { this.tokens++; dup = true; }
        return { rarity: 6, camille: true, dup, tokenBonus, forced: force };
      }
      return { rarity: 6, camille: false, dup: false, tokenBonus };
    }
    // среди не-6★: 5★ с условной вероятностью
    if (Math.random() < CFG.BASE_5 / (1 - CFG.BASE_6)) {
      return { rarity: 5, camille: false, dup: false, tokenBonus };
    }
    return { rarity: 4, camille: false, dup: false, tokenBonus };
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
