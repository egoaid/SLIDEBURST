/* library.js — 端末に貯めた作品の一覧 */

const fmtDate = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

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
      const img = document.createElement('img');
      const url = URL.createObjectURL(item.thumb);
      img.src = url;
      img.dataset.url = url;
      img.alt = '';
      open.append(img);
    }
    const meta = document.createElement('span');
    meta.className = 'libItem__meta';
    meta.innerHTML = '<b>' + fmtDate(item.createdAt) + '</b>' +
      '<small>' + item.frameCount + 'コマ · ' + item.width + '×' + item.height +
      (item.settings && item.settings.filterId && item.settings.filterId !== 'none' ? ' · ' + item.settings.filterId : '') +
      '</small>';
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
