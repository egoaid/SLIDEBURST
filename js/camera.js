/* camera.js — getUserMedia とストリーム管理 */

import { STREAM_MODES, VIDEO_FRAME_RATE } from './config.js';
import { L } from './i18n.js';

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facing = 'environment';
    this.mode = 'fps';
    this.withAudio = false;
    this.forVideo = false;
    this.audioFailed = false;
  }

  get track() {
    return this.stream ? this.stream.getVideoTracks()[0] : null;
  }

  settings() {
    const t = this.track;
    return t && t.getSettings ? t.getSettings() : {};
  }

  label() {
    const t = this.track;
    return t ? (t.label || L('Unnamed', '名称なし')) : '';
  }

  /**
   * カメラを起動する。
   * audio: マイクも同じ getUserMedia で取る（映像と音声を別々に取ると、録画のなかで音と映像の開始位置がずれるおそれがあるため）。
   * forVideo: 「ふつうの動画」用。コマ数を24fps（上限30）にする。バースト撮影は高速フレームが要るので触らない。
   * マイクだけ拒否された場合は、映像だけで起動して audioFailed を立てる。
   */
  async start({ facing = this.facing, mode = this.mode, audio = false, forVideo = false } = {}) {
    this.stop();
    this.facing = facing;
    this.mode = mode;
    this.withAudio = !!audio;
    this.forVideo = !!forVideo;
    this.audioFailed = false;

    const base = Object.assign(
      { facingMode: facing === 'user' ? 'user' : { ideal: 'environment' } },
      STREAM_MODES[mode] || STREAM_MODES.fps,
      forVideo ? { frameRate: VIDEO_FRAME_RATE } : {}
    );
    const minimal = { facingMode: facing === 'user' ? 'user' : 'environment' };

    const attempt = async (withAudio) => {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: withAudio, video: base });
      } catch (err) {
        // 制約が厳しすぎて拒否された場合は最低限の条件で再試行する
        if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
          return navigator.mediaDevices.getUserMedia({ audio: withAudio, video: minimal });
        }
        throw err;
      }
    };

    let stream;
    try {
      stream = await attempt(!!audio);
    } catch (err) {
      if (!audio) throw err;
      // マイクのせいで失敗したかもしれない。映像だけでもう一度（それも失敗するならカメラの問題なのでそのまま投げる）
      stream = await attempt(false);
      this.audioFailed = true;
      this.withAudio = false;
    }

    this.stream = stream;
    this.video.srcObject = stream;
    this.video.classList.toggle('is-mirrored', facing === 'user');
    await this.video.play();
    await this.waitForSize();
    return this.settings();
  }

  /* マイクが使える状態か（トラックが生きていて、無音扱い(muted)になっていない） */
  hasLiveAudio() {
    const t = this.stream ? this.stream.getAudioTracks()[0] : null;
    return !!t && t.readyState === 'live' && t.enabled && !t.muted;
  }

  /* マイクだけを手放す（映像はそのまま）。加工画面で音を再生するとき、iOSの音声セッションを奪い合わないように */
  releaseAudio() {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) {
      t.stop();
      this.stream.removeTrack(t);
    }
    this.withAudio = false;
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
    return this.start({ facing: this.facing === 'user' ? 'environment' : 'user', audio: this.withAudio, forVideo: this.forVideo });
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}

/* 権限エラーを対処法つきの文章に変換する */
export function describeCameraError(err, withAudio = false) {
  const name = err && err.name ? err.name : '';
  const device = withAudio ? L('the camera and microphone', 'カメラとマイク') : L('the camera', 'カメラ');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return L(
      'Access to ' + device + ' was not allowed. Please allow it in your browser\u2019s site settings, then start again.',
      device + 'の使用が許可されませんでした。ブラウザのサイト設定で許可してから、もう一度起動してください。'
    );
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return L(
      'Couldn\u2019t find a usable ' + device + '. Try switching to a different camera, or change the stream settings.',
      '使用できる' + device + 'が見つかりませんでした。別のカメラに切り替えるか、ストリーム設定を変えて試してください。'
    );
  }
  if (name === 'NotReadableError') {
    return L(
      device.charAt(0).toUpperCase() + device.slice(1) + ' is in use by another app. Please close it and try again.',
      device + 'を他のアプリが使用中です。他のアプリを閉じてから、もう一度起動してください。'
    );
  }
  return L(
    'Couldn\u2019t start ' + device + ' (' + (name || 'unknown error') + '). Please reload the page and try again.',
    device + 'を起動できませんでした（' + (name || '不明なエラー') + '）。ページを再読み込みして試してください。'
  );
}
