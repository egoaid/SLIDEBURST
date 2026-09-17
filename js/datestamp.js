/* datestamp.js — 当時のビデオカメラ風の日付焼き込み
   数字は7セグメント表示で描く。webフォントに依存しない。 */

const SEGMENTS = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'
};

/* 撮影時刻から既定の表示文字列を作る */
export function defaultStampText(date = new Date()) {
  const yy = String(date.getFullYear()).slice(2);
  return "'" + yy + ' ' + (date.getMonth() + 1) + ' ' + date.getDate();
}

function drawDigit(ctx, ch, x, y, w, h, t) {
  const segs = SEGMENTS[ch];
  if (!segs) return;
  const g = t * 0.42;           // セグメント同士の隙間
  const mid = y + h / 2;
  const hx0 = x + t * 0.55;
  const hx1 = x + w - t * 0.55;

  const hbar = (cy) => ctx.fillRect(hx0, cy - t / 2, hx1 - hx0, t);
  const vbar = (cx, y0, y1) => ctx.fillRect(cx - t / 2, y0, t, y1 - y0);

  if (segs.includes('a')) hbar(y + t / 2);
  if (segs.includes('g')) hbar(mid);
  if (segs.includes('d')) hbar(y + h - t / 2);
  if (segs.includes('f')) vbar(x + t / 2, y + t + g, mid - t / 2 - g);
  if (segs.includes('b')) vbar(x + w - t / 2, y + t + g, mid - t / 2 - g);
  if (segs.includes('e')) vbar(x + t / 2, mid + t / 2 + g, y + h - t - g);
  if (segs.includes('c')) vbar(x + w - t / 2, mid + t / 2 + g, y + h - t - g);
}

function measure(text, dw, gap, h) {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += dw * 0.55;
    else if (SEGMENTS[ch]) w += dw + gap;
    else if (ch === ':' || ch === '.' || ch === "'") w += dw * 0.4;
    else w += h * 0.58;
  }
  return w;
}

/**
 * フレームの右下に日付を焼き込む。
 * @param {CanvasRenderingContext2D} ctx 描画先
 * @param {Object} opt {text,color,width,height}
 */
export function drawStamp(ctx, { text, color = '#ff8a1f', width, height }) {
  if (!text) return;
  const h = Math.max(12, Math.round(height * 0.042));
  const dw = h * 0.58;
  const t = Math.max(1.5, h * 0.145);
  const gap = h * 0.16;
  const total = measure(text, dw, gap, h);
  const margin = Math.round(Math.min(width, height) * 0.045);
  let x = width - margin - total;
  const y = height - margin - h;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = h * 0.25;
  ctx.shadowOffsetX = h * 0.06;
  ctx.shadowOffsetY = h * 0.06;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 ' + Math.round(h * 0.86) + 'px ui-monospace, Menlo, monospace';

  for (const ch of text) {
    if (ch === ' ') {
      x += dw * 0.55;
    } else if (SEGMENTS[ch]) {
      drawDigit(ctx, ch, x, y, dw, h, t);
      x += dw + gap;
    } else if (ch === ':') {
      ctx.fillRect(x + dw * 0.1, y + h * 0.3, t, t);
      ctx.fillRect(x + dw * 0.1, y + h * 0.66, t, t);
      x += dw * 0.4;
    } else if (ch === '.') {
      ctx.fillRect(x + dw * 0.1, y + h - t, t, t);
      x += dw * 0.4;
    } else if (ch === "'") {
      ctx.fillRect(x + dw * 0.14, y + t * 0.4, t, h * 0.26);
      x += dw * 0.4;
    } else {
      ctx.fillText(ch, x, y + h * 0.92);
      x += ctx.measureText(ch).width + gap * 0.5;
    }
  }
  ctx.restore();
}
