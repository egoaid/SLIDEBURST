/* playback.js — 往復ループ再生プレイヤー */

export class LoopPlayer {
  constructor(canvas, store) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.store = store;
    this.fps = 12;
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
    const frame = this.store.frameAt(this.pos);
    if (!frame) return;
    this.resizeTo(frame.canvas.width, frame.canvas.height);
    this.ctx.drawImage(frame.canvas, 0, 0);
    if (this.onPosChange) this.onPosChange(this.pos);
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

  reset() {
    this.pos = 0;
    this.drawCurrent();
  }
}
