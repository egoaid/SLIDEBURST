/* video-player.js — 動画作品の加工画面での再生。
   隠した <video> を実際に再生し、その映像を1コマずつ Compositor に通して #loopCanvas へ描く。
   バースト用の LoopPlayer と同じ呼び方（refresh / pause / play / toggle / playing）ができるので、
   main.js は「いまのプレイヤー」を差し替えるだけで済む。 */

import { L } from './i18n.js';

const DRAW_INTERVAL_MS = 40;   // 描く間隔の下限（24fps相当）。フィルターとブラウン管を毎コマかけるので、これ以上は描かない
const SLOW_DRAW_MS = 55;       // 1コマの描画がこれより長い状態が続いたら、プレビューの解像度を下げる
const MIN_PREVIEW_SCALE = 0.45;

function once(el, name, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      el.removeEventListener(name, onEvt);
      clearTimeout(timer);
      resolve(ok);
    };
    const onEvt = () => finish(true);
    const timer = setTimeout(() => finish(false), ms);
    el.addEventListener(name, onEvt);
  });
}

/* <video> に Blob をつなぐ。ユーザー操作の中で同期的に呼べるよう、待たずに URL だけ返す */
export function attachBlob(v, blob) {
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  const url = URL.createObjectURL(blob);
  v.src = url;
  return url;
}

/* attachBlob のあと、メタデータを待ち、長さを確定させる。読み込めなければ例外 */
export async function settleVideoElement(v, durationHint = 0) {
  const meta = once(v, 'loadedmetadata', 15000);
  const failed = once(v, 'error', 15000);
  const ok = v.readyState >= 1 ? 'ok' : await Promise.race([
    meta.then((r) => (r ? 'ok' : 'timeout')),
    failed.then((r) => (r ? 'error' : 'timeout'))
  ]);
  if (ok !== 'ok' || !v.videoWidth) throw new Error(L('Couldn\u2019t load the video.', '動画を読み込めませんでした。'));

  // MediaRecorder が作った webm は長さが不明(Infinity)なことがある。終端まで飛ばして長さを確定させる
  if (!isFinite(v.duration)) {
    v.currentTime = 1e101;
    await once(v, 'timeupdate', 3000);
    v.currentTime = 0;
    await once(v, 'seeked', 3000);
  }
  const duration = isFinite(v.duration) && v.duration > 0 ? v.duration : durationHint;
  if (v.readyState < 2) await once(v, 'loadeddata', 5000);
  return { width: v.videoWidth, height: v.videoHeight, duration };
}

export class VideoPlayer {
  constructor(canvas, videoEl, compositor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.video = videoEl;
    this.compositor = compositor;
    this.url = null;
    this.duration = 0;
    this.playing = false;
    this.active = false;
    this.rafId = null;
    this._lastDraw = 0;
    this.onTime = null;          // (timeSec, duration) => void
    this.onStateChange = null;   // (playing) => void
    this.onDraw = null;          // 1コマ描くたびに呼ばれる
    this.onProblem = null;       // (message) => void  再生できない・止まったときの通知
    this._drawMs = 0;            // 描画時間の移動平均
    this._drawCount = 0;
    this.fps = 24;               // LoopPlayer との互換用（書き出しの見積もりなどで参照される）

    videoEl.addEventListener('seeked', () => { if (this.active && !this.playing) this.refresh(); });
    videoEl.addEventListener('error', () => {
      if (this.active && this.onProblem) {
        const e = videoEl.error;
        this.onProblem(L(
          'A video playback error occurred (code ' + (e ? e.code : '?') + ').',
          '動画の再生でエラーが出ました（コード ' + (e ? e.code : '?') + '）。'
        ));
      }
    });
    videoEl.addEventListener('pause', () => {
      if (this.active && this.playing && !videoEl.ended) this._setPlaying(false);
    });
  }

  /* Blob を読み込む。読み込めたら {width, height, duration} を返す */
  async load(blob, durationHint = 0) {
    this.unload();
    const v = this.video;
    v.muted = true;
    this.url = attachBlob(v, blob);
    let info;
    try {
      info = await settleVideoElement(v, durationHint);
    } catch (e) {
      this.unload();
      throw e;
    }
    this.duration = info.duration;
    this.active = true;
    return info;
  }

  unload() {
    this.pause();
    this.active = false;
    const v = this.video;
    v.removeAttribute('src');
    v.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.duration = 0;
  }

  get timeSec() { return this.video.currentTime || 0; }

  _setPlaying(on) {
    if (this.playing === on) return;
    this.playing = on;
    if (!on && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.onStateChange) this.onStateChange(on);
  }

  resizeTo(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  _draw() {
    const v = this.video;
    if (!this.active || v.readyState < 2) return;
    const { width, height } = this.compositor.size;
    if (!width) return;
    this.resizeTo(width, height);
    const t0 = performance.now();
    this.compositor.renderVideoFrame(this.ctx, v, v.currentTime, width, height);
    this._lastDraw = performance.now();
    this._adaptPreview(this._lastDraw - t0);
    if (this.onTime) this.onTime(v.currentTime, this.duration);
    if (this.onDraw) this.onDraw();
  }

  /* フィルターとブラウン管を毎コマかけるので、端末が間に合わないと再生が止まったように見える。
     描画が遅い状態が続いたら、プレビューの解像度を段階的に下げて間に合わせる（書き出しの画質には影響しない） */
  _adaptPreview(ms) {
    this._drawMs = this._drawMs ? this._drawMs * 0.8 + ms * 0.2 : ms;
    if (++this._drawCount % 12 !== 0) return;
    const c = this.compositor;
    if (this._drawMs > SLOW_DRAW_MS && c.videoPreviewScale > MIN_PREVIEW_SCALE) {
      c.videoPreviewScale = Math.max(MIN_PREVIEW_SCALE, c.videoPreviewScale * 0.8);
      this._drawMs = 0;
    }
  }

  /* 設定が変わったときに、いまのコマを描き直す */
  refresh() {
    this._draw();
  }

  seek(sec) {
    const v = this.video;
    const t = Math.min(Math.max(0, sec), Math.max(0, this.duration - 0.001));
    v.currentTime = t;
    if (this.onTime) this.onTime(t, this.duration);
  }

  step(deltaSec) {
    this.pause();
    this.seek(this.video.currentTime + deltaSec);
  }

  /* v.play() を、待ちきれないときは諦めて結果（本当に再生が始まったか）を返す。iOSは約束が返ってこないことがある */
  async _tryPlay() {
    const v = this.video;
    const p = v.play();
    if (p && p.then) {
      await Promise.race([
        p.then(() => true, () => false),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    }
    return !v.paused;
  }

  async play() {
    if (!this.active || this.playing) return true;
    const v = this.video;
    let ok = await this._tryPlay();
    if (!ok) {
      // 音ありの自動再生が許されない場合は、音なしで再生する（次に「再生」を押した操作で音を戻せる）
      v.muted = true;
      this.mutedByPolicy = true;
      ok = await this._tryPlay();
    }
    if (!ok) {
      if (this.onProblem) this.onProblem(L('Couldn\u2019t start playback. Please tap \u201cPlay\u201d.', '再生を始められませんでした。「再生」を押してください。'));
      return false;
    }
    this._setPlaying(true);
    const tick = (now) => {
      if (!this.playing) return;
      if (now - this._lastDraw >= DRAW_INTERVAL_MS) this._draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    this._watchProgress();
    return true;
  }

  /* 再生を始めたのに時間が進まないとき（読み込み待ち・音声セッションの中断など）に、一度だけ立て直す */
  _watchProgress() {
    const v = this.video;
    const t0 = v.currentTime;
    setTimeout(async () => {
      if (!this.playing || v.paused || v.currentTime !== t0) return;
      this.pause();
      v.muted = true;
      await this.play();
      setTimeout(() => {
        if (this.playing && !v.paused && v.currentTime === t0 && this.onProblem) {
          this.onProblem(L(
            'Playback isn\u2019t advancing (ready state ' + v.readyState + '). Please stop and tap \u201cPlay\u201d again.',
            '再生が進みません（読み込み状態 ' + v.readyState + '）。いちど停止して、もう一度「再生」を押してください。'
          ));
        }
      }, 2000);
    }, 2000);
  }

  pause() {
    if (this.video && !this.video.paused) this.video.pause();
    this._setPlaying(false);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
    return !this.playing;
  }
}
