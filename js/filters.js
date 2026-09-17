/* filters.js — 記録メディアごとの質感を作る
   それぞれ「どの機材で撮られたか」が分かる方向に寄せる。色味だけの加工にはしない。
   強さ(k)は 0〜1.5 程度。1.0 が基準。 */

export const FILTERS = [
  { id: 'none',  label: 'なし',    adjustable: false },
  { id: 'hi8',   label: 'Hi8',     adjustable: true },
  { id: 'vhs',   label: 'VHS',     adjustable: true },
  { id: 'film8', label: '8mm',     adjustable: true },
  { id: 'pop',   label: 'ガラケー', adjustable: true },
  { id: 'night', label: '夜ふけ',  adjustable: true },
  { id: 'mono',  label: 'モノクロ', adjustable: true }
];

/* コマごとに同じ粒子・同じ揺れを出すための固定乱数 */
export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* 縮小して戻すことで、軽いソフトフォーカスを作る */
function softFocus(canvas, amount) {
  if (amount <= 0.01) return;
  const w = canvas.width, h = canvas.height;
  const sw = Math.max(2, Math.round(w * (1 - Math.min(0.75, amount))));
  const sh = Math.max(2, Math.round(h * (1 - Math.min(0.75, amount))));
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext('2d', { alpha: false });
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount * 1.4);
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

/* 解像度そのものを落とす。ガラケーの画づくりの土台 */
function downRes(canvas, targetLong) {
  const w = canvas.width, h = canvas.height;
  const long = Math.max(w, h);
  if (targetLong >= long) return;
  const s = targetLong / long;
  const sw = Math.max(2, Math.round(w * s));
  const sh = Math.max(2, Math.round(h * s));
  const small = makeCanvas(sw, sh);
  small.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, sw, sh);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, w, h);
  return small;
}

/* 輪郭強調。初期のデジカメがやっていた、あの不自然なくっきり感 */
function sharpen(canvas, amount) {
  if (amount <= 0.01) return;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        const sum = src[p - w * 4] + src[p + w * 4] + src[p - 4] + src[p + 4];
        d[p] = src[p] + (src[p] * 4 - sum) * amount * 0.25;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function chromaShift(data, src, w, h, amount) {
  const dx = Math.round(amount);
  if (dx <= 0) return;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      data[i] = src[row + Math.min(w - 1, x + dx) * 4];
      data[i + 2] = src[row + Math.max(0, x - dx) * 4 + 2];
    }
  }
}

/* テープのドロップアウト。横に数本、ずれた帯を入れる */
function dropoutBands(data, w, h, rand, count, strength) {
  const src = new Uint8ClampedArray(data);
  for (let n = 0; n < count; n++) {
    const y0 = Math.floor(rand() * h);
    const bh = 1 + Math.floor(rand() * 4);
    const dx = Math.round((rand() - 0.5) * w * strength);
    const bright = 1 + (rand() - 0.5) * 0.3;
    for (let y = y0; y < Math.min(h, y0 + bh); y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x - dx));
        const i = row + x * 4;
        const j = row + sx * 4;
        data[i] = src[j] * bright;
        data[i + 1] = src[j + 1] * bright;
        data[i + 2] = src[j + 2] * bright;
      }
    }
  }
}

/* 画面下の同期の乱れ。VHSらしさの要 */
function trackingNoise(ctx, w, h, rand, k) {
  const bh = Math.max(3, h * 0.035 * k);
  const y = h - bh - h * 0.01;
  ctx.save();
  ctx.globalAlpha = 0.28 * k;
  for (let i = 0; i < 26; i++) {
    const yy = y + rand() * bh;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#7a7a7a';
    ctx.fillRect(rand() * w, yy, w * (0.04 + rand() * 0.22), 1 + rand() * 1.5);
  }
  ctx.restore();
}

/* フィルムのゴミと擦り傷 */
function filmDirt(ctx, w, h, rand, k) {
  ctx.save();
  const specks = Math.floor(2 + rand() * 5 * k);
  for (let i = 0; i < specks; i++) {
    ctx.globalAlpha = 0.18 + rand() * 0.35;
    ctx.fillStyle = rand() > 0.35 ? '#1b1206' : '#fff6e2';
    const x = rand() * w, y = rand() * h;
    const r = (0.6 + rand() * 1.8) * (w / 360);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand()), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rand() > 0.55) {
    ctx.globalAlpha = 0.12 + rand() * 0.16;
    ctx.fillStyle = '#fff6e2';
    const x = rand() * w;
    ctx.fillRect(x, 0, Math.max(1, w * 0.0025), h);
  }
  ctx.restore();
}

function vignette(ctx, w, h, amount) {
  if (amount <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + amount + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* 露出ムラ。フィルムの片側だけ明るくなる感じ */
function unevenExposure(ctx, w, h, rand, k) {
  const g = ctx.createLinearGradient(0, 0, w * (rand() > 0.5 ? 1 : -1), h);
  g.addColorStop(0, 'rgba(255,238,200,' + (0.10 * k) + ')');
  g.addColorStop(0.55, 'rgba(255,238,200,0)');
  g.addColorStop(1, 'rgba(40,20,0,' + (0.10 * k) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* --- 各プリセット ---------------------------------------------------- */

function pixelPass(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h);
  fn(img.data, w, h);
  ctx.putImageData(img, 0, 0);
}

function film8(out, src, k, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  // コマごとの微妙な位置ずれ。フィルムがゲートで踊る分
  const jx = (rand() - 0.5) * w * 0.008 * k;
  const jy = (rand() - 0.5) * h * 0.010 * k;
  const zoom = 1.015 + rand() * 0.006 * k;
  ctx.save();
  ctx.translate(w / 2 + jx, h / 2 + jy);
  ctx.scale(zoom, zoom);
  ctx.drawImage(src, -w / 2, -h / 2);
  ctx.restore();

  softFocus(out, 0.30 * k);

  const flicker = 1 + (rand() - 0.5) * 0.14 * k;
  pixelPass(ctx, w, h, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * 1.10 * flicker + 10 * k;
      let g = d[i + 1] * 1.01 * flicker + 5 * k;
      let b = d[i + 2] * 0.84 * flicker + 2 * k;
      r = (r - 128) * (1 + 0.10 * k) + 128;
      g = (g - 128) * (1 + 0.10 * k) + 128;
      b = (b - 128) * (1 + 0.10 * k) + 128;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1 - 0.18 * k;
      const n = (rand() - 0.5) * 42 * k;
      d[i] = lum + (r - lum) * sat + n;
      d[i + 1] = lum + (g - lum) * sat + n;
      d[i + 2] = lum + (b - lum) * sat + n * 0.8;
    }
  });

  unevenExposure(ctx, w, h, rand, k);
  filmDirt(ctx, w, h, rand, k);
  vignette(ctx, w, h, 0.42 * k);
}

function hi8(out, src, k, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);
  softFocus(out, 0.34 * k);

  pixelPass(ctx, w, h, (d, ww, hh) => {
    const copy = new Uint8ClampedArray(d);
    chromaShift(d, copy, ww, hh, 1.4 * k);
    for (let y = 0; y < hh; y++) {
      const scan = (y & 1) ? 1 - 0.05 * k : 1;
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        // 退色: コントラストを落とし、黒を持ち上げ、全体を黄へ転ばせる
        let r = d[i] * 0.96 + 20 * k;
        let g = d[i + 1] * 0.95 + 18 * k;
        let b = d[i + 2] * 0.88 + 12 * k;
        const fade = 1 - 0.14 * k;
        r = (r - 128) * fade + 128;
        g = (g - 128) * fade + 128;
        b = (b - 128) * fade + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(0, 1 - 0.34 * k);
        const n = (rand() - 0.5) * 18 * k;
        d[i] = (lum + (r - lum) * sat + n) * scan;
        d[i + 1] = (lum + (g - lum) * sat + n) * scan;
        d[i + 2] = (lum + (b - lum) * sat + n * 1.2) * scan;
      }
    }
    if (k > 0.5) dropoutBands(d, ww, hh, rand, Math.floor(rand() * 2), 0.012 * k);
  });

  vignette(ctx, w, h, 0.24 * k);
}

function vhs(out, src, k, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);
  softFocus(out, 0.26 * k);

  pixelPass(ctx, w, h, (d, ww, hh) => {
    const copy = new Uint8ClampedArray(d);
    chromaShift(d, copy, ww, hh, 3.2 * k);
    dropoutBands(d, ww, hh, rand, 2 + Math.floor(rand() * 3 * k), 0.045 * k);
    for (let y = 0; y < hh; y++) {
      const scan = (y & 1) ? 1 - 0.12 * k : 1;
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        let r = d[i] * 1.05 + 9 * k;
        let g = d[i + 1] * 0.97 + 6 * k;
        let b = d[i + 2] * 1.02 + 15 * k;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1 + 0.12 * k;
        const n = (rand() - 0.5) * 30 * k;
        d[i] = (lum + (r - lum) * sat + n) * scan;
        d[i + 1] = (lum + (g - lum) * sat + n) * scan;
        d[i + 2] = (lum + (b - lum) * sat + n) * scan;
      }
    }
  });

  trackingNoise(ctx, w, h, rand, k);
  vignette(ctx, w, h, 0.28 * k);
}

/* 平成のケータイ。低解像度・輪郭強調・白飛び・黒つぶれ */
function keitai(out, src, k, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);

  const long = Math.max(w, h);
  downRes(out, Math.max(120, long * (1 - 0.62 * Math.min(1, k))));
  sharpen(out, 1.15 * k);

  pixelPass(ctx, w, h, (d) => {
    // ホワイトバランスの癖。撮影ごとに固定
    const wbR = 1 + 0.06 * k, wbB = 1 - 0.05 * k;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * wbR, g = d[i + 1] * (1 + 0.01 * k), b = d[i + 2] * wbB;
      // ダイナミックレンジが狭い: 明部は飛び、暗部は潰れる
      const knee = (v) => {
        let x = v / 255;
        x = x < 0.18 ? x * (1 - 0.55 * k) : x;
        x = x > 0.72 ? 0.72 + (x - 0.72) * (1 + 1.5 * k) : x;
        return Math.min(255, x * 255);
      };
      r = knee(r); g = knee(g); b = knee(b);
      r = (r - 124) * (1 + 0.30 * k) + 120;
      g = (g - 124) * (1 + 0.30 * k) + 120;
      b = (b - 124) * (1 + 0.30 * k) + 120;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1 + 0.18 * k;
      const n = (rand() - 0.5) * 16 * k;
      d[i] = lum + (r - lum) * sat + n + 1 * k;
      d[i + 1] = lum + (g - lum) * sat + n + 3 * k;
      d[i + 2] = lum + (b - lum) * sat * 0.94 + n - 2 * k;
    }
  });

  vignette(ctx, w, h, 0.20 * k);
}

function simple(out, src, k, rand, p) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);
  pixelPass(ctx, w, h, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * p.gain[0] + p.lift[0] * k;
      let g = d[i + 1] * p.gain[1] + p.lift[1] * k;
      let b = d[i + 2] * p.gain[2] + p.lift[2] * k;
      const c = 1 + (p.contrast - 1) * k;
      r = (r - 128) * c + 128;
      g = (g - 128) * c + 128;
      b = (b - 128) * c + 128;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1 + (p.sat - 1) * k;
      const n = (rand() - 0.5) * p.grain * 2 * k;
      d[i] = lum + (r - lum) * sat + n;
      d[i + 1] = lum + (g - lum) * sat + n;
      d[i + 2] = lum + (b - lum) * sat + n;
    }
  });
  vignette(ctx, w, h, p.vignette * k);
}

const SIMPLE = {
  night: { gain: [0.92, 0.96, 1.12], lift: [4, 6, 18], contrast: 1.12, sat: 0.80, grain: 14, vignette: 0.40 },
  mono:  { gain: [1.12, 1.12, 1.12], lift: [5, 5, 5],  contrast: 1.20, sat: 0.00, grain: 15, vignette: 0.30 }
};

/**
 * フレーム1枚を加工して新しい canvas を返す。
 * @param {HTMLCanvasElement} source 元フレーム
 * @param {string} id FILTERS の id
 * @param {number} seed コマ番号（粒子と揺れを固定するため）
 * @param {number} k 強さ 0〜1.5
 */
export function applyFilter(source, id, seed = 0, k = 1) {
  const out = makeCanvas(source.width, source.height);
  const ctx = out.getContext('2d', { alpha: false });
  if (id === 'none' || k <= 0) {
    ctx.drawImage(source, 0, 0);
    return out;
  }
  const rand = seeded(seed * 7919 + 13);
  if (id === 'film8') film8(out, source, k, rand);
  else if (id === 'hi8') hi8(out, source, k, rand);
  else if (id === 'vhs') vhs(out, source, k, rand);
  else if (id === 'pop') keitai(out, source, k, rand);
  else if (SIMPLE[id]) simple(out, source, k, rand, SIMPLE[id]);
  else ctx.drawImage(source, 0, 0);
  return out;
}
