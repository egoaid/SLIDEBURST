/* share.js — できあがったファイルを共有シートへ渡す、またはダウンロードさせる */

export function timestampName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'SLIDEBURST_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
}

export function canShareFiles(file) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
}

export function toFile(blob, filename) {
  try {
    return new File([blob], filename, { type: blob.type });
  } catch (e) {
    return null;
  }
}

/**
 * 共有シートを開く。写真アプリへの保存はここから行う。
 * @returns {Promise<'shared'|'cancelled'|'unsupported'>}
 */
export async function shareFile(blob, filename) {
  const file = toFile(blob, filename);
  if (!file || !canShareFiles(file)) return 'unsupported';
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export function attachDownload(anchor, blob, filename) {
  if (anchor.dataset.url) URL.revokeObjectURL(anchor.dataset.url);
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.dataset.url = url;
  return url;
}
