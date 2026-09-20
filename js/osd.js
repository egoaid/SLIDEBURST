/* osd.js — 当時のビデオデッキがテープに焼き込んでいたような文字を映像へ重ねる
   （タイトルスーパー・PLAY/PAUSE表示・テープカウンター）。
   オフラインのPWAなのでWebフォントは読み込まず、OS標準のフォントだけで組む。 */

export const OSD_FONTS = [
  { id: 'gothic',  label: 'ゴシック太字',   stack: "'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif", weight: 900, tracking: 0.01 },
  { id: 'rounded', label: '丸ゴシック',     stack: "'Hiragino Maru Gothic ProN', 'UD Digi Kyokasho NK-R', 'Yu Gothic', sans-serif", weight: 700, tracking: 0.02 },
  { id: 'mincho',  label: '映画字幕風（明朝）', stack: "'Hiragino Mincho ProN', 'Yu Mincho', serif", weight: 700, tracking: 0 },
  { id: 'block',   label: 'VHSブロック体',  stack: "'Arial Black', 'Hiragino Sans', sans-serif", weight: 900, tracking: 0.06 },
  { id: 'mono',    label: 'デジタル風',     stack: "'Courier New', 'Osaka-Mono', monospace", weight: 700, tracking: 0.08 }
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

/**
 * タイトルスーパー。画面下寄りに中央揃えで、大きめの縁取り文字を出す。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} o {text, font, color, outline, outlineColor, outlineWidthPct, sizePct, width, height}
 */
export function drawOSDTitle(ctx, o) {
  const text = o.text;
  if (!text) return;
  const font = fontOf(o.font);
  const px = Math.max(10, o.height * 0.075 * ((o.sizePct || 100) / 100));
  const tracking = px * font.tracking;
  const outline = o.outline !== false;

  ctx.save();
  ctx.font = font.weight + ' ' + Math.round(px) + 'px ' + font.stack;
  ctx.textBaseline = 'alphabetic';
  const w = trackedWidth(ctx, text, tracking);
  const x = (o.width - w) / 2;
  const y = o.height * 0.86;

  if (outline) {
    ctx.strokeStyle = o.outlineColor || '#12161c';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(1, px * 0.16 * ((o.outlineWidthPct != null ? o.outlineWidthPct : 100) / 100));
  }
  ctx.fillStyle = o.color || '#ffffff';
  drawTracked(ctx, text, x, y, tracking, outline);
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

/* 右下のテープカウンター。時刻ではなく、実機の機械式カウンターと同じ「巻き取り量」
   相当の4桁の数字にしている（呼び出し側が渡す value を毎コマ増やすだけで動く）。 */
export function drawOSDCounter(ctx, { value = 0, width, height }) {
  const px = Math.max(10, Math.min(width, height) * 0.052);
  const margin = Math.round(Math.min(width, height) * 0.045);
  const text = String(((Math.round(value) % 10000) + 10000) % 10000).padStart(4, '0');
  ctx.save();
  ctx.font = '700 ' + Math.round(px) + 'px "Courier New", "Osaka-Mono", monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = px * 0.22;
  ctx.shadowOffsetX = px * 0.05;
  ctx.shadowOffsetY = px * 0.05;
  const w = ctx.measureText(text).width;
  ctx.fillText(text, width - margin - w, height - margin);
  ctx.restore();
}
