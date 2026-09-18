/* pip.js — 加工中に映像が画面外へ出たら、小さな映像窓を浮かせて追いかける
   4:3 でも 9:16 でも、作品の縦横比に合わせて窓の形を変えるので、
   パラメーターの上に映像を重ねる方式のようにレイアウトが崩れない。 */

const MAX_SIZE = 148; // 長辺の目安（px）。CSSの --pip-size と合わせて調整する

export class FloatingPreview {
  /**
   * @param {Object} o
   * @param {HTMLElement} o.wrap PiP全体のラッパー要素
   * @param {HTMLCanvasElement} o.canvas PiP内に描くcanvas
   * @param {HTMLElement} o.watchTarget これが画面外に出たらPiPを出す対象（本体のプレビュー）
   * @param {HTMLCanvasElement} o.source 描き写す元のcanvas（本体のプレビュー）
   * @param {() => boolean} o.isRelevant いま表示すべき文脈かどうか（例: 結果画面が開いているか）
   */
  constructor({ wrap, canvas, watchTarget, source, isRelevant }) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.watchTarget = watchTarget;
    this.source = source;
    this.isRelevant = isRelevant || (() => true);

    this.mainVisible = true;
    this.dragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.rafId = null;
    this.lastW = 0;
    this.lastH = 0;

    this._setupObserver();
    this._setupDrag();
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
    if (sw === this.lastW && sh === this.lastH) return;
    this.lastW = sw;
    this.lastH = sh;
    const scale = MAX_SIZE / Math.max(sw, sh);
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
}
