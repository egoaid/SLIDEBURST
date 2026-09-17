/* main.js — アプリ全体の進行役
   SLIDEBURST — 一瞬の横移動で、止まった人が立体的に動き出すカメラ
   © 2026 egoaid / All rights reserved. */

import {
  APP, DURATIONS, DEFAULT_DURATION_MS, FRAME_MODES, DEFAULT_FRAME_MODE,
  DEFAULT_PLAY_FPS, STAMP_COLORS, EMOJI_SET, PEN_COLORS, EXPORT_FORMATS
} from './config.js';
import { $, browserLabel, isSecure, supportsRVFC } from './utils.js';
import { Camera, describeCameraError } from './camera.js';
import { FramePool, burstCapture } from './capture.js';
import { FrameStore } from './frames.js';
import { Compositor } from './compose.js';
import { Doodle } from './doodle.js';
import { FILTERS } from './filters.js';
import { defaultStampText } from './datestamp.js';
import { LoopPlayer } from './playback.js';
import { analyze, renderMetrics, verdict, toText } from './metrics.js';
import { encodeGIF } from './export-gif.js';
import { encodeVideo, videoSupported, pickMimeType, extensionFor } from './export-video.js';
import { timestampName, shareFile, attachDownload } from './share.js';
import {
  buildChips, selectChip, buildSwatches, buildEmojiGrid, clearEmojiSelection,
  setupTabs, showTab, setStatus, showView, fireFlash, renderStrip, markStripUsage, setExportStatus
} from './ui.js';

const video = $('preview');
const camera = new Camera(video);
const pool = new FramePool();
const store = new FrameStore();
const doodle = new Doodle();
const compositor = new Compositor(store, doodle);
const player = new LoopPlayer($('loopCanvas'), store, compositor);

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
  exporting: false,
  lastBlob: null,
  lastName: ''
};

/* ---------- 環境表示 ---------- */

function showEnvironment() {
  const bits = [browserLabel()];
  bits.push(supportsRVFC() ? 'rVFC 対応' : 'rVFC 非対応');
  if (!videoSupported() || !pickMimeType()) bits.push('動画書き出し不可');
  if (!isSecure()) bits.push('HTTPSでないためカメラを使えません');
  $('envNote').textContent = bits.join(' · ');
  $('buildTag').textContent = APP.name + ' v' + APP.version + ' build ' + APP.build;
}

/* ---------- 撮影 ---------- */

function setupCameraControls() {
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

  $('scaleSelect').addEventListener('change', (e) => {
    state.scale = Number(e.target.value);
    pool.items = [];
  });

  $('modeSelect').addEventListener('change', async (e) => {
    state.streamMode = e.target.value;
    if (!camera.stream) return;
    try {
      const s = await camera.start({ mode: state.streamMode });
      pool.items = [];
      setStatus('ストリームを ' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps に切り替えました。');
    } catch (err) {
      setStatus(describeCameraError(err), true);
    }
  });

  $('startCamera').addEventListener('click', startCamera);
  $('flipCamera').addEventListener('click', flipCamera);
  $('shutter').addEventListener('click', shoot);
  $('toResult').addEventListener('click', () => { if (store.count) showView('result'); });
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
    const s = await camera.start({ mode: state.streamMode });
    $('blocker').hidden = true;
    $('shutter').disabled = false;
    updateFacingLabel();
    setStatus('準備できました（' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps）。');
  } catch (err) {
    $('blockerText').textContent = describeCameraError(err);
    setStatus(describeCameraError(err), true);
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
    setStatus(describeCameraError(err), true);
  }
}

async function shoot() {
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

function handleResult(result) {
  if (!result.frames.length) {
    setStatus('フレームを1枚も取得できませんでした。撮影時間を長くして試してください。', true);
    return;
  }
  store.setResult(result);
  state.metrics = analyze(result, camera.settings());

  compositor.invalidate();
  doodle.clear();
  doodle.setSize(result.width, result.height);
  $('stampText').value = defaultStampText();
  compositor.setStamp({ text: $('stampText').value });
  resetExportResult();

  $('toResult').disabled = false;
  setStatus(result.frames.length + ' 枚 / 実測 ' + Math.round(state.metrics.measuredFps) + 'fps。');

  renderResult();
  showView('result');
  showTab($('tabs'), 'play');
  setDrawing(false);
}

/* ---------- 再生 ---------- */

function setupPlayControls() {
  buildChips(
    $('frameModeChips'),
    FRAME_MODES.map((m) => ({ value: m.count, label: m.label })),
    DEFAULT_FRAME_MODE,
    (count) => { store.setFrameMode(count); syncSequenceUI(); }
  );

  $('fpsRange').addEventListener('input', (e) => {
    player.fps = Number(e.target.value);
    $('fpsOut').textContent = e.target.value;
  });

  $('pingpongToggle').addEventListener('change', (e) => {
    store.setPingPong(e.target.checked);
    $('loopBadge').textContent = e.target.checked ? '往復再生' : '片道再生';
    syncSequenceUI();
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
    showView('camera');
  });

  player.onPosChange = (pos, sourceIndex) => {
    $('scrubRange').value = String(pos);
    $('scrubOut').textContent = (pos + 1) + ' / ' + store.sequence.length + '（元コマ ' + (sourceIndex + 1) + '）';
    markStripUsage($('strip'), store, sourceIndex);
  };
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
  resetExportResult();
}

function renderResult() {
  player.fps = Number($('fpsRange').value) || DEFAULT_PLAY_FPS;
  renderStrip($('strip'), store, (i) => {
    const pos = store.sequence.indexOf(i);
    pausePlayback();
    player.setPos(pos >= 0 ? pos : 0);
  });
  renderMetrics($('metrics'), state.metrics);
  $('verdict').textContent = verdict(state.metrics);
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
      player.refresh();
      resetExportResult();
    }
  );

  buildChips(
    $('stampColorChips'),
    STAMP_COLORS.map((c) => ({ value: c.value, label: c.label })),
    STAMP_COLORS[0].value,
    (value) => {
      compositor.setStamp({ color: value });
      player.refresh();
      resetExportResult();
    }
  );

  $('stampToggle').addEventListener('change', (e) => {
    compositor.setStamp({ enabled: e.target.checked });
    player.refresh();
    resetExportResult();
  });

  $('stampText').addEventListener('input', (e) => {
    compositor.setStamp({ text: e.target.value });
    player.refresh();
    resetExportResult();
  });
  $('stampText').value = defaultStampText();
  compositor.setStamp({ text: $('stampText').value });
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
  };

  setupDrawSurface();
}

function setDrawing(on) {
  $('drawLayer').hidden = !on;
  $('loopWrap').classList.toggle('is-drawing', on);
  if (on) pausePlayback();
}

function surfacePoint(e) {
  const canvas = $('loopCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height
  };
}

function setupDrawSurface() {
  const layer = $('drawLayer');
  let drawing = false;

  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = surfacePoint(e);
    if (state.drawMode === 'emoji' && state.emoji) {
      const size = $('loopCanvas').width * (0.08 + state.penSize / 120);
      doodle.stamp(state.emoji, p.x, p.y, size);
      return;
    }
    drawing = true;
    layer.setPointerCapture(e.pointerId);
    const size = ($('loopCanvas').width / 360) * state.penSize;
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

/* ---------- 保存 ---------- */

function setupExportControls() {
  buildChips(
    $('formatChips'),
    EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label })),
    'mp4',
    (id) => {
      state.format = id;
      updateFormatHint();
      resetExportResult();
    }
  );
  updateFormatHint();

  $('exportSize').addEventListener('change', resetExportResult);
  $('exportLoops').addEventListener('change', resetExportResult);
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
  $('exportLoops').disabled = state.format === 'gif';
}

function resetExportResult() {
  state.lastBlob = null;
  state.lastName = '';
  $('exportResult').hidden = true;
  setExportStatus('');
}

function exportSize() {
  const { width, height } = compositor.size;
  const target = Number($('exportSize').value);
  const longSide = Math.max(width, height);
  const scale = target >= 1080 ? 1 : Math.min(1, target / longSide);
  // H.264 は偶数サイズを要求するので、2の倍数へ丸める
  const even = (v) => Math.max(2, Math.round(v * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

async function runExport() {
  if (state.exporting || !store.sequence.length) return;
  state.exporting = true;
  $('exportBtn').disabled = true;
  pausePlayback();
  resetExportResult();

  const size = exportSize();
  const fps = player.fps;
  const onProgress = (p, label) => setExportStatus(label + ' ' + Math.round(p * 100) + '%', p);

  try {
    let blob, name;
    if (state.format === 'gif') {
      setExportStatus('GIFを作っています…', 0.05);
      blob = await encodeGIF({
        compositor,
        sequence: store.sequence,
        fps,
        width: size.width,
        height: size.height,
        onProgress
      });
      name = timestampName('gif');
    } else {
      setExportStatus('動画を録っています…', 0.05);
      blob = await encodeVideo({
        compositor,
        sequence: store.sequence,
        fps,
        width: size.width,
        height: size.height,
        loops: Number($('exportLoops').value),
        onProgress
      });
      name = timestampName(extensionFor(pickMimeType()));
    }

    state.lastBlob = blob;
    state.lastName = name;
    attachDownload($('downloadLink'), blob, name);
    $('exportResult').hidden = false;
    const kb = Math.round(blob.size / 1024);
    setExportStatus('できました（' + name + ' / ' + (kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB') + '）。共有から写真に保存できます。');
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

/* ---------- 起動 ---------- */

showEnvironment();
setupCameraControls();
setupPlayControls();
setupLookControls();
setupDrawControls();
setupExportControls();

setupTabs($('tabs'), (name) => {
  setDrawing(name === 'draw');
});

selectChip($('frameModeChips'), DEFAULT_FRAME_MODE);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pausePlayback();
});
