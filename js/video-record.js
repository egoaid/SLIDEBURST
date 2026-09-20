/* video-record.js — 「ふつうの動画」を、無加工のまま録画する。
   カメラのストリーム（映像＋音声）を MediaRecorder へそのまま渡すだけ。
   フィルターや縦横比、文字は録画後の加工画面でかける。録画中は画素処理が一切走らないので、
   長さの上限は設けない（端末の空き容量と、メモリが許す限り撮れる）。 */

export function videoRecordSupported() {
  return typeof MediaRecorder !== 'undefined';
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

/* 録画のビットレート。720p前後の実用画質で、1分あたり約45MB */
export const RECORD_VIDEO_BPS = 6000000;
export const RECORD_AUDIO_BPS = 128000;

/* 空き容量がこれを下回りそうになったら、データを失う前に自動で止める */
const MIN_FREE_BYTES = 150 * 1024 * 1024;

async function freeBytes() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      if (e && e.quota) return e.quota - (e.usage || 0);
    } catch (err) { /* 取れない環境は見張りをあきらめる */ }
  }
  return null;
}

export class VideoRecorder {
  constructor() {
    this.recording = false;
    this.mediaRecorder = null;
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = 0;
    this.timer = null;
    this._stopped = null;
    this._checking = false;
  }

  /**
   * 録画を開始する。
   * @param {Object} o
   * @param {MediaStream} o.stream カメラ（と、あればマイク）のストリーム
   * @param {(elapsedMs:number, bytes:number)=>void} [o.onTick] 経過時間と、ここまでの大きさの通知
   * @param {(result:{blob:Blob,durationMs:number,mime:string}|null, reason:string)=>void} [o.onAutoStop]
   *   空き容量が足りなくなって自動停止したときに呼ばれる（stop() を呼んだ場合は呼ばれない）
   */
  start({ stream, onTick, onAutoStop }) {
    if (this.recording || !stream) return false;
    if (!videoRecordSupported()) return false;

    const mime = pickVideoMimeType();
    this.chunks = [];
    this.bytes = 0;
    try {
      this.mediaRecorder = new MediaRecorder(stream, Object.assign(
        { videoBitsPerSecond: RECORD_VIDEO_BPS, audioBitsPerSecond: RECORD_AUDIO_BPS },
        mime ? { mimeType: mime } : {}
      ));
    } catch (e) {
      return false;
    }
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) {
        this.chunks.push(e.data);
        this.bytes += e.data.size;
      }
      this._guardStorage(onAutoStop);
    };
    this._stopped = new Promise((resolve) => { this.mediaRecorder.onstop = resolve; });

    this.recording = true;
    this.startedAt = performance.now();
    // 数秒ごとにデータを受け取って手元に積む（最後にまとめて受け取るより、途中で失いにくい）
    this.mediaRecorder.start(3000);
    this.timer = setInterval(() => {
      if (onTick) onTick(performance.now() - this.startedAt, this.bytes);
    }, 250);
    return true;
  }

  /* 空き容量の見張り。録画済みのぶんは保存にも同じだけ要るので、その2倍で見積もる */
  async _guardStorage(onAutoStop) {
    if (this._checking || !this.recording) return;
    this._checking = true;
    try {
      const free = await freeBytes();
      if (free !== null && this.recording && free - this.bytes < MIN_FREE_BYTES) {
        const result = await this.stop();
        if (onAutoStop) onAutoStop(result, 'storage');
      }
    } finally {
      this._checking = false;
    }
  }

  /**
   * 録画を止めて、できあがった Blob を返す。
   * @returns {Promise<{blob: Blob, durationMs: number, mime: string}|null>}
   */
  async stop() {
    if (!this.recording || !this.mediaRecorder) return null;
    this.recording = false;
    clearInterval(this.timer);
    this.timer = null;
    const durationMs = performance.now() - this.startedAt;
    if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    await this._stopped;
    const mime = this.mediaRecorder.mimeType || pickVideoMimeType() || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime });
    this.chunks = [];
    return { blob, durationMs, mime };
  }
}
