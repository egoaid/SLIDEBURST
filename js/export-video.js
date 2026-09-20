/* export-video.js — ループ再生を録画して動画ファイルにする
   iOS Safari の MediaRecorder は MP4(H.264) を直接吐けるので、それを最優先で使う。 */

const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
];

export function videoSupported() {
  return typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    } catch (e) { /* 判定できない実装は次へ */ }
  }
  return null;
}

export function extensionFor(mime) {
  return mime && mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 往復シーケンスを指定回数くり返して録画する。
 * @param {Object} o {render, sequence, fps, width, height, loops, onProgress}
 *   render(ctx, index, pos, width, height) — pos は往復列の中の再生位置（テープカウンター用）
 * @returns {Promise<Blob>}
 */
export async function encodeVideo({ render, sequence, fps, width, height, loops = 4, onProgress }) {
  const mime = pickMimeType();
  if (!videoSupported() || !mime) {
    throw new Error('このブラウザは動画の書き出しに対応していません。GIFで保存してください。');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'offscreenCanvas';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  render(ctx, sequence[0], 0, width, height);

  const stream = canvas.captureStream(Math.max(30, fps * 2));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10000000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  recorder.start();
  const interval = 1000 / fps;
  const totalSteps = loops * sequence.length;
  let step = 0;

  try {
    for (let l = 0; l < loops; l++) {
      for (let i = 0; i < sequence.length; i++) {
        render(ctx, sequence[i], i, width, height);
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.requestFrame === 'function') {
          try { track.requestFrame(); } catch (e) { /* fps指定のストリームでは無視されることがある */ }
        }
        step++;
        if (onProgress) onProgress(step / totalSteps, '録画中');
        await sleep(interval);
      }
    }
    await sleep(Math.max(120, interval));
  } finally {
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    canvas.remove();
  }

  return new Blob(chunks, { type: recorder.mimeType || mime });
}
