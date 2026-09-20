/* camera.js — getUserMedia とストリーム管理 */

import { STREAM_MODES } from './config.js';

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facing = 'environment';
    this.mode = 'fps';
    this.withAudio = false;
  }

  get track() {
    return this.stream ? this.stream.getVideoTracks()[0] : null;
  }

  get audioTrack() {
    return this.stream ? this.stream.getAudioTracks()[0] : null;
  }

  settings() {
    const t = this.track;
    return t && t.getSettings ? t.getSettings() : {};
  }

  label() {
    const t = this.track;
    return t ? (t.label || '名称なし') : '';
  }

  async start({ facing = this.facing, mode = this.mode, audio = this.withAudio } = {}) {
    this.stop();
    this.facing = facing;
    this.mode = mode;
    this.withAudio = audio;

    const constraints = {
      audio: !!audio,
      video: Object.assign(
        { facingMode: facing === 'user' ? 'user' : { ideal: 'environment' } },
        STREAM_MODES[mode] || STREAM_MODES.fps
      )
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // 制約が厳しすぎて拒否された場合は最低限の条件で再試行する
      if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: !!audio,
          video: { facingMode: facing === 'user' ? 'user' : 'environment' }
        });
      } else {
        throw err;
      }
    }

    this.stream = stream;
    this.video.srcObject = stream;
    this.video.classList.toggle('is-mirrored', facing === 'user');
    await this.video.play();
    await this.waitForSize();
    return this.settings();
  }

  waitForSize() {
    const v = this.video;
    if (v.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { v.removeEventListener('loadedmetadata', done); resolve(); };
      v.addEventListener('loadedmetadata', done);
      setTimeout(resolve, 2500);
    });
  }

  async flip() {
    return this.start({ facing: this.facing === 'user' ? 'environment' : 'user' });
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}

/* 権限エラーを日本語の対処法に変換する */
export function describeCameraError(err, withAudio = false) {
  const name = err && err.name ? err.name : '';
  const device = withAudio ? 'カメラとマイク' : 'カメラ';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return device + 'の使用が許可されませんでした。ブラウザのサイト設定で許可してから、もう一度起動してください。';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '使用できる' + device + 'が見つかりませんでした。別のカメラに切り替えるか、ストリーム設定を変えて試してください。';
  }
  if (name === 'NotReadableError') {
    return device + 'を他のアプリが使用中です。他のアプリを閉じてから、もう一度起動してください。';
  }
  return device + 'を起動できませんでした（' + (name || '不明なエラー') + '）。ページを再読み込みして試してください。';
}
