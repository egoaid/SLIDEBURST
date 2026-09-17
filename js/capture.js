/* capture.js — 極短時間バースト撮影の中核
   requestVideoFrameCallback で「実際にデコードされたフレーム」だけを拾う。
   未対応環境では requestAnimationFrame にフォールバックする。 */

import { MAX_POOL_FRAMES } from './config.js';
import { supportsRVFC } from './utils.js';

/* 撮影中に canvas を作ると取りこぼすため、事前に確保して使い回す */
export class FramePool {
  constructor() {
    this.items = [];
    this.w = 0;
    this.h = 0;
  }

  ensure(w, h, n) {
    if (w !== this.w || h !== this.h) {
      this.items = [];
      this.w = w;
      this.h = h;
    }
    while (this.items.length < n) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.items.push({ canvas, ctx });
    }
    return this.items;
  }

  /* 最初の1枚を先に描いて、描画パスを温めておく */
  warmUp(video) {
    if (!this.items.length) return;
    try {
      this.items[0].ctx.drawImage(video, 0, 0, this.w, this.h);
    } catch (e) { /* 初回は失敗しうるので無視してよい */ }
  }
}

function targetSize(video, scale) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  return {
    w: Math.max(2, Math.round(vw * scale)),
    h: Math.max(2, Math.round(vh * scale)),
    sourceW: vw,
    sourceH: vh
  };
}

/**
 * バースト撮影を実行する。
 * @returns {Promise<Object>} frames と計測用の生データ
 */
export function burstCapture({ video, pool, durationMs, scale = 1 }) {
  const { w, h, sourceW, sourceH } = targetSize(video, scale);
  const expected = Math.ceil((durationMs / 1000) * 120) + 6;
  const capacity = Math.min(MAX_POOL_FRAMES, Math.max(4, expected));
  const items = pool.ensure(w, h, capacity);
  pool.warmUp(video);

  const useRVFC = supportsRVFC();
  const frames = [];

  return new Promise((resolve) => {
    let startedAt = null;
    let settled = false;
    const wallStart = performance.now();

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({
        frames,
        width: w,
        height: h,
        sourceWidth: sourceW,
        sourceHeight: sourceH,
        requestedMs: durationMs,
        capacity,
        method: useRVFC ? 'requestVideoFrameCallback' : 'requestAnimationFrame',
        latencyMs: startedAt === null ? 0 : startedAt - wallStart
      });
    };

    /* フレームが届かないまま止まる端末に備えた保険 */
    const watchdog = setTimeout(finish, durationMs + 2000);

    const onFrame = (now, meta) => {
      if (settled) return;
      const slot = items[frames.length];
      slot.ctx.drawImage(video, 0, 0, w, h);
      const t = performance.now();
      if (startedAt === null) startedAt = t;

      frames.push({
        canvas: slot.canvas,
        t,
        elapsed: t - startedAt,
        mediaTime: meta && typeof meta.mediaTime === 'number' ? meta.mediaTime : null,
        presentedFrames: meta && typeof meta.presentedFrames === 'number' ? meta.presentedFrames : null
      });

      const finished = (t - startedAt) >= durationMs || frames.length >= capacity;
      if (finished) {
        finish();
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (useRVFC) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame((t) => onFrame(t, null));
      }
    };

    schedule();
  });
}
