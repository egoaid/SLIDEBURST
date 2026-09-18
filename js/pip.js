/* pip.js — 加工中に映像が画面外へ出たら、小さな映像窓を浮かせて追いかける
   4:3 でも 9:16 でも、作品の縦横比に合わせて窓の形を変えるので、
   パラメーターの上に映像を重ねる方式のようにレイアウトが崩れない。
   右下のつまみをドラッグすると、窓そのものの大きさを自由に変えられる。 */

const DEFAULT_SIZE = 168; // 長辺の目安（px）の初期値
const MIN_SIZE = 90;      // これより小さくはしない
const MAX_SIZE = 320;     // これより大きくはしない
const SIZE_STORAGE_KEY = 'slideburst.pipSize';

function loadSavedSize() {
  try {
    const v = Number(localStorage.getItem(SIZE_STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_SIZE && v <= MAX_SIZE) return v;
  } catch (_e) { /* プライベートブラウズ等で読めなくても無視する */ }
  return DEFAULT_SIZE;
}

function saveSize(v) {
  try { localStorage.setItem(SIZE_STORAGE_KEY, String(Math.round(v))); }
  catch (_e) { /* 保存できなくても致命的ではない */ }
}

export class FloatingPreview {
  /**
   * @param {Object} o
   * @param {HTMLElement} o.wrap PiP全体のラッパー要素
   * @param {HTMLCanvasElement} o.canvas PiP内に描くcanvas
   * @param {HTMLElement} o.watchTarget これが画面外に出たらPiPを出す対象（本体のプレビュー）
   * @param {HTMLCanvasElement} o.source 描き写す元のcanvas（本体のプレビュー）
   * @param {() => boolean} o.isRelevant いま表示すべき文脈かどうか（例: 結果画面が開いているか）
   * @param {HTMLElement} [o.resizeHandle] 右下のリサイズ用つまみ要素
   */
  constructor({ wrap, canvas, watchTarget, source, isRelevant, resizeHandle }) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.watchTarget = watchTarget;
    this.source = source;
    this.isRelevant = isRelevant || (() => true);
    this.resizeHandle = resizeHandle || null;

    this.mainVisible = true;
    this.dragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizing = false;
    this.rafId = null;
    this.lastW = 0;
    this.lastH = 0;

    this.size = loadSavedSize();
    this.wrap.style.width = this.size + 'px';

    this._setupObserver();
    this._setupDrag();
    this._setupResize();
  }

  _setupObserver() {
    if (typeof IntersectionObserver !== 'function') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        this.mainVisible = entry.isIntersecting;
        this._sync();
      },
      { threshold: 0 }
    );
    this.observer.observe(this.watchTarget);
  }

  _sync() {
    const shouldShow = this.isRelevant() && !this.mainVisible;
    if (shouldShow) this.show();
    else this.hide();
  }

  /* isRelevant の対象が変わった（タブ切り替えなど）ときに呼ぶ */
  refresh() {
    this._sync();
  }

  show() {
    if (!this.wrap.hidden) return;
    this.wrap.hidden = false;
    this._loop();
  }

  hide() {
    this.wrap.hidden = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  _resizeIfNeeded() {
    const sw = this.source.width, sh = this.source.height;
    if (!sw || !sh) return;
    if (sw === this.lastW && sh === this.lastH && this._lastRenderSize === this.size) return;
    this.lastW = sw;
    this.lastH = sh;
    this._lastRenderSize = this.size;
    // 表示の倍密度でも粗くならないよう、実際の見た目サイズより少し高い解像度で描く
    const target = this.size * (window.devicePixelRatio > 1 ? 2 : 1.4);
    const scale = target / Math.max(sw, sh);
    this.canvas.width = Math.max(2, Math.round(sw * scale));
    this.canvas.height = Math.max(2, Math.round(sh * scale));
  }

  _loop() {
    this._resizeIfNeeded();
    if (this.source.width) {
      this.ctx.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
    }
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _setupDrag() {
    const wrap = this.wrap;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    const onDown = (e) => {
      if (this.resizing) return;
      if (this.resizeHandle && e.target === this.resizeHandle) return;
      this.dragging = true;
      wrap.classList.add('is-dragging');
      const rect = wrap.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      // ドラッグを始めたら、右下基準ではなく絶対座標での配置に切り替える
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = rect.left + 'px';
      wrap.style.top = rect.top + 'px';
      wrap.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!this.dragging) return;
      const rect = wrap.getBoundingClientRect();
      const x = clamp(e.clientX - this.dragOffset.x, 4, window.innerWidth - rect.width - 4);
      const y = clamp(e.clientY - this.dragOffset.y, 4, window.innerHeight - rect.height - 4);
      wrap.style.left = x + 'px';
      wrap.style.top = y + 'px';
    };
    const onUp = () => {
      this.dragging = false;
      wrap.classList.remove('is-dragging');
    };

    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
  }

  /* 右下のつまみをドラッグして、映像窓そのものの大きさを変える */
  _setupResize() {
    const handle = this.resizeHandle;
    if (!handle) return;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    let startX = 0;
    let startSize = 0;

    const onDown = (e) => {
      e.stopPropagation();
      this.resizing = true;
      this.wrap.classList.add('is-resizing');
      startX = e.clientX;
      startSize = this.size;
      handle.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!this.resizing) return;
      e.stopPropagation();
      // 対角のドラッグ量を、右下つまみなら X方向の動きだけで代表させる（斜め移動にも自然に追従する）
      const delta = e.clientX - startX;
      const maxByViewport = Math.min(window.innerWidth, window.innerHeight) - 24;
      this.size = clamp(startSize + delta, MIN_SIZE, Math.min(MAX_SIZE, maxByViewport));
      this.wrap.style.width = this.size + 'px';
    };
    const onUp = (e) => {
      if (!this.resizing) return;
      this.resizing = false;
      this.wrap.classList.remove('is-resizing');
      saveSize(this.size);
      try { handle.releasePointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
}
