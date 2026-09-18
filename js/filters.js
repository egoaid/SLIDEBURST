/* filters.js — 記録メディアごとの質感を作る
   簡単設定は「強さ」1つ。くわしい設定では、フィルターごとの要素を個別に動かせる。
   どちらも同じパラメータ（0〜150%）を使うので、値の意味は一貫している。 */

export const FILTERS = [
  { id: 'none',   label: 'なし' },
  { id: 'hi8',    label: 'Hi8' },
  { id: 'vhs',    label: 'VHS' },
  { id: 'film8',  label: '8mm' },
  { id: 'pop',    label: 'ガラケー' },
  { id: 'cinema', label: '映画' },
  { id: 'mono',   label: 'モノクロ' }
];

/* フィルターごとの、くわしい設定の項目。順番は画面に出る順そのまま */
export const PARAM_SCHEMAS = {
  hi8: [
    { key: 'fade',        label: '色あせ' },
    { key: 'saturation',  label: '彩度' },
    { key: 'contrast',    label: 'コントラスト' },
    { key: 'yellow',      label: '黄色味' },
    { key: 'tapeNoise',   label: 'テープノイズ' },
    { key: 'softFocus',   label: 'ソフトフォーカス' },
    { key: 'scanlines',   label: 'スキャンライン' },
    { key: 'chroma',      label: '色収差' },
    { key: 'flicker',     label: 'フリッカー' },
    { key: 'instability', label: '画面の不安定さ' }
  ],
  vhs: [
    { key: 'saturation',  label: '彩度' },
    { key: 'contrast',    label: 'コントラスト' },
    { key: 'chroma',      label: '色収差' },
    { key: 'tapeNoise',   label: 'ノイズ' },
    { key: 'scanlines',   label: 'スキャンライン' },
    { key: 'softFocus',   label: 'ソフトフォーカス' },
    { key: 'tracking',    label: 'トラッキング乱れ' },
    { key: 'instability', label: '画面の不安定さ' }
  ],
  film8: [
    { key: 'grain',       label: '粒状感' },
    { key: 'instability', label: '揺れ' },
    { key: 'softFocus',   label: 'ソフトフォーカス' },
    { key: 'exposure',    label: '露出ムラ' },
    { key: 'flicker',     label: 'フリッカー' },
    { key: 'fade',        label: '色あせ' },
    { key: 'dust',        label: 'ゴミ・傷' },
    { key: 'saturation',  label: '彩度' }
  ],
  pop: [
    { key: 'resolution',    label: '解像感' },
    { key: 'sharpen',       label: '輪郭強調' },
    { key: 'crush',         label: '白飛び・黒つぶれ' },
    { key: 'whiteBalance',  label: 'ホワイトバランスの狂い' },
    { key: 'saturation',    label: '彩度' },
    { key: 'noise',         label: 'デジタルノイズ' }
  ],
  cinema: [
    { key: 'saturation', label: '彩度' },
    { key: 'contrast',   label: 'コントラスト' },
    { key: 'warmth',     label: '色温度' },
    { key: 'glow',       label: 'グロー' },
    { key: 'grain',      label: '粒状感' },
    { key: 'vignette',   label: '周辺減光' },
    { key: 'flicker',    label: 'フリッカー' }
  ],
  mono: [
    { key: 'contrast',    label: 'コントラスト' },
    { key: 'grain',       label: '粒状感' },
    { key: 'flicker',     label: 'フリッカー' },
    { key: 'instability', label: '揺れ' },
    { key: 'vignette',    label: '周辺減光' },
    { key: 'softFocus',   label: 'ソフトフォーカス' }
  ]
};

/* 映画の色の方式。テクニカラーは三色分解プロセスの発色、アグファは国産カラーの穏やかな発色 */
export const CINEMA_VARIANTS = [
  { id: 'technicolor', label: 'テクニカラー' },
  { id: 'agfa',         label: 'アグファカラー' }
];

const VARIANT_BASE = {
  technicolor: { sat: 1.22, contrast: 1.06, tint: [1.05, 1.01, 0.97], glow: 0.55 },
  agfa:        { sat: 0.92, contrast: 0.94, tint: [1.04, 1.00, 0.94], glow: 0.4 }
};

/* 強さ(0〜150)を、その ID が持つ全項目に一律で適用したデフォルト値を作る */
export function getDefaultParams(id, intensityPct = 100, extra = {}) {
  const schema = PARAM_SCHEMAS[id];
  const out = Object.assign({}, extra);
  if (!schema) return out;
  for (const item of schema) out[item.key] = intensityPct;
  return out;
}

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

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* パラメータのパーセントを 0〜1.5 の係数へ。未指定なら100%扱い */
function pct(p, key, def = 100) {
  const v = typeof p[key] === 'number' ? p[key] : def;
  return v / 100;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixelPass(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h);
  fn(img.data, w, h);
  ctx.putImageData(img, 0, 0);
}

/* 縮小して戻すことで、軽いソフトフォーカスを作る */
function softFocus(canvas, amount) {
  if (amount <= 0.01) return;
  const w = canvas.width, h = canvas.height;
  const sw = Math.max(2, Math.round(w * (1 - Math.min(0.75, amount))));
  const sh = Math.max(2, Math.round(h * (1 - Math.min(0.75, amount))));
  const small = makeCanvas(sw, sh);
  small.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, sw, sh);
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
  if (count <= 0 || strength <= 0) return;
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
  if (k <= 0.02) return;
  const bh = Math.max(3, h * 0.035 * k);
  const y = h - bh - h * 0.01;
  ctx.save();
  ctx.globalAlpha = 0.28 * Math.min(1.3, k);
  for (let i = 0; i < 26; i++) {
    const yy = y + rand() * bh;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#7a7a7a';
    ctx.fillRect(rand() * w, yy, w * (0.04 + rand() * 0.22), 1 + rand() * 1.5);
  }
  ctx.restore();
}

/* フィルムのゴミと擦り傷 */
function filmDirt(ctx, w, h, rand, k) {
  if (k <= 0.02) return;
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
  if (amount <= 0.01) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.75, amount) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* 露出ムラ。フィルムの片側だけ明るくなる感じ */
function unevenExposure(ctx, w, h, rand, k) {
  if (k <= 0.02) return;
  const g = ctx.createLinearGradient(0, 0, w * (rand() > 0.5 ? 1 : -1), h);
  g.addColorStop(0, 'rgba(255,238,200,' + (0.10 * k) + ')');
  g.addColorStop(0.55, 'rgba(255,238,200,0)');
  g.addColorStop(1, 'rgba(40,20,0,' + (0.10 * k) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* --- 各プリセット ---------------------------------------------------- */

function hi8(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  const fade = pct(p, 'fade'), saturation = pct(p, 'saturation'), contrast = pct(p, 'contrast'),
    yellow = pct(p, 'yellow'), tapeNoise = pct(p, 'tapeNoise'), soft = pct(p, 'softFocus'),
    scan = pct(p, 'scanlines'), chroma = pct(p, 'chroma'), flicker = pct(p, 'flicker'),
    instability = pct(p, 'instability');

  const jy = (rand() - 0.5) * h * 0.012 * instability;
  ctx.drawImage(src, 0, jy);
  softFocus(out, 0.34 * soft);

  const satFactor = clamp(saturation / 1.5, 0, 1.3);
  const contrastMul = 0.78 + 0.5 * contrast;
  const fadeC = 1 - 0.16 * fade;
  const flickerMul = 1 + (rand() - 0.5) * 0.16 * flicker;
  const scanAmt = 0.05 * scan;

  pixelPass(ctx, w, h, (d, ww, hh) => {
    const copy = new Uint8ClampedArray(d);
    if (chroma > 0.02) chromaShift(d, copy, ww, hh, 1.4 * chroma);
    for (let y = 0; y < hh; y++) {
      const scanMul = (y & 1) ? 1 - scanAmt : 1;
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        let r = d[i] * flickerMul + 6 * fade + 14 * yellow;
        let g = d[i + 1] * flickerMul + 6 * fade + 9 * yellow;
        let b = d[i + 2] * flickerMul + 6 * fade - 6 * yellow;
        r = (r - 128) * fadeC * contrastMul + 128;
        g = (g - 128) * fadeC * contrastMul + 128;
        b = (b - 128) * fadeC * contrastMul + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const n = (rand() - 0.5) * 36 * tapeNoise;
        d[i] = (lum + (r - lum) * satFactor + n) * scanMul;
        d[i + 1] = (lum + (g - lum) * satFactor + n) * scanMul;
        d[i + 2] = (lum + (b - lum) * satFactor + n * 1.2) * scanMul;
      }
    }
    if (instability > 0.15) {
      dropoutBands(d, ww, hh, rand, Math.round(rand() * 2 * instability), 0.012 * instability);
    }
  });

  vignette(ctx, w, h, 0.22);
}

function vhs(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  const saturation = pct(p, 'saturation'), contrast = pct(p, 'contrast'), chroma = pct(p, 'chroma'),
    tapeNoise = pct(p, 'tapeNoise'), scan = pct(p, 'scanlines'), soft = pct(p, 'softFocus'),
    tracking = pct(p, 'tracking'), instability = pct(p, 'instability');

  const jy = (rand() - 0.5) * h * 0.01 * instability;
  ctx.drawImage(src, 0, jy);
  softFocus(out, 0.26 * soft);

  const satFactor = 0.88 + 0.24 * saturation;
  const contrastMul = 0.8 + 0.4 * contrast;
  const scanAmt = 0.12 * scan;
  const dropCount = Math.round((2 + rand() * 3) * instability);
  const dropStrength = 0.045 * instability;

  pixelPass(ctx, w, h, (d, ww, hh) => {
    const copy = new Uint8ClampedArray(d);
    if (chroma > 0.02) chromaShift(d, copy, ww, hh, 3.2 * chroma);
    if (instability > 0.05) dropoutBands(d, ww, hh, rand, dropCount, dropStrength);
    for (let y = 0; y < hh; y++) {
      const scanMul = (y & 1) ? 1 - scanAmt : 1;
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        let r = d[i] + 9, g = d[i + 1] + 6, b = d[i + 2] + 15;
        r = (r - 128) * contrastMul + 128;
        g = (g - 128) * contrastMul + 128;
        b = (b - 128) * contrastMul + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const n = (rand() - 0.5) * 30 * tapeNoise;
        d[i] = (lum + (r - lum) * satFactor + n) * scanMul;
        d[i + 1] = (lum + (g - lum) * satFactor + n) * scanMul;
        d[i + 2] = (lum + (b - lum) * satFactor + n) * scanMul;
      }
    }
  });

  trackingNoise(ctx, w, h, rand, tracking);
  vignette(ctx, w, h, 0.22);
}

function film8(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  const grain = pct(p, 'grain'), instability = pct(p, 'instability'), soft = pct(p, 'softFocus'),
    exposure = pct(p, 'exposure'), flicker = pct(p, 'flicker'), fade = pct(p, 'fade'),
    dust = pct(p, 'dust'), saturation = pct(p, 'saturation');

  const jx = (rand() - 0.5) * w * 0.008 * instability;
  const jy = (rand() - 0.5) * h * 0.010 * instability;
  const zoom = 1 + (0.006 + rand() * 0.006) * instability;
  ctx.save();
  ctx.translate(w / 2 + jx, h / 2 + jy);
  ctx.scale(zoom, zoom);
  ctx.drawImage(src, -w / 2, -h / 2);
  ctx.restore();

  softFocus(out, 0.30 * soft);

  const flickerMul = 1 + (rand() - 0.5) * 0.14 * flicker;
  const satFactor = clamp(saturation * 0.82, 0, 1.3);
  const fadeC = 1 + 0.10 * fade;

  pixelPass(ctx, w, h, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * 1.10 * flickerMul + 10 * fade;
      let g = d[i + 1] * 1.01 * flickerMul + 5 * fade;
      let b = d[i + 2] * 0.84 * flickerMul + 2 * fade;
      r = (r - 128) * fadeC + 128;
      g = (g - 128) * fadeC + 128;
      b = (b - 128) * fadeC + 128;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = (rand() - 0.5) * 42 * grain;
      d[i] = lum + (r - lum) * satFactor + n;
      d[i + 1] = lum + (g - lum) * satFactor + n;
      d[i + 2] = lum + (b - lum) * satFactor + n * 0.8;
    }
  });

  unevenExposure(ctx, w, h, rand, exposure);
  filmDirt(ctx, w, h, rand, dust);
  vignette(ctx, w, h, 0.30);
}

/* 平成のケータイ。低解像度・輪郭強調・白飛び・黒つぶれ */
function keitai(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);

  const resolution = pct(p, 'resolution'), sharpenAmt = pct(p, 'sharpen'), crush = pct(p, 'crush'),
    wb = pct(p, 'whiteBalance'), saturation = pct(p, 'saturation'), noise = pct(p, 'noise');

  const long = Math.max(w, h);
  const reduce = clamp(0.62 * resolution, 0, 0.9);
  if (reduce > 0.02) downRes(out, Math.max(120, long * (1 - reduce)));
  sharpen(out, 1.15 * sharpenAmt);

  const satFactor = clamp(saturation * 1.18, 0, 1.6);
  const contrastPunch = 1 + 0.30 * crush;

  pixelPass(ctx, w, h, (d) => {
    const wbR = 1 + 0.06 * wb, wbB = 1 - 0.05 * wb;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * wbR, g = d[i + 1] * (1 + 0.01 * wb), b = d[i + 2] * wbB;
      const knee = (v) => {
        let x = v / 255;
        x = x < 0.18 ? x * (1 - 0.55 * crush) : x;
        x = x > 0.72 ? 0.72 + (x - 0.72) * (1 + 1.5 * crush) : x;
        return Math.min(255, x * 255);
      };
      r = knee(r); g = knee(g); b = knee(b);
      r = (r - 124) * contrastPunch + 120;
      g = (g - 124) * contrastPunch + 120;
      b = (b - 124) * contrastPunch + 120;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = (rand() - 0.5) * 16 * noise;
      d[i] = lum + (r - lum) * satFactor + n + 1;
      d[i + 1] = lum + (g - lum) * satFactor + n + 3;
      d[i + 2] = lum + (b - lum) * satFactor * 0.94 + n - 2;
    }
  });

  vignette(ctx, w, h, 0.20);
}

/* モノクロ。チャップリン時代のような白黒映画へ。
   彩度をいじって落とすのではなく、最初に単一の明るさ(Y)だけへ変換し、
   その後の処理はすべてその1値に対して行い、最後に r=g=b として書き戻す。
   3チャンネルに別々の計算を通さないので、色がにじみ出る余地が構造的にない。 */
function mono(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  const contrast = pct(p, 'contrast'), grain = pct(p, 'grain'), flicker = pct(p, 'flicker'),
    instability = pct(p, 'instability'), vig = pct(p, 'vignette'), soft = pct(p, 'softFocus');

  const jy = (rand() - 0.5) * h * 0.010 * instability;
  ctx.drawImage(src, 0, jy);
  softFocus(out, 0.22 * soft);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = 1 + 0.9 * contrast;
  const flickerMul = 1 + (rand() - 0.5) * 0.12 * flicker;

  for (let i = 0; i < d.length; i += 4) {
    let y = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * flickerMul;
    y = (y - 128) * c + 128;
    const n = (rand() - 0.5) * 30 * grain;
    const v = y + n;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  if (instability > 0.4 && rand() > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rand() > 0.5 ? '#050505' : '#f2f2f2';
    ctx.fillRect(rand() * w, 0, Math.max(1, w * 0.0025), h);
    ctx.restore();
  }

  vignette(ctx, w, h, 0.30 * vig);
}

/* 映画。テクニカラーとアグファカラーの2方式 */
function cinema(out, src, p, rand, variant) {
  const v = VARIANT_BASE[variant] || VARIANT_BASE.technicolor;
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);

  const saturation = pct(p, 'saturation'), contrast = pct(p, 'contrast'), warmth = pct(p, 'warmth'),
    glow = pct(p, 'glow'), grain = pct(p, 'grain'), vig = pct(p, 'vignette'), flicker = pct(p, 'flicker');

  const glowAmt = glow * v.glow;
  if (glowAmt > 0.03) {
    // 画面全体を明るくするのではなく、明るい部分だけを抜き出してにじませる
    const highlight = makeCanvas(w, h);
    const hctx = highlight.getContext('2d', { alpha: false });
    hctx.drawImage(out, 0, 0);
    pixelPass(hctx, w, h, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bright = Math.max(0, (lum - 190) / 65);
        d[i] *= bright; d[i + 1] *= bright; d[i + 2] *= bright;
      }
    });
    const small = makeCanvas(Math.max(2, w >> 4), Math.max(2, h >> 4));
    small.getContext('2d', { alpha: false }).drawImage(highlight, 0, 0, small.width, small.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * glowAmt;
    ctx.drawImage(small, 0, 0, w, h);
    ctx.restore();
  }

  const flickerMul = 1 + (rand() - 0.5) * 0.10 * flicker;
  const satFactor = clamp(v.sat * saturation, 0, 2.0);
  const contrastMul = v.contrast * (0.7 + 0.5 * contrast);
  const [tr, tg, tb] = v.tint;
  const warm = 1 + 0.12 * warmth;

  pixelPass(ctx, w, h, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * tr * flickerMul * warm;
      let g = d[i + 1] * tg * flickerMul;
      let b = d[i + 2] * tb * flickerMul / warm;
      r = (r - 128) * contrastMul + 128;
      g = (g - 128) * contrastMul + 128;
      b = (b - 128) * contrastMul + 128;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = (rand() - 0.5) * 16 * grain;
      d[i] = lum + (r - lum) * satFactor + n;
      d[i + 1] = lum + (g - lum) * satFactor + n;
      d[i + 2] = lum + (b - lum) * satFactor + n;
    }
  });

  vignette(ctx, w, h, 0.18 * vig);
}

/**
 * フレーム1枚を加工して新しい canvas を返す。
 * @param {HTMLCanvasElement} source 元フレーム
 * @param {string} id FILTERS の id
 * @param {number} seed コマ番号（粒子と揺れを固定するため）
 * @param {Object} params 0〜150 のパーセントで各項目を持つオブジェクト。cinema は variant も持つ
 */
export function applyFilter(source, id, seed = 0, params = {}) {
  const out = makeCanvas(source.width, source.height);
  const ctx = out.getContext('2d', { alpha: false });
  if (id === 'none') {
    ctx.drawImage(source, 0, 0);
    return out;
  }
  const rand = seeded(seed * 7919 + 13);
  if (id === 'film8') film8(out, source, params, rand);
  else if (id === 'hi8') hi8(out, source, params, rand);
  else if (id === 'vhs') vhs(out, source, params, rand);
  else if (id === 'pop') keitai(out, source, params, rand);
  else if (id === 'mono') mono(out, source, params, rand);
  else if (id === 'cinema') cinema(out, source, params, rand, params.variant || 'technicolor');
  else ctx.drawImage(source, 0, 0);
  return out;
}
