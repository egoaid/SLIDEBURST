/* export-gif.js — 無限ループするGIF89aを自前で書き出す
   外部ライブラリを使わずに、メディアンカット減色 + LZW で組み立てる。 */

import { L } from './i18n.js';

class ByteWriter {
  constructor() {
    this.buf = new Uint8Array(1 << 16);
    this.len = 0;
  }
  grow(n) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(v) { this.grow(1); this.buf[this.len++] = v & 255; }
  bytes(arr) { this.grow(arr.length); this.buf.set(arr, this.len); this.len += arr.length; }
  short(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
  ascii(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.len); }
}

function boxStats(box) {
  if (box.stats) return box.stats;
  let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
  for (let i = 0; i < box.pixels.length; i += 3) {
    const r = box.pixels[i], g = box.pixels[i + 1], b = box.pixels[i + 2];
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    if (b < bmin) bmin = b; if (b > bmax) bmax = b;
  }
  const ranges = [rmax - rmin, gmax - gmin, bmax - bmin];
  const channel = ranges.indexOf(Math.max(...ranges));
  box.stats = { range: ranges[channel], channel };
  return box.stats;
}

function splitBox(box) {
  const { channel } = boxStats(box);
  const n = box.pixels.length / 3;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => box.pixels[a * 3 + channel] - box.pixels[b * 3 + channel]);
  const half = n >> 1;
  const take = (from, to) => {
    const out = new Uint8Array((to - from) * 3);
    for (let i = from; i < to; i++) {
      const s = idx[i] * 3;
      const d = (i - from) * 3;
      out[d] = box.pixels[s];
      out[d + 1] = box.pixels[s + 1];
      out[d + 2] = box.pixels[s + 2];
    }
    return { pixels: out };
  };
  return [take(0, half), take(half, n)];
}

function averageColor(box) {
  const n = box.pixels.length / 3;
  if (!n) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < box.pixels.length; i += 3) {
    r += box.pixels[i]; g += box.pixels[i + 1]; b += box.pixels[i + 2];
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/* 全コマから間引いた画素で共通パレットを作る */
function buildPalette(frames, maxColors = 256) {
  const total = frames.reduce((s, f) => s + f.length / 4, 0);
  const step = Math.max(1, Math.floor(total / 24000));
  const samples = [];
  for (const data of frames) {
    for (let p = 0; p < data.length / 4; p += step) {
      samples.push(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    }
  }
  let boxes = [{ pixels: Uint8Array.from(samples) }];
  while (boxes.length < maxColors) {
    let target = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 6) continue;
      const r = boxStats(boxes[i]).range;
      if (r > best) { best = r; target = i; }
    }
    if (target < 0 || best <= 0) break;
    const parts = splitBox(boxes[target]);
    boxes.splice(target, 1, parts[0], parts[1]);
  }
  const palette = boxes.map(averageColor);
  while (palette.length < 2) palette.push([0, 0, 0]);
  return palette;
}

function makeMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return function (r, g, b) {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = r - p[0], dg = g - p[1], db = b - p[2];
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache[key] = best;
    return best;
  };
}

function lzwEncode(indices, minCodeSize) {
  const out = [];
  let bitBuf = 0, bitCount = 0;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;
  let freeEnt = eoiCode + 1;
  let dict = new Map();

  const emitBits = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuf & 255);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  /* 符号長を広げるのは「コードを出した後」。ここを1つ早めると復号側とずれる */
  const output = (code) => {
    emitBits(code);
    if (freeEnt > maxCode && codeSize < 12) {
      codeSize++;
      maxCode = codeSize === 12 ? 4096 : (1 << codeSize) - 1;
    }
  };

  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    maxCode = (1 << codeSize) - 1;
    freeEnt = eoiCode + 1;
  };

  output(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    output(prefix);
    if (freeEnt < 4096) {
      dict.set(key, freeEnt);
      freeEnt++;
    } else {
      output(clearCode);
      resetDict();
    }
    prefix = k;
  }
  output(prefix);
  output(eoiCode);
  if (bitCount > 0) out.push(bitBuf & 255);
  return out;
}

function writeSubBlocks(w, bytes) {
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    w.byte(chunk.length);
    w.bytes(Uint8Array.from(chunk));
  }
  w.byte(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ループGIFを作る。
 * @param {Object} o {render, sequence, fps, width, height, onProgress}
 *   render(ctx, index, timeSec, width, height) — timeSec は1周の中の経過秒数（テープカウンター用）
 * @returns {Promise<Blob>}
 */
export async function encodeGIF({ render, sequence, fps, width, height, onProgress }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  // テープカウンターなどpos依存の表示があり得るので、同じコマ番号でも位置ごとに描き直す
  // （以前は同じコマ番号をまとめて1回だけ描いていたが、それだとpos依存の表示が焼けない）
  const buffers = [];
  for (let i = 0; i < sequence.length; i++) {
    render(ctx, sequence[i], i / fps, width, height);
    buffers.push(ctx.getImageData(0, 0, width, height).data);
    if (onProgress) onProgress(0.1 + (0.25 * (i + 1)) / sequence.length, L('Preparing frames', 'コマを準備中'));
    await sleep(0);
  }

  const palette = buildPalette(buffers);
  const map = makeMapper(palette);
  if (onProgress) onProgress(0.45, L('Organizing colors', '色を整理中'));
  await sleep(0);

  const indexed = [];
  for (let i = 0; i < buffers.length; i++) {
    const data = buffers[i];
    const px = new Uint8Array(width * height);
    for (let p = 0; p < px.length; p++) {
      px[p] = map(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    }
    indexed.push(px);
    await sleep(0);
  }
  if (onProgress) onProgress(0.6, L('Exporting', '書き出し中'));

  const w = new ByteWriter();
  w.ascii('GIF89a');
  w.short(width);
  w.short(height);
  w.byte(0xf7);           // グローバルカラーテーブルあり / 256色
  w.byte(0);
  w.byte(0);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    w.byte(c[0]); w.byte(c[1]); w.byte(c[2]);
  }
  // 無限ループ指定
  w.byte(0x21); w.byte(0xff); w.byte(11);
  w.ascii('NETSCAPE2.0');
  w.byte(3); w.byte(1); w.short(0); w.byte(0);

  const delay = Math.max(2, Math.round(100 / fps));
  for (let i = 0; i < sequence.length; i++) {
    w.byte(0x21); w.byte(0xf9); w.byte(4);
    w.byte(0x04);         // 直前のコマを残さない
    w.short(delay);
    w.byte(0); w.byte(0);

    w.byte(0x2c);
    w.short(0); w.short(0);
    w.short(width); w.short(height);
    w.byte(0);
    w.byte(8);
    writeSubBlocks(w, lzwEncode(indexed[i], 8));
    if (onProgress) onProgress(0.6 + (0.4 * (i + 1)) / sequence.length, L('Exporting', '書き出し中'));
    await sleep(0);
  }
  w.byte(0x3b);

  return new Blob([w.result()], { type: 'image/gif' });
}
