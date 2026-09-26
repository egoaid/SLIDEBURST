/* metrics.js — 計測値の算出と表示 */

import { stats, round } from './utils.js';
import { L } from './i18n.js';

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

  row(dl, L('Frames captured', '取得フレーム数'), L(m.frameCount + '', m.frameCount + ' 枚'), countState);
  row(dl, L('Measured frame rate', '実測フレームレート'), round(m.measuredFps, 1) + ' fps', fpsState);
  row(dl, L('Requested capture time', '指定撮影時間'), m.requestedMs + ' ms');
  row(dl, L('Measured capture time', '実測撮影時間'), round(m.actualMs, 1) + ' ms');
  row(dl, L('Frame interval, average', 'フレーム間隔 平均'), round(m.deltaAvg, 2) + ' ms');
  row(dl, L('Frame interval, min/max', 'フレーム間隔 最短／最長'), round(m.deltaMin, 2) + ' / ' + round(m.deltaMax, 2) + ' ms');
  row(dl, L('Jitter', 'ばらつき'), round(m.jitter, 2) + ' ms', m.jitter > 20 ? 'warn' : null);
  row(dl, L('Recording resolution', '記録解像度'), m.captureWidth + ' \u00d7 ' + m.captureHeight);
  row(dl, L('Sensor output', 'センサー出力'), m.sourceWidth + ' \u00d7 ' + m.sourceHeight);
  row(dl, L('Track settings', 'トラック設定'), (m.trackWidth || '?') + ' \u00d7 ' + (m.trackHeight || '?') + ' / ' + (m.trackFps ? round(m.trackFps, 0) : '?') + ' fps');
  row(dl, L('Dropped frames', '取りこぼし'), m.dropped === null ? L('n/a', '計測不可') : L(m.dropped + '', m.dropped + ' 枚'), m.dropped ? 'warn' : m.dropped === 0 ? 'ok' : null);
  row(dl, L('Capture method', '取得方法'), m.method === 'requestVideoFrameCallback' ? 'rVFC' : L('rAF (fallback)', 'rAF（代替）'), m.method === 'requestVideoFrameCallback' ? 'ok' : 'warn');
  row(dl, L('Shutter latency', 'シャッター遅延'), round(m.latencyMs, 1) + ' ms');
}

/* 撮れ高の読み方を短く返す */
export function verdict(m) {
  const lines = [];
  const fps = m.measuredFps;

  if (m.frameCount < 3) {
    lines.push(L(
      'Not enough frames. At least 3 are needed for a 3D feel. Try a longer capture time.',
      'コマが足りません。立体感を出すには最低3コマ必要です。撮影時間を1段長くしてください。'
    ));
  } else if (fps >= 45) {
    lines.push(L(
      'Captured at roughly 60fps. At this speed the subject stays nearly still while only the viewpoint moves.',
      '60fps級で取れています。この速さなら被写体はほぼ止まったまま、視点だけが動きます。'
    ));
  } else if (fps >= 25) {
    lines.push(L(
      'Roughly 30fps. Capturing the same number of frames takes twice as long, so subject motion is more likely to blend in.',
      '30fps級です。同じコマ数を取るのに倍の時間がかかるため、被写体の動きが混ざりやすくなります。'
    ));
  } else {
    lines.push(L(
      'The frame rate is too low. Lower the recording resolution and set the stream setting to frame-rate priority.',
      'フレームレートが低すぎます。記録解像度を下げ、ストリーム設定をフレームレート優先にしてください。'
    ));
  }

  if (m.dropped) {
    lines.push(L(
      'There were ' + m.dropped + ' dropped frame(s). Lowering the recording resolution one step will reduce this.',
      '取りこぼしが ' + m.dropped + ' 枚ありました。記録解像度を1段下げると減ります。'
    ));
  }
  if (m.hitCapacity) {
    lines.push(L(
      'The frame limit was reached, so the measured time is shorter than requested.',
      'フレーム上限に達したため、実測時間が指定より短く出ています。'
    ));
  }
  if (m.method !== 'requestVideoFrameCallback') {
    lines.push(L(
      'This browser doesn\u2019t support requestVideoFrameCallback, so timing relies on the screen\u2019s repaint cycle. Numbers are approximate.',
      'このブラウザは requestVideoFrameCallback が使えず、画面の描画周期に依存しています。数値は参考値です。'
    ));
  }
  if (fps > 0) {
    const need = (n) => Math.ceil((n / fps) * 1000);
    lines.push(L(
      'At this speed, 6 frames take about ' + need(6) + ' ms, and 8 frames about ' + need(8) + ' ms.',
      'この速さなら、6コマに約 ' + need(6) + ' ms、8コマに約 ' + need(8) + ' ms かかります。'
    ));
  }
  return lines.join(' ');
}

export function toText(m) {
  return [
    L('SLIDEBURST measurements', 'SLIDEBURST 計測結果'),
    L('Frame count: ', 'フレーム数: ') + m.frameCount,
    L('Measured fps: ', '実測fps: ') + round(m.measuredFps, 2),
    L('Requested/measured time: ', '指定/実測時間: ') + m.requestedMs + 'ms / ' + round(m.actualMs, 1) + 'ms',
    L('Interval avg/min/max: ', '間隔 avg/min/max: ') + round(m.deltaAvg, 2) + ' / ' + round(m.deltaMin, 2) + ' / ' + round(m.deltaMax, 2) + ' ms',
    L('Recording resolution: ', '記録解像度: ') + m.captureWidth + 'x' + m.captureHeight,
    L('Sensor output: ', 'センサー出力: ') + m.sourceWidth + 'x' + m.sourceHeight,
    L('Track: ', 'トラック: ') + m.trackWidth + 'x' + m.trackHeight + ' @' + m.trackFps,
    L('Camera: ', 'カメラ: ') + m.facing,
    L('Dropped: ', '取りこぼし: ') + (m.dropped === null ? 'n/a' : m.dropped),
    L('Capture method: ', '取得方法: ') + m.method,
    'UA: ' + navigator.userAgent
  ].join('\n');
}
