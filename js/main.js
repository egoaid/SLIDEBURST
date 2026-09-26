/* main.js — アプリ全体の進行役
   SLIDEBURST — 一瞬の横移動で、止まった人が立体的に動き出すカメラ
   © 2026 egoaid / All rights reserved. */

import {
  APP, DURATIONS, DEFAULT_DURATION_MS, FRAME_MODES, DEFAULT_FRAME_MODE,
  DEFAULT_PLAY_FPS, STAMP_COLORS, EMOJI_SET, PEN_COLORS, EXPORT_FORMATS,
  EXPORT_DURATIONS, DEFAULT_EXPORT_SECONDS, SOCIAL_FRAMES, BACKGROUNDS, GUIDES,
  TIMER_OPTIONS
} from './config.js';
import { $, browserLabel, isSecure, supportsRVFC } from './utils.js';
import { Camera, describeCameraError } from './camera.js';
import { FramePool, burstCapture } from './capture.js';
import { FrameStore, makeThumbnail } from './frames.js';
import { Compositor } from './compose.js';
import { crtWarpPoint, crtUnwarpPoint } from './crt.js';
import { ASPECTS, ratioOf, hasVerticalRoom } from './crop.js';
import { Doodle } from './doodle.js';
import { FILTERS, PARAM_SCHEMAS, CINEMA_VARIANTS } from './filters.js';
import { OSD_FONTS, TITLE_DEFAULT_X, TITLE_DEFAULT_Y } from './osd.js';
import { VideoRecorder, videoRecordSupported } from './video-record.js';
import { VideoPlayer, attachBlob, settleVideoElement } from './video-player.js';
import { AudioTap } from './audio-tap.js';
import { keepAwake, releaseAwake } from './wakelock.js';
import { defaultStampText } from './datestamp.js';
import { LoopPlayer } from './playback.js';
import { analyze, renderMetrics, verdict, toText } from './metrics.js';
import { encodeGIF } from './export-gif.js';
import { encodeVideo, encodeVideoWork, videoSupported, pickMimeType, extensionFor } from './export-video.js';
import { timestampName, shareFile, attachDownload } from './share.js';
import {
  storageAvailable, newCaptureId, canvasToBlob, saveCapture, updateCapture,
  listCaptures, getCapture, loadFrameBlobs, deleteCapture, blobToCanvas, estimateUsage, frameBytes
} from './storage.js';
import { renderLibrary } from './library.js';
import { FloatingPreview } from './pip.js';
import {
  buildChips, selectChip, buildSwatches, buildEmojiGrid, clearEmojiSelection,
  setupTabs, showTab, setStatus, showView, fireFlash, renderStrip, markStripUsage,
  setExportStatus, buildAdvancedGrid, retranslateDynamicUI
} from './ui.js';
import { getLang, setLang, onLangChange, t, tf, L, applyI18n } from './i18n.js';

/* タブを切り替える。落書きの受け皿やタイトルの移動枠も、タブに合わせて切り替わる */
function gotoTab(name) {
  showTab($('tabs'), name);
  state.tab = name;
  setDrawing(name === 'draw');
  syncTextEditing();
}

/* showView に加えて、PiP プレビューへも今の画面状態を伝える */
function goView(name) {
  showView(name);
  if (floatingPreview) floatingPreview.refresh();
  syncMicToView(name);
}

/* カメラの起動条件。「ふつうの動画」のときだけ、マイクと24fpsを使う */
function cameraOptions() {
  const isVideo = state.captureMode === 'video';
  return { mode: state.streamMode, audio: isVideo, forVideo: isVideo };
}

/* マイクは、カメラ画面で「ふつうの動画」を撮るときだけ持つ。加工画面へ移るときに手放し
   （加工画面で音を再生すると、iOSの音声セッションを奪い合って次の録画が無音になることがあった）、
   カメラ画面へ戻ったら新しく取り直す */
function syncMicToView(name) {
  if (!camera.stream || videoRecorder.recording) return;
  if (name === 'result') {
    if (camera.withAudio) camera.releaseAudio();
  } else if (name === 'camera' && state.captureMode === 'video' && !camera.hasLiveAudio() && !camera.audioFailed) {
    camera.start(cameraOptions()).catch((err) => setStatus(describeCameraError(err, true), true));
  }
}

const video = $('preview');
const camera = new Camera(video);
const pool = new FramePool();
const store = new FrameStore();
const doodle = new Doodle();
const compositor = new Compositor(store, doodle);
const burstPlayer = new LoopPlayer($('loopCanvas'), store, compositor);
const workVideo = $('workVideo');
const videoPlayer = new VideoPlayer($('loopCanvas'), workVideo, compositor);
/* いま画面に出している作品のプレイヤー。バースト作品と動画作品で差し替わる（同じ呼び方ができる） */
let player = burstPlayer;
const videoRecorder = new VideoRecorder();
let floatingPreview = null;

const CAPTURE_MODES = [
  { id: 'burst', label: { en: '3D burst photo', ja: 'バースト立体撮影' } },
  { id: 'video', label: { en: 'Regular video', ja: 'ふつうの動画' } }
];

const state = {
  durationMs: DEFAULT_DURATION_MS,
  scale: 0.5,
  streamMode: 'fps',
  busy: false,
  metrics: null,
  drawMode: 'pen',
  penColor: PEN_COLORS[0],
  penSize: 8,
  emoji: null,
  format: 'mp4',
  exportSeconds: DEFAULT_EXPORT_SECONDS,
  socialFrame: 'artwork',
  background: 'blur',
  exporting: false,
  seeking: false,
  lastBlob: null,
  lastName: '',
  captureId: null,
  saveTimer: null,
  timerMs: 0,
  countdownCancelled: false,
  captureMode: 'burst',
  guideId: 'off',
  workKind: 'burst',       // いま加工画面に開いている作品の種類（'burst' | 'video'）
  videoBlob: null,         // 動画作品の元データ（無加工の録画）
  soundOn: true,
  exportAbort: null,
  tab: 'play'
};

/* ---------- 環境表示 ---------- */

function showEnvironment() {
  const bits = [browserLabel()];
  bits.push(supportsRVFC() ? t('env.rvfcSupported') : t('env.rvfcUnsupported'));
  if (!videoSupported() || !pickMimeType()) bits.push(t('env.noVideoExport'));
  if (!storageAvailable()) bits.push(t('env.noStorage'));
  if (!isSecure()) bits.push(t('env.notHttps'));
  $('envNote').textContent = bits.join(' \u00b7 ');
  $('buildTag').textContent = APP.name + ' v' + APP.version + ' build ' + APP.build;
}

/* ---------- 撮影 ---------- */

function setupCameraControls() {
  buildChips(
    $('captureModeChips'),
    CAPTURE_MODES.map((m) => ({ value: m.id, label: m.label })),
    'burst',
    setCaptureMode
  );

  buildChips(
    $('durationChips'),
    DURATIONS.map((d) => ({ value: d.ms, label: d.label, hint: d.hint })),
    DEFAULT_DURATION_MS,
    (ms) => {
      state.durationMs = ms;
      $('shutterText').textContent = (ms / 1000).toFixed(2) + 's';
      setStatus(L(
        'Capture time ' + (ms / 1000).toFixed(2) + 's. Slide the camera sideways, level, the moment you tap the shutter.',
        '撮影時間 ' + (ms / 1000).toFixed(2) + ' 秒。シャッターと同時に、カメラを水平に横へ滑らせてください。'
      ));
    }
  );
  $('shutterText').textContent = (DEFAULT_DURATION_MS / 1000).toFixed(2) + 's';

  buildChips(
    $('guideChips'),
    GUIDES.map((g) => ({ value: g.id, label: g.label })),
    'off',
    setGuide
  );

  buildChips(
    $('timerChips'),
    TIMER_OPTIONS.map((t) => ({ value: t.value, label: t.label })),
    0,
    (ms) => { state.timerMs = ms; }
  );

  $('scaleSelect').addEventListener('change', (e) => {
    state.scale = Number(e.target.value);
    pool.items = [];
  });

  $('modeSelect').addEventListener('change', async (e) => {
    state.streamMode = e.target.value;
    if (!camera.stream || videoRecorder.recording) return;
    try {
      const s = await camera.start(cameraOptions());
      pool.items = [];
      setStatus(L(
        'Switched stream to ' + s.width + '\u00d7' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps.',
        'ストリームを ' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps に切り替えました。'
      ));
    } catch (err) {
      setStatus(describeCameraError(err, state.captureMode === 'video'), true);
    }
  });

  $('startCamera').addEventListener('click', startCamera);
  $('flipCamera').addEventListener('click', flipCamera);
  $('shutter').addEventListener('click', onShutter);
  $('toResult').addEventListener('click', () => {
    if (hasWork()) {
      goView('result');
    } else {
      // 撮影前・作品を開く前でも、作品一覧だけは常に見られるようにする
      goView('result');
      gotoTab('lib');
      refreshLibrary();
    }
  });
}

/* 撮影モードの切り替え。バースト立体撮影とふつうの動画は、必要な画面部品が異なる */
function setCaptureMode(mode) {
  if (state.busy || videoRecorder.recording) return;
  state.captureMode = mode;
  $('durationField').hidden = mode === 'video';
  $('videoModeHint').hidden = mode !== 'video';

  if (mode === 'video' && !videoRecordSupported()) {
    setStatus(L('This browser doesn\u2019t support recording video with sound.', 'このブラウザは音声付き動画の録画に対応していません。'), true);
  }

  if (camera.stream) {
    camera.start(cameraOptions()).then(() => {
      if (mode === 'video' && camera.audioFailed) setStatus(L(
        'Microphone unavailable. Recording will have no sound. Allow the microphone in your browser\u2019s site settings.',
        'マイクを使えません。このまま録画すると音声なしになります。ブラウザのサイト設定でマイクを許可してください。'
      ), true);
    }).catch((err) => {
      setStatus(describeCameraError(err, mode === 'video'), true);
    });
  }

  setStatus(mode === 'video'
    ? L('Regular video mode. Tap the shutter to start and stop recording; you can edit it afterwards.', 'ふつうの動画モードです。シャッターで録画を開始・停止します。加工は録ったあとにできます。')
    : L('Choose a capture time, then slide the camera sideways the moment you tap the shutter.', '撮影時間を選んで、シャッターと同時にカメラを横へ滑らせてください。'));
}

function onShutter() {
  if (state.captureMode === 'video') toggleVideoRecording();
  else shoot();
}

/* プレビューに重ねる構図ガイド。撮影する範囲そのものは変わらない。
   box-shadow の巨大な塗りつぶしではなく、4枚の帯で外側を暗くする
   （こちらのほうが、一部ブラウザでの意図しないスクロール発生を避けられる）。 */
function setGuide(id) {
  state.guideId = id;
  const guide = GUIDES.find((g) => g.id === id) || GUIDES[0];
  const el = $('frameGuide');
  if (!guide.ratio) {
    el.hidden = true;
    return;
  }
  const stageRatio = 3 / 4;
  let boxWPct, boxHPct;
  if (guide.ratio >= stageRatio) {
    boxWPct = 100;
    boxHPct = (stageRatio / guide.ratio) * 100;
  } else {
    boxHPct = 100;
    boxWPct = (guide.ratio / stageRatio) * 100;
  }
  const box = $('frameGuideBox');
  box.style.width = boxWPct.toFixed(2) + '%';
  box.style.height = boxHPct.toFixed(2) + '%';

  const marginV = (100 - boxHPct) / 2;
  const marginH = (100 - boxWPct) / 2;
  $('dimTop').style.cssText = 'left:0;right:0;top:0;height:' + marginV.toFixed(2) + '%;';
  $('dimBottom').style.cssText = 'left:0;right:0;bottom:0;height:' + marginV.toFixed(2) + '%;';
  $('dimLeft').style.cssText = 'top:' + marginV.toFixed(2) + '%;bottom:' + marginV.toFixed(2) + '%;left:0;width:' + marginH.toFixed(2) + '%;';
  $('dimRight').style.cssText = 'top:' + marginV.toFixed(2) + '%;bottom:' + marginV.toFixed(2) + '%;right:0;width:' + marginH.toFixed(2) + '%;';

  $('frameGuideLabel').textContent = tf(guide.label);
  el.hidden = false;
}

async function startCamera() {
  if (!isSecure()) {
    setStatus(L('This page must be opened over HTTPS.', 'このページは HTTPS で開く必要があります。'), true);
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus(L('This browser doesn\u2019t support camera input.', 'このブラウザはカメラ入力に対応していません。'), true);
    return;
  }
  $('blockerText').textContent = L('Please allow camera access\u2026', 'カメラの使用を許可してください…');
  try {
    const s = await camera.start(cameraOptions());
    $('blocker').hidden = true;
    $('shutter').disabled = false;
    updateFacingLabel();
    setStatus(L(
      'Ready (' + s.width + '\u00d7' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps).',
      '準備できました（' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps）。'
    ));
    if (state.captureMode === 'video' && camera.audioFailed) {
      setStatus(L(
        'Microphone unavailable. Recording will have no sound. Allow the microphone in your browser\u2019s site settings.',
        'マイクを使えません。このまま録画すると音声なしになります。ブラウザのサイト設定でマイクを許可してください。'
      ), true);
    }
  } catch (err) {
    const msg = describeCameraError(err, state.captureMode === 'video');
    $('blockerText').textContent = msg;
    setStatus(msg, true);
  }
}

function updateFacingLabel() {
  $('facingLabel').textContent = camera.facing === 'user' ? L('Front', 'イン') : L('Back', 'アウト');
}

async function flipCamera() {
  if (!camera.stream || state.busy) return;
  try {
    await camera.flip();
    pool.items = [];
    updateFacingLabel();
    setStatus(camera.facing === 'user'
      ? L('Switched to front camera.', 'インカメラに切り替えました。')
      : L('Switched to back camera.', 'アウトカメラに切り替えました。'));
  } catch (err) {
    setStatus(describeCameraError(err, state.captureMode === 'video'), true);
  }
}

/* カウントダウンを表示して待つ。キャンセルされたら false を返す */
function runCountdown(ms) {
  return new Promise((resolve) => {
    state.countdownCancelled = false;
    const el = $('countdown');
    const num = $('countdownNum');
    let remaining = Math.ceil(ms / 1000);
    num.textContent = String(remaining);
    el.hidden = false;

    const cancel = () => {
      state.countdownCancelled = true;
    };
    $('countdownCancel').addEventListener('click', cancel, { once: true });

    const timer = setInterval(() => {
      if (state.countdownCancelled) {
        clearInterval(timer);
        el.hidden = true;
        resolve(false);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        el.hidden = true;
        resolve(true);
        return;
      }
      num.textContent = String(remaining);
    }, 1000);
  });
}

async function shoot() {
  if (state.busy || !camera.stream) return;

  if (state.timerMs > 0) {
    state.busy = true;
    setStatus(L('Self-timer running\u2026', 'セルフタイマー作動中…'));
    const done = await runCountdown(state.timerMs);
    state.busy = false;
    if (!done) {
      setStatus(L('Self-timer cancelled.', 'セルフタイマーをキャンセルしました。'));
      return;
    }
  }

  if (state.busy || !camera.stream) return;
  state.busy = true;
  $('shutter').classList.add('is-busy');
  $('stage').classList.add('is-recording');
  setStatus(L('Capturing\u2026', '撮影中…'));

  try {
    const result = await burstCapture({
      video,
      pool,
      durationMs: state.durationMs,
      scale: state.scale
    });
    fireFlash();
    handleResult(result);
  } catch (err) {
    setStatus(L(
      'Capture failed (' + (err && err.message ? err.message : 'unknown') + ').',
      '撮影に失敗しました（' + (err && err.message ? err.message : '不明') + '）。'
    ), true);
  } finally {
    state.busy = false;
    $('shutter').classList.remove('is-busy');
    $('stage').classList.remove('is-recording');
  }
}

/* ---------- ふつうの動画（無加工で録画 → 録画後に加工画面で仕上げる） ---------- */

function formatRecTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
}

function formatMB(bytes) {
  const mb = bytes / 1048576;
  if (mb >= 1000) return (mb / 1024).toFixed(1) + 'GB';
  return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + 'MB';
}

function endRecordingUI() {
  $('shutter').classList.remove('is-busy');
  $('stage').classList.remove('is-recording');
  $('recIndicator').hidden = true;
  releaseAwake();
}

/* 録画の前に、マイクが使える状態か確かめる。止まっていたら、映像と音声をいっしょに取り直す
   （別々に取ると、録画の中で映像と音声の開始位置がずれるおそれがある） */
async function prepareVideoStream() {
  if (!camera.stream) return false;
  const videoLive = camera.track && camera.track.readyState === 'live';
  if (videoLive && (camera.hasLiveAudio() || camera.audioFailed)) return true;
  try {
    await camera.start(cameraOptions());
  } catch (e) {
    return false;
  }
  return !!camera.stream;
}

async function toggleVideoRecording() {
  if (videoRecorder.recording) {
    await stopVideoRecording();
    return;
  }
  if (state.busy || !camera.stream) return;
  if (!videoRecordSupported()) {
    setStatus(L('This browser doesn\u2019t support recording video with sound.', 'このブラウザは音声付き動画の録画に対応していません。'), true);
    return;
  }

  if (state.timerMs > 0) {
    state.busy = true;
    setStatus(L('Self-timer running\u2026', 'セルフタイマー作動中…'));
    const done = await runCountdown(state.timerMs);
    state.busy = false;
    if (!done) {
      setStatus(L('Self-timer cancelled.', 'セルフタイマーをキャンセルしました。'));
      return;
    }
  }

  if (state.busy || !camera.stream) return;

  // マイクの確認・取り直しの間、二重に押されないようにする
  state.busy = true;
  const ready = await prepareVideoStream();
  state.busy = false;
  if (!ready) {
    setStatus(L('The camera has stopped. Please restart it.', 'カメラが止まっています。カメラを起動し直してください。'), true);
    return;
  }

  const hasMic = camera.hasLiveAudio();
  $('shutter').classList.add('is-busy');
  $('stage').classList.add('is-recording');
  $('recIndicator').hidden = false;
  $('recTime').textContent = '0:00 · 0MB';
  setStatus(hasMic
    ? L('Recording\u2026 (with sound, untouched. Tap the shutter again to stop)', '録画中…（音声あり・無加工で録っています。もう一度シャッターで止まります）')
    : L('Recording\u2026 (no sound \u2014 microphone unavailable. Tap the shutter again to stop)', '録画中…（マイクを使えないため、音声なしで録っています。もう一度シャッターで止まります）'), !hasMic);
  keepAwake();

  const started = videoRecorder.start({
    stream: camera.stream,
    onTick: (elapsed, bytes) => {
      $('recTime').textContent = formatRecTime(elapsed) + ' · ' + formatMB(bytes);
    },
    onAutoStop: (result) => {
      // 端末の空き容量が少なくなったので、録画済みぶんを守るために自動で止めた
      endRecordingUI();
      finishVideoRecording(result, 'storage');
    }
  });

  if (!started) {
    endRecordingUI();
    setStatus(L('Couldn\u2019t start recording.', '録画を開始できませんでした。'), true);
    return;
  }
  state.busy = true;
}

async function stopVideoRecording() {
  setStatus(L('Finishing up the video\u2026', '動画を仕上げています…'));
  const result = await videoRecorder.stop();
  endRecordingUI();
  // 空き容量の見張りが先に自動停止していた場合は、そちらが仕上げを済ませる
  if (!result) return;
  await finishVideoRecording(result, 'user');
}

/* 録画が終わったら、ライブラリを経由せず、そのまま加工画面へ進む */
async function finishVideoRecording(result, reason) {
  state.busy = false;
  if (!result || !result.blob || !result.blob.size) {
    setStatus(L('Recording failed.', '録画に失敗しました。'), true);
    return;
  }
  setStatus(L('Saving the video\u2026', '動画を保存しています…'));

  const record = {
    id: newCaptureId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    kind: 'video',
    editable: true,          // 無加工の録画。加工内容は settings に持つ（旧版の焼き込み済み動画と区別する印）
    width: 0,
    height: 0,
    durationSec: result.durationMs / 1000,
    sizeBytes: result.blob.size,
    mime: result.mime,
    settings: {},
    thumb: null
  };
  const opened = await enterVideoWork(result.blob, record, { isNew: true });
  if (!opened) return;

  const info = formatRecTime(result.durationMs) + '\u30fb' + formatMB(result.blob.size);
  if (result.audioIssue) {
    setStatus(L(
      'Recorded (' + info + '). The microphone may have stopped during recording \u2014 please play it back to check the sound.',
      '録画できました（' + info + '）。ただし録画中にマイクが止まった可能性があります。音が入っているか、再生して確かめてください。'
    ), true);
  } else if (reason === 'storage') {
    setStatus(L(
      'Stopped automatically because storage is running low (' + info + '). What was recorded so far has been saved.',
      '端末の空き容量が少なくなったため、録画を自動で止めました（' + info + '）。ここまでの動画は保存済みです。'
    ), true);
  } else if (!state.captureId) {
    setStatus(L(
      'Recorded (' + info + '). Couldn\u2019t save it to this device, but you can still edit and export it.',
      '録画できました（' + info + '）。端末への保存には失敗しましたが、加工と書き出しはできます。'
    ), true);
  } else {
    setStatus(L(
      'Recorded (' + info + '). You can now add filters, aspect ratio, and text.',
      '録画できました（' + info + '）。フィルター・縦横比・文字を付けられます。'
    ));
  }
}

/* 動画作品を加工画面へ開く（録画直後も、ライブラリからも同じ入口）。開けたら true */
async function enterVideoWork(blob, record, { isNew = false } = {}) {
  burstPlayer.pause();
  pausePlayback();
  let info;
  try {
    info = await videoPlayer.load(blob, record.durationSec || 0);
  } catch (e) {
    setStatus(L('Couldn\u2019t open this video.', 'この動画を開けませんでした。'), true);
    return false;
  }

  player = videoPlayer;
  state.workKind = 'video';
  state.videoBlob = blob;
  compositor.setVideoSource(info);
  workVideo.muted = !state.soundOn;

  // 旧版（v0.6.0）で録った動画は、フィルターが映像に焼き込み済みで、保存された設定は「焼いた内容」を指す。
  // 二重にかけないよう、加工内容は初期状態から始める
  resetCompositorDefaults();
  if (record.editable && record.settings && Object.keys(record.settings).length) {
    compositor.applySettings(record.settings);
  }
  doodle.setSize(info.width, info.height);
  const s = record.settings || {};
  doodle.items = record.editable && Array.isArray(s.doodle) ? s.doodle.slice() : [];
  doodle.redraw();
  compositor.setStamp({ text: (record.editable && s.stamp && s.stamp.text) || defaultStampText(new Date(record.createdAt || Date.now())) });

  applyWorkKindUI('video');
  syncUIFromCompositor();
  resetExportResult();
  state.metrics = null;
  state.captureId = null;

  if (storageAvailable()) {
    try {
      if (isNew) {
        record.width = info.width;
        record.height = info.height;
        record.settings = currentSettings();
        await saveCapture(record, [blob]);
        state.captureId = record.id;
      } else {
        state.captureId = record.id;
        if (!record.editable) {
          await updateCapture(record.id, { editable: true, settings: currentSettings() });
        }
      }
    } catch (e) {
      state.captureId = null;
    }
  }

  updateToResultLabel();
  goView('result');
  gotoTab('play');
  updateVideoSeekUI(0, info.duration);
  updateLoopInfo();
  videoPlayer.refresh();
  await playVideoWork();
  refreshLibrary();
  if (state.captureId && isNew) saveVideoThumb(record.id);
  return true;
}

/* 加工画面に開いた直後の再生。音ありを試し、許されなければ音なしで始める */
async function playVideoWork() {
  workVideo.muted = !state.soundOn;
  videoPlayer.mutedByPolicy = false;
  const started = await videoPlayer.play();
  if (started && state.soundOn && workVideo.muted) {
    setStatus(L('Sound will play once you stop and tap \u201cPlay\u201d again.', '音は、いちど停止してから「再生」を押すと出ます。'));
  }
}

/* 一覧に出すサムネイル。動画の冒頭付近の絵を使う */
async function saveVideoThumb(id) {
  try {
    const { width, height } = compositor.sourceSize;
    if (!width) return;
    const c = document.createElement('canvas');
    const scale = 240 / width;
    c.width = 240;
    c.height = Math.max(2, Math.round(height * scale));
    c.getContext('2d', { alpha: false }).drawImage(workVideo, 0, 0, c.width, c.height);
    const thumb = await canvasToBlob(c, 'image/jpeg', 0.8);
    if (thumb) {
      await updateCapture(id, { thumb });
      refreshLibrary();
    }
  } catch (e) { /* サムネイルが作れなくても作品は使える */ }
}

/* 動画の再生位置つまみと表示 */
function fmtClock(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(t % 60).padStart(2, '0');
}

function updateVideoSeekUI(t, duration) {
  if (!duration) return;
  if (!state.seeking) $('videoSeekRange').value = String(Math.round((t / duration) * 1000));
  $('videoTimeOut').textContent = fmtClock(t) + ' / ' + fmtClock(duration);
}

/* 加工画面に開ける作品があるか */
function hasWork() {
  return state.workKind === 'video' ? !!state.videoBlob : store.count > 0;
}

/* 「結果」アイコンのラベル。今の作品があるかどうかで表示を変える */
function updateToResultLabel() {
  $('toResultText').textContent = hasWork() ? L('Result', '結果') : L('Works', '作品');
}

/* 作品の種類で、加工画面に出す部品を切り替える（data-only="burst" / "video"） */
function applyWorkKindUI(kind) {
  document.querySelectorAll('[data-only]').forEach((el) => {
    el.hidden = el.dataset.only !== kind;
  });
  buildFormatChips();
  updateFormatHint();
  updateLoopInfo();
}

/* 新しい作品を開く前の、加工内容の初期化 */
function resetCompositorDefaults() {
  compositor.setFilter('none');
  compositor.intensity = 100;
  compositor.paramsByFilter = {};
  compositor.cinemaVariant = 'technicolor';
  compositor.setCRT(false, 1);
  compositor.invalidate();
  compositor.setAspect('src');
  compositor.setOffsetY(0.5);
  doodle.clear();
  compositor.resetOSD();
}

/* バースト作品を開く前に、動画作品を片付ける */
function activateBurst() {
  if (state.workKind !== 'video') return;
  videoPlayer.unload();
  compositor.setVideoSource(null);
  player = burstPlayer;
  state.workKind = 'burst';
  state.videoBlob = null;
  applyWorkKindUI('burst');
}

function handleResult(result) {
  if (!result.frames.length) {
    setStatus(L('Couldn\u2019t capture any frames. Try a longer capture time.', 'フレームを1枚も取得できませんでした。撮影時間を長くして試してください。'), true);
    return;
  }
  activateBurst();
  state.captureId = null;
  store.setResult(result);
  state.metrics = analyze(result, camera.settings());

  resetCompositorDefaults();
  doodle.setSize(result.width, result.height);
  compositor.setStamp({ text: defaultStampText() });
  $('stampText').value = compositor.stamp.text;
  syncUIFromCompositor();
  resetExportResult();

  updateToResultLabel();
  setStatus(L(
    result.frames.length + ' frames / measured ' + Math.round(state.metrics.measuredFps) + 'fps.',
    result.frames.length + ' 枚 / 実測 ' + Math.round(state.metrics.measuredFps) + 'fps。'
  ));

  renderResult();
  goView('result');
  gotoTab('play');
  persistNewCapture(result);
}

/* ---------- 再生・構図 ---------- */

function setupPlayControls() {
  buildChips(
    $('frameModeChips'),
    FRAME_MODES.map((m) => ({ value: m.count, label: m.label })),
    DEFAULT_FRAME_MODE,
    (count) => { store.setFrameMode(count); syncSequenceUI(); scheduleSave(); }
  );

  $('fpsRange').addEventListener('input', (e) => {
    burstPlayer.fps = Number(e.target.value);
    $('fpsOut').textContent = e.target.value;
    updateLoopInfo();
    scheduleSave();
  });

  $('pingpongToggle').addEventListener('change', (e) => {
    store.setPingPong(e.target.checked);
    syncSequenceUI();
    scheduleSave();
  });

  $('scrubRange').addEventListener('input', (e) => {
    pausePlayback();
    burstPlayer.setPos(Number(e.target.value));
  });

  $('prevFrame').addEventListener('click', () => { burstPlayer.step(-1); markPaused(); });
  $('nextFrame').addEventListener('click', () => { burstPlayer.step(1); markPaused(); });
  $('playToggle').addEventListener('click', () => {
    if (state.workKind === 'video') {
      // ここはユーザー操作の中なので、音ありの再生が許される
      workVideo.muted = !state.soundOn;
      videoPlayer.toggle();
    } else {
      $('playToggle').textContent = player.toggle() ? L('Stop', '停止') : L('Play', '再生');
    }
  });

  /* 動画作品の再生位置・コマ送り・音 */
  $('videoSeekRange').addEventListener('input', (e) => {
    state.seeking = true;
    pausePlayback();
    videoPlayer.seek((Number(e.target.value) / 1000) * videoPlayer.duration);
  });
  $('videoSeekRange').addEventListener('change', () => { state.seeking = false; });
  $('videoPrevFrame').addEventListener('click', () => { videoPlayer.step(-1 / 30); markPaused(); });
  $('videoNextFrame').addEventListener('click', () => { videoPlayer.step(1 / 30); markPaused(); });
  $('videoSoundToggle').addEventListener('change', (e) => {
    state.soundOn = e.target.checked;
    workVideo.muted = !state.soundOn;
  });
  videoPlayer.onStateChange = (on) => {
    $('playToggle').textContent = on ? L('Stop', '停止') : L('Play', '再生');
  };
  videoPlayer.onTime = (t, duration) => updateVideoSeekUI(t, duration);
  videoPlayer.onProblem = (message) => {
    $('playToggle').textContent = L('Play', '再生');
    setStatus(message, true);
  };
  $('backToCamera').addEventListener('click', () => {
    pausePlayback();
    setDrawing(false);
    goView('camera');
  });

  buildChips(
    $('aspectChips'),
    ASPECTS.map((a) => ({ value: a.id, label: a.label })),
    'src',
    (id) => {
      compositor.setAspect(id);
      updateOffsetAvailability();
      player.refresh();
      resetExportResult();
      updateLoopInfo();
      scheduleSave();
    }
  );

  $('offsetRange').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    compositor.setOffsetY(v);
    $('offsetOut').textContent = v < 0.34 ? L('Top', '上より') : v > 0.66 ? L('Bottom', '下より') : L('Center', '中央');
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  burstPlayer.onDraw = updateTitleGuide;
  videoPlayer.onDraw = updateTitleGuide;
  burstPlayer.onPosChange = (pos, sourceIndex) => {
    $('scrubRange').value = String(pos);
    $('scrubOut').textContent = L(
      (pos + 1) + ' / ' + store.sequence.length + ' (frame ' + (sourceIndex + 1) + ')',
      (pos + 1) + ' / ' + store.sequence.length + '（元コマ ' + (sourceIndex + 1) + '）'
    );
    markStripUsage($('strip'), store, sourceIndex);
  };
}

function updateOffsetAvailability() {
  const { width, height } = compositor.sourceSize;
  const room = width ? hasVerticalRoom(width, height, ratioOf(compositor.aspectId)) : false;
  $('offsetRange').disabled = !room;
}

function pausePlayback() {
  player.pause();
  markPaused();
}

function markPaused() {
  $('playToggle').textContent = L('Play', '再生');
}

function syncSequenceUI() {
  $('stripCount').textContent = L(
    store.usedIndices.length + ' of ' + store.count + ' used',
    store.count + ' 枚中 ' + store.usedIndices.length + ' 枚を使用'
  );
  $('scrubRange').max = String(Math.max(0, store.sequence.length - 1));
  burstPlayer.setPos(0);
  markStripUsage($('strip'), store, store.sourceIndexAt(0));
  updateLoopInfo();
  resetExportResult();
}

function renderResult() {
  burstPlayer.fps = Number($('fpsRange').value) || DEFAULT_PLAY_FPS;
  renderStrip($('strip'), store, (i) => {
    const pos = store.sequence.indexOf(i);
    pausePlayback();
    player.setPos(pos >= 0 ? pos : 0);
  });
  if (state.metrics) {
    renderMetrics($('metrics'), state.metrics);
    $('verdict').textContent = verdict(state.metrics);
  }
  updateOffsetAvailability();
  syncSequenceUI();
  burstPlayer.play();
  $('playToggle').textContent = L('Stop', '停止');
}

/* ---------- 加工 ---------- */

function setupLookControls() {
  buildChips(
    $('filterChips'),
    FILTERS.map((f) => ({ value: f.id, label: f.label })),
    'none',
    (id) => {
      compositor.setFilter(id);
      syncFilterDependentUI();
      player.refresh();
      resetExportResult();
      scheduleSave();
    }
  );

  $('intensityRange').addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    $('intensityOut').textContent = e.target.value;
    compositor.setIntensity(pct);
    renderAdvancedGrid();
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  buildChips(
    $('cinemaVariantChips'),
    CINEMA_VARIANTS.map((v) => ({ value: v.id, label: v.label })),
    'technicolor',
    (id) => {
      compositor.setCinemaVariant(id);
      player.refresh();
      resetExportResult();
      scheduleSave();
    }
  );

  $('advancedToggle').addEventListener('click', () => {
    const open = $('advancedPanel').hidden;
    $('advancedPanel').hidden = !open;
    $('advancedToggle').setAttribute('aria-expanded', String(open));
    $('advancedToggle').textContent = open ? L('Back to simple mode', 'かんたん設定に戻す') : L('Fine-tune', 'くわしく調整する');
    if (open) renderAdvancedGrid();
    $('cinemaVariantField').hidden = !(open && compositor.filterId === 'cinema');
  });

  $('advancedReset').addEventListener('click', () => {
    compositor.resetAdvanced(compositor.filterId);
    renderAdvancedGrid();
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('crtToggle').addEventListener('change', (e) => {
    compositor.setCRT(e.target.checked);
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('crtRange').addEventListener('input', (e) => {
    $('crtOut').textContent = e.target.value;
    compositor.setCRT(compositor.crt, Number(e.target.value) / 100);
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  buildChips(
    $('stampColorChips'),
    STAMP_COLORS.map((c) => ({ value: c.value, label: c.label })),
    STAMP_COLORS[0].value,
    (value) => {
      compositor.setStamp({ color: value });
      player.refresh();
      resetExportResult();
      scheduleSave();
    }
  );

  $('stampToggle').addEventListener('change', (e) => {
    compositor.setStamp({ enabled: e.target.checked });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('stampText').addEventListener('input', (e) => {
    compositor.setStamp({ text: e.target.value });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });
  $('stampText').value = defaultStampText();
  compositor.setStamp({ text: $('stampText').value });

  /* VHS風の文字（タイトル・PLAY表示・テープカウンター） */
  buildChips(
    $('osdFontChips'),
    OSD_FONTS.map((f) => ({ value: f.id, label: f.label })),
    'gothic',
    (id) => {
      compositor.setOSD({ font: id });
      player.refresh();
      resetExportResult();
      scheduleSave();
    }
  );

  buildSwatches($('osdColorChips'), PEN_COLORS, PEN_COLORS[0], (color) => {
    compositor.setOSD({ color });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  buildSwatches($('osdOutlineColorChips'), PEN_COLORS, PEN_COLORS[6], (color) => {
    compositor.setOSD({ outlineColor: color });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdTitleToggle').addEventListener('change', (e) => {
    compositor.setOSD({ titleEnabled: e.target.checked });
    syncTextEditing();
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdTitleText').addEventListener('input', (e) => {
    compositor.setOSD({ titleText: e.target.value });
    syncTextEditing();
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdSizeRange').addEventListener('input', (e) => {
    $('osdSizeOut').textContent = e.target.value;
    compositor.setOSD({ sizePct: Number(e.target.value) });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdOutlineToggle').addEventListener('change', (e) => {
    compositor.setOSD({ outline: e.target.checked });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdOutlineWidthRange').addEventListener('input', (e) => {
    $('osdOutlineWidthOut').textContent = e.target.value;
    compositor.setOSD({ outlineWidthPct: Number(e.target.value) });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdTransportToggle').addEventListener('change', (e) => {
    compositor.setOSD({ transportEnabled: e.target.checked });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdCounterToggle').addEventListener('change', (e) => {
    compositor.setOSD({ counterEnabled: e.target.checked });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdTitleReset').addEventListener('click', () => {
    compositor.setOSD({ titleX: TITLE_DEFAULT_X, titleY: TITLE_DEFAULT_Y });
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  setupTitleDrag();

  syncFilterDependentUI();
}

/* ---------- タイトルの移動（テキストタブでプレビューをなぞる） ---------- */

/* テキストタブが開いていて、タイトルが表示中のときだけ、ドラッグの受け皿を出す */
function syncTextEditing() {
  const on = state.tab === 'text' && !!compositor.titleBoxNorm();
  $('titleLayer').hidden = !on;
  $('loopWrap').classList.toggle('is-titleEditing', on);
  updateTitleGuide();
}

/* タイトルの位置を示す点線。ブラウン管で曲がっているときは、曲がったあとの位置に出す */
function updateTitleGuide() {
  const g = $('titleGuide');
  const box = state.tab === 'text' ? compositor.titleBoxNorm() : null;
  if (!box) {
    g.hidden = true;
    return;
  }
  let cx = box.cx, cy = box.cy;
  if (compositor.crt) {
    const p = crtWarpPoint(cx, cy, compositor.crtStrength);
    cx = p.x;
    cy = p.y;
  }
  g.style.left = (cx * 100).toFixed(2) + '%';
  g.style.top = (cy * 100).toFixed(2) + '%';
  g.style.width = (box.w * 100).toFixed(2) + '%';
  g.style.height = (box.h * 100).toFixed(2) + '%';
  g.hidden = false;
}

function setupTitleDrag() {
  const layer = $('titleLayer');
  let dragging = false;
  let offset = { x: 0, y: 0 };

  /* 画面上の指の位置（0〜1）を、曲げる前の作品の座標へ戻す */
  const pointerToArtwork = (e) => {
    const rect = $('loopCanvas').getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    if (compositor.crt) {
      const p = crtUnwarpPoint(x, y, compositor.crtStrength);
      x = p.x;
      y = p.y;
    }
    return { x, y };
  };

  const moveTo = (p) => {
    const x = Math.min(1, Math.max(0, p.x + offset.x));
    const y = Math.min(1, Math.max(0, p.y + offset.y));
    compositor.setOSD({ titleX: x, titleY: y });
    player.refresh();
    resetExportResult();
    scheduleSave();
  };

  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pointerToArtwork(e);
    const box = compositor.titleBoxNorm();
    // 文字の上でつかんだときは、つかんだ位置のまま動かす。外をタップしたときは、そこへ飛ばす
    const grabbed = box &&
      Math.abs(p.x - box.cx) <= box.w / 2 + 0.04 &&
      Math.abs(p.y - box.cy) <= box.h / 2 + 0.04;
    offset = grabbed ? { x: box.cx - p.x, y: box.cy - p.y } : { x: 0, y: 0 };
    dragging = true;
    layer.setPointerCapture(e.pointerId);
    moveTo(p);
  });
  layer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    moveTo(pointerToArtwork(e));
  });
  const end = () => { dragging = false; };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
}

/* いま選んでいるフィルターに合わせて、映画の色方式とくわしい設定の表示を切り替える */
function syncFilterDependentUI() {
  const id = compositor.filterId;
  if (id === 'cinema') selectChip($('cinemaVariantChips'), compositor.cinemaVariant);

  const hasSchema = !!PARAM_SCHEMAS[id];
  $('advancedToggleWrap').hidden = !hasSchema;
  if (!hasSchema) {
    $('advancedPanel').hidden = true;
    $('advancedToggle').setAttribute('aria-expanded', 'false');
    $('advancedToggle').textContent = L('Fine-tune', 'くわしく調整する');
  } else if (!$('advancedPanel').hidden) {
    renderAdvancedGrid();
  }

  // 色の方式は「くわしい設定」を開いていて、かつ映画フィルターのときだけ表示する
  $('cinemaVariantField').hidden = !(id === 'cinema' && !$('advancedPanel').hidden);
}

/* くわしい設定のスライダーを、いまの値で描き直す */
function renderAdvancedGrid() {
  const id = compositor.filterId;
  const schema = PARAM_SCHEMAS[id];
  if (!schema) return;
  const values = compositor.resolvedParams(id);
  buildAdvancedGrid($('advancedGrid'), schema, values, (key, value) => {
    compositor.setAdvancedParam(id, key, value);
    player.refresh();
    resetExportResult();
    scheduleSave();
  });
}

/* 保存した編集内容を画面へ戻す */
function syncUIFromCompositor() {
  selectChip($('filterChips'), compositor.filterId);
  selectChip($('aspectChips'), compositor.aspectId);
  selectChip($('stampColorChips'), compositor.stamp.color);
  $('intensityRange').value = String(compositor.intensity);
  $('intensityOut').textContent = $('intensityRange').value;
  $('crtToggle').checked = compositor.crt;
  $('crtRange').value = String(Math.round(compositor.crtStrength * 100));
  $('crtOut').textContent = $('crtRange').value;
  $('offsetRange').value = String(Math.round(compositor.offsetY * 100));
  $('offsetOut').textContent = compositor.offsetY < 0.34 ? L('Top', '上より') : compositor.offsetY > 0.66 ? L('Bottom', '下より') : L('Center', '中央');
  $('stampToggle').checked = compositor.stamp.enabled;
  $('stampText').value = compositor.stamp.text || '';

  const osd = compositor.osd;
  selectChip($('osdFontChips'), osd.font);
  selectChip($('osdColorChips'), osd.color);
  selectChip($('osdOutlineColorChips'), osd.outlineColor);
  $('osdTitleToggle').checked = osd.titleEnabled;
  $('osdTitleText').value = osd.titleText || '';
  $('osdSizeRange').value = String(osd.sizePct);
  $('osdSizeOut').textContent = String(osd.sizePct);
  $('osdOutlineToggle').checked = osd.outline;
  $('osdOutlineWidthRange').value = String(osd.outlineWidthPct);
  $('osdOutlineWidthOut').textContent = String(osd.outlineWidthPct);
  $('osdTransportToggle').checked = osd.transportEnabled;
  $('osdCounterToggle').checked = osd.counterEnabled;

  updateOffsetAvailability();
  syncFilterDependentUI();
}

/* ---------- 落書き ---------- */

function setupDrawControls() {
  buildSwatches($('penColors'), PEN_COLORS, state.penColor, (color) => {
    state.penColor = color;
    state.drawMode = 'pen';
    state.emoji = null;
    clearEmojiSelection($('emojiGrid'));
  });

  $('penSize').addEventListener('input', (e) => {
    state.penSize = Number(e.target.value);
    $('penSizeOut').textContent = e.target.value;
  });

  buildEmojiGrid($('emojiGrid'), EMOJI_SET, (emoji) => {
    state.emoji = emoji;
    state.drawMode = emoji ? 'emoji' : 'pen';
  });

  $('undoDraw').addEventListener('click', () => { doodle.undo(); });
  $('clearDraw').addEventListener('click', () => { doodle.clear(); });

  doodle.onChange = () => {
    player.refresh();
    resetExportResult();
    scheduleSave();
  };

  setupDrawSurface();
}

function setDrawing(on) {
  $('drawLayer').hidden = !on;
  $('loopWrap').classList.toggle('is-drawing', on);
  if (on) pausePlayback();
}

/* 表示中の作品の座標から、元フレームの座標へ戻す */
function surfacePoint(e) {
  const canvas = $('loopCanvas');
  const rect = canvas.getBoundingClientRect();
  const crop = compositor.rect;
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  return {
    x: crop.x + nx * crop.width,
    y: crop.y + ny * crop.height
  };
}

function setupDrawSurface() {
  const layer = $('drawLayer');
  let drawing = false;

  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = surfacePoint(e);
    if (state.drawMode === 'emoji' && state.emoji) {
      const size = compositor.rect.width * (0.08 + state.penSize / 120);
      doodle.stamp(state.emoji, p.x, p.y, size);
      return;
    }
    drawing = true;
    layer.setPointerCapture(e.pointerId);
    const size = (compositor.rect.width / 360) * state.penSize;
    doodle.beginStroke(state.penColor, size);
    doodle.addPoint(p.x, p.y);
  });

  layer.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = surfacePoint(e);
    doodle.addPoint(p.x, p.y);
  });

  const end = () => {
    if (!drawing) return;
    drawing = false;
    doodle.endStroke();
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
  layer.addEventListener('pointerleave', end);
}

/* ---------- 保存（書き出し） ---------- */

/* 保存形式のチップ。動画作品はGIFにしない（何分もある動画をGIFにする意味がない） */
function buildFormatChips() {
  const list = state.workKind === 'video' ? EXPORT_FORMATS.filter((f) => f.id !== 'gif') : EXPORT_FORMATS;
  if (!list.some((f) => f.id === state.format)) state.format = list[0].id;
  buildChips(
    $('formatChips'),
    list.map((f) => ({ value: f.id, label: f.label })),
    state.format,
    (id) => { state.format = id; updateFormatHint(); updateLoopInfo(); resetExportResult(); }
  );
}

function setupExportControls() {
  buildFormatChips();

  buildChips(
    $('durationExportChips'),
    EXPORT_DURATIONS.map((d) => ({ value: d.value, label: d.label })),
    DEFAULT_EXPORT_SECONDS,
    (sec) => { state.exportSeconds = sec; updateLoopInfo(); resetExportResult(); }
  );

  buildChips(
    $('socialChips'),
    SOCIAL_FRAMES.map((f) => ({ value: f.id, label: f.label })),
    'artwork',
    (id) => { state.socialFrame = id; resetExportResult(); }
  );

  buildChips(
    $('backgroundChips'),
    BACKGROUNDS.map((b) => ({ value: b.id, label: b.label })),
    'blur',
    (id) => { state.background = id; resetExportResult(); }
  );

  updateFormatHint();
  $('exportSize').addEventListener('change', resetExportResult);
  $('exportBtn').addEventListener('click', runExport);
  $('exportCancel').addEventListener('click', () => {
    if (state.exportAbort) state.exportAbort.aborted = true;
  });
  $('shareBtn').addEventListener('click', doShare);
  $('quickSave').addEventListener('click', () => {
    gotoTab('save');
    $('exportBtn').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('copyMetrics').addEventListener('click', async () => {
    if (!state.metrics) return;
    const text = toText(state.metrics);
    try {
      await navigator.clipboard.writeText(text);
      $('copyMetrics').textContent = L('Copied', 'コピーしました');
      setTimeout(() => { $('copyMetrics').textContent = t('data.copy'); }, 1600);
    } catch (e) {
      window.prompt(L('Please copy this text', 'この内容をコピーしてください'), text);
    }
  });
}

function updateFormatHint() {
  const f = EXPORT_FORMATS.find((x) => x.id === state.format);
  let hint = f ? tf(f.hint) : '';
  if (state.format === 'mp4' && !pickMimeType()) {
    hint = L('This browser can\u2019t export video. Please choose GIF instead.', 'このブラウザでは動画を書き出せません。GIFを選んでください。');
  }
  if (state.workKind === 'video' && state.format === 'mp4') {
    hint += L(' (re-recorded to take the same time as the original video)', '（元の動画と同じ時間をかけて撮り直すように書き出します）');
  }
  $('formatHint').textContent = hint;
  $('durationExportChips').classList.toggle('is-disabled', state.format === 'gif' || state.format === 'photo');
}

/* 作品は短いまま、書き出しでくり返す */
function loopCount() {
  const loopMs = (store.sequence.length / (burstPlayer.fps || 10)) * 1000;
  if (!loopMs) return 1;
  return Math.max(1, Math.round((state.exportSeconds * 1000) / loopMs));
}

function updateLoopInfo() {
  const isVideo = state.workKind === 'video';
  if (isVideo ? !state.videoBlob : !store.sequence.length) {
    $('loopInfo').textContent = '';
    return;
  }
  if (state.format === 'photo') {
    $('loopInfo').textContent = isVideo
      ? L('Saves the frame currently on screen as a photo (the video itself is unchanged).', 'いま画面に出ているコマ1枚を、写真として保存します（動画はそのまま残ります）。')
      : L('Saves the frame currently on screen (the moving work itself is unchanged).', 'いま画面に出ているコマ1枚を保存します（動く作品はそのまま残ります）。');
    return;
  }
  if (isVideo) {
    $('loopInfo').textContent = L(
      'The video has no set length \u2014 it exports start to finish (' + fmtClock(videoPlayer.duration) + '). Export runs in real time, so it takes just as long. Please keep this screen open until it finishes.',
      '動画は長さの指定なしで、最初から最後まで書き出します（' + fmtClock(videoPlayer.duration) +
      '）。書き出しは実時間で進むので、同じだけ時間がかかります。終わるまで、この画面を開いたままにしてください。'
    );
    return;
  }
  const loopMs = (store.sequence.length / (burstPlayer.fps || 10)) * 1000;
  if (state.format === 'gif') {
    $('loopInfo').textContent = L(
      'A GIF has no set length \u2014 it loops forever (one loop is ' + Math.round(loopMs) + ' ms).',
      'GIFは長さの指定なしで、無限にループします（1周 ' + Math.round(loopMs) + ' ms）。'
    );
    return;
  }
  const n = loopCount();
  $('loopInfo').textContent = L(
    'Repeats a ' + Math.round(loopMs) + ' ms loop ' + n + ' times, about ' + (Math.round(loopMs * n) / 1000).toFixed(1) + 's total.',
    '1周 ' + Math.round(loopMs) + ' ms を ' + n + '回くり返して、約 ' +
    (Math.round(loopMs * n) / 1000).toFixed(1) + ' 秒にします。'
  );
}

function resetExportResult() {
  state.lastBlob = null;
  state.lastName = '';
  $('exportResult').hidden = true;
  setExportStatus('');
}

/* 書き出しの画面サイズ。作品の比率、または書き出し枠から決める */
function exportBox() {
  const art = compositor.rect;   // 切り出しの大きさ（元フレームの解像度）。バーストも動画も同じ
  const target = Number($('exportSize').value);
  const frame = SOCIAL_FRAMES.find((f) => f.id === state.socialFrame);
  const ratio = frame ? frame.ratio : null;
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);

  if (ratio) {
    const long = target >= 1080 ? Math.max(art.width, art.height) : target;
    return ratio >= 1
      ? { width: even(long), height: even(long / ratio), framed: true }
      : { width: even(long * ratio), height: even(long), framed: true };
  }
  const longSide = Math.max(art.width, art.height);
  const scale = target >= 1080 ? 1 : Math.min(1, target / longSide);
  return { width: even(art.width * scale), height: even(art.height * scale), framed: false };
}

function makeRenderer(framed) {
  if (!framed) return (ctx, index, timeSec, w, h) => compositor.renderTo(ctx, index, timeSec, w, h);
  return (ctx, index, timeSec, w, h) => compositor.renderFramed(ctx, index, timeSec, w, h, state.background);
}

/* 動画作品用。<video> のいまの1コマを、指定の時刻・サイズで描く */
function makeVideoRenderer(framed, videoEl = workVideo) {
  if (!framed) return (ctx, t, w, h) => compositor.renderVideoFrame(ctx, videoEl, t, w, h);
  return (ctx, t, w, h) => compositor.renderVideoFramed(ctx, videoEl, t, w, h, state.background);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* 動画作品の書き出し。書き出し専用の <video> を毎回作り、音声つきで撮り直す。
   再生が始まらない・止まる場合は、音声の経路を使わない音なしの書き出しで、一度だけやり直す。
   （音声つきの書き出しは iOS の挙動に左右されやすく、実機で確かめられていないための保険） */
async function exportVideoWork(box, onProgress) {
  const attempt = async (withAudio) => {
    const src = document.createElement('video');
    src.className = 'offscreenVideo';
    src.muted = !withAudio;
    document.body.append(src);
    let tap = null;
    let url = null;
    try {
      // ↓ここから最初の await までは、ボタンを押した操作の中。iOSが音声の再生を許すのはこの間だけ
      if (withAudio) {
        tap = new AudioTap(src);
        tap.setup();
      }
      url = attachBlob(src, state.videoBlob);
      if (withAudio) {
        const unlocked = src.play().then(() => src.pause(), () => false);
        await Promise.race([unlocked, sleep(3000)]);
      }
      const info = await settleVideoElement(src, videoPlayer.duration);
      const audioTrack = tap ? await tap.prepare() : null;
      const out = await encodeVideoWork({
        video: src,
        render: makeVideoRenderer(box.framed, src),
        width: box.width, height: box.height,
        audioTrack, duration: info.duration,
        signal: state.exportAbort, onProgress
      });
      return { blob: out.blob, silent: out.silent, hadAudioTrack: !!audioTrack };
    } finally {
      // 書き出し用の <video> と音声コンテキストは、毎回きれいに手放す
      if (tap) tap.close();
      src.pause();
      src.removeAttribute('src');
      src.load();
      src.remove();
      if (url) URL.revokeObjectURL(url);
    }
  };

  setExportStatus(L('Preparing the video\u2026', '動画を準備しています…'), 0.02);
  try {
    const out = await attempt(true);
    let note = '';
    if (out.silent) note = L(' (couldn\u2019t carry over audio \u2014 exported without sound)', '（音声は写せず、無音で書き出しました）');
    else if (!out.hadAudioTrack) note = L(' (the original video had no audio, or it couldn\u2019t be read)', '（元の動画に音声が無かったか、取り出せませんでした）');
    return { blob: out.blob, note };
  } catch (err) {
    if (!err || !err.stall || (state.exportAbort && state.exportAbort.aborted)) throw err;
    setExportStatus(L('Export with sound stalled \u2014 retrying without sound\u2026', '音声つきの書き出しが進まなかったため、音なしでやり直します…'), 0.02);
    const out = await attempt(false);
    return { blob: out.blob, note: L(' (couldn\u2019t carry over audio \u2014 exported without sound)', '（音声を写せなかったため、無音で書き出しました）') };
  }
}

async function runExport() {
  const isVideo = state.workKind === 'video';
  if (state.exporting || (isVideo ? !state.videoBlob : !store.sequence.length)) return;
  state.exporting = true;
  $('exportBtn').disabled = true;
  const wasPlaying = isVideo && videoPlayer.playing;
  pausePlayback();
  resetExportResult();

  const box = exportBox();
  const onProgress = (p, label) => setExportStatus(label + ' ' + Math.round(p * 100) + '%', p);
  let silentNote = '';

  try {
    let blob, name;
    if (state.format === 'photo') {
      setExportStatus(L('Creating the photo\u2026', '静止画を作っています…'), 0.3);
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (isVideo) {
        makeVideoRenderer(box.framed)(ctx, workVideo.currentTime, box.width, box.height);
      } else {
        const index = store.sourceIndexAt(burstPlayer.pos);
        makeRenderer(box.framed)(ctx, index, burstPlayer.timeSec, box.width, box.height);
      }
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      if (!blob) throw new Error(L('Couldn\u2019t create the photo.', '静止画の書き出しに失敗しました。'));
      name = timestampName('jpg');
    } else if (isVideo) {
      // 動画作品。元動画を実時間で再生しながら、加工した絵と音を撮り直す
      state.exportAbort = { aborted: false };
      $('exportCancel').hidden = false;
      keepAwake();
      const out = await exportVideoWork(box, onProgress);
      blob = out.blob;
      silentNote = out.note;
      name = timestampName(extensionFor(pickMimeType()));
    } else if (state.format === 'gif') {
      setExportStatus(L('Creating the GIF\u2026', 'GIFを作っています…'), 0.05);
      blob = await encodeGIF({
        render: makeRenderer(box.framed), sequence: store.sequence, fps: burstPlayer.fps,
        width: box.width, height: box.height, onProgress
      });
      name = timestampName('gif');
    } else {
      setExportStatus(L('Recording the video\u2026', '動画を録っています…'), 0.05);
      blob = await encodeVideo({
        render: makeRenderer(box.framed), sequence: store.sequence, fps: burstPlayer.fps,
        width: box.width, height: box.height, loops: loopCount(), onProgress
      });
      name = timestampName(extensionFor(pickMimeType()));
    }

    state.lastBlob = blob;
    state.lastName = name;
    attachDownload($('downloadLink'), blob, name);
    $('exportResult').hidden = false;
    const kb = Math.round(blob.size / 1024);
    setExportStatus(L(
      'Done (' + box.width + '\u00d7' + box.height + ' / ' +
      (kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB') + ')' + silentNote + '. You can share it to save to Photos.',
      'できました（' + box.width + '×' + box.height + ' / ' +
      (kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB') + '）' + silentNote + '。共有から写真に保存できます。'
    ));
  } catch (err) {
    setExportStatus(err && err.message ? err.message : L('Export failed. Try a smaller size.', '書き出しに失敗しました。サイズを小さくして試してください。'));
  } finally {
    state.exporting = false;
    state.exportAbort = null;
    $('exportBtn').disabled = false;
    $('exportCancel').hidden = true;
    if (isVideo) {
      releaseAwake();
      // 書き出す前に再生していたなら、再生に戻す（止まったままに見えないように）
      if (wasPlaying) playVideoWork();
    }
    player.refresh();
  }
}

async function doShare() {
  if (!state.lastBlob) return;
  const result = await shareFile(state.lastBlob, state.lastName);
  if (result === 'unsupported') {
    setExportStatus(L('This browser can\u2019t open the share sheet. Please save using Download below.', 'このブラウザでは共有シートを開けません。下のダウンロードから保存してください。'));
  } else if (result === 'shared') {
    setExportStatus(L('Handed off to the share sheet.', '共有シートに渡しました。'));
  }
}

/* ---------- 作品ライブラリ ---------- */

function currentSettings() {
  const base = Object.assign(compositor.exportSettings(), { doodle: doodle.items });
  if (state.workKind === 'video') return base;
  return Object.assign(base, {
    fps: burstPlayer.fps,
    frameMode: store.frameMode,
    pingpong: store.pingpong
  });
}

/* 編集はまとめて保存する。スライダー操作のたびに書き込まない */
function scheduleSave() {
  if (!state.captureId || !storageAvailable()) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await updateCapture(state.captureId, { settings: currentSettings() });
    } catch (e) { /* 保存できなくても撮影は続けられる */ }
  }, 700);
}

async function persistNewCapture(result) {
  if (!storageAvailable()) return;
  const id = newCaptureId();
  state.captureId = id;
  try {
    const blobs = [];
    for (const frame of result.frames) {
      blobs.push(await canvasToBlob(frame.canvas, 'image/jpeg', 0.92));
    }
    const thumb = await canvasToBlob(makeThumbnail(result.frames[0].canvas, 240), 'image/jpeg', 0.8);
    await saveCapture({
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      kind: 'burst',
      width: result.width,
      height: result.height,
      frameCount: result.frames.length,
      frameTimes: result.frames.map((f) => Math.round(f.elapsed)),
      metrics: state.metrics,
      settings: currentSettings(),
      sizeBytes: blobs.reduce((n, b) => n + (b ? b.size : 0), 0),
      thumb
    }, blobs);
    refreshLibrary();
  } catch (e) {
    state.captureId = null;
  }
}

/* 大きさを記録していない古い作品は、中身のBlobの大きさを合計して補う（一度だけ。補ったら一覧を描き直す） */
let backfilling = false;
async function backfillSizes(items) {
  const missing = items.filter((it) => typeof it.sizeBytes !== 'number');
  if (!missing.length || backfilling) return;
  backfilling = true;
  try {
    for (const it of missing) {
      const bytes = await frameBytes(it.id);
      await updateCapture(it.id, { sizeBytes: bytes }, { touch: false });   // 0 でも記録する（何度も数え直さない）
    }
  } catch (e) { /* 補えなくても、一覧は使える */ }
  backfilling = false;
  refreshLibrary();
}

async function refreshLibrary() {
  if (!storageAvailable()) {
    $('libNote').textContent = L('This browser can\u2019t save works.', 'このブラウザでは作品を保存できません。');
    return;
  }
  let items = [];
  try {
    items = await listCaptures();
  } catch (e) {
    $('libNote').textContent = L('Couldn\u2019t open storage.', '保存領域を開けませんでした。');
    return;
  }
  renderLibrary($('library'), items, {
    currentId: state.captureId,
    onOpen: openCapture,
    onDelete: removeCapture
  });
  backfillSizes(items);
  const usage = await estimateUsage();
  const base = L(
    items.length + ' item(s). Saved on this device only \u2014 nothing is sent anywhere.',
    items.length + ' 件。この端末の中だけに保存され、どこにも送信されません。'
  );
  $('libNote').textContent = usage && usage.usage
    ? base + L(' (using ' + (usage.usage / 1048576).toFixed(1) + 'MB)', '（使用中 ' + (usage.usage / 1048576).toFixed(1) + 'MB）')
    : base;
}

async function openCapture(id) {
  try {
    const record = await getCapture(id);
    if (!record) return;
    if (record.kind === 'video') {
      // 動画作品も、バーストと同じ加工画面へ開く
      const videoBlobs = await loadFrameBlobs(id);
      if (!videoBlobs.length) return;
      const opened = await enterVideoWork(videoBlobs[0], record);
      if (opened && !record.editable) {
        setStatus(L(
          'This video was recorded with an older version. Its filter was baked in at recording time, so anything you add now will stack on top.',
          '旧バージョンで録った動画です。フィルターは録画時に焼き込み済みなので、加工は重ねがけになります。'
        ));
      }
      return;
    }
    const blobs = await loadFrameBlobs(id);
    if (!blobs.length) return;
    activateBurst();

    const canvases = [];
    for (const b of blobs) canvases.push(await blobToCanvas(b));

    const frames = canvases.map((canvas, i) => ({
      canvas,
      t: 0,
      elapsed: (record.frameTimes && record.frameTimes[i]) || 0,
      mediaTime: null,
      presentedFrames: null
    }));

    store.setResult({
      frames,
      width: record.width,
      height: record.height,
      sourceWidth: record.metrics ? record.metrics.sourceWidth : record.width,
      sourceHeight: record.metrics ? record.metrics.sourceHeight : record.height,
      requestedMs: record.metrics ? record.metrics.requestedMs : 0,
      capacity: frames.length,
      method: record.metrics ? record.metrics.method : 'stored',
      latencyMs: 0
    });

    state.captureId = id;
    state.metrics = record.metrics || null;

    const s = record.settings || {};
    compositor.invalidate();
    compositor.applySettings(s);
    doodle.setSize(record.width, record.height);
    doodle.items = Array.isArray(s.doodle) ? s.doodle.slice() : [];
    doodle.redraw();

    if (typeof s.fps === 'number') {
      burstPlayer.fps = s.fps;
      $('fpsRange').value = String(s.fps);
      $('fpsOut').textContent = String(s.fps);
    }
    if (typeof s.frameMode === 'number') {
      store.setFrameMode(s.frameMode);
      selectChip($('frameModeChips'), s.frameMode);
    }
    if (typeof s.pingpong === 'boolean') {
      store.setPingPong(s.pingpong);
      $('pingpongToggle').checked = s.pingpong;
    }

    syncUIFromCompositor();
    renderResult();
    goView('result');
    gotoTab('play');
    updateToResultLabel();
    refreshLibrary();
  } catch (e) {
    $('libNote').textContent = L('Couldn\u2019t open this work.', 'この作品を開けませんでした。');
  }
}

async function removeCapture(id) {
  if (!window.confirm(L('This will delete the work. This can\u2019t be undone.', 'この作品を削除します。元に戻せません。'))) return;
  try {
    await deleteCapture(id);
    if (state.captureId === id) state.captureId = null;
    refreshLibrary();
  } catch (e) { /* 失敗しても一覧はそのまま */ }
}

/* ---------- 言語切り替え ---------- */

function setupLanguageSwitch() {
  const wrap = $('langSwitch');
  wrap.querySelectorAll('.langSwitch__btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.lang === getLang() ? 'true' : 'false');
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  onLangChange((lang) => {
    wrap.querySelectorAll('.langSwitch__btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.lang === lang ? 'true' : 'false');
    });
    // 静的なUIテキストは applyI18n（setLang内で呼ばれる）が処理する。
    // ここでは、チップのラベルや、現在の状態から組み立てている動的な文字だけを訳し直す。
    retranslateDynamicUI();
    showEnvironment();
    updateToResultLabel();
    updateFacingLabel();
    setGuide(state.guideId);
    if (compositor.filterId) syncFilterDependentUI();
    $('offsetOut').textContent = compositor.offsetY < 0.34 ? L('Top', '上より') : compositor.offsetY > 0.66 ? L('Bottom', '下より') : L('Center', '中央');
    $('advancedToggle').textContent = $('advancedPanel').hidden ? L('Fine-tune', 'くわしく調整する') : L('Back to simple mode', 'かんたん設定に戻す');
    if (state.workKind === 'video') {
      $('playToggle').textContent = videoPlayer.playing ? L('Stop', '停止') : L('Play', '再生');
    } else {
      $('playToggle').textContent = burstPlayer.playing ? L('Stop', '停止') : L('Play', '再生');
    }
    updateFormatHint();
    updateLoopInfo();
    if (state.tab === 'lib') refreshLibrary();
  });
}

/* ---------- 起動 ---------- */

setupLanguageSwitch();
applyI18n();
showEnvironment();
setupCameraControls();
setupPlayControls();
setupLookControls();
setupDrawControls();
setupExportControls();

setupTabs($('tabs'), (name) => {
  state.tab = name;
  setDrawing(name === 'draw');
  syncTextEditing();
  if (name === 'lib') refreshLibrary();
  if (name === 'save') updateLoopInfo();
  if (floatingPreview) floatingPreview.refresh();
});

floatingPreview = new FloatingPreview({
  wrap: $('pip'),
  canvas: $('pipCanvas'),
  watchTarget: $('loopWrap'),
  source: $('loopCanvas'),
  isRelevant: () => !$('viewResult').hidden,
  resizeHandle: $('pipResize')
});

selectChip($('frameModeChips'), DEFAULT_FRAME_MODE);
applyWorkKindUI('burst');
updateToResultLabel();
goView('camera');
refreshLibrary();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pausePlayback();
});
