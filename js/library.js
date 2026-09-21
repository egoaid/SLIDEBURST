/* library.js — 端末に貯めた作品の一覧 */

const fmtDate = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/* ファイルサイズの表示。1MB未満はKB、10MB未満は小数1桁、1GB以上はGB */
export function formatBytes(n) {
  if (!n) return '';
  if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + 'KB';
  const mb = n / 1048576;
  if (mb >= 1000) return (mb / 1024).toFixed(2) + 'GB';
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + 'MB';
}

/**
 * 一覧を描く。サムネイルは保存済みの Blob から復元する。
 */
export function renderLibrary(container, items, { onOpen, onDelete, currentId }) {
  container.querySelectorAll('img[data-url]').forEach((img) => URL.revokeObjectURL(img.dataset.url));
  container.textContent = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'まだ作品がありません。撮影すると、この端末の中にだけ保存されます。';
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'libItem' + (item.id === currentId ? ' is-current' : '');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'libItem__open';
    if (item.thumb) {
      const thumbWrap = document.createElement('span');
      thumbWrap.className = 'libItem__thumbWrap';
      const img = document.createElement('img');
      const url = URL.createObjectURL(item.thumb);
      img.src = url;
      img.dataset.url = url;
      img.alt = '';
      thumbWrap.append(img);
      if (item.kind === 'video') {
        const badge = document.createElement('span');
        badge.className = 'libItem__badge';
        badge.textContent = '▶';
        badge.setAttribute('aria-hidden', 'true');
        thumbWrap.append(badge);
      }
      open.append(thumbWrap);
    }
    const meta = document.createElement('span');
    meta.className = 'libItem__meta';
    const sizeText = item.sizeBytes ? ' · ' + formatBytes(item.sizeBytes) : '';
    meta.innerHTML = item.kind === 'video'
      ? '<b>' + fmtDate(item.createdAt) + '</b>' +
        '<small>動画 · ' + (item.durationSec ? item.durationSec.toFixed(1) + '秒' : '') +
        (item.settings && item.settings.filterId && item.settings.filterId !== 'none' ? ' · ' + item.settings.filterId : '') +
        sizeText + '</small>'
      : '<b>' + fmtDate(item.createdAt) + '</b>' +
        '<small>' + item.frameCount + 'コマ · ' + item.width + '×' + item.height +
        (item.settings && item.settings.filterId && item.settings.filterId !== 'none' ? ' · ' + item.settings.filterId : '') +
        sizeText + '</small>';
    open.append(meta);
    open.addEventListener('click', () => onOpen(item.id));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'libItem__delete';
    del.setAttribute('aria-label', 'この作品を削除');
    del.textContent = '削除';
    del.addEventListener('click', () => onDelete(item.id));

    card.append(open, del);
    container.append(card);
  });
}
