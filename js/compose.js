/* compose.js — 1コマを「フィルター → 落書き → 日付」の順に合成する
   加工結果はコマ単位でキャッシュし、再生でも書き出しでも同じ絵を使う。 */

import { applyFilter } from './filters.js';
import { drawStamp } from './datestamp.js';

export class Compositor {
  constructor(store, doodle) {
    this.store = store;
    this.doodle = doodle;
    this.filterId = 'none';
    this.stamp = { enabled: false, text: '', color: '#ff8a1f' };
    this.cache = new Map();
  }

  setFilter(id) {
    if (this.filterId === id) return;
    this.filterId = id;
    this.cache.clear();
  }

  setStamp(patch) {
    Object.assign(this.stamp, patch);
  }

  invalidate() {
    this.cache.clear();
  }

  /* 加工済みのコマを返す。初回だけ計算する */
  frameCanvas(index) {
    const frame = this.store.frames[index];
    if (!frame) return null;
    if (this.filterId === 'none') return frame.canvas;
    const key = this.filterId + ':' + index;
    let c = this.cache.get(key);
    if (!c) {
      c = applyFilter(frame.canvas, this.filterId, index);
      this.cache.set(key, c);
    }
    return c;
  }

  get size() {
    const first = this.store.frames[0];
    return first ? { width: first.canvas.width, height: first.canvas.height } : { width: 0, height: 0 };
  }

  /* 指定サイズで1コマ描き切る */
  renderTo(ctx, index, outW, outH) {
    const base = this.frameCanvas(index);
    if (!base) return;
    ctx.drawImage(base, 0, 0, outW, outH);

    const overlay = this.doodle;
    if (overlay && !overlay.isEmpty) {
      ctx.drawImage(overlay.canvas, 0, 0, outW, outH);
    }
    if (this.stamp.enabled && this.stamp.text) {
      drawStamp(ctx, {
        text: this.stamp.text,
        color: this.stamp.color,
        width: outW,
        height: outH
      });
    }
  }
}
