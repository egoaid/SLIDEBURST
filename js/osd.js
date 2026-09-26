/* osd.js — 当時のビデオデッキがテープに焼き込んでいたような文字を映像へ重ねる
   （タイトルスーパー・PLAY/PAUSE表示・テープカウンター）。
   オフラインのPWAなのでWebフォントは読み込まず、OS標準のフォントだけで組む。 */

export const OSD_FONTS = [
  { id: 'gothic',  label: { en: 'Bold Gothic', ja: 'ゴシック太字' },   stack: "'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif", weight: 900, tracking: 0.01 },
  { id: 'rounded', label: { en: 'Rounded Gothic', ja: '丸ゴシック' },     stack: "'Hiragino Maru Gothic ProN', 'UD Digi Kyokasho NK-R', 'Yu Gothic', sans-serif", weight: 700, tracking: 0.02 },
  { id: 'mincho',  label: { en: 'Cinema Subtitle (Serif)', ja: '映画字幕風（明朝）' }, stack: "'Hiragino Mincho ProN', 'Yu Mincho', serif", weight: 700, tracking: 0 },
  { id: 'block',   label: { en: 'VHS Block', ja: 'VHSブロック体' },  stack: "'Arial Black', 'Hiragino Sans', sans-serif", weight: 900, tracking: 0.06 },
  { id: 'mono',    label: { en: 'Digital', ja: 'デジタル風' },     stack: "'Courier New', 'Osaka-Mono', monospace", weight: 700, tracking: 0.08 }
];

function fontOf(id) {
  return OSD_FONTS.find((f) => f.id === id) || OSD_FONTS[0];
}

/* fillText/strokeText には letter-spacing が無いので、1文字ずつ送りながら描く */
function trackedWidth(ctx, text, tracking) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return Math.max(0, w - tracking);
}

function drawTracked(ctx, text, x, y, tracking, stroke) {
  let cx = x;
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cx, y);
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/* 文字の幅を測るためだけの小さなcanvas */
let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export const TITLE_DEFAULT_X = 0.5;
export const TITLE_DEFAULT_Y = 0.84;

function titleMetrics(ctx, o, height) {
  const font = fontOf(o.font);
  const px = Math.max(10, height * 0.075 * ((o.sizePct || 100) / 100));
  const tracking = px * font.tracking;
  ctx.font = font.weight + ' ' + Math.round(px) + 'px ' + font.stack;
  const w = trackedWidth(ctx, o.text, tracking);
  return { font, px, tracking, w };
}

/**
 * タイトルの外枠（0〜1の割合。中心と大きさ）。ドラッグ操作の当たり判定と、点線ガイドに使う。
 * ブラウン管で曲げる前の座標。
 */
export function titleBox(o, width, height) {
  if (!o.text) return null;
  const m = titleMetrics(getMeasureCtx(), o, height);
  const cx = typeof o.titleX === 'number' ? o.titleX : TITLE_DEFAULT_X;
  const cy = typeof o.titleY === 'number' ? o.titleY : TITLE_DEFAULT_Y;
  return { cx, cy, w: m.w / width, h: (m.px * 1.05) / height };
}

/**
 * タイトルスーパー。titleX / titleY（0〜1）が文字の中心。ドラッグで自由に動かせる。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} o {text, font, color, outline, outlineColor, outlineWidthPct, sizePct, titleX, titleY, width, height}
 */
export function drawOSDTitle(ctx, o) {
  const text = o.text;
  if (!text) return;
  const outline = o.outline !== false;

  ctx.save();
  const m = titleMetrics(ctx, o, o.height);
  ctx.textBaseline = 'alphabetic';
  const cx = (typeof o.titleX === 'number' ? o.titleX : TITLE_DEFAULT_X) * o.width;
  const cy = (typeof o.titleY === 'number' ? o.titleY : TITLE_DEFAULT_Y) * o.height;
  const x = cx - m.w / 2;
  const y = cy + m.px * 0.325;

  if (outline) {
    ctx.strokeStyle = o.outlineColor || '#12161c';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(1, m.px * 0.16 * ((o.outlineWidthPct != null ? o.outlineWidthPct : 100) / 100));
  }
  ctx.fillStyle = o.color || '#ffffff';
  drawTracked(ctx, text, x, y, m.tracking, outline);
  ctx.restore();
}

/* 左上のPLAY/PAUSE表示。実機のOSDに寄せて、白文字+黒い影だけで組む（縁取り設定の影響を受けない） */
export function drawOSDTransport(ctx, { label = 'PLAY', width, height }) {
  if (!label) return;
  const px = Math.max(10, Math.min(width, height) * 0.052);
  const margin = Math.round(Math.min(width, height) * 0.045);
  ctx.save();
  ctx.font = '700 ' + Math.round(px) + 'px system-ui, "Hiragino Sans", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = px * 0.22;
  ctx.shadowOffsetX = px * 0.05;
  ctx.shadowOffsetY = px * 0.05;
  ctx.fillText('▶ ' + label, margin, margin + px * 0.86);
  ctx.restore();
}

/* テープカウンターの表記。0:00:00（時:分:秒）。再生位置の秒数から作る */
export function formatCounter(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* 右下のテープカウンター。ビデオデッキの経過時間表示と同じ h:mm:ss */
export function drawOSDCounter(ctx, { timeSec = 0, width, height, bottomOffset = 0 }) {
  const px = Math.max(10, Math.min(width, height) * 0.052);
  const margin = Math.round(Math.min(width, height) * 0.045);
  const text = formatCounter(timeSec);
  ctx.save();
  ctx.font = '700 ' + Math.round(px) + 'px "Courier New", "Osaka-Mono", monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = px * 0.22;
  ctx.shadowOffsetX = px * 0.05;
  ctx.shadowOffsetY = px * 0.05;
  const w = ctx.measureText(text).width;
  ctx.fillText(text, width - margin - w, height - margin - bottomOffset);
  ctx.restore();
}
