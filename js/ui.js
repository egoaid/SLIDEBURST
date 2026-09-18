/* ui.js — DOM の組み立てと表示切り替え */

import { $ } from './utils.js';
import { makeThumbnail } from './frames.js';

/* ラジオ相当のチップ群 */
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

export function selectChip(container, value) {
  container.querySelectorAll('.chip').forEach((c) => {
    c.setAttribute('aria-checked', c.dataset.value === String(value) ? 'true' : 'false');
  });
}

/* 色見本のボタン列 */
export function buildSwatches(container, colors, selected, onSelect) {
  container.textContent = '';
  colors.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.value = color;
    btn.style.setProperty('--swatch', color);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', color);
    btn.setAttribute('aria-checked', color === selected ? 'true' : 'false');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.swatch').forEach((c) => c.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      onSelect(color);
    });
    container.append(btn);
  });
}

export function buildEmojiGrid(container, list, onSelect) {
  container.textContent = '';
  list.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emojiBtn';
    btn.textContent = emoji;
    btn.dataset.value = emoji;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') === 'true';
      container.querySelectorAll('.emojiBtn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
      onSelect(on ? null : emoji);
    });
    container.append(btn);
  });
}

export function clearEmojiSelection(container) {
  container.querySelectorAll('.emojiBtn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

/* タブの切り替え */
export function setupTabs(nav, onChange) {
  nav.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    showTab(nav, tab.dataset.tab);
    onChange(tab.dataset.tab);
  });
}

export function showTab(nav, name) {
  nav.querySelectorAll('.tab').forEach((t) => {
    t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tabPanel').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
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
  // 撮影中は画面そのものを動かせなくする。結果画面はタブを縦にスクロールするので外す
  document.body.classList.toggle('is-camera-locked', name === 'camera');
  window.scrollTo(0, 0);
}

export function fireFlash() {
  const flash = $('flash');
  flash.classList.remove('is-firing');
  void flash.offsetWidth;
  flash.classList.add('is-firing');
}

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

/**
 * くわしい設定のスライダー列を作る。
 * @param {HTMLElement} container
 * @param {Array<{key:string,label:string}>} schema
 * @param {Object} values 現在の値（key -> 0〜150）
 * @param {(key:string, value:number)=>void} onChange
 */
export function buildAdvancedGrid(container, schema, values, onChange) {
  container.textContent = '';
  schema.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'range';
    const top = document.createElement('span');
    top.className = 'range__label';
    const out = document.createElement('output');
    out.textContent = String(values[item.key]);
    top.append(item.label + ' ', out, '%');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '150';
    input.step = '5';
    input.value = String(values[item.key]);
    input.addEventListener('input', () => {
      out.textContent = input.value;
      onChange(item.key, Number(input.value));
    });
    row.append(top, input);
    container.append(row);
  });
}

export function setExportStatus(text, progress = null) {
  const el = $('exportStatus');
  el.textContent = text;
  el.classList.toggle('is-active', progress !== null);
  el.style.setProperty('--progress', progress === null ? '0%' : Math.round(progress * 100) + '%');
}
