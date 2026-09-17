/* ui.js — DOM の組み立てと表示切り替え */

import { $ } from './utils.js';
import { makeThumbnail } from './frames.js';

/* ラジオ相当のチップ群を作る */
export function buildChips(container, items, selectedValue, onSelect) {
  container.textContent = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = String(item.value);
    btn.setAttribute('aria-checked', item.value === selectedValue ? 'true' : 'false');
    btn.innerHTML = '<span>' + item.label + '</span>' + (item.hint ? '<small>' + item.hint + '</small>' : '');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      onSelect(item.value);
    });
    container.append(btn);
  });
}

export function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

export function showView(name) {
  $('viewCamera').hidden = name !== 'camera';
  $('viewResult').hidden = name !== 'result';
  window.scrollTo(0, 0);
}

export function fireFlash() {
  const flash = $('flash');
  flash.classList.remove('is-firing');
  void flash.offsetWidth;
  flash.classList.add('is-firing');
}

/* 取得フレームの一覧を作る。クリックでそのコマへジャンプ */
export function renderStrip(container, store, onPick) {
  container.textContent = '';
  const used = new Set(store.usedIndices);
  store.frames.forEach((frame, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'frameCell' + (used.has(i) ? ' is-used' : '');
    cell.dataset.index = String(i);
    cell.append(makeThumbnail(frame.canvas, 160));
    const no = document.createElement('span');
    no.className = 'frameCell__no';
    no.textContent = (i + 1) + ' · ' + Math.round(frame.elapsed) + 'ms';
    cell.append(no);
    cell.addEventListener('click', () => onPick(i));
    container.append(cell);
  });
}

export function markStripUsage(container, store, currentSourceIndex) {
  const used = new Set(store.usedIndices);
  container.querySelectorAll('.frameCell').forEach((cell) => {
    const i = Number(cell.dataset.index);
    cell.classList.toggle('is-used', used.has(i));
    cell.classList.toggle('is-current', i === currentSourceIndex);
  });
}
