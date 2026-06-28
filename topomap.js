/* ENDFIELD // топографическая карта для прелоадера.
   Генерит поле высот через value-noise, рисует изолинии (горизонтали)
   методом marching squares + тонкую координатную сетку. Чистый canvas, без ассетов. */

function drawTopoMap(canvas, opts) {
  opts = opts || {};
  // тема: 'dark' (светлые линии на тёмном — прелоадер) или 'light' (тёмные линии на светлом — фон сайта)
  const theme = opts.theme || 'dark';
  const radialFade = opts.radialFade !== false; // по умолчанию да
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // ── value noise (детерминированный, со сглаживанием) ──
  const seed = Math.floor(Math.random() * 9999);
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695040) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  const smooth = t => t * t * (3 - 2 * t);
  function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const tl = hash(xi, yi), tr = hash(xi + 1, yi);
    const bl = hash(xi, yi + 1), br = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v;
  }
  // фрактальный шум (несколько октав) → органичный рельеф
  function fbm(x, y) {
    let val = 0, amp = 0.5, freq = 1;
    for (let o = 0; o < 4; o++) {
      val += valueNoise(x * freq, y * freq) * amp;
      freq *= 2; amp *= 0.5;
    }
    return val;
  }

  // ── строим поле высот на сетке ──
  const cell = 14;                 // шаг сетки в пикселях (мельче = плавнее, дороже)
  const cols = Math.ceil(W / cell) + 1;
  const rows = Math.ceil(H / cell) + 1;
  const scale = opts.scale || 0.065;  // масштаб шума (меньше = крупнее «горы»)
  const field = [];
  for (let j = 0; j < rows; j++) {
    field[j] = [];
    for (let i = 0; i < cols; i++) {
      field[j][i] = fbm(i * cell * scale, j * cell * scale);
    }
  }

  // ── изолинии через marching squares ──
  function lerp(a, b, t) { return a + (b - a) * t; }
  function isoline(level) {
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const tl = field[j][i], tr = field[j][i + 1];
        const bl = field[j + 1][i], br = field[j + 1][i + 1];
        let idx = 0;
        if (tl > level) idx |= 8;
        if (tr > level) idx |= 4;
        if (br > level) idx |= 2;
        if (bl > level) idx |= 1;
        if (idx === 0 || idx === 15) continue;

        const x = i * cell, y = j * cell;
        // точки пересечения уровня на рёбрах ячейки
        const top = [x + cell * (level - tl) / (tr - tl), y];
        const bottom = [x + cell * (level - bl) / (br - bl), y + cell];
        const left = [x, y + cell * (level - tl) / (bl - tl)];
        const right = [x + cell, y + cell * (level - tr) / (br - tr)];

        const seg = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
        switch (idx) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 10: seg(left, bottom); seg(top, right); break;
        }
      }
    }
    ctx.stroke();
  }

  // цвета линий по теме
  const rgb = theme === 'light' ? '20,22,26' : '255,255,255';
  const C = (a) => `rgba(${rgb},${a})`;

  // ── тонкая координатная сетка (еле видна) ──
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme === 'light' ? C(0.035) : C(0.018);
  const gridStep = 110;
  ctx.beginPath();
  for (let x = 0; x <= W; x += gridStep) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += gridStep) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  // ── изолинии: несколько уровней высоты ──
  const levels = [0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78];
  const major0 = theme === 'light' ? 0.10 : 0.062;
  const minor0 = theme === 'light' ? 0.055 : 0.034;
  levels.forEach((lv, k) => {
    // каждая 3-я линия чуть ярче — «индексные горизонтали» как на реальных картах
    const major = k % 3 === 0;
    ctx.lineWidth = major ? 1.4 : 1;
    ctx.strokeStyle = C(major ? major0 : minor0);
    isoline(lv);
  });

  // ── радиальный фейд: карта видна в центре кругом, растворяется к краям ──
  if (radialFade) {
    ctx.globalCompositeOperation = 'destination-out';
    const cx = W / 2, cy = H / 2;
    const r = Math.max(W, H) * 0.62;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');      // центр — карту не трогаем
    grad.addColorStop(0.65, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');      // края — стираем полностью
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
