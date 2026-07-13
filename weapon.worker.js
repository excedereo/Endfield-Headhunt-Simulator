/* ENDFIELD // Web Worker — тяжёлые симуляции оружейного баннера в фоновом потоке. */

importScripts('weapon.js');

let lastProgPost = 0;
function progress(f) {
  const now = Date.now();
  if (now - lastProgPost >= 60 || f >= 1) {
    lastProgPost = now;
    postMessage({ type: 'progress', value: f });
  }
}

function buildHisto(rawSorted, bucket = 1) {
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
    if (mode === 'wmonte') {
      const r = weaponMonteCarlo(params.supplies, params.trials, progress);
      postMessage({ type: 'done', result: r });
    } else if (mode === 'wreverse') {
      const r = weaponSuppliesUntil(params.target, params.trials, progress);
      const histo = buildHisto(r.raw);
      delete r.raw;
      r.histo = histo;
      postMessage({ type: 'done', result: r });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
