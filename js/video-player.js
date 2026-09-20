/* video-player.js — 動画作品の加工画面での再生。
   隠した <video> を実際に再生し、その映像を1コマずつ Compositor に通して #loopCanvas へ描く。
   バースト用の LoopPlayer と同じ呼び方（refresh / pause / play / toggle / playing）ができるので、
   main.js は「いまのプレイヤー」を差し替えるだけで済む。 */

const DRAW_INTERVAL_MS = 30;   // 描く間隔の下限。フィルターとブラウン管を毎コマかけるので、30fps程度に抑える

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
  if (ok !== 'ok' || !v.videoWidth) throw new Error('動画を読み込めませんでした。');

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
    this.fps = 30;               // LoopPlayer との互換用（書き出しの見積もりなどで参照される）

    videoEl.addEventListener('seeked', () => { if (this.active && !this.playing) this.refresh(); });
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
    this.compositor.renderVideoFrame(this.ctx, v, v.currentTime, width, height);
    this._lastDraw = performance.now();
    if (this.onTime) this.onTime(v.currentTime, this.duration);
    if (this.onDraw) this.onDraw();
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

  async play() {
    if (!this.active || this.playing) return;
    const v = this.video;
    try {
      await v.play();
    } catch (e) {
      // 音ありの自動再生が許されない場合は、音なしで再生する（次のタップで音を戻せる）
      v.muted = true;
      try { await v.play(); } catch (e2) { return; }
    }
    this._setPlaying(true);
    const tick = (now) => {
      if (!this.playing) return;
      if (now - this._lastDraw >= DRAW_INTERVAL_MS) this._draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
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
