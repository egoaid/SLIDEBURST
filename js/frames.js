/* frames.js — 撮影結果の保持・間引き・サムネイル生成 */

import { pickEven, pingPong } from './utils.js';

export class FrameStore {
  constructor() {
    this.result = null;      // burstCapture の戻り値
    this.frames = [];
    this.usedIndices = [];   // 往復再生に使う元フレーム番号
    this.sequence = [];      // 実際の再生順（往復済み）
    this.frameMode = 0;
    this.pingpong = true;
  }

  setResult(result) {
    this.result = result;
    this.frames = result.frames;
    this.rebuild();
  }

  get count() {
    return this.frames.length;
  }

  setFrameMode(count) {
    this.frameMode = count;
    this.rebuild();
  }

  setPingPong(on) {
    this.pingpong = on;
    this.rebuild();
  }

  rebuild() {
    const n = this.frames.length;
    if (!n) {
      this.usedIndices = [];
      this.sequence = [];
      return;
    }
    this.usedIndices = pickEven(n, this.frameMode);
    this.sequence = this.pingpong ? pingPong(this.usedIndices) : this.usedIndices.slice();
  }

  frameAt(seqPos) {
    if (!this.sequence.length) return null;
    const idx = this.sequence[seqPos % this.sequence.length];
    return this.frames[idx] || null;
  }

  sourceIndexAt(seqPos) {
    if (!this.sequence.length) return 0;
    return this.sequence[seqPos % this.sequence.length];
  }
}

/* 一覧用の縮小コピーを作る。撮影後に行うので撮影性能には影響しない */
export function makeThumbnail(sourceCanvas, targetWidth = 160) {
  const scale = targetWidth / sourceCanvas.width;
  const c = document.createElement('canvas');
  c.width = targetWidth;
  c.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const ctx = c.getContext('2d', { alpha: false });
  ctx.drawImage(sourceCanvas, 0, 0, c.width, c.height);
  return c;
}
