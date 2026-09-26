/* filters.js — 記録メディアごとの質感を作る
   簡単設定は「強さ」1つ。くわしい設定では、フィルターごとの要素を個別に動かせる。
   どちらも同じパラメータ（0〜150%）を使うので、値の意味は一貫している。 */

export const FILTERS = [
  { id: 'none',   label: { en: 'None', ja: 'なし' } },
  { id: 'hi8',    label: 'Hi8' },
  { id: 'vhs',    label: 'VHS' },
  { id: 'film8',  label: '8mm' },
  { id: 'pop',    label: { en: 'Feature phone', ja: 'ガラケー' } },
  { id: 'cinema', label: { en: 'Cinema', ja: '映画' } },
  { id: 'mono',   label: { en: 'Monochrome', ja: 'モノクロ' } }
];

/* パラメータ名の共有辞書。同じ概念（彩度・コントラストなど）が複数のフィルターで使われるため、
   ここでまとめて {en, ja} を持たせ、各フィルターのスキーマからは参照するだけにする。 */
const P = {
  fade:          { en: 'Fade', ja: '色あせ' },
  saturation:    { en: 'Saturation', ja: '彩度' },
  contrast:      { en: 'Contrast', ja: 'コントラスト' },
  yellow:        { en: 'Yellow tint', ja: '黄色味' },
  tapeNoiseHi8:  { en: 'Tape noise', ja: 'テープノイズ' },
  ccdSoftness:   { en: 'CCD softness', ja: 'CCDの柔らかさ' },
  scanlines:     { en: 'Scanlines', ja: 'スキャンライン' },
  colorBleed:    { en: 'Color bleed', ja: '色にじみ' },
  flicker:       { en: 'Flicker', ja: 'フリッカー' },
  instability:   { en: 'Screen instability', ja: '画面の不安定さ' },
  chromaAberr:   { en: 'Chromatic aberration', ja: '色収差' },
  noiseVHS:      { en: 'Noise', ja: 'ノイズ' },
  softFocus:     { en: 'Soft focus', ja: 'ソフトフォーカス' },
  tracking:      { en: 'Tracking distortion', ja: 'トラッキング乱れ' },
  grain:         { en: 'Grain', ja: '粒状感' },
  shake:         { en: 'Shake', ja: '揺れ' },
  exposure:      { en: 'Exposure unevenness', ja: '露出ムラ' },
  dust:          { en: 'Dust & scratches', ja: 'ゴミ・傷' },
  resolution:    { en: 'Resolution feel', ja: '解像感' },
  sharpen:       { en: 'Edge sharpening', ja: '輪郭強調' },
  crush:         { en: 'Clipping', ja: '白飛び・黒つぶれ' },
  whiteBalance:  { en: 'White balance drift', ja: 'ホワイトバランスの狂い' },
  noiseDigital:  { en: 'Digital noise', ja: 'デジタルノイズ' },
  warmth:        { en: 'Color temperature', ja: '色温度' },
  glow:          { en: 'Glow', ja: 'グロー' },
  vignette:      { en: 'Vignette', ja: '周辺減光' }
};

/* フィルターごとの、くわしい設定の項目。順番は画面に出る順そのまま */
export const PARAM_SCHEMAS = {
  hi8: [
    { key: 'fade',        label: P.fade },
    { key: 'saturation',  label: P.saturation },
    { key: 'contrast',    label: P.contrast },
    { key: 'yellow',      label: P.yellow },
    { key: 'tapeNoise',   label: P.tapeNoiseHi8 },
    { key: 'softFocus',   label: P.ccdSoftness },
    { key: 'scanlines',   label: P.scanlines },
    { key: 'chroma',      label: P.colorBleed },
    { key: 'flicker',     label: P.flicker },
    { key: 'instability', label: P.instability }
  ],
  vhs: [
    { key: 'saturation',  label: P.saturation },
    { key: 'contrast',    label: P.contrast },
    { key: 'chroma',      label: P.chromaAberr },
    { key: 'tapeNoise',   label: P.noiseVHS },
    { key: 'scanlines',   label: P.scanlines },
    { key: 'softFocus',   label: P.softFocus },
    { key: 'tracking',    label: P.tracking },
    { key: 'instability', label: P.instability }
  ],
  film8: [
    { key: 'grain',       label: P.grain },
    { key: 'instability', label: P.shake },
    { key: 'softFocus',   label: P.softFocus },
    { key: 'exposure',    label: P.exposure },
    { key: 'flicker',     label: P.flicker },
    { key: 'fade',        label: P.fade },
    { key: 'dust',        label: P.dust },
    { key: 'saturation',  label: P.saturation }
  ],
  pop: [
    { key: 'resolution',    label: P.resolution },
    { key: 'sharpen',       label: P.sharpen },
    { key: 'crush',         label: P.crush },
    { key: 'whiteBalance',  label: P.whiteBalance },
    { key: 'saturation',    label: P.saturation },
    { key: 'noise',         label: P.noiseDigital }
  ],
  cinema: [
    { key: 'saturation', label: P.saturation },
    { key: 'contrast',   label: P.contrast },
    { key: 'warmth',     label: P.warmth },
    { key: 'glow',       label: P.glow },
    { key: 'grain',      label: P.grain },
    { key: 'vignette',   label: P.vignette },
    { key: 'flicker',    label: P.flicker }
  ],
  mono: [
    { key: 'contrast',    label: P.contrast },
    { key: 'grain',       label: P.grain },
    { key: 'flicker',     label: P.flicker },
    { key: 'instability', label: P.shake },
    { key: 'vignette',    label: P.vignette },
    { key: 'softFocus',   label: P.softFocus }
  ]
};

/* 映画の色の方式。
   Trumpy & Flueckiger (2015) 「Light Source Criteria for Digitizing Color Films」が実測した
   1940年代カラー映画フィルムの染料吸収ピークを根拠に、単純なRGBティントではなく
   「各色の応答（露光record）を、隣接する色にわずかに漏れ込ませてから、
   フィルムの特性曲線（ハイライト圧縮・シャドーの持ち上げ）にかける」という
   簡略化したFilm Color Engineで発色を作る。波長そのものをRGB係数に置き換えているのではなく、
   ピーク位置から読み取れる「どの記録がどの色再現を主に・どれだけ汚して励起するか」という
   定性的な関係を数値化したもの（詳細は SLIDEBURST_Technicolor_Agfacolor_research.md 参照）。
   実際の写真フィルムはネガ→プリントの多段階の反転を経て最終的に見た目どおりの陽画に戻るが、
   ここではその「入力が明るいほど出力も明るい」という最終的な単調増加の関係だけを再現し、
   途中の反転工程そのものはモデル化していない。 */
export const CINEMA_VARIANTS = [
  { id: 'technicolor', label: { en: 'Technicolor', ja: 'テクニカラー' } },
  { id: 'agfa',         label: { en: 'Agfacolor', ja: 'アグファカラー' } }
];

const CINEMA_MODELS = {
  /* Technicolor 3-strip / dye-transfer（参照: Samson and Delilah, 1949 / The Wizard of Oz, 1939）。
     Magenta が575nm肩、Cyanが720nm成分を持つ＝理想的なCMYより汚れた分離をしている。
     クロストーク行列と特性曲線が実測データに基づく「フィルム材料としての土台」、
     hueAnchors以下が「観客が実際に見た、鮮烈で人工的な画面」を狙った色分離の仕上げ
     （SLIDEBURST 映画フィルター再設計指示.md 参照）。 */
  technicolor: {
    // 行 = [R応答, G応答, B応答]、列 = [R, G, B] 露光record からの寄与（対角が主応答、非対角が隣接色への漏れ込み）
    matrix: [
      [1.00, -0.06, 0.11],
      [-0.04, 1.00, 0.17],
      [0.02, -0.05, 1.00]
    ],
    toe: [0.020, 0.020, 0.025],       // シャドーでも完全な黒には落ちきらない＝黒に色が残る
    shoulder: [0.98, 0.975, 0.97],    // ハイライトはなだらかに圧縮（白飛びしにくい）
    gammaBase: 3.6,                   // 特性曲線の傾き＝コントラストの主因
    warmBias: 0.05,
    glowBase: 0.55,
    bloomTint: [1.08, 1.0, 0.85],
    grainDecorrelation: 0.55,
    keyImage: true,                   // dye-transferのblack/key版に相当する、輪郭方向の締まり
    keyImageBase: 0.20,               // 弱すぎた旧値(0.10)から引き上げ、色の境界が分離して見えるようにする
    paletteMute: 1.0,                 // 画面全体は鮮烈なまま（Agfacolorのように背景を静めない）
    chromaPivot: 0.32,                // このあたりの彩度を基準に、それより上/下を強調する
    chromaGain: 1.35,                 // 彩度差そのものを広げる＝色の境界を少し硬くする
    // 純赤・純黄・純青は色相を引き寄せた上で彩度を強く、緑は色相はそのままに彩度を抑える。
    // シアン・マゼンタはほぼ中立（Technicolorは緑もそれなりに明瞭に残す）
    hueAnchors: [
      { hue: 3,   sigma: 16, pull: 0.55, satBoost: 0.60 },
      { hue: 52,  sigma: 20, pull: 0.40, satBoost: 0.42 },
      { hue: 235, sigma: 26, pull: 0.45, satBoost: 0.48 },
      { hue: 120, sigma: 30, pull: 0.15, satBoost: -0.28 },
      { hue: 185, sigma: 26, pull: 0.10, satBoost: -0.08 },
      { hue: 300, sigma: 30, pull: 0.10, satBoost: -0.05 }
    ]
  },
  /* Agfacolor 1940s / subtractive three-color chromogenic monopack（参照: Opfergang, 1944 /
     小津安二郎『彼岸花』などの赤の再現）。Yellowのピークがより短波長寄り、Cyanは700nm超まで
     裾を引く＝Technicolorとは別の漏れ込み方。3-stripのような合成・matrix工程を経ない一枚の
     フィルムなので特性曲線は穏やかだが、見た目の狙いは正反対――画面全体は静かに抑え、
     赤だけを異様なほど強く浮かび上がらせる（Technicolorと同じ処理にはしない）。 */
  agfa: {
    matrix: [
      [1.00, -0.02, 0.05],
      [0.09, 1.00, -0.02],
      [-0.02, 0.06, 1.00]
    ],
    toe: [0.045, 0.050, 0.055],
    shoulder: [0.955, 0.96, 0.95],
    gammaBase: 2.4,
    warmBias: 0.03,
    glowBase: 0.40,
    bloomTint: [1.02, 0.99, 0.90],
    grainDecorrelation: 0.8,
    keyImage: false,                  // Technicolorのdye-transfer black版に相当するものを持たないため
    paletteMute: 0.62,                // 背景をあらかじめ静める。赤のsatBoostがここから跳ね上げる
    chromaPivot: 0.28,
    chromaGain: 1.55,                 // 「静かな背景」と「浮き出る赤」の差をTechnicolorより広げる
    // 赤だけ突出して強く、黄はアクセント程度。青・緑・シアンは静かな背景側へ抑える
    hueAnchors: [
      { hue: 3,   sigma: 14, pull: 0.65, satBoost: 1.05 },
      { hue: 52,  sigma: 18, pull: 0.30, satBoost: 0.25 },
      { hue: 235, sigma: 28, pull: 0.20, satBoost: -0.10 },
      { hue: 120, sigma: 32, pull: 0.15, satBoost: -0.25 },
      { hue: 185, sigma: 28, pull: 0.12, satBoost: -0.15 },
      { hue: 300, sigma: 30, pull: 0.08, satBoost: -0.05 }
    ]
  }
};

/* 特性曲線（H&Dカーブ）を0〜1の256分割LUTにしておく。
   S字カーブの傾き(gamma)でコントラスト、toe/shoulderでシャドー・ハイライトの粘りを作る。
   毎ピクセルでMath.exp()を呼ばずに済むよう、フィルター1回の呼び出しにつき事前に計算する。 */
function buildCurveLUT(toe, shoulder, gamma, size = 257) {
  const lut = new Float32Array(size);
  const s0 = 1 / (1 + Math.exp(gamma * 0.5));
  const s1 = 1 / (1 + Math.exp(-gamma * 0.5));
  const denom = (s1 - s0) || 1e-6;
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    const s = 1 / (1 + Math.exp(-gamma * (x - 0.5)));
    lut[i] = toe + (shoulder - toe) * ((s - s0) / denom);
  }
  return lut;
}

function sampleLUT(lut, x) {
  const n = lut.length - 1;
  const f = (x < 0 ? 0 : x > 1 ? 1 : x) * n;
  const i0 = f | 0;
  const i1 = i0 < n ? i0 + 1 : n;
  const t = f - i0;
  return lut[i0] + (lut[i1] - lut[i0]) * t;
}

/* ここから「色分離」の仕組み（SLIDEBURST 映画フィルター再設計指示.md 参照）。
   3x3のクロストーク行列と特性曲線だけでは、実写を見ると「RGBを少し変形した画像」の域を出ず、
   古典映画特有の「色が面として分離して見える」感じにはならなかった。そこでHSLへ変換し、
   純赤・純黄・純青のようないくつかの「アンカー色相」へ連続的に色相を引き寄せつつ、
   アンカーに近い色（＝もともとその色に近い部分）ほど彩度を強く・遠い色（緑など）は
   彩度を抑える、という選択的な処理を加える。ポスタライズのような色数そのものの削減はせず、
   あくまで連続画像のまま「色の境界を強調する」方向を狙っている。 */

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (((h % 360) + 360) % 360) / 360;
  return [hue2rgb(p, q, hk + 1 / 3), hue2rgb(p, q, hk), hue2rgb(p, q, hk - 1 / 3)];
}

/* 色相hが、方式ごとに用意した「アンカー色相」（純赤・純黄・純青など）へどれだけ近いかを
   ガウス関数で重み付けし、[色相をアンカー側へ引き寄せる量, 彩度を増減する量]を
   加重平均で返す。単純な合計ではなく加重平均にしているのは、肌色のように2つのアンカー
   （赤と黄）の中間にある色が、両方の効果を二重に受けて過剰に強調されるのを防ぐため
   （特に「肌色まで真っ赤にする」ことは明確に避けたい）。 */
function purifyHue(h, anchors) {
  let wSum = 0, hueShiftSum = 0, satBoostSum = 0;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    let d = h - a.hue;
    d = ((d + 180) % 360 + 360) % 360 - 180;
    const w = Math.exp(-(d * d) / (2 * a.sigma * a.sigma));
    wSum += w;
    hueShiftSum += w * -d * a.pull;
    satBoostSum += w * a.satBoost;
  }
  const norm = wSum > 0.3 ? wSum : 0.3;
  return [hueShiftSum / norm, satBoostSum / norm];
}

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

/* --- Hi8: CCD Handycamの撮像・記録過程を意識した処理 ---------------------

   単純な「ぼかしフィルター」ではなく、
     (a) レンズ／CCDによる光学的な高周波の減衰＋ハイライトのにじみ（ハレーション）
     (b) 輝度(Y)と色(C)を分けて、Cのほうをよりはっきり低帯域化する
   という2段階で、画像の「情報の残り方」そのものをHi8のCCD Handycamらしくする。
   大きな輪郭やコントラストはそのまま残し、ピクセル単位の高周波ディテールだけを
   穏やかに間引く。全体に均一なGaussian Blurをかける映画的なソフトフォーカスとは違う。
   （詳しい設計意図は DEVELOPER_NOTES.md の該当節を参照） */

function clampi(v, min, max) { return v < min ? min : (v > max ? max : v); }

/* 指定チャンネル（0=R,1=G,2=B）だけを取り出す／書き戻す。Y/Cb/Cr各面の抽出にも使う */
function extractChannel(data, w, h, c) {
  const n = w * h;
  const out = new Float32Array(n);
  for (let p = 0, i = c; p < n; p++, i += 4) out[p] = data[i];
  return out;
}

/* extractChannel の逆。処理し終えたチャンネルを書き戻す */
function writeChannel(data, plane, w, h, c) {
  const n = w * h;
  for (let p = 0, i = c; p < n; p++, i += 4) data[i] = plane[p];
}

/* 1次元の箱ぼかしを横→縦の2パスに分けて適用する（半径によらず画素数に比例する速さで済む）。
   端は同じ画素を繰り返す（クランプ）ことで、画面端が不自然に暗くならないようにする。 */
function boxBlurPlane(src, w, h, r) {
  if (r <= 0) return src.slice();
  const size = r * 2 + 1;
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + clampi(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / size;
      sum += src[row + clampi(x + r + 1, 0, w - 1)] - src[row + clampi(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clampi(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / size;
      sum += tmp[clampi(y + r + 1, 0, h - 1) * w + x] - tmp[clampi(y - r, 0, h - 1) * w + x];
    }
  }
  return dst;
}

/* ①②③④⑤⑥ レンズ／CCDの光学的な柔らかさ（高周波低下＋ハレーション）と、
   Y/C分離での色の低帯域化を、ひとつのバッファの上でまとめて行う。
   （getImageData/putImageDataは画像全体のコピーを伴い重いので、段階ごとに分けず1回にまとめてある。
   処理の内容そのものは、分けて書いた場合と変わらない） */
function hi8OpticalAndChroma(d, w, h, amount) {
  if (amount <= 0.01) return;
  const R = extractChannel(d, w, h, 0), G = extractChannel(d, w, h, 1), B = extractChannel(d, w, h, 2);
  const n = w * h;

  // ①② 高周波の穏やかな減衰（半径1の箱ぼかしを部分的にしか混ぜない＝中間の周波数はほぼ残る）
  const highFreqMix = Math.min(0.6, 0.46 * amount);
  const Rb = boxBlurPlane(R, w, h, 1), Gb = boxBlurPlane(G, w, h, 1), Bb = boxBlurPlane(B, w, h, 1);
  for (let p = 0; p < n; p++) {
    R[p] = R[p] * (1 - highFreqMix) + Rb[p] * highFreqMix;
    G[p] = G[p] * (1 - highFreqMix) + Gb[p] * highFreqMix;
    B[p] = B[p] * (1 - highFreqMix) + Bb[p] * highFreqMix;
  }

  // ②' もう一段階、少し広めの半径を弱めに混ぜる。「眠い」「べたっとした」見え方は、
  // 一番細かい高周波だけでなく、もう少し広い帯域までなだらかに削れていくことで出る。
  // 半径1だけだと、レンズ・CCDの柔らかさというより「輪郭だけがちょっと甘い」程度で止まってしまう。
  const midFreqMix = Math.min(0.4, 0.3 * amount);
  const Rm = boxBlurPlane(R, w, h, 2), Gm = boxBlurPlane(G, w, h, 2), Bm = boxBlurPlane(B, w, h, 2);
  for (let p = 0; p < n; p++) {
    R[p] = R[p] * (1 - midFreqMix) + Rm[p] * midFreqMix;
    G[p] = G[p] * (1 - midFreqMix) + Gm[p] * midFreqMix;
    B[p] = B[p] * (1 - midFreqMix) + Bm[p] * midFreqMix;
  }

  // ③ ハレーション／薄いにじみ。明るい部分だけでなく中間より上の明るさも広く柔らかく持ち上げることで、
  // 全体がうっすら白っぽく霞んだような「べたっとした」質感を足す（明るい部分ほど強く効く）
  const bright = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const y = 0.299 * R[p] + 0.587 * G[p] + 0.114 * B[p];
    const v = y - 150;
    bright[p] = v > 0 ? v : 0;
  }
  const haloR = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const halo = boxBlurPlane(bright, w, h, haloR);
  const gain = 0.7 * amount;
  for (let p = 0; p < n; p++) {
    const a = Math.min(150, halo[p] * gain);
    if (a <= 0.4) continue;
    R[p] = 255 - (255 - R[p]) * (255 - a) / 255;
    G[p] = 255 - (255 - G[p]) * (255 - a) / 255;
    B[p] = 255 - (255 - B[p]) * (255 - a) / 255;
  }

  // ④⑤⑥ 輝度(Y)と色(C)を分け、Cのほうを明確に低帯域化する（Yはここでは触らない）
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const r = R[p], g = G[p], b = B[p];
    Y[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[p] = -0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[p] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  const radius = Math.max(1, Math.round(1 + 2.4 * amount));
  const cb = boxBlurPlane(Cb, w, h, radius);
  const cr = boxBlurPlane(Cr, w, h, radius);
  for (let p = 0; p < n; p++) {
    const y = Y[p], u = cb[p], v = cr[p];
    R[p] = y + 1.402 * v;
    G[p] = y - 0.344136 * u - 0.714136 * v;
    B[p] = y + 1.772 * u;
  }

  writeChannel(d, R, w, h, 0);
  writeChannel(d, G, w, h, 1);
  writeChannel(d, B, w, h, 2);
}

/* --- 各プリセット ---------------------------------------------------- */

function hi8(out, src, p, rand) {
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });

  const fade = pct(p, 'fade'), saturation = pct(p, 'saturation'), contrast = pct(p, 'contrast'),
    yellow = pct(p, 'yellow'), tapeNoise = pct(p, 'tapeNoise'), soft = pct(p, 'softFocus'),
    scan = pct(p, 'scanlines'), chroma = pct(p, 'chroma'), flicker = pct(p, 'flicker'),
    instability = pct(p, 'instability');

  // 手ブレ・トラッキングに相当する上下のわずかなジッター
  const jy = (rand() - 0.5) * h * 0.012 * instability;
  ctx.drawImage(src, 0, jy);

  // 以降は1回のgetImageData/putImageDataの中で完結させる（画像全体のコピーが重いため）
  const scanAmt = 0.035 * scan;
  const satFactor = clamp(saturation / 1.5, 0, 1.3);
  // 以前より低めのベース（黒が締まりすぎない、ぱきっとしすぎないコントラスト）
  const contrastMul = 0.66 + 0.26 * contrast;
  const fadeC = 1 - 0.16 * fade;
  const flickerMul = 1 + (rand() - 0.5) * 0.16 * flicker;
  // 黒浮き・薄いもや（veiling glare）。CCD・レンズの光の滲みで、黒が締まりきらず、
  // 全体がうっすら白く霞んだような「べたっとした」質感になる。暗い部分ほど強く、
  // 明るい部分にはほとんど乗らない（色そのものは薄くならない）。CCDの柔らかさの一部として、
  // 「softFocus」の強さに連動させる（0%でも最低限は残る＝Hi8は元からこの傾向がある）
  const liftMax = 8 + 16 * soft;

  pixelPass(ctx, w, h, (d, ww, hh) => {
    // ①②③ レンズ／CCDの光学的な柔らかさ＋ハレーション（Y/C分離の前、光として一体だった段階）
    // ④⑤⑥ Y/C分離。Cのほうをはっきり低帯域化して色の境界を柔らかくする
    hi8OpticalAndChroma(d, ww, hh, soft);

    // ⑦⑧⑨ アナログ記録・再生・コンポジット出力由来の質感と、テープノイズ・フリッカーなど
    // （CCDの柔らかさが主役なので、以前よりはっきり弱めにしてある）
    const copy = new Uint8ClampedArray(d);
    // Hi8はY/C分離記録なので、コンポジットのVHSほど色がにじまない。ごく弱いクロスカラー程度に留める
    if (chroma > 0.02) chromaShift(d, copy, ww, hh, 0.6 * chroma);
    for (let y = 0; y < hh; y++) {
      const scanMul = (y & 1) ? 1 - scanAmt : 1;
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        const r0 = d[i] * flickerMul + 6 * fade + 14 * yellow;
        const g0 = d[i + 1] * flickerMul + 6 * fade + 9 * yellow;
        const b0 = d[i + 2] * flickerMul + 6 * fade - 6 * yellow;
        // コントラスト・退色・黒浮きは明るさ(輝度)にだけ効かせ、色の差分（dr/dg/db）はそのまま保つ。
        // 輝度と色を分けずに r,g,b を直接縮めると、コントラストを下げるほど彩度まで一緒に落ちてしまう
        // （見た目の「薄さ」ではなく、実際に色が減ってしまう）。ここは分けて、色は satFactor だけで扱う。
        const lum0 = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const dr = r0 - lum0, dg = g0 - lum0, db = b0 - lum0;
        let lum = (lum0 - 128) * fadeC * contrastMul + 128;
        // 黒浮き・もや。暗いところほど強く効き、明るいところ（lum≈150以上）にはほぼ乗らない
        if (lum < 150) lum += liftMax * (1 - lum / 150);
        const n = (rand() - 0.5) * 22 * tapeNoise;
        d[i] = (lum + dr * satFactor + n) * scanMul;
        d[i + 1] = (lum + dg * satFactor + n) * scanMul;
        d[i + 2] = (lum + db * satFactor + n * 1.2) * scanMul;
      }
    }
    if (instability > 0.15) {
      dropoutBands(d, ww, hh, rand, Math.round(rand() * 2 * instability), 0.012 * instability);
    }
  });

  vignette(ctx, w, h, 0.18);
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

/* 映画。テクニカラーとアグファカラーの2方式を、それぞれ別のFilm Color Engineとして扱う。
   「クロストーク行列＋特性曲線」で実測データに基づく土台を作った後、HSLで色相ごとに
   選択的な色分離（purifyHue / チャンネル彩度コントラスト）を仕上げにかけている。
   彩度・コントラストのスライダーは、この一連の処理の途中にある基準値を動かす役目に留めている
   （詳細: SLIDEBURST_Technicolor_Agfacolor_research.md, SLIDEBURST 映画フィルター再設計指示.md）。 */
function cinema(out, src, p, rand, variantId) {
  const model = CINEMA_MODELS[variantId] || CINEMA_MODELS.technicolor;
  const w = out.width, h = out.height;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(src, 0, 0);

  const saturation = pct(p, 'saturation'), contrast = pct(p, 'contrast'), warmth = pct(p, 'warmth'),
    glow = pct(p, 'glow'), grain = pct(p, 'grain'), vig = pct(p, 'vignette'), flicker = pct(p, 'flicker');

  const glowAmt = glow * model.glowBase;
  if (glowAmt > 0.03) {
    // 画面全体を明るくするのではなく、明るい部分だけを抜き出してにじませる（ハレーション的な処理）。
    // このとき方式ごとの色味（bloomTint）を軽くかけておくと、あとの特性曲線を通った後の
    // にじみの色味にも方式ごとの個性が出る
    const highlight = makeCanvas(w, h);
    const hctx = highlight.getContext('2d', { alpha: false });
    hctx.drawImage(out, 0, 0);
    const [bt0, bt1, bt2] = model.bloomTint;
    pixelPass(hctx, w, h, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bright = Math.max(0, (lum - 190) / 65);
        d[i] = d[i] * bright * bt0;
        d[i + 1] = d[i + 1] * bright * bt1;
        d[i + 2] = d[i + 2] * bright * bt2;
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

  // コントラストのスライダーは、特性曲線そのものの傾き(gamma)を動かす。
  // 単なる後がけのコントラスト強調ではなく、フィルムの現像特性を強め・弱めするイメージ
  const gamma = model.gammaBase * (0.5 + contrast);
  const lutR = buildCurveLUT(model.toe[0], model.shoulder[0], gamma);
  const lutG = buildCurveLUT(model.toe[1], model.shoulder[1], gamma);
  const lutB = buildCurveLUT(model.toe[2], model.shoulder[2], gamma);

  const [[mRR, mRG, mRB], [mGR, mGG, mGB], [mBR, mBG, mBB]] = model.matrix;
  const warm = model.warmBias * warmth;
  const flickerMul = 1 + (rand() - 0.5) * 0.10 * flicker;
  const userSat = clamp(saturation, 0, 1.5);
  const grainAmt = 14 * grain;
  const decorr = model.grainDecorrelation;
  const anchors = model.hueAnchors;
  const paletteMute = model.paletteMute;
  const chromaPivot = model.chromaPivot;
  const chromaGain = model.chromaGain;

  pixelPass(ctx, w, h, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      // 0〜1の「露光record」。色温度はここで軽く効かせる（実際に感光する段階のバイアスとして）
      const rE = (d[i] / 255) * flickerMul * (1 + warm);
      const gE = (d[i + 1] / 255) * flickerMul;
      const bE = (d[i + 2] / 255) * flickerMul * (1 - warm);

      // 各色の応答。対角成分が主応答、非対角成分が隣接色への漏れ込み（クロストーク）
      let rResp = mRR * rE + mRG * gE + mRB * bE;
      let gResp = mGR * rE + mGG * gE + mGB * bE;
      let bResp = mBR * rE + mBG * gE + mBB * bE;
      rResp = rResp < 0 ? 0 : rResp > 1 ? 1 : rResp;
      gResp = gResp < 0 ? 0 : gResp > 1 ? 1 : gResp;
      bResp = bResp < 0 ? 0 : bResp > 1 ? 1 : bResp;

      // 特性曲線（ハイライト圧縮・シャドーの色残り）。ここまでが実測データに基づく「フィルム材料の土台」
      const r1 = sampleLUT(lutR, rResp);
      const g1 = sampleLUT(lutG, gResp);
      const b1 = sampleLUT(lutB, bResp);

      // ここから色分離の仕上げ。HSLへ変換し、純色アンカーへ色相を引き寄せつつ、
      // アンカーに近い色ほど彩度を強く（遠い色＝緑などは抑えて）、最後に彩度そのものの
      // コントラスト（背景は静かに、際立つ色はより際立つように）をかける
      const [hh, ss, ll] = rgbToHsl(r1, g1, b1);
      const [hueShift, satBoost] = purifyHue(hh, anchors);
      const newH = hh + hueShift;
      let s1 = ss * paletteMute * (1 + satBoost);
      s1 = s1 < 0 ? 0 : s1 > 1 ? 1 : s1;
      let s2 = chromaPivot + (s1 - chromaPivot) * chromaGain;
      s2 = s2 < 0 ? 0 : s2 > 1 ? 1 : s2;
      s2 *= userSat;
      s2 = s2 < 0 ? 0 : s2 > 1 ? 1 : s2;
      const [r2, g2, b2] = hslToRgb(newH, s2, ll);
      const rS = r2 * 255, gS = g2 * 255, bS = b2 * 255;

      // 粒状感。3チャンネルをある程度独立させ、単色ノイズではなく色のある粒子にする
      const n0 = (rand() - 0.5) * grainAmt;
      const n1 = n0 * (1 - decorr) + (rand() - 0.5) * grainAmt * decorr;
      const n2 = n0 * (1 - decorr) + (rand() - 0.5) * grainAmt * decorr;
      d[i] = rS + n0;
      d[i + 1] = gS + n1;
      d[i + 2] = bS + n2;
    }
  });

  // dye-transferのblack/key版に相当する、輪郭方向の締まり（Technicolorのみ。旧実装は弱すぎたため引き上げ）
  if (model.keyImage) sharpen(out, model.keyImageBase + 0.16 * contrast);

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
