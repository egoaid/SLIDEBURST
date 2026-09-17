/* main.js — アプリ全体の進行役
   SLIDEBURST — 一瞬の横移動で多視点フレームを取る検証プロトタイプ
   © 2026 egoaid / All rights reserved. */

import { APP, DURATIONS, DEFAULT_DURATION_MS, FRAME_MODES, DEFAULT_FRAME_MODE, DEFAULT_PLAY_FPS } from './config.js';
import { $, browserLabel, isSecure, supportsRVFC } from './utils.js';
import { Camera, describeCameraError } from './camera.js';
import { FramePool, burstCapture } from './capture.js';
import { FrameStore } from './frames.js';
import { LoopPlayer } from './playback.js';
import { analyze, renderMetrics, verdict, toText } from './metrics.js';
import { buildChips, setStatus, showView, fireFlash, renderStrip, markStripUsage } from './ui.js';

const video = $('preview');
const camera = new Camera(video);
const pool = new FramePool();
const store = new FrameStore();
const player = new LoopPlayer($('loopCanvas'), store);

const state = {
  durationMs: DEFAULT_DURATION_MS,
  scale: 0.5,
  streamMode: 'fps',
  busy: false,
  metrics: null
};

/* ---------- 起動時の環境表示 ---------- */

function showEnvironment() {
  const bits = [browserLabel()];
  bits.push(supportsRVFC() ? 'rVFC 対応' : 'rVFC 非対応');
  if (!isSecure()) bits.push('HTTPS でないためカメラを使えません');
  $('envNote').textContent = bits.join(' · ');
  $('buildTag').textContent = APP.name + ' v' + APP.version + ' build ' + APP.build;
}

/* ---------- 撮影画面 ---------- */

function setupControls() {
  buildChips(
    $('durationChips'),
    DURATIONS.map((d) => ({ value: d.ms, label: d.label, hint: d.hint })),
    DEFAULT_DURATION_MS,
    (ms) => {
      state.durationMs = ms;
      setStatus('撮影時間 ' + (ms / 1000).toFixed(2) + ' 秒。シャッターを押した瞬間からカメラを横へ滑らせてください。');
    }
  );

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
  $('toResult').addEventListener('click', () => {
    if (store.count) showView('result');
  });
}

async function startCamera() {
  if (!isSecure()) {
    setStatus('このページは HTTPS で開く必要があります。GitHub Pages の https:// の URL から開いてください。', true);
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
    setStatus('準備できました（' + s.width + '×' + s.height + ' / ' + Math.round(s.frameRate || 0) + 'fps）。被写体に正対し、シャッターと同時にカメラを横へ滑らせてください。');
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
  const shutter = $('shutter');
  shutter.classList.add('is-busy');
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
    setStatus('撮影に失敗しました（' + (err && err.message ? err.message : '不明') + '）。カメラを起動し直してください。', true);
  } finally {
    state.busy = false;
    shutter.classList.remove('is-busy');
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

  $('toResult').disabled = false;
  setStatus(result.frames.length + ' 枚 / 実測 ' + Math.round(state.metrics.measuredFps) + 'fps。結果を確認してください。');

  renderResult();
  showView('result');
}

/* ---------- 結果画面 ---------- */

function setupResultControls() {
  buildChips(
    $('frameModeChips'),
    FRAME_MODES.map((m) => ({ value: m.count, label: m.label })),
    DEFAULT_FRAME_MODE,
    (count) => {
      store.setFrameMode(count);
      syncSequenceUI();
    }
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
    player.pause();
    $('playToggle').textContent = '再生';
    player.setPos(Number(e.target.value));
  });

  $('prevFrame').addEventListener('click', () => { player.step(-1); $('playToggle').textContent = '再生'; });
  $('nextFrame').addEventListener('click', () => { player.step(1); $('playToggle').textContent = '再生'; });
  $('playToggle').addEventListener('click', () => {
    $('playToggle').textContent = player.toggle() ? '停止' : '再生';
  });

  $('backToCamera').addEventListener('click', () => {
    player.pause();
    $('playToggle').textContent = '再生';
    showView('camera');
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

  player.onPosChange = (pos) => {
    const src = store.sourceIndexAt(pos);
    $('scrubRange').value = String(pos);
    $('scrubOut').textContent = (pos + 1) + ' / ' + store.sequence.length + '（元コマ ' + (src + 1) + '）';
    markStripUsage($('strip'), store, src);
  };
}

function syncSequenceUI() {
  $('stripCount').textContent = store.count + ' 枚中 ' + store.usedIndices.length + ' 枚を使用';
  $('scrubRange').max = String(Math.max(0, store.sequence.length - 1));
  player.setPos(0);
  markStripUsage($('strip'), store, store.sourceIndexAt(0));
}

function renderResult() {
  player.fps = Number($('fpsRange').value) || DEFAULT_PLAY_FPS;
  renderStrip($('strip'), store, (i) => {
    const pos = store.sequence.indexOf(i);
    player.pause();
    $('playToggle').textContent = '再生';
    player.setPos(pos >= 0 ? pos : 0);
  });
  renderMetrics($('metrics'), state.metrics);
  $('verdict').textContent = verdict(state.metrics);
  syncSequenceUI();
  player.play();
  $('playToggle').textContent = '停止';
}

/* ---------- 起動 ---------- */

showEnvironment();
setupControls();
setupResultControls();

/* 画面が隠れたら再生とカメラを止めて発熱と電池を抑える */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    player.pause();
    $('playToggle').textContent = '再生';
  }
});
