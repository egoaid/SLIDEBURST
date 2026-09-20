/* video-record.js — 音声付きの「ふつうの動画」を、その場でフィルターをかけながら録画する。
   バースト撮影（複数コマを撮って立体パラパラを作る）とは別の、単純な連続録画モード。
   仕組み: <video> の毎フレームを scratch canvas に描き、filters.js の applyFilter() を通してから
   出力用 canvas へ描く。その出力 canvas を captureStream() し、元のメディアストリームの
   音声トラックと合わせて MediaRecorder に渡す。 */

import { applyFilter } from './filters.js';

export function videoRecordSupported() {
  return typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

export function pickVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    } catch (e) { /* 判定できない実装は次へ */ }
  }
  return null;
}

export function videoExtensionFor(mime) {
  return mime && mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
}

export class VideoRecorder {
  constructor() {
    this.recording = false;
    this.raw = document.createElement('canvas');
    this.rawCtx = this.raw.getContext('2d', { alpha: false });
    this.out = document.createElement('canvas');
    this.outCtx = this.out.getContext('2d', { alpha: false });
    this.rafId = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.frameIndex = 0;
    this._stopped = null;
  }

  /**
   * 録画を開始する。
   * @param {Object} o
   * @param {HTMLVideoElement} o.video ライブプレビューの video 要素
   * @param {number} o.width 出力の幅
   * @param {number} o.height 出力の高さ
   * @param {MediaStream} o.mediaStream 音声トラックを取り出す元ストリーム（無くてもよい）
   * @param {string} o.filterId フィルターID（'none' でそのまま）
   * @param {Object} o.filterParams フィルターの解決済みパラメータ
   * @param {number} [o.maxMs] 最長録画時間（安全のための上限）
   * @param {(elapsedMs:number)=>void} [o.onTick] 経過時間の通知
   * @param {(result:{blob:Blob,durationMs:number,mime:string}|null)=>void} [o.onAutoStop]
   *   maxMsに達して自動停止したときに呼ばれる（呼び出し側が明示的にstop()した場合は呼ばれない）
   */
  start({ video, width, height, mediaStream, filterId, filterParams, maxMs = 60000, onTick, onAutoStop }) {
    if (this.recording) return false;
    if (!videoRecordSupported()) return false;

    this.raw.width = width;
    this.raw.height = height;
    this.out.width = width;
    this.out.height = height;
    this.frameIndex = 0;

    const draw = () => {
      if (!this.recording) return;
      this.rawCtx.drawImage(video, 0, 0, width, height);
      if (filterId && filterId !== 'none') {
        const filtered = applyFilter(this.raw, filterId, this.frameIndex, filterParams || {});
        this.outCtx.drawImage(filtered, 0, 0);
      } else {
        this.outCtx.drawImage(this.raw, 0, 0);
      }
      this.frameIndex++;
      const elapsed = performance.now() - this.startedAt;
      if (onTick) onTick(elapsed);
      if (elapsed >= maxMs) {
        this.stop().then((result) => { if (onAutoStop) onAutoStop(result); });
        return;
      }
      this.rafId = requestAnimationFrame(draw);
    };

    const canvasStream = this.out.captureStream(30);
    const audioTracks = mediaStream ? mediaStream.getAudioTracks() : [];
    const tracks = [...canvasStream.getVideoTracks(), ...audioTracks];
    const combined = new MediaStream(tracks);

    const mime = pickVideoMimeType();
    this.chunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(combined, Object.assign(
        { videoBitsPerSecond: 8000000 },
        mime ? { mimeType: mime } : {}
      ));
    } catch (e) {
      return false;
    }
    this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this._stopped = new Promise((resolve) => { this.mediaRecorder.onstop = resolve; });

    this.recording = true;
    this.startedAt = performance.now();
    this.mediaRecorder.start();
    this.rafId = requestAnimationFrame(draw);
    return true;
  }

  /**
   * 録画を止めて、できあがった Blob を返す。
   * @returns {Promise<{blob: Blob, durationMs: number, mime: string}|null>}
   */
  async stop() {
    if (!this.recording || !this.mediaRecorder) return null;
    this.recording = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const durationMs = performance.now() - this.startedAt;
    if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    await this._stopped;
    const mime = this.mediaRecorder.mimeType || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime });
    return { blob, durationMs, mime };
  }
}
