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
import { ASPECTS, ratioOf, hasVerticalRoom } from './crop.js';
import { Doodle } from './doodle.js';
import { FILTERS, PARAM_SCHEMAS, CINEMA_VARIANTS, getDefaultParams } from './filters.js';
import { OSD_FONTS } from './osd.js';
import { VideoRecorder, videoRecordSupported } from './video-record.js';
import { defaultStampText } from './datestamp.js';
import { LoopPlayer } from './playback.js';
import { analyze, renderMetrics, verdict, toText } from './metrics.js';
import { encodeGIF } from './export-gif.js';
import { encodeVideo, videoSupported, pickMimeType, extensionFor } from './export-video.js';
import { timestampName, shareFile, attachDownload } from './share.js';
import {
  storageAvailable, newCaptureId, canvasToBlob, saveCapture, updateCapture,
  listCaptures, getCapture, loadFrameBlobs, deleteCapture, blobToCanvas, estimateUsage
} from './storage.js';
import { renderLibrary } from './library.js';
import { FloatingPreview } from './pip.js';
import {
  buildChips, selectChip, buildSwatches, buildEmojiGrid, clearEmojiSelection,
  setupTabs, showTab, setStatus, showView, fireFlash, renderStrip, markStripUsage,
  setExportStatus, buildAdvancedGrid
} from './ui.js';

/* showView に加えて、PiP プレビューへも今の画面状態を伝える */
function goView(name) {
  showView(name);
  if (floatingPreview) floatingPreview.refresh();
}

const video = $('preview');
const camera = new Camera(video);
const pool = new FramePool();
const store = new FrameStore();
const doodle = new Doodle();
const compositor = new Compositor(store, doodle);
const player = new LoopPlayer($('loopCanvas'), store, compositor);
const videoRecorder = new VideoRecorder();
let floatingPreview = null;

const CAPTURE_MODES = [
  { id: 'burst', label: 'バースト立体撮影' },
  { id: 'video', label: 'ふつうの動画' }
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
  lastBlob: null,
  lastName: '',
  captureId: null,
  saveTimer: null,
  timerMs: 0,
  countdownCancelled: false,
  captureMode: 'burst',
  videoFilterId: 'none',
  videoIntensity: 100,
  videoCinemaVariant: 'technicolor',
  lastVideoBlob: null,
  lastVideoName: ''
};

/* ---------- 環境表示 ---------- */

function showEnvironment() {
  const bits = [browserLabel()];
  bits.push(supportsRVFC() ? 'rVFC 対応' : 'rVFC 非対応');
  if (!videoSupported() || !pickMimeType()) bits.push('動画書き出し不可');
  if (!storageAvailable()) bits.push('保存不可');
  if (!isSecure()) bits.push('HTTPSでないためカメラを使えません');
  $('envNote').textContent = bits.join(' · ');
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
      setStatus('撮影時間 ' + (ms / 1000).toFixed(2) + ' 秒。シャッターと同時に、カメラを水平に横へ滑らせてください。');
    }
  );
  $('shutterText').textContent = (DEFAULT_DURATION_MS / 1000).toFixed(2) + 's';

  buildChips(
    $('videoFilterChips'),
    FILTERS.map((f) => ({ value: f.id, label: f.label })),
    'none',
    (id) => {
      state.videoFilterId = id;
      $('videoCinemaVariantField').hidden = id !== 'cinema';
    }
  );
  buildChips(
    $('videoCinemaVariantChips'),
    CINEMA_VARIANTS.map((v) => ({ value: v.id, label: v.label })),
    'technicolor',
    (id) => { state.videoCinemaVariant = id; }
  );
  $('videoIntensityRange').addEventListener('input', (e) => {
    state.videoIntensity = Number(e.target.value);
    $('videoIntensityOut').textContent = e.target.value;
  });

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
      const s = await camera.start({ mode: state.streamMode, audio: state.captureMode === 'video' });
      pool.items = [];
      setStatus('ストリームを ' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps に切り替えました。');
    } catch (err) {
      setStatus(describeCameraError(err, state.captureMode === 'video'), true);
    }
  });

  $('startCamera').addEventListener('click', startCamera);
  $('flipCamera').addEventListener('click', flipCamera);
  $('shutter').addEventListener('click', onShutter);
  $('toResult').addEventListener('click', () => {
    if (store.count) {
      goView('result');
    } else {
      // 撮影前・作品を開く前でも、作品一覧だけは常に見られるようにする
      goView('result');
      showTab($('tabs'), 'lib');
      setDrawing(false);
      refreshLibrary();
    }
  });

  $('videoShareBtn').addEventListener('click', async () => {
    if (!state.lastVideoBlob) return;
    const result = await shareFile(state.lastVideoBlob, state.lastVideoName);
    if (result === 'unsupported') {
      setStatus('このブラウザでは共有シートを開けません。下のダウンロードから保存してください。');
    } else if (result === 'shared') {
      setStatus('共有シートに渡しました。');
    }
  });
  $('videoToLibraryBtn').addEventListener('click', () => {
    goView('result');
    showTab($('tabs'), 'lib');
    setDrawing(false);
    refreshLibrary();
  });
}

/* 撮影モードの切り替え。バースト立体撮影とふつうの動画は、必要な画面部品が異なる */
function setCaptureMode(mode) {
  if (state.busy || videoRecorder.recording) return;
  state.captureMode = mode;
  $('durationField').hidden = mode === 'video';
  $('videoFilterField').hidden = mode !== 'video';
  $('videoResult').hidden = true;

  if (mode === 'video' && !videoRecordSupported()) {
    setStatus('このブラウザは音声付き動画の録画に対応していません。', true);
  }

  if (camera.stream) {
    camera.start({ mode: state.streamMode, audio: mode === 'video' }).catch((err) => {
      setStatus(describeCameraError(err, mode === 'video'), true);
    });
  }

  setStatus(mode === 'video'
    ? 'ふつうの動画モードです。フィルターを選んでからシャッターで録画を開始・停止します。'
    : '撮影時間を選んで、シャッターと同時にカメラを横へ滑らせてください。');
}

function onShutter() {
  if (state.captureMode === 'video') toggleVideoRecording();
  else shoot();
}

/* プレビューに重ねる構図ガイド。撮影する範囲そのものは変わらない。
   box-shadow の巨大な塗りつぶしではなく、4枚の帯で外側を暗くする
   （こちらのほうが、一部ブラウザでの意図しないスクロール発生を避けられる）。 */
function setGuide(id) {
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

  $('frameGuideLabel').textContent = guide.label;
  el.hidden = false;
}

async function startCamera() {
  if (!isSecure()) {
    setStatus('このページは HTTPS で開く必要があります。', true);
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('このブラウザはカメラ入力に対応していません。', true);
    return;
  }
  $('blockerText').textContent = 'カメラの使用を許可してください…';
  try {
    const s = await camera.start({ mode: state.streamMode, audio: state.captureMode === 'video' });
    $('blocker').hidden = true;
    $('shutter').disabled = false;
    updateFacingLabel();
    setStatus('準備できました（' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps）。');
  } catch (err) {
    const msg = describeCameraError(err, state.captureMode === 'video');
    $('blockerText').textContent = msg;
    setStatus(msg, true);
  }
}

function updateFacingLabel() {
  $('facingLabel').textContent = camera.facing === 'user' ? 'イン' : 'アウト';
}

async function flipCamera() {
  if (!camera.stream || state.busy) return;
  try {
    await camera.flip();
    pool.items = [];
    updateFacingLabel();
    setStatus((camera.facing === 'user' ? 'インカメラ' : 'アウトカメラ') + 'に切り替えました。');
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
    setStatus('セルフタイマー作動中…');
    const done = await runCountdown(state.timerMs);
    state.busy = false;
    if (!done) {
      setStatus('セルフタイマーをキャンセルしました。');
      return;
    }
  }

  if (state.busy || !camera.stream) return;
  state.busy = true;
  $('shutter').classList.add('is-busy');
  $('stage').classList.add('is-recording');
  setStatus('撮影中…');

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
    setStatus('撮影に失敗しました（' + (err && err.message ? err.message : '不明') + '）。', true);
  } finally {
    state.busy = false;
    $('shutter').classList.remove('is-busy');
    $('stage').classList.remove('is-recording');
  }
}

/* ---------- ふつうの動画（音声付き・ループではない通常撮影） ---------- */

function formatRecTime(ms) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

let activeRecordingMeta = null;

async function toggleVideoRecording() {
  if (videoRecorder.recording) {
    await stopVideoRecording();
    return;
  }
  if (state.busy || !camera.stream) return;
  if (!videoRecordSupported()) {
    setStatus('このブラウザは音声付き動画の録画に対応していません。', true);
    return;
  }

  if (state.timerMs > 0) {
    state.busy = true;
    setStatus('セルフタイマー作動中…');
    const done = await runCountdown(state.timerMs);
    state.busy = false;
    if (!done) {
      setStatus('セルフタイマーをキャンセルしました。');
      return;
    }
  }

  if (state.busy || !camera.stream) return;

  const settings = camera.settings();
  const width = Math.round(settings.width || video.videoWidth || 720);
  const height = Math.round(settings.height || video.videoHeight || 1280);
  const filterId = state.videoFilterId;
  const filterParams = getDefaultParams(
    filterId, state.videoIntensity,
    filterId === 'cinema' ? { variant: state.videoCinemaVariant } : {}
  );
  // 録画中にフィルターの選択が変わっても、この録画自体には反映されない
  // （録り始めた時点の設定で最初から最後まで撮る）ので、開始時点の値を控えておく
  activeRecordingMeta = { width, height, filterId, filterParams, intensity: state.videoIntensity };

  $('videoResult').hidden = true;
  $('shutter').classList.add('is-busy');
  $('stage').classList.add('is-recording');
  $('recIndicator').hidden = false;
  $('recTime').textContent = '0:00';
  setStatus('録画中…（音声も記録しています）');

  const started = videoRecorder.start({
    video, width, height,
    mediaStream: camera.stream,
    filterId, filterParams,
    maxMs: 60000,
    onTick: (elapsed) => { $('recTime').textContent = formatRecTime(elapsed); },
    onAutoStop: (result) => {
      $('shutter').classList.remove('is-busy');
      $('stage').classList.remove('is-recording');
      $('recIndicator').hidden = true;
      finishVideoRecording(result, activeRecordingMeta);
    }
  });

  if (!started) {
    $('shutter').classList.remove('is-busy');
    $('stage').classList.remove('is-recording');
    $('recIndicator').hidden = true;
    setStatus('録画を開始できませんでした。', true);
    activeRecordingMeta = null;
    return;
  }
  state.busy = true;
}

async function stopVideoRecording() {
  setStatus('動画を仕上げています…');
  const meta = activeRecordingMeta;
  const result = await videoRecorder.stop();
  $('shutter').classList.remove('is-busy');
  $('stage').classList.remove('is-recording');
  $('recIndicator').hidden = true;
  await finishVideoRecording(result, meta);
}

async function finishVideoRecording(result, meta) {
  state.busy = false;
  activeRecordingMeta = null;
  if (!result || !result.blob || !result.blob.size) {
    setStatus('録画に失敗しました。', true);
    return;
  }
  setStatus('動画を保存しています…');
  const id = await persistNewVideoCapture(result, meta || {});
  const ext = result.mime && result.mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const name = timestampName(ext);
  state.lastVideoBlob = result.blob;
  state.lastVideoName = name;
  attachDownload($('videoDownloadLink'), result.blob, name);
  $('videoResultNote').textContent = id
    ? '動画を保存しました（約 ' + (result.durationMs / 1000).toFixed(1) + ' 秒）。'
    : '動画はできましたが、端末への保存には失敗しました。ダウンロードだけはできます。';
  $('videoResult').hidden = false;
  setStatus(id ? '動画を保存しました。' : '動画の保存に失敗しました。ダウンロードはできます。', !id);
}

async function persistNewVideoCapture(result, meta) {
  if (!storageAvailable()) return null;
  const id = newCaptureId();
  try {
    let thumb = null;
    try {
      thumb = await canvasToBlob(makeThumbnail(videoRecorder.out, 240), 'image/jpeg', 0.8);
    } catch (e) { /* サムネイルが作れなくても保存は続ける */ }
    await saveCapture({
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      kind: 'video',
      width: meta.width,
      height: meta.height,
      durationSec: result.durationMs / 1000,
      mime: result.mime,
      settings: {
        filterId: meta.filterId || 'none',
        cinemaVariant: (meta.filterParams && meta.filterParams.variant) || 'technicolor',
        intensity: typeof meta.intensity === 'number' ? meta.intensity : 100
      },
      thumb
    }, [result.blob]);
    refreshLibrary();
    return id;
  } catch (e) {
    return null;
  }
}

/* 動画作品を開く。バースト作品と違い、撮影後の加工はできないのでそのまま再生・共有・削除のみ */
async function openVideoCapture(id, record) {
  try {
    const blobs = await loadFrameBlobs(id);
    if (!blobs.length) return;
    const blob = blobs[0];
    const url = URL.createObjectURL(blob);
    const player_ = $('videoViewerPlayer');
    if (player_.dataset.url) URL.revokeObjectURL(player_.dataset.url);
    player_.src = url;
    player_.dataset.url = url;

    const f = record.settings && record.settings.filterId;
    $('videoViewerMeta').textContent = fmtVideoDate(record.createdAt) + ' · ' +
      (record.durationSec ? record.durationSec.toFixed(1) + '秒' : '') +
      (f && f !== 'none' ? ' · ' + (FILTERS.find((x) => x.id === f) || {}).label : '');

    const name = timestampName(record.mime && record.mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
    attachDownload($('videoViewerDownload'), blob, name);

    $('videoViewerShare').onclick = async () => {
      const r = await shareFile(blob, name);
      if (r === 'unsupported') setStatus('このブラウザでは共有シートを開けません。下のダウンロードから保存してください。');
      else if (r === 'shared') setStatus('共有シートに渡しました。');
    };
    $('videoViewerDelete').onclick = async () => {
      await removeCapture(id);
      closeVideoViewer();
    };
    $('videoViewerBack').onclick = closeVideoViewer;

    $('library').hidden = true;
    $('videoViewer').hidden = false;
  } catch (e) { /* 開けなくても一覧はそのまま */ }
}

function closeVideoViewer() {
  const player_ = $('videoViewerPlayer');
  player_.pause();
  $('videoViewer').hidden = true;
  $('library').hidden = false;
}

function fmtVideoDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* 「結果」アイコンのラベル。今の作品があるかどうかで表示を変える */
function updateToResultLabel() {
  $('toResultText').textContent = store.count ? '結果' : '作品';
}

function handleResult(result) {
  if (!result.frames.length) {
    setStatus('フレームを1枚も取得できませんでした。撮影時間を長くして試してください。', true);
    return;
  }
  store.setResult(result);
  state.metrics = analyze(result, camera.settings());

  compositor.setFilter('none');
  compositor.intensity = 100;
  compositor.paramsByFilter = {};
  compositor.cinemaVariant = 'technicolor';
  compositor.setCRT(false, 1);
  compositor.invalidate();
  compositor.setAspect('src');
  compositor.setOffsetY(0.5);
  doodle.clear();
  doodle.setSize(result.width, result.height);
  compositor.setStamp({ text: defaultStampText() });
  compositor.resetOSD();
  $('stampText').value = compositor.stamp.text;
  syncUIFromCompositor();
  resetExportResult();

  updateToResultLabel();
  setStatus(result.frames.length + ' 枚 / 実測 ' + Math.round(state.metrics.measuredFps) + 'fps。');

  renderResult();
  goView('result');
  showTab($('tabs'), 'play');
  setDrawing(false);
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
    player.fps = Number(e.target.value);
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
    player.setPos(Number(e.target.value));
  });

  $('prevFrame').addEventListener('click', () => { player.step(-1); markPaused(); });
  $('nextFrame').addEventListener('click', () => { player.step(1); markPaused(); });
  $('playToggle').addEventListener('click', () => {
    $('playToggle').textContent = player.toggle() ? '停止' : '再生';
  });
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
    $('offsetOut').textContent = v < 0.34 ? '上より' : v > 0.66 ? '下より' : '中央';
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  player.onPosChange = (pos, sourceIndex) => {
    $('scrubRange').value = String(pos);
    $('scrubOut').textContent = (pos + 1) + ' / ' + store.sequence.length + '（元コマ ' + (sourceIndex + 1) + '）';
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
  $('playToggle').textContent = '再生';
}

function syncSequenceUI() {
  $('stripCount').textContent = store.count + ' 枚中 ' + store.usedIndices.length + ' 枚を使用';
  $('scrubRange').max = String(Math.max(0, store.sequence.length - 1));
  player.setPos(0);
  markStripUsage($('strip'), store, store.sourceIndexAt(0));
  updateLoopInfo();
  resetExportResult();
}

function renderResult() {
  player.fps = Number($('fpsRange').value) || DEFAULT_PLAY_FPS;
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
  player.play();
  $('playToggle').textContent = '停止';
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
    $('advancedToggle').textContent = open ? 'かんたん設定に戻す' : 'くわしく調整する';
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
    player.refresh();
    resetExportResult();
    scheduleSave();
  });

  $('osdTitleText').addEventListener('input', (e) => {
    compositor.setOSD({ titleText: e.target.value });
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

  syncFilterDependentUI();
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
    $('advancedToggle').textContent = 'くわしく調整する';
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
  $('offsetOut').textContent = compositor.offsetY < 0.34 ? '上より' : compositor.offsetY > 0.66 ? '下より' : '中央';
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

function setupExportControls() {
  buildChips(
    $('formatChips'),
    EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label })),
    'mp4',
    (id) => { state.format = id; updateFormatHint(); updateLoopInfo(); resetExportResult(); }
  );

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
  $('shareBtn').addEventListener('click', doShare);
  $('quickSave').addEventListener('click', () => {
    showTab($('tabs'), 'save');
    setDrawing(false);
    $('exportBtn').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('copyMetrics').addEventListener('click', async () => {
    if (!state.metrics) return;
    const text = toText(state.metrics);
    try {
      await navigator.clipboard.writeText(text);
      $('copyMetrics').textContent = 'コピーしました';
      setTimeout(() => { $('copyMetrics').textContent = '計測結果をコピー'; }, 1600);
    } catch (e) {
      window.prompt('この内容をコピーしてください', text);
    }
  });
}

function updateFormatHint() {
  const f = EXPORT_FORMATS.find((x) => x.id === state.format);
  let hint = f ? f.hint : '';
  if (state.format === 'mp4' && !pickMimeType()) {
    hint = 'このブラウザでは動画を書き出せません。GIFを選んでください。';
  }
  $('formatHint').textContent = hint;
  $('durationExportChips').classList.toggle('is-disabled', state.format === 'gif' || state.format === 'photo');
}

/* 作品は短いまま、書き出しでくり返す */
function loopCount() {
  const loopMs = (store.sequence.length / (player.fps || 10)) * 1000;
  if (!loopMs) return 1;
  return Math.max(1, Math.round((state.exportSeconds * 1000) / loopMs));
}

function updateLoopInfo() {
  if (!store.sequence.length) {
    $('loopInfo').textContent = '';
    return;
  }
  if (state.format === 'photo') {
    $('loopInfo').textContent = 'いま画面に出ているコマ1枚を保存します（動く作品はそのまま残ります）。';
    return;
  }
  const loopMs = (store.sequence.length / (player.fps || 10)) * 1000;
  if (state.format === 'gif') {
    $('loopInfo').textContent = 'GIFは長さの指定なしで、無限にループします（1周 ' + Math.round(loopMs) + ' ms）。';
    return;
  }
  const n = loopCount();
  $('loopInfo').textContent = '1周 ' + Math.round(loopMs) + ' ms を ' + n + '回くり返して、約 ' +
    (Math.round(loopMs * n) / 1000).toFixed(1) + ' 秒にします。';
}

function resetExportResult() {
  state.lastBlob = null;
  state.lastName = '';
  $('exportResult').hidden = true;
  setExportStatus('');
}

/* 書き出しの画面サイズ。作品の比率、または書き出し枠から決める */
function exportBox() {
  const art = compositor.size;
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
  if (!framed) return (ctx, index, pos, w, h) => compositor.renderTo(ctx, index, pos, w, h);
  return (ctx, index, pos, w, h) => compositor.renderFramed(ctx, index, pos, w, h, state.background);
}

async function runExport() {
  if (state.exporting || !store.sequence.length) return;
  state.exporting = true;
  $('exportBtn').disabled = true;
  pausePlayback();
  resetExportResult();

  const box = exportBox();
  const render = makeRenderer(box.framed);
  const fps = player.fps;
  const onProgress = (p, label) => setExportStatus(label + ' ' + Math.round(p * 100) + '%', p);

  try {
    let blob, name;
    if (state.format === 'photo') {
      setExportStatus('静止画を作っています…', 0.3);
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      const index = store.sourceIndexAt(player.pos);
      render(ctx, index, player.pos, box.width, box.height);
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      if (!blob) throw new Error('静止画の書き出しに失敗しました。');
      name = timestampName('jpg');
    } else if (state.format === 'gif') {
      setExportStatus('GIFを作っています…', 0.05);
      blob = await encodeGIF({
        render, sequence: store.sequence, fps,
        width: box.width, height: box.height, onProgress
      });
      name = timestampName('gif');
    } else {
      setExportStatus('動画を録っています…', 0.05);
      blob = await encodeVideo({
        render, sequence: store.sequence, fps,
        width: box.width, height: box.height, loops: loopCount(), onProgress
      });
      name = timestampName(extensionFor(pickMimeType()));
    }

    state.lastBlob = blob;
    state.lastName = name;
    attachDownload($('downloadLink'), blob, name);
    $('exportResult').hidden = false;
    const kb = Math.round(blob.size / 1024);
    setExportStatus('できました（' + box.width + '×' + box.height + ' / ' +
      (kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB') + '）。共有から写真に保存できます。');
  } catch (err) {
    setExportStatus(err && err.message ? err.message : '書き出しに失敗しました。サイズを小さくして試してください。');
  } finally {
    state.exporting = false;
    $('exportBtn').disabled = false;
    player.refresh();
  }
}

async function doShare() {
  if (!state.lastBlob) return;
  const result = await shareFile(state.lastBlob, state.lastName);
  if (result === 'unsupported') {
    setExportStatus('このブラウザでは共有シートを開けません。下のダウンロードから保存してください。');
  } else if (result === 'shared') {
    setExportStatus('共有シートに渡しました。');
  }
}

/* ---------- 作品ライブラリ ---------- */

function currentSettings() {
  return Object.assign(compositor.exportSettings(), {
    doodle: doodle.items,
    fps: player.fps,
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
      thumb
    }, blobs);
    refreshLibrary();
  } catch (e) {
    state.captureId = null;
  }
}

async function refreshLibrary() {
  if ($('videoViewer') && !$('videoViewer').hidden) {
    $('videoViewer').hidden = true;
    $('library').hidden = false;
  }
  if (!storageAvailable()) {
    $('libNote').textContent = 'このブラウザでは作品を保存できません。';
    return;
  }
  let items = [];
  try {
    items = await listCaptures();
  } catch (e) {
    $('libNote').textContent = '保存領域を開けませんでした。';
    return;
  }
  renderLibrary($('library'), items, {
    currentId: state.captureId,
    onOpen: openCapture,
    onDelete: removeCapture
  });
  const usage = await estimateUsage();
  const base = items.length + ' 件。この端末の中だけに保存され、どこにも送信されません。';
  $('libNote').textContent = usage && usage.usage
    ? base + '（使用中 ' + (usage.usage / 1048576).toFixed(1) + 'MB）'
    : base;
}

async function openCapture(id) {
  try {
    const record = await getCapture(id);
    if (!record) return;
    if (record.kind === 'video') {
      goView('result');
      showTab($('tabs'), 'lib');
      setDrawing(false);
      await openVideoCapture(id, record);
      return;
    }
    const blobs = await loadFrameBlobs(id);
    if (!blobs.length) return;

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
      player.fps = s.fps;
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
    showTab($('tabs'), 'play');
    setDrawing(false);
    updateToResultLabel();
    refreshLibrary();
  } catch (e) {
    $('libNote').textContent = 'この作品を開けませんでした。';
  }
}

async function removeCapture(id) {
  if (!window.confirm('この作品を削除します。元に戻せません。')) return;
  try {
    await deleteCapture(id);
    if (state.captureId === id) state.captureId = null;
    refreshLibrary();
  } catch (e) { /* 失敗しても一覧はそのまま */ }
}

/* ---------- 起動 ---------- */

showEnvironment();
setupCameraControls();
setupPlayControls();
setupLookControls();
setupDrawControls();
setupExportControls();

setupTabs($('tabs'), (name) => {
  setDrawing(name === 'draw');
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
updateToResultLabel();
goView('camera');
refreshLibrary();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pausePlayback();
});
