/* crop.js — 作品の縦横比と切り出し位置
   元フレームには一切触らない。表示と書き出しのときだけ矩形を計算する。 */

export const ASPECTS = [
  { id: 'src',  label: { en: 'Original', ja: 'そのまま' }, ratio: null },
  { id: '4x3',  label: '4:3',     ratio: 4 / 3 },
  { id: '1x1',  label: '1:1',     ratio: 1 },
  { id: '3x4',  label: '3:4',     ratio: 3 / 4 },
  { id: '9x16', label: '9:16',    ratio: 9 / 16 }
];

export function ratioOf(id) {
  const a = ASPECTS.find((x) => x.id === id);
  return a ? a.ratio : null;
}

/**
 * 元フレームの中から、指定比率で最大の矩形を切り出す。
 * @param {number} w 元の幅
 * @param {number} h 元の高さ
 * @param {number|null} ratio 横/縦。null は切り出しなし
 * @param {number} offsetY 0(上)〜1(下)。縦方向の位置
 */
export function cropRect(w, h, ratio, offsetY = 0.5) {
  if (!ratio) return { x: 0, y: 0, width: w, height: h };
  let cw = w, ch = Math.round(w / ratio);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * ratio);
  }
  const x = Math.round((w - cw) / 2);
  const y = Math.round((h - ch) * Math.min(1, Math.max(0, offsetY)));
  return { x, y, width: cw, height: ch };
}

/* 縦に動かせる余地があるか（ないときはスライダーを無効にする） */
export function hasVerticalRoom(w, h, ratio) {
  const r = cropRect(w, h, ratio, 0);
  return r.height < h;
}

/* 書き出し枠に作品を収めたときの配置 */
export function fitRect(srcW, srcH, boxW, boxH) {
  const s = Math.min(boxW / srcW, boxH / srcH);
  const width = Math.round(srcW * s);
  const height = Math.round(srcH * s);
  return { x: Math.round((boxW - width) / 2), y: Math.round((boxH - height) / 2), width, height };
}
