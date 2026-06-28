/* ENDFIELD // Web Worker — тяжёлые симуляции в фоновом потоке.
   Импортирует чистую логику из sim.js и гоняет её, не блокируя UI.
   Прогресс шлёт батчами (не на каждый прогон), чтобы не спамить postMessage. */

importScripts('sim.js');

// throttle прогресса: шлём не чаще, чем раз в ~60мс
let lastProgPost = 0;
function progress(f) {
  const now = Date.now();
  if (now - lastProgPost >= 60 || f >= 1) {
    lastProgPost = now;
    postMessage({ type: 'progress', value: f });
  }
}

// гистограмма по бакетам прямо тут, чтобы не гонять сырой массив (до 300k чисел) в основной поток
function buildHisto(rawSorted, bucket = 10) {
  const max = rawSorted[rawSorted.length - 1] || 0;
  const nB = Math.ceil((max + 1) / bucket);
  const counts = new Array(nB).fill(0);
  for (const v of rawSorted) counts[Math.floor(v / bucket)]++;
  return { bucket, counts };
}

onmessage = (e) => {
  const { mode, params } = e.data;
  lastProgPost = 0;

  try {
    if (mode === 'monte') {
      const r = monteCarlo(params.pulls, params.trials, params.pity, progress);
      postMessage({ type: 'done', result: r });
    } else if (mode === 'reverse') {
      const r = pullsUntil(params.target, params.trials, params.pity, progress);
      // считаем гистограмму здесь и НЕ пересылаем raw обратно (экономим память/трансфер)
      const histo = buildHisto(r.raw);
      delete r.raw;
      r.histo = histo;
      postMessage({ type: 'done', result: r });
    } else if (mode === 'prizes') {
      const r = prizesMonte(params.pulls, params.trials, params.maxed, progress, params.freebies);
      postMessage({ type: 'done', result: r });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
