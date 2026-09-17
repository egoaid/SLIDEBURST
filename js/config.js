/* config.js — アプリ定数
   SLIDEBURST © 2026 egoaid / All rights reserved. */

export const APP = {
  name: 'SLIDEBURST',
  version: '0.1.0',
  build: '20260917a',
  copyright: '© 2026 egoaid'
};

/* 検証用の撮影時間（ミリ秒）。ラベルは実際に何が起きるかの目安 */
export const DURATIONS = [
  { ms: 50,  label: '0.05s', hint: '極短' },
  { ms: 100, label: '0.10s', hint: '標準候補' },
  { ms: 150, label: '0.15s', hint: '13コマ狙い' },
  { ms: 200, label: '0.20s', hint: '余裕あり' },
  { ms: 300, label: '0.30s', hint: '24コマ狙い' }
];

export const DEFAULT_DURATION_MS = 150;

/* 往復再生に使うコマ数。0 は取得した全フレーム */
export const FRAME_MODES = [
  { count: 8,  label: '8' },
  { count: 13, label: '13' },
  { count: 24, label: '24' },
  { count: 0,  label: '全部' }
];

export const DEFAULT_FRAME_MODE = 13;
export const DEFAULT_PLAY_FPS = 12;

/* getUserMedia の制約プリセット */
export const STREAM_MODES = {
  fps: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } },
  res: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  max: { frameRate: { ideal: 60 } }
};

/* フレームプールの上限。端末メモリを守るための保険 */
export const MAX_POOL_FRAMES = 72;
