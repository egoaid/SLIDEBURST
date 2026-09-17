/* config.js — アプリ定数
   SLIDEBURST © 2026 egoaid / All rights reserved. */

export const APP = {
  name: 'SLIDEBURST',
  version: '0.2.0',
  build: '20260917b',
  url: 'https://egoaid.github.io/SLIDEBURST/'
};

/* 撮影時間。短いほど被写体が止まったまま視点だけが動く */
export const DURATIONS = [
  { ms: 50,  label: '0.05s', hint: '4コマ前後' },
  { ms: 100, label: '0.10s', hint: '6コマ前後' },
  { ms: 150, label: '0.15s', hint: '8コマ前後' },
  { ms: 200, label: '0.20s', hint: '10コマ前後' },
  { ms: 300, label: '0.30s', hint: '長め' }
];

export const DEFAULT_DURATION_MS = 100;

/* 往復再生に使うコマ数。0 は取得した全フレーム */
export const FRAME_MODES = [
  { count: 3,  label: '3' },
  { count: 4,  label: '4' },
  { count: 6,  label: '6' },
  { count: 8,  label: '8' },
  { count: 0,  label: '全部' }
];

export const DEFAULT_FRAME_MODE = 0;
export const DEFAULT_PLAY_FPS = 10;

export const STREAM_MODES = {
  fps: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } },
  res: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  max: { frameRate: { ideal: 60 } }
};

export const MAX_POOL_FRAMES = 72;

/* 日付焼き込みの色。当時のカメラに載っていた発色に寄せる */
export const STAMP_COLORS = [
  { id: 'amber', label: 'アンバー', value: '#ff8a1f' },
  { id: 'white', label: 'ホワイト', value: '#fff4e2' },
  { id: 'lime',  label: 'グリーン', value: '#8bff6a' }
];

export const EMOJI_SET = [
  '❤️','✨','🔥','😂','😭','🥺','😎','🫶',
  '🎉','⭐️','💫','🌈','🫧','🍀','🌸','🎀',
  '📼','📸','🕶️','💬','👍','✌️','💯','⚡️'
];

export const PEN_COLORS = ['#ffffff', '#ff4d6d', '#ffd23f', '#35c8d8', '#7ad46a', '#b06bff', '#12161c'];

export const EXPORT_FORMATS = [
  {
    id: 'mp4',
    label: '動画',
    hint: 'インスタのストーリーやリール、LINEやメッセージで送るならこれ。写真アプリにビデオとして保存されます。'
  },
  {
    id: 'gif',
    label: 'GIF',
    hint: 'どこでも勝手にループします。LINEやXに貼るならこれ。写真アプリには画像として保存されます。'
  }
];
