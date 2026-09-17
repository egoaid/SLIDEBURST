/* crt.js — ブラウン管テレビの映り
   VHS / Hi8 の質感を壊さないよう、色は大きく触らず「画面の形」と光で見せる。 */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* 横方向と縦方向を2回に分けて樽型に歪ませる。短冊を並べる近似 */
function barrel(src, k) {
  const w = src.width, h = src.height;
  const slices = 28;
  const curve = 0.055 * k;

  const pass1 = makeCanvas(w, h);
  const c1 = pass1.getContext('2d', { alpha: false });
  c1.fillStyle = '#000';
  c1.fillRect(0, 0, w, h);
  for (let i = 0; i < slices; i++) {
    const sy = (i * h) / slices;
    const sh = h / slices + 1;
    const dy = ((sy + sh / 2) / h - 0.5) * 2;       // -1〜1
    const scale = 1 - curve * dy * dy;
    const dw = w * scale;
    c1.drawImage(src, 0, sy, w, sh, (w - dw) / 2, sy, dw, sh);
  }

  const pass2 = makeCanvas(w, h);
  const c2 = pass2.getContext('2d', { alpha: false });
  c2.fillStyle = '#000';
  c2.fillRect(0, 0, w, h);
  for (let i = 0; i < slices; i++) {
    const sx = (i * w) / slices;
    const sw = w / slices + 1;
    const dx = ((sx + sw / 2) / w - 0.5) * 2;
    const scale = 1 - curve * dx * dx;
    const dh = h * scale;
    c2.drawImage(pass1, sx, 0, sw, h, sx, (h - dh) / 2, sw, dh);
  }
  return pass2;
}

function roundedMask(ctx, w, h, radius) {
  const r = radius;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, w, h, r);
  } else {
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

/**
 * ブラウン管風に変換した canvas を返す。
 * @param {HTMLCanvasElement} source
 * @param {number} k 強さ 0〜1.5
 */
export function applyCRT(source, k = 1) {
  const w = source.width, h = source.height;
  const warped = barrel(source, k);

  // 走査線とにじみは透明キャンバスに重ねてから、角を丸めて黒地へ置く
  const screen = makeCanvas(w, h);
  const ctx = screen.getContext('2d');
  ctx.drawImage(warped, 0, 0);

  // 発光。明るいところがふくらむ
  const glow = makeCanvas(Math.max(2, w >> 2), Math.max(2, h >> 2));
  glow.getContext('2d').drawImage(warped, 0, 0, glow.width, glow.height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.09 * k;
  ctx.drawImage(glow, 0, 0, w, h);
  ctx.restore();

  // 走査線。画面が小さいときに潰れないよう間隔を調整する
  const step = Math.max(2, Math.round(h / 240));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + (0.26 * k) + ')';
  for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, Math.max(1, step * 0.45));
  ctx.restore();

  // 色ずれ。左右の端だけ軽く
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.055 * k;
  ctx.drawImage(warped, -1.2 * k, 0);
  ctx.globalAlpha = 0.045 * k;
  ctx.drawImage(warped, 1.2 * k, 0);
  ctx.restore();

  // 周辺の落ち込み
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30, w / 2, h / 2, Math.max(w, h) * 0.70);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + (0.52 * k) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  roundedMask(ctx, w, h, Math.min(w, h) * 0.075 * Math.min(1.2, k));

  const out = makeCanvas(w, h);
  const octx = out.getContext('2d', { alpha: false });
  octx.fillStyle = '#05070a';
  octx.fillRect(0, 0, w, h);
  octx.drawImage(screen, 0, 0);
  return out;
}
