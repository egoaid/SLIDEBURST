/* playback.js — 往復ループ再生プレイヤー */

export class LoopPlayer {
  constructor(canvas, store, compositor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.store = store;
    this.compositor = compositor;
    this.fps = 10;
    this.pos = 0;
    this.tick = 0;           // 再生してから表示したコマの通し数（往復列を何周してもふえ続ける）。テープカウンター用
    this.playing = false;
    this.rafId = null;
    this.lastTick = 0;
    this.onPosChange = null;
    this.onDraw = null;
  }

  resizeTo(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  drawCurrent() {
    if (!this.store.sequence.length) return;
    const index = this.store.sourceIndexAt(this.pos);
    const { width, height } = this.compositor.size;
    if (!width) return;
    this.resizeTo(width, height);
    this.compositor.renderTo(this.ctx, index, this.timeSec, width, height);
    if (this.onPosChange) this.onPosChange(this.pos, index);
    if (this.onDraw) this.onDraw();
  }

  /* テープカウンターに出す秒数。通しのコマ数 ÷ 再生速度 */
  get timeSec() {
    return this.tick / (this.fps || 10);
  }

  refresh() {
    this.drawCurrent();
  }

  setPos(pos) {
    const len = this.store.sequence.length || 1;
    this.pos = ((pos % len) + len) % len;
    // 外から位置を指定されたとき（コマ送り・つまみ）は、その位置から数え直す。
    // 再生中の自動送り(advance)では tick を止めずに進める
    if (!this._advancing) this.tick = this.pos;
    this.drawCurrent();
  }

  step(delta) {
    this.pause();
    this.setPos(this.pos + delta);
  }

  play() {
    if (this.playing || !this.store.sequence.length) return;
    this.playing = true;
    this.lastTick = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const interval = 1000 / this.fps;
      if (now - this.lastTick >= interval) {
        this.lastTick = now - ((now - this.lastTick) % interval);
        this._advancing = true;
        this.tick += 1;
        this.setPos(this.pos + 1);
        this._advancing = false;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }
}
