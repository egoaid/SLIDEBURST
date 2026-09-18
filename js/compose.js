/* compose.js — 1コマを組み立てる唯一の場所
   元フレーム → フィルター → 切り出し → 落書き → 日付 → ブラウン管
   再生も書き出しもここを通るので、プレビューと保存結果が必ず一致する。 */

import { applyFilter, getDefaultParams } from './filters.js';
import { applyCRT } from './crt.js';
import { drawStamp } from './datestamp.js';
import { cropRect, ratioOf, fitRect } from './crop.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Compositor {
  constructor(store, doodle) {
    this.store = store;
    this.doodle = doodle;
    this.filterId = 'none';
    this.intensity = 100;              // 簡単設定の強さ（0〜150%）
    this.cinemaVariant = 'technicolor';
    this.paramsByFilter = {};          // くわしい設定で個別に触った項目だけを持つ
    this.crt = false;
    this.crtStrength = 1;
    this.aspectId = 'src';
    this.offsetY = 0.5;
    this.stamp = { enabled: false, text: '', color: '#ff8a1f' };
    this.cache = new Map();
    this.stage = null;
    this.stageCache = new Map();
    this.stageSig = '';
  }

  setFilter(id) {
    if (this.filterId === id) return;
    this.filterId = id;
    this.cache.clear();
  }

  /* 簡単設定。動かすと、いま選んでいるフィルターのくわしい設定は消える */
  setIntensity(pct) {
    if (this.intensity === pct) return;
    this.intensity = pct;
    delete this.paramsByFilter[this.filterId];
    this.cache.clear();
  }

  setCinemaVariant(id) {
    if (this.cinemaVariant === id) return;
    this.cinemaVariant = id;
    this.cache.clear();
  }

  /* くわしい設定。1項目だけを上書きする */
  setAdvancedParam(filterId, key, value) {
    const current = this.paramsByFilter[filterId] || {};
    this.paramsByFilter[filterId] = Object.assign({}, current, { [key]: value });
    this.cache.clear();
  }

  hasCustomParams(filterId) {
    return !!this.paramsByFilter[filterId];
  }

  resetAdvanced(filterId) {
    delete this.paramsByFilter[filterId];
    this.cache.clear();
  }

  /* 実際に使う値。簡単設定を土台に、くわしい設定で触った項目だけ上書きする */
  resolvedParams(filterId) {
    const extra = filterId === 'cinema' ? { variant: this.cinemaVariant } : {};
    const base = getDefaultParams(filterId, this.intensity, extra);
    return Object.assign(base, this.paramsByFilter[filterId]);
  }

  paramsSignature(filterId) {
    const p = this.resolvedParams(filterId);
    let s = filterId;
    for (const k of Object.keys(p).sort()) s += '|' + k + '=' + p[k];
    return s;
  }

  setCRT(on, strength) {
    this.crt = !!on;
    if (typeof strength === 'number') this.crtStrength = strength;
  }

  setAspect(id) { this.aspectId = id; }
  setOffsetY(v) { this.offsetY = v; }
  setStamp(patch) { Object.assign(this.stamp, patch); }
  invalidate() { this.cache.clear(); this.stageCache.clear(); this.stageSig = ''; }

  /* 元フレームの寸法 */
  get sourceSize() {
    const first = this.store.frames[0];
    return first ? { width: first.canvas.width, height: first.canvas.height } : { width: 0, height: 0 };
  }

  /* 切り出し矩形。元フレームには触らない */
  get rect() {
    const { width, height } = this.sourceSize;
    return cropRect(width, height, ratioOf(this.aspectId), this.offsetY);
  }

  /* 作品としての寸法 */
  get size() {
    const r = this.rect;
    return { width: r.width, height: r.height };
  }

  /* 加工済みのコマ。フィルターとパラメータの組ごとに1回だけ計算する */
  frameCanvas(index) {
    const frame = this.store.frames[index];
    if (!frame) return null;
    if (this.filterId === 'none') return frame.canvas;
    const sig = this.paramsSignature(this.filterId);
    const key = sig + ':' + index;
    let c = this.cache.get(key);
    if (!c) {
      c = applyFilter(frame.canvas, this.filterId, index, this.resolvedParams(this.filterId));
      this.cache.set(key, c);
    }
    return c;
  }

  /* 設定が同じ間だけ、組み上げた1枚を使い回すための鍵 */
  get signature() {
    const s = this.stamp;
    return [
      this.filterId === 'none' ? 'none' : this.paramsSignature(this.filterId),
      this.crt, this.crtStrength,
      this.aspectId, Math.round(this.offsetY * 1000),
      s.enabled ? s.text + s.color : '-',
      this.doodle ? this.doodle.version : 0
    ].join('|');
  }

  /* 切り出し・落書き・日付・ブラウン管まで済ませた1枚を返す */
  buildStage(index) {
    const sig = this.signature;
    if (sig !== this.stageSig) {
      this.stageSig = sig;
      this.stageCache.clear();
    }
    const cached = this.stageCache.get(index);
    if (cached) return cached;

    const base = this.frameCanvas(index);
    if (!base) return null;
    const r = this.rect;
    if (!this.stage || this.stage.width !== r.width || this.stage.height !== r.height) {
      this.stage = makeCanvas(r.width, r.height);
    }
    const ctx = this.stage.getContext('2d', { alpha: false });
    ctx.drawImage(base, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);

    const overlay = this.doodle;
    if (overlay && !overlay.isEmpty) {
      ctx.drawImage(overlay.canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    }
    if (this.stamp.enabled && this.stamp.text) {
      drawStamp(ctx, { text: this.stamp.text, color: this.stamp.color, width: r.width, height: r.height });
    }

    // ブラウン管は毎コマ計算すると重いので、設定が変わるまで取っておく
    if (this.crt) {
      const crt = applyCRT(this.stage, this.crtStrength);
      if (this.stageCache.size < 48) this.stageCache.set(index, crt);
      return crt;
    }
    if (this.stageCache.size < 48) this.stageCache.set(index, this.stage);
    return this.stage;
  }

  /* 作品をそのまま指定サイズへ */
  renderTo(ctx, index, outW, outH) {
    const stage = this.buildStage(index);
    if (!stage) return;
    ctx.drawImage(stage, 0, 0, outW, outH);
  }

  /* SNS用の枠に、作品を切らずに収める */
  renderFramed(ctx, index, boxW, boxH, background = 'blur') {
    const stage = this.buildStage(index);
    if (!stage) return;
    const fit = fitRect(stage.width, stage.height, boxW, boxH);

    if (background === 'blur') {
      const cover = Math.max(boxW / stage.width, boxH / stage.height) * 1.15;
      const cw = stage.width * cover, ch = stage.height * cover;
      const small = makeCanvas(Math.max(2, Math.round(boxW / 22)), Math.max(2, Math.round(boxH / 22)));
      const sctx = small.getContext('2d', { alpha: false });
      sctx.drawImage(stage, (boxW - cw) / 2 / 22, (boxH - ch) / 2 / 22, cw / 22, ch / 22);
      ctx.drawImage(small, 0, 0, boxW, boxH);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, boxW, boxH);
    } else {
      ctx.fillStyle = background === 'white' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, boxW, boxH);
    }
    ctx.drawImage(stage, fit.x, fit.y, fit.width, fit.height);
  }

  /* 保存しておく編集内容 */
  exportSettings() {
    return {
      filterId: this.filterId,
      intensity: this.intensity,
      cinemaVariant: this.cinemaVariant,
      paramsByFilter: JSON.parse(JSON.stringify(this.paramsByFilter)),
      crt: this.crt,
      crtStrength: this.crtStrength,
      aspectId: this.aspectId,
      offsetY: this.offsetY,
      stamp: Object.assign({}, this.stamp)
    };
  }

  applySettings(s) {
    if (!s) return;
    this.filterId = s.filterId || 'none';
    this.intensity = typeof s.intensity === 'number' ? s.intensity : 100;
    this.cinemaVariant = s.cinemaVariant || 'technicolor';
    this.paramsByFilter = s.paramsByFilter ? JSON.parse(JSON.stringify(s.paramsByFilter)) : {};
    this.crt = !!s.crt;
    this.crtStrength = typeof s.crtStrength === 'number' ? s.crtStrength : 1;
    this.aspectId = s.aspectId || 'src';
    this.offsetY = typeof s.offsetY === 'number' ? s.offsetY : 0.5;
    if (s.stamp) this.stamp = Object.assign({ enabled: false, text: '', color: '#ff8a1f' }, s.stamp);
    this.invalidate();
  }
}
