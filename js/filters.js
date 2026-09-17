/* filters.js — Hi8 / VHS / 8mm 風のフレーム加工
   撮影後に1回だけ走らせ、結果はキャッシュして使い回す。 */

export const FILTERS = [
  { id: 'none',  label: 'なし' },
  { id: 'hi8',   label: 'Hi8' },
  { id: 'vhs',   label: 'VHS' },
  { id: 'film8', label: '8mm' },
  { id: 'night', label: '夜ふけ' },
  { id: 'mono',  label: 'モノクロ' },
  { id: 'pop',   label: '平成ポップ' }
];

const PRESETS = {
  hi8:   { shift: 1.6, grain: 11, scan: 0.07, sat: 0.94, gain: [1.06, 1.00, 0.95], lift: [7, 4, 13], contrast: 1.04, vignette: 0.28, flicker: 0.02 },
  vhs:   { shift: 3.4, grain: 17, scan: 0.13, sat: 1.12, gain: [1.05, 0.97, 1.02], lift: [9, 6, 15], contrast: 1.02, vignette: 0.30, flicker: 0.05, bands: true },
  film8: { shift: 0.0, grain: 23, scan: 0.00, sat: 0.86, gain: [1.10, 1.00, 0.84], lift: [14, 8, 2],  contrast: 1.10, vignette: 0.46, flicker: 0.07 },
  night: { shift: 1.2, grain: 14, scan: 0.05, sat: 0.80, gain: [0.92, 0.96, 1.12], lift: [4, 6, 18], contrast: 1.12, vignette: 0.40, flicker: 0.02 },
  mono:  { shift: 0.0, grain: 15, scan: 0.03, sat: 0.00, gain: [1.12, 1.12, 1.12], lift: [5, 5, 5],  contrast: 1.20, vignette: 0.30, flicker: 0.03 },
  pop:   { shift: 1.0, grain: 6,  scan: 0.00, sat: 1.38, gain: [1.05, 1.00, 1.07], lift: [3, 0, 7],  contrast: 1.10, vignette: 0.14, flicker: 0 }
};

/* コマごとに同じ粒子が出るよう、乱数は種から作る */
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chromaShift(data, src, w, h, amount) {
  const dx = Math.round(amount);
  if (dx <= 0) return;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const rx = Math.min(w - 1, x + dx);
      const bx = Math.max(0, x - dx);
      data[i] = src[row + rx * 4];
      data[i + 2] = src[row + bx * 4 + 2];
    }
  }
}

/* VHSらしい横方向のずれた帯を数本入れる */
function dropoutBands(data, src, w, h, rand) {
  const count = 2 + Math.floor(rand() * 3);
  for (let n = 0; n < count; n++) {
    const y0 = Math.floor(rand() * h);
    const bh = 1 + Math.floor(rand() * 4);
    const dx = Math.round((rand() - 0.5) * w * 0.045);
    for (let y = y0; y < Math.min(h, y0 + bh); y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x - dx));
        const i = row + x * 4;
        const j = row + sx * 4;
        data[i] = src[j];
        data[i + 1] = src[j + 1];
        data[i + 2] = src[j + 2];
      }
    }
  }
}

function drawVignette(ctx, w, h, amount) {
  if (amount <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + amount + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * フレーム1枚を加工して新しい canvas を返す。
 * @param {HTMLCanvasElement} source 元フレーム
 * @param {string} id FILTERS の id
 * @param {number} seed コマ番号（粒子を固定するため）
 */
export function applyFilter(source, id, seed = 0) {
  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(source, 0, 0);

  const p = PRESETS[id];
  if (!p) return out;

  const rand = seeded(seed * 7919 + 13);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const src = new Uint8ClampedArray(data);

  if (p.shift) chromaShift(data, src, w, h, p.shift);
  if (p.bands) dropoutBands(data, new Uint8ClampedArray(data), w, h, rand);

  const flick = p.flicker ? 1 + (rand() - 0.5) * 2 * p.flicker : 1;
  const [gr, gg, gb] = p.gain;
  const [lr, lg, lb] = p.lift;
  const c = p.contrast || 1;

  for (let y = 0; y < h; y++) {
    const scanMul = p.scan && (y & 1) ? 1 - p.scan : 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i] * gr * flick + lr;
      let g = data[i + 1] * gg * flick + lg;
      let b = data[i + 2] * gb * flick + lb;

      r = (r - 128) * c + 128;
      g = (g - 128) * c + 128;
      b = (b - 128) * c + 128;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * p.sat;
      g = lum + (g - lum) * p.sat;
      b = lum + (b - lum) * p.sat;

      if (p.grain) {
        const n = (rand() - 0.5) * p.grain * 2;
        r += n; g += n; b += n;
      }

      data[i] = r * scanMul;
      data[i + 1] = g * scanMul;
      data[i + 2] = b * scanMul;
    }
  }

  ctx.putImageData(img, 0, 0);
  drawVignette(ctx, w, h, p.vignette);
  return out;
}
