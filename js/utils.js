/* utils.js — 小さな共通処理 */

export const $ = (id) => document.getElementById(id);

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const round = (v, digits = 1) => {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
};

/* 平均・最小・最大をまとめて返す */
export function stats(values) {
  if (!values.length) return { min: 0, max: 0, avg: 0 };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / values.length };
}

/* 等間隔にcount個のインデックスを選ぶ（両端を必ず含む） */
export function pickEven(total, count) {
  if (count <= 0 || count >= total) return Array.from({ length: total }, (_, i) => i);
  if (count === 1) return [0];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round((i * (total - 1)) / (count - 1)));
  }
  return [...new Set(out)];
}

/* 1→N→2 の往復シーケンスを作る */
export function pingPong(indices) {
  if (indices.length < 3) return indices.slice();
  return indices.concat(indices.slice(1, -1).reverse());
}

export function supportsRVFC() {
  return typeof HTMLVideoElement !== 'undefined' &&
    typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
}

export function isSecure() {
  return window.isSecureContext === true;
}

export function browserLabel() {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return 'Chrome (iOS)';
  if (/EdgiOS/.test(ua)) return 'Edge (iOS)';
  if (/FxiOS/.test(ua)) return 'Firefox (iOS)';
  if (/iPhone|iPad|iPod/.test(ua)) return 'Safari (iOS)';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'その他';
}
