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
 *   render(ctx, index, timeSec, width, height) — timeSec は書き出し動画の中の経過秒数（テープカウンター用）
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
        render(ctx, sequence[i], (l * sequence.length + i) / fps, width, height);
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

/**
 * 動画作品を、フィルター・文字・ブラウン管をかけて1本の動画に書き出す。
 * 元動画を実時間で再生しながら、1コマずつ加工して録画し直す。だから書き出しにかかる時間は
 * 元動画の長さと同じ（画面を開いたままにしておく必要がある）。
 * @param {Object} o
 *   video: 元動画の <video>（音声も、ここから写す）
 *   render(ctx, timeSec, width, height): 1コマを描く
 *   audioTrack: 写し取った音声トラック（無ければ音なし）
 *   duration: 元動画の長さ（秒）
 *   signal: {aborted:boolean} 立てると中止
 * @returns {Promise<{blob: Blob, silent: boolean}>} silent は、音声を写せず無音で書き出したとき true
 */
export async function encodeVideoWork({ video, render, width, height, audioTrack, duration, signal, onProgress }) {
  const mime = pickMimeType();
  if (!videoSupported() || !mime) {
    throw new Error('このブラウザは動画の書き出しに対応していません。');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'offscreenCanvas';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  const stream = canvas.captureStream(30);
  if (audioTrack) stream.addTrack(audioTrack);
  // 画素数に応じたビットレート。フィルターの粒子やノイズは圧縮しにくく、低いとブロックノイズになるので多めに取る（上限はメモリのため）
  const bps = Math.round(Math.min(16000000, Math.max(3000000, width * height * 30 * 0.45)));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  const wasLoop = video.loop;
  const ended = new Promise((resolve) => video.addEventListener('ended', resolve, { once: true }));
  let rafId = null;
  let silent = false;

  try {
    video.loop = false;
    if (video.currentTime !== 0) {
      video.currentTime = 0;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2000);
        video.addEventListener('seeked', () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
    render(ctx, video.currentTime, width, height);

    recorder.start(3000);
    try {
      await video.play();
    } catch (e) {
      // 音ありの再生が許されなかった。音なしで書き出しを続ける
      video.muted = true;
      silent = true;
      await video.play();
    }

    let lastT = -1;
    let lastMoveAt = performance.now();
    let finished = false;
    ended.then(() => { finished = true; });

    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal && signal.aborted) { reject(new Error('書き出しを中止しました。')); return; }
        const t = video.currentTime;
        if (t !== lastT) {
          lastT = t;
          lastMoveAt = performance.now();
          render(ctx, t, width, height);
          if (onProgress) onProgress(duration ? Math.min(1, t / duration) : 0, '録画中');
        } else if (performance.now() - lastMoveAt > 15000 && !finished) {
          reject(new Error('動画の再生が止まりました。もう一度お試しください。'));
          return;
        }
        if (finished) { resolve(); return; }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    });

    render(ctx, video.currentTime, width, height);
    await sleep(250);
  } finally {
    if (rafId) cancelAnimationFrame(rafId);
    video.pause();
    video.loop = wasLoop;
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    // 音声トラックは Web Audio の出口そのものなので止めない（止めると次の書き出しで使えなくなる）
    if (audioTrack) stream.removeTrack(audioTrack);
    stream.getTracks().forEach((t) => t.stop());
    canvas.remove();
  }

  return { blob: new Blob(chunks, { type: recorder.mimeType || mime }), silent };
}
