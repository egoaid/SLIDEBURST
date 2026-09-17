/* doodle.js — プレビューの上に描く落書きとスタンプ
   フレームと同じ座標系の透明キャンバスに描き、全コマへ合成する。 */

export class Doodle {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.items = [];
    this.current = null;
    this.version = 0;
    this.onChange = null;
  }

  setSize(w, h) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.redraw();
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  beginStroke(color, size) {
    this.current = { type: 'stroke', color, size, points: [] };
  }

  addPoint(x, y) {
    if (!this.current) return;
    this.current.points.push({ x, y });
    this.redraw();
  }

  endStroke() {
    if (this.current && this.current.points.length) {
      this.items.push(this.current);
    }
    this.current = null;
    this.redraw();
  }

  stamp(emoji, x, y, size) {
    this.items.push({ type: 'emoji', emoji, x, y, size });
    this.redraw();
  }

  undo() {
    this.items.pop();
    this.redraw();
  }

  clear() {
    this.items = [];
    this.current = null;
    this.redraw();
  }

  redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = this.current ? this.items.concat([this.current]) : this.items;
    for (const item of all) {
      if (item.type === 'emoji') {
        ctx.save();
        ctx.font = item.size + 'px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, item.x, item.y);
        ctx.restore();
        continue;
      }
      const pts = item.points;
      if (!pts.length) continue;
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }
    this.version++;
    if (this.onChange) this.onChange();
  }
}
