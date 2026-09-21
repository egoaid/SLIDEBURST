/* audio-tap.js — 動画の書き出しで、元動画の音声を新しい動画へ写し取る。
   書き出し専用の <video>（書き出しのたびに作って捨てる）の音を Web Audio で受け、
   MediaStream の音声トラックとして取り出す。スピーカー(destination)へは音量0でしかつながないので、
   書き出し中に音は鳴らない。終わったら close() で音声コンテキストごと手放す。

   加工画面のプレビュー用 <video> には使わない。createMediaElementSource は1つの要素に1回しか使えず、
   使うと以後その要素の音が必ずこの経路を通ってしまい、iOSでは音声コンテキストが動いているだけで
   マイク録音に悪さをすることがあるため（録画が無音になる不具合の原因の一つと考えられた）。 */

export class AudioTap {
  constructor(video) {
    this.video = video;
    this.ctx = null;
    this.dest = null;
    this._resumed = null;
  }

  static supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /* 必ず、ボタンを押した操作の中で、await より前に呼ぶこと（iOS は操作の外だと音声コンテキストを動かさない） */
  setup() {
    if (!AudioTap.supported()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._resumed = this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
      const src = this.ctx.createMediaElementSource(this.video);
      this.dest = this.ctx.createMediaStreamDestination();
      src.connect(this.dest);
      // 音量0でスピーカー側へもつなぐ。つながっていないと、Safariは音声の経路を動かさず、
      // <video> の再生が音声待ちで止まってしまうおそれがある（音は出ない）
      const silent = this.ctx.createGain();
      silent.gain.value = 0;
      src.connect(silent);
      silent.connect(this.ctx.destination);
    } catch (e) {
      this.close();
    }
  }

  /* 書き出しに足す音声トラック。取れなければ null（無音で書き出す） */
  async prepare() {
    if (this.ctx && this.dest) {
      try { await this._resumed; } catch (e) { /* 動かなければトラックは無音になる */ }
      const t = this.dest.stream.getAudioTracks()[0];
      if (t) return t;
    }
    return this._elementCapture();
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

  close() {
    if (this.ctx) {
      try { this.ctx.close(); } catch (e) { /* 既に閉じている */ }
    }
    this.ctx = null;
    this.dest = null;
  }
}
