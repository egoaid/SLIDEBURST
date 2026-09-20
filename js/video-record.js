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

/* 録画のビットレートは、実際に取れた映像の大きさとコマ数から決める。
   以前は6Mbps固定で、1080pや高コマ数のとき圧縮が足りず、ブロックノイズが出ていた。
   画素数×コマ数×0.14bit を目安に、5〜20Mbpsの範囲に収める（上限は長時間録画でメモリを食いつぶさないため） */
export const RECORD_AUDIO_BPS = 128000;
const BITS_PER_PIXEL = 0.14;

export function recordBitrate(stream) {
  const t = stream && stream.getVideoTracks()[0];
  const st = t && t.getSettings ? t.getSettings() : {};
  const w = st.width || 1280;
  const h = st.height || 720;
  const fps = Math.min(st.frameRate || 30, 60);
  return Math.round(Math.min(20000000, Math.max(5000000, w * h * fps * BITS_PER_PIXEL)));
}

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
    this.ownedTracks = [];
    this._audioTracks = [];
    this.audioIssue = false;   // 録画中にマイクが止まった（iOSの音声セッション競合など）とき true
    this.bitrate = 0;
  }

  /**
   * 録画を開始する。
   * @param {Object} o
   * @param {MediaStream} o.stream 映像（と、あればマイクの音声）のストリーム
   * @param {MediaStreamTrack[]} [o.ownedTracks] 録画が終わったら止めるトラック（録画のために取り直したマイク）
   * @param {(elapsedMs:number, bytes:number)=>void} [o.onTick] 経過時間と、ここまでの大きさの通知
   * @param {(result:{blob:Blob,durationMs:number,mime:string}|null, reason:string)=>void} [o.onAutoStop]
   *   空き容量が足りなくなって自動停止したときに呼ばれる（stop() を呼んだ場合は呼ばれない）
   */
  start({ stream, ownedTracks = [], onTick, onAutoStop }) {
    if (this.recording || !stream) return false;
    if (!videoRecordSupported()) return false;

    const mime = pickVideoMimeType();
    this.chunks = [];
    this.bytes = 0;
    this.ownedTracks = ownedTracks;
    this.audioIssue = false;
    this.bitrate = recordBitrate(stream);
    try {
      this.mediaRecorder = new MediaRecorder(stream, Object.assign(
        { videoBitsPerSecond: this.bitrate, audioBitsPerSecond: RECORD_AUDIO_BPS },
        mime ? { mimeType: mime } : {}
      ));
    } catch (e) {
      this._releaseTracks();
      return false;
    }
    // マイクが途中で止まったら覚えておく（録画後に知らせる）
    this._audioTracks = stream.getAudioTracks();
    for (const t of this._audioTracks) {
      t.addEventListener('mute', () => { this.audioIssue = true; });
      t.addEventListener('ended', () => { this.audioIssue = true; });
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

  /* 録画のために取り直したマイクを手放す。iOSでは、録画後に加工画面で音を再生するときの邪魔になる */
  _releaseTracks() {
    for (const t of this.ownedTracks) {
      try { t.stop(); } catch (e) { /* 既に止まっている */ }
    }
    this.ownedTracks = [];
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
    // 止める時点でマイクが無音状態（mute）のままなら、録音できていない
    if (this._audioTracks.some((t) => t.muted || t.readyState === 'ended')) this.audioIssue = true;
    if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    await this._stopped;
    this._releaseTracks();
    const mime = this.mediaRecorder.mimeType || pickVideoMimeType() || 'video/webm';
    const blob = new Blob(this.chunks, { type: mime });
    this.chunks = [];
    return { blob, durationMs, mime, audioIssue: this.audioIssue };
  }
}
