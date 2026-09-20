/* playback.js — 往復ループ再生プレイヤー */

export class LoopPlayer {
  constructor(canvas, store, compositor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.store = store;
    this.compositor = compositor;
    this.fps = 10;
    this.pos = 0;
    this.playing = false;
    this.rafId = null;
    this.lastTick = 0;
    this.onPosChange = null;
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
    this.compositor.renderTo(this.ctx, index, this.pos, width, height);
    if (this.onPosChange) this.onPosChange(this.pos, index);
  }

  refresh() {
    this.drawCurrent();
  }

  setPos(pos) {
    const len = this.store.sequence.length || 1;
    this.pos = ((pos % len) + len) % len;
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
        this.setPos(this.pos + 1);
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
