/* storage.js — 撮った作品を端末の中に貯める（IndexedDB）
   フレームは1枚ずつ別ストアに置き、一覧では読み込まない。
   作品レコードは軽いまま保ち、編集内容だけを上書きできるようにする。 */

const DB_NAME = 'slideburst';
const DB_VERSION = 1;
const CAPTURES = 'captures';
const FRAMES = 'frames';

let dbPromise = null;

export function storageAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CAPTURES)) {
        const s = db.createObjectStore(CAPTURES, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(FRAMES)) {
        const f = db.createObjectStore(FRAMES, { keyPath: 'key' });
        f.createIndex('captureId', 'captureId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newCaptureId() {
  return 'cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/* canvas を JPEG の Blob に。撮影直後の負荷を避けるため呼び出し側で待つ */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
    else resolve(null);
  });
}

/**
 * 作品を1件保存する。フレームは frames ストアへ個別に入れる。
 */
export async function saveCapture(record, frameBlobs) {
  const db = await openDB();
  const t = tx(db, [CAPTURES, FRAMES], 'readwrite');
  t.objectStore(CAPTURES).put(record);
  const fs = t.objectStore(FRAMES);
  frameBlobs.forEach((blob, i) => {
    if (blob) fs.put({ key: record.id + ':' + i, captureId: record.id, index: i, blob });
  });
  await done(t);
  return record.id;
}

/* 編集内容だけを上書きする。フレームには触らない。touch=false のときは更新日時を変えない（一覧用の補完など） */
export async function updateCapture(id, patch, { touch = true } = {}) {
  const db = await openDB();
  const t = tx(db, [CAPTURES], 'readwrite');
  const store = t.objectStore(CAPTURES);
  const current = await request(store.get(id));
  if (!current) return false;
  store.put(Object.assign(current, patch, touch ? { updatedAt: Date.now() } : {}));
  await done(t);
  return true;
}

export async function listCaptures() {
  const db = await openDB();
  const t = tx(db, [CAPTURES], 'readonly');
  const all = await request(t.objectStore(CAPTURES).getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCapture(id) {
  const db = await openDB();
  const t = tx(db, [CAPTURES], 'readonly');
  return request(t.objectStore(CAPTURES).get(id));
}

export async function loadFrameBlobs(id) {
  const db = await openDB();
  const t = tx(db, [FRAMES], 'readonly');
  const rows = await request(t.objectStore(FRAMES).index('captureId').getAll(IDBKeyRange.only(id)));
  return rows.sort((a, b) => a.index - b.index).map((r) => r.blob);
}

/* 作品のフレーム（動画作品なら動画そのもの）の合計バイト数。Blob の大きさだけを見るので、中身は読まない */
export async function frameBytes(id) {
  const blobs = await loadFrameBlobs(id);
  return blobs.reduce((n, b) => n + (b ? b.size : 0), 0);
}

export async function deleteCapture(id) {
  const db = await openDB();
  const t = tx(db, [CAPTURES, FRAMES], 'readwrite');
  t.objectStore(CAPTURES).delete(id);
  const idx = t.objectStore(FRAMES).index('captureId');
  const keys = await request(idx.getAllKeys(IDBKeyRange.only(id)));
  const fs = t.objectStore(FRAMES);
  keys.forEach((k) => fs.delete(k));
  await done(t);
}

/* Blob をそのまま canvas へ戻す */
export async function blobToCanvas(blob) {
  const canvas = document.createElement('canvas');
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return canvas;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d', { alpha: false }).drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function estimateUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    } catch (err) { /* 取れない環境は黙って諦める */ }
  }
  return null;
}
