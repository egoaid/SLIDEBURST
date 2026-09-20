/* audio-tap.js — 動画の書き出しで、元動画の音声を新しい動画へ写し取る。
   <video> の音を Web Audio で受けて、MediaStream の音声トラックとして取り出す。
   書き出し中に音がスピーカーから鳴り続けないよう、聞こえる側（モニター）だけを消せるようにしてある。
   createMediaElementSource は1つの <video> に1回しか使えず、いちど使うと音は必ずこの経路を通る。
   だから通常の再生でも、モニターをオンに戻しておくこと。 */

export class AudioTap {
  constructor(video) {
    this.video = video;
    this.ctx = null;
    this.monitor = null;
    this.dest = null;
  }

  static supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /* ユーザー操作の中で呼ぶこと（iOS は操作の外だと音声コンテキストを動かしてくれない） */
  async prepare() {
    if (!AudioTap.supported()) return this._elementCapture();
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const src = this.ctx.createMediaElementSource(this.video);
        this.monitor = this.ctx.createGain();
        this.dest = this.ctx.createMediaStreamDestination();
        src.connect(this.monitor);
        this.monitor.connect(this.ctx.destination);
        src.connect(this.dest);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      const tracks = this.dest.stream.getAudioTracks();
      return tracks[0] || null;
    } catch (e) {
      return this._elementCapture();
    }
  }

  /* Web Audio が使えないときの代替（音がそのまま鳴ってしまうが、音声なしよりはよい） */
  _elementCapture() {
    const v = this.video;
    const fn = v.captureStream || v.mozCaptureStream;
    if (!fn) return null;
    try {
      const tracks = fn.call(v).getAudioTracks();
      return tracks[0] || null;
    } catch (e) {
      return null;
    }
  }

  setMonitor(on) {
    if (this.monitor) this.monitor.gain.value = on ? 1 : 0;
  }

  /* 通常の再生の前に。中断されていたら動かし直す */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* 次の操作でもう一度 */ }
    }
  }
}
