/* metrics.js — 計測値の算出と表示 */

import { stats, round } from './utils.js';

export function analyze(result, camSettings) {
  const frames = result.frames;
  const n = frames.length;
  const deltas = [];
  for (let i = 1; i < n; i++) deltas.push(frames[i].t - frames[i - 1].t);
  const d = stats(deltas);

  const span = n > 1 ? frames[n - 1].t - frames[0].t : 0;
  const measuredFps = span > 0 ? ((n - 1) / span) * 1000 : 0;

  let dropped = null;
  const first = frames[0], last = frames[n - 1];
  if (first && last && first.presentedFrames !== null && last.presentedFrames !== null) {
    dropped = Math.max(0, (last.presentedFrames - first.presentedFrames) - (n - 1));
  }

  return {
    frameCount: n,
    requestedMs: result.requestedMs,
    actualMs: span,
    measuredFps,
    deltaMin: d.min,
    deltaMax: d.max,
    deltaAvg: d.avg,
    jitter: d.max - d.min,
    dropped,
    method: result.method,
    latencyMs: result.latencyMs,
    captureWidth: result.width,
    captureHeight: result.height,
    sourceWidth: result.sourceWidth,
    sourceHeight: result.sourceHeight,
    hitCapacity: n >= result.capacity,
    trackFps: camSettings.frameRate || null,
    trackWidth: camSettings.width || null,
    trackHeight: camSettings.height || null,
    facing: camSettings.facingMode || null
  };
}

function row(dl, label, value, state) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (state) dd.classList.add('is-' + state);
  dl.append(dt, dd);
}

export function renderMetrics(dl, m) {
  dl.textContent = '';

  const fpsState = m.measuredFps >= 55 ? 'ok' : m.measuredFps >= 28 ? 'warn' : 'ng';
  const countState = m.frameCount >= 8 ? 'ok' : m.frameCount >= 4 ? 'warn' : 'ng';

  row(dl, '取得フレーム数', m.frameCount + ' 枚', countState);
  row(dl, '実測フレームレート', round(m.measuredFps, 1) + ' fps', fpsState);
  row(dl, '指定撮影時間', m.requestedMs + ' ms');
  row(dl, '実測撮影時間', round(m.actualMs, 1) + ' ms');
  row(dl, 'フレーム間隔 平均', round(m.deltaAvg, 2) + ' ms');
  row(dl, 'フレーム間隔 最短／最長', round(m.deltaMin, 2) + ' / ' + round(m.deltaMax, 2) + ' ms');
  row(dl, 'ばらつき', round(m.jitter, 2) + ' ms', m.jitter > 20 ? 'warn' : null);
  row(dl, '記録解像度', m.captureWidth + ' × ' + m.captureHeight);
  row(dl, 'センサー出力', m.sourceWidth + ' × ' + m.sourceHeight);
  row(dl, 'トラック設定', (m.trackWidth || '?') + ' × ' + (m.trackHeight || '?') + ' / ' + (m.trackFps ? round(m.trackFps, 0) : '?') + ' fps');
  row(dl, '取りこぼし', m.dropped === null ? '計測不可' : m.dropped + ' 枚', m.dropped ? 'warn' : m.dropped === 0 ? 'ok' : null);
  row(dl, '取得方法', m.method === 'requestVideoFrameCallback' ? 'rVFC' : 'rAF（代替）', m.method === 'requestVideoFrameCallback' ? 'ok' : 'warn');
  row(dl, 'シャッター遅延', round(m.latencyMs, 1) + ' ms');
}

/* 実機検証の判断材料を1文で返す */
export function verdict(m) {
  const lines = [];
  if (m.frameCount < 4) {
    lines.push('この撮影時間ではコマ数が足りません。撮影時間を1段長くするか、記録解像度を下げてください。');
  } else if (m.measuredFps < 28) {
    lines.push('実測レートが低く、コマ間の視点移動が粗くなります。記録解像度を下げると改善することがあります。');
  } else if (m.measuredFps >= 55) {
    lines.push('60fps相当で取得できています。この撮影時間ならコンセプトは成立します。');
  } else {
    lines.push('30fps相当で取得できています。13コマ以上ほしい場合は撮影時間を伸ばしてください。');
  }
  if (m.hitCapacity) lines.push('フレーム上限に達したため、実測時間が指定より短く出ています。');
  if (m.method !== 'requestVideoFrameCallback') {
    lines.push('このブラウザは requestVideoFrameCallback が使えず、画面の描画周期に依存しています。数値は参考値として見てください。');
  }
  const need13 = m.measuredFps > 0 ? Math.ceil((13 / m.measuredFps) * 1000) : null;
  if (need13) lines.push('13コマ取るには約 ' + need13 + ' ms の撮影が必要です。');
  return lines.join(' ');
}

export function toText(m) {
  return [
    'SLIDEBURST 計測結果',
    'フレーム数: ' + m.frameCount,
    '実測fps: ' + round(m.measuredFps, 2),
    '指定/実測時間: ' + m.requestedMs + 'ms / ' + round(m.actualMs, 1) + 'ms',
    '間隔 avg/min/max: ' + round(m.deltaAvg, 2) + ' / ' + round(m.deltaMin, 2) + ' / ' + round(m.deltaMax, 2) + ' ms',
    '記録解像度: ' + m.captureWidth + 'x' + m.captureHeight,
    'センサー出力: ' + m.sourceWidth + 'x' + m.sourceHeight,
    'トラック: ' + m.trackWidth + 'x' + m.trackHeight + ' @' + m.trackFps,
    'カメラ: ' + m.facing,
    '取りこぼし: ' + (m.dropped === null ? 'n/a' : m.dropped),
    '取得方法: ' + m.method,
    'UA: ' + navigator.userAgent
  ].join('\n');
}
