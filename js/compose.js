/* compose.js — 1コマを組み立てる唯一の場所
   元フレーム → 切り出し → 文字（日付・タイトル・PLAY・カウンター）→ フィルター → 落書き → ブラウン管
   文字はフィルターとブラウン管の「下」に敷く。だからVHSのノイズや色にじみが文字にもかかり、
   ブラウン管の湾曲で文字も一緒に曲がる。
   バースト作品（コマの列）と動画作品（<video>）の両方を、同じ順序・同じ設定で処理する。 */

import { applyFilter, getDefaultParams } from './filters.js';
import { applyCRT } from './crt.js';
import { drawStamp } from './datestamp.js';
import { drawOSDTitle, drawOSDTransport, drawOSDCounter, titleBox } from './osd.js';
import { cropRect, ratioOf, fitRect } from './crop.js';

/* 動画の編集プレビューは、長辺をこの大きさに抑える（フィルターとブラウン管を毎コマかけるため） */
export const VIDEO_PREVIEW_LONG = 720;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const DEFAULT_OSD = {
  titleEnabled: false,
  titleText: '',
  titleX: 0.5,
  titleY: 0.84,
  font: 'gothic',
  color: '#ffffff',
  outline: true,
  outlineColor: '#12161c',
  outlineWidthPct: 100,
  sizePct: 100,
  transportEnabled: false,
  transportLabel: 'PLAY',
  counterEnabled: false
};

export class Compositor {
  constructor(store, doodle) {
    this.store = store;
    this.doodle = doodle;
    this.video = null;                 // 動画作品のとき {width, height}。バースト作品のときは null
    this.filterId = 'none';
    this.intensity = 100;              // 簡単設定の強さ（0〜150%）
    this.cinemaVariant = 'technicolor';
    this.paramsByFilter = {};          // くわしい設定で個別に触った項目だけを持つ
    this.crt = false;
    this.crtStrength = 1;
    this.aspectId = 'src';
    this.offsetY = 0.5;
    this.stamp = { enabled: false, text: '', color: '#ff8a1f' };
    this.osd = Object.assign({}, DEFAULT_OSD);
    this.stageCache = new Map();
    this.stageSig = '';
    this._scratch = null;              // 動画用の使い回しcanvas（キャッシュには入れない）
    this._scratch2 = null;
  }

  setFilter(id) { this.filterId = id; }

  /* 簡単設定。動かすと、いま選んでいるフィルターのくわしい設定は消える */
  setIntensity(pct) {
    if (this.intensity === pct) return;
    this.intensity = pct;
    delete this.paramsByFilter[this.filterId];
  }

  setCinemaVariant(id) { this.cinemaVariant = id; }

  /* くわしい設定。1項目だけを上書きする */
  setAdvancedParam(filterId, key, value) {
    const current = this.paramsByFilter[filterId] || {};
    this.paramsByFilter[filterId] = Object.assign({}, current, { [key]: value });
  }

  hasCustomParams(filterId) {
    return !!this.paramsByFilter[filterId];
  }

  resetAdvanced(filterId) {
    delete this.paramsByFilter[filterId];
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
  setOSD(patch) { Object.assign(this.osd, patch); }
  resetOSD() { this.osd = Object.assign({}, DEFAULT_OSD); }
  invalidate() { this.stageCache.clear(); this.stageSig = ''; }

  /* 動画作品にする（info: {width,height}）。null でバースト作品へ戻す */
  setVideoSource(info) {
    this.video = info ? { width: info.width, height: info.height } : null;
    this.invalidate();
  }

  get isVideo() { return !!this.video; }

  /* 元フレームの寸法 */
  get sourceSize() {
    if (this.video) return { width: this.video.width, height: this.video.height };
    const first = this.store.frames[0];
    return first ? { width: first.canvas.width, height: first.canvas.height } : { width: 0, height: 0 };
  }

  /* 切り出し矩形（元フレームの座標）。元フレームには触らない */
  get rect() {
    const { width, height } = this.sourceSize;
    return cropRect(width, height, ratioOf(this.aspectId), this.offsetY);
  }

  /* 画面に出す作品の寸法。動画は重いので長辺を抑える。バーストは切り出しそのまま */
  get size() {
    const r = this.rect;
    if (!this.video) return { width: r.width, height: r.height };
    const long = Math.max(r.width, r.height);
    const s = Math.min(1, VIDEO_PREVIEW_LONG / long);
    return { width: Math.max(2, Math.round(r.width * s)), height: Math.max(2, Math.round(r.height * s)) };
  }

  /* 設定が同じ間だけ、組み上げた1枚を使い回すための鍵。
     テープカウンターは秒が変わるたびに絵が変わるので、ここには含めず、キャッシュのキーへ秒を足す。 */
  get signature() {
    const s = this.stamp;
    const o = this.osd;
    const titleKey = o.titleEnabled && o.titleText
      ? [o.titleText, o.titleX, o.titleY, o.font, o.color, o.outline, o.outlineColor, o.outlineWidthPct, o.sizePct].join(',')
      : '-';
    const transportKey = o.transportEnabled ? o.transportLabel : '-';
    return [
      this.filterId === 'none' ? 'none' : this.paramsSignature(this.filterId),
      this.crt, this.crtStrength,
      this.aspectId, Math.round(this.offsetY * 1000),
      s.enabled ? s.text + s.color : '-',
      titleKey, transportKey, o.counterEnabled,
      this.doodle ? this.doodle.version : 0
    ].join('|');
  }

  /* 文字レイヤー。フィルターより下に敷くので、まだ何も加工されていない絵の上へ描く */
  drawTextLayer(ctx, w, h, timeSec) {
    if (this.stamp.enabled && this.stamp.text) {
      drawStamp(ctx, { text: this.stamp.text, color: this.stamp.color, width: w, height: h });
    }
    const o = this.osd;
    if (o.titleEnabled && o.titleText) {
      drawOSDTitle(ctx, Object.assign({}, o, { text: o.titleText, width: w, height: h }));
    }
    if (o.transportEnabled) {
      drawOSDTransport(ctx, { label: o.transportLabel || 'PLAY', width: w, height: h });
    }
    if (o.counterEnabled) {
      // 日付も右下に出ているときは、重ならないよう日付の1段上へ
      const stampOn = this.stamp.enabled && this.stamp.text;
      const bottomOffset = stampOn ? Math.max(12, Math.round(h * 0.042)) + Math.min(w, h) * 0.02 : 0;
      drawOSDCounter(ctx, { timeSec, width: w, height: h, bottomOffset });
    }
  }

  /* タイトルの外枠（0〜1）。ドラッグの当たり判定用。曲げる前の座標 */
  titleBoxNorm() {
    const o = this.osd;
    if (!o.titleEnabled || !o.titleText) return null;
    const size = this.size;
    if (!size.width) return null;
    return titleBox(Object.assign({}, o, { text: o.titleText }), size.width, size.height);
  }

  /* 切り出し・文字・フィルター・落書き・ブラウン管まで済ませた1枚（バースト用）。
     timeSec は再生位置の秒数（テープカウンター用） */
  buildStage(index, timeSec = 0) {
    const sig = this.signature;
    if (sig !== this.stageSig) {
      this.stageSig = sig;
      this.stageCache.clear();
    }
    const key = this.osd.counterEnabled ? index + '@' + Math.floor(timeSec) : String(index);
    const cached = this.stageCache.get(key);
    if (cached) return cached;

    const frame = this.store.frames[index];
    if (!frame) return null;
    const r = this.rect;
    // 呼び出しのたびに新しい canvas を作る。使い回すキャンバスをキャッシュに入れると、
    // 次のコマを描いた瞬間に前のコマのキャッシュまで同じ絵に変わってしまい、
    // 静止画のように見えるコマ落ちバグになる（実際に起きていた）。
    const stage = makeCanvas(r.width, r.height);
    const ctx = stage.getContext('2d', { alpha: false });
    ctx.drawImage(frame.canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    this.drawTextLayer(ctx, r.width, r.height, timeSec);

    // applyFilter も applyCRT も、必ず新しい canvas を返す（none のときは上で作った stage そのもの）
    let result = this.filterId === 'none'
      ? stage
      : applyFilter(stage, this.filterId, index, this.resolvedParams(this.filterId));

    const overlay = this.doodle;
    if (overlay && !overlay.isEmpty) {
      result.getContext('2d').drawImage(overlay.canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    }
    if (this.crt) result = applyCRT(result, this.crtStrength);

    if (this.stageCache.size < 48) this.stageCache.set(key, result);
    return result;
  }

  /* 動画の1コマを組み立てて、そのまま ctx へ描く（キャッシュしない）。
     video は再生中の <video>。timeSec はその時刻。 */
  renderVideoFrame(ctx, video, timeSec, outW, outH) {
    const r = this.rect;
    if (!this._scratch) this._scratch = makeCanvas(2, 2);
    const stage = this._scratch;
    if (stage.width !== outW || stage.height !== outH) {
      stage.width = outW;
      stage.height = outH;
    }
    const sctx = stage.getContext('2d', { alpha: false });
    sctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, outW, outH);
    this.drawTextLayer(sctx, outW, outH, timeSec);

    // 粒子の種は動画の時刻から（24コマ/秒で踊る）。止めているあいだは同じ絵になる
    let result = this.filterId === 'none'
      ? stage
      : applyFilter(stage, this.filterId, Math.floor(timeSec * 24), this.resolvedParams(this.filterId));

    const overlay = this.doodle;
    if (overlay && !overlay.isEmpty) {
      result.getContext('2d').drawImage(overlay.canvas, r.x, r.y, r.width, r.height, 0, 0, outW, outH);
    }
    if (this.crt) result = applyCRT(result, this.crtStrength, true);
    ctx.drawImage(result, 0, 0, outW, outH);
  }

  /* 作品をそのまま指定サイズへ。timeSec は再生位置の秒数（テープカウンター用） */
  renderTo(ctx, index, timeSec, outW, outH) {
    const stage = this.buildStage(index, timeSec);
    if (!stage) return;
    ctx.drawImage(stage, 0, 0, outW, outH);
  }

  /* SNS用の枠に、作品を切らずに収める（バースト） */
  renderFramed(ctx, index, timeSec, boxW, boxH, background = 'blur') {
    const stage = this.buildStage(index, timeSec);
    if (!stage) return;
    this._drawFramed(ctx, stage, boxW, boxH, background);
  }

  /* SNS用の枠に、動画の1コマを収める */
  renderVideoFramed(ctx, video, timeSec, boxW, boxH, background = 'blur') {
    const r = this.rect;
    const fit = fitRect(r.width, r.height, boxW, boxH);
    if (!this._scratch2) this._scratch2 = makeCanvas(2, 2);
    const art = this._scratch2;
    if (art.width !== fit.width || art.height !== fit.height) {
      art.width = fit.width;
      art.height = fit.height;
    }
    this.renderVideoFrame(art.getContext('2d', { alpha: false }), video, timeSec, fit.width, fit.height);
    this._drawFramed(ctx, art, boxW, boxH, background);
  }

  _drawFramed(ctx, stage, boxW, boxH, background) {
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
      stamp: Object.assign({}, this.stamp),
      osd: Object.assign({}, this.osd)
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
    this.osd = Object.assign({}, DEFAULT_OSD, s.osd);
    this.invalidate();
  }
}
