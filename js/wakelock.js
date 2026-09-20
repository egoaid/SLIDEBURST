/* wakelock.js — 録画や書き出しの最中に、画面が自動で暗くなって処理が止まるのを防ぐ。
   対応していない環境では何もしない（失敗しても録画や書き出し自体は続ける）。 */

let sentinel = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel) return;
  if (!('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch (e) { /* 低電力モードなどで拒否されても無視する */ }
}

export function keepAwake() {
  wanted = true;
  acquire();
}

export function releaseAwake() {
  wanted = false;
  if (sentinel) {
    try { sentinel.release(); } catch (e) { /* 既に解放済み */ }
    sentinel = null;
  }
}

/* タブを離れると自動で解除されるので、戻ってきたら取り直す */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) acquire();
});
