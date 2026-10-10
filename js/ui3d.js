// Interfaz dentro de la escena 3D: paneles de texto y botones que se pulsan
// tocándolos con el dedo, pellizcando, con el gatillo o con clic.
import * as THREE from 'three';
import { POINTER_TYPES } from './input.js';

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const _v = new THREE.Vector3();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export class TextPanel extends THREE.Mesh {
  constructor(width, height, { ppm = 800, background = 'rgba(255,255,255,0.94)', radius = 0.025 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * ppm);
    canvas.height = Math.ceil(height * ppm);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.texture = texture;
    this.ppm = ppm;
    this.panelWidth = width;
    this.panelHeight = height;
    this.background = background;
    this.radius = radius;
    this._key = '';
  }

  clear() {
    const c = this.ctx2d;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.background) {
      c.fillStyle = this.background;
      roundRect(c, 0, 0, this.canvas.width, this.canvas.height, this.radius * this.ppm);
      c.fill();
    }
  }

  // Texto en flujo vertical. lines: string | { text, size, color, weight }
  setContent(lines, { align = 'center', valign = 'top', padding = 0.035 } = {}) {
    const key = JSON.stringify([lines, align, valign]);
    if (key === this._key) return;
    this._key = key;
    const c = this.ctx2d;
    const s = this.ppm;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.clear();
    const blocks = [];
    let total = 0;
    for (const raw of lines) {
      const line = typeof raw === 'string' ? { text: raw } : raw;
      const size = (line.size ?? 0.032) * s;
      const font = `${line.weight ?? 500} ${size}px ${FONT}`;
      c.font = font;
      for (const text of wrapText(c, line.text, W - 2 * padding * s)) {
        blocks.push({ text, font, size, color: line.color ?? '#1f2d3a' });
        total += size * 1.3;
      }
    }
    let y = valign === 'middle' ? (H - total) / 2 : padding * s;
    const x = align === 'center' ? W / 2 : align === 'left' ? padding * s : W - padding * s;
    c.textAlign = align;
    c.textBaseline = 'top';
    for (const b of blocks) {
      c.font = b.font;
      c.fillStyle = b.color;
      c.fillText(b.text, x, y + b.size * 0.12);
      y += b.size * 1.3;
    }
    this.texture.needsUpdate = true;
  }

  // Texto en posiciones absolutas (metros, origen al centro, y hacia arriba).
  paint(items) {
    const key = JSON.stringify(items);
    if (key === this._key) return;
    this._key = key;
    const c = this.ctx2d;
    const s = this.ppm;
    this.clear();
    c.textBaseline = 'middle';
    for (const it of items) {
      c.font = `${it.weight ?? 500} ${(it.size ?? 0.03) * s}px ${FONT}`;
      c.fillStyle = it.color ?? '#1f2d3a';
      c.textAlign = it.align ?? 'center';
      c.fillText(it.text, (it.x + this.panelWidth / 2) * s, (this.panelHeight / 2 - it.y) * s);
    }
    this.texture.needsUpdate = true;
  }
}

export class Button3D extends THREE.Group {
  // Se ejecuta en cualquier pulsación (sonido y vibración globales).
  static onAnyPress = null;

  constructor(label, { width = 0.2, height = 0.07, depth = 0.016, color = '#2f80ed', textColor = '#ffffff', fontSize = 0.026, onPress = null } = {}) {
    super();
    this.w = width;
    this.h = height;
    this.d = depth;
    this.color = color;
    this.textColor = textColor;
    this.fontSize = fontSize;
    this.onPress = onPress;
    this.label = label;
    this.hover = false;
    this.cooldown = 0;
    this.pressAnim = 0;
    this.prevZ = { left: Infinity, right: Infinity };

    const ppm = 900;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(width * ppm);
    this.canvas.height = Math.ceil(height * ppm);
    this.ppm = ppm;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) });
    const s = this.sideMat;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [s, s, s, s, face, s]);
    this.add(this.body);
    this.draw();
  }

  setLabel(label) {
    if (label === this.label) return;
    this.label = label;
    this.draw();
  }

  setColor(color) {
    this.color = color;
    this.sideMat.color.set(color).multiplyScalar(0.7);
    this.draw();
  }

  draw() {
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    const base = new THREE.Color(this.color);
    if (this.hover) base.lerp(new THREE.Color('#ffffff'), 0.25);
    c.fillStyle = `#${base.getHexString()}`;
    c.fillRect(0, 0, W, H);
    if (this.hover) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = H * 0.08;
      c.strokeRect(0, 0, W, H);
    }
    const lines = String(this.label).split('\n');
    let size = this.fontSize * this.ppm;
    c.font = `600 ${size}px ${FONT}`;
    const widest = Math.max(...lines.map((l) => c.measureText(l).width));
    if (widest > W * 0.9) size *= (W * 0.9) / widest;
    c.font = `600 ${size}px ${FONT}`;
    c.fillStyle = this.textColor;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lineH = size * 1.15;
    lines.forEach((l, i) => c.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lineH));
    this.texture.needsUpdate = true;
  }

  update(dt, hands) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pressAnim = Math.max(0, this.pressAnim - dt);
    this.body.position.z = this.pressAnim > 0 ? -this.d * 0.4 : 0;
    if (!this.visible) return false;

    const front = this.d / 2;
    let hover = false;
    let pressedBy = null;
    for (const hand of hands) {
      if (!hand.active) {
        this.prevZ[hand.handedness] = Infinity;
        continue;
      }
      const p = this.worldToLocal(_v.copy(hand.position));
      const over = Math.abs(p.x) < this.w / 2 + 0.008 && Math.abs(p.y) < this.h / 2 + 0.008;
      const near = over && p.z > -front - 0.03 && p.z < front + 0.05;
      if (near) hover = true;
      if (POINTER_TYPES.has(hand.type)) {
        if (near && hand.justPressed) pressedBy = hand;
      } else {
        // Toque: el dedo cruza la cara frontal desde delante.
        const prev = this.prevZ[hand.handedness];
        if (over && prev > front + 0.004 && p.z <= front + 0.004 && p.z > -front - 0.04) pressedBy = hand;
        // Pellizco o gatillo con el dedo sobre el botón.
        if (near && hand.justPressed) pressedBy = hand;
        this.prevZ[hand.handedness] = p.z;
      }
    }
    if (hover !== this.hover) {
      this.hover = hover;
      this.draw();
    }
    if (pressedBy && this.cooldown === 0) {
      this.cooldown = 0.5;
      this.pressAnim = 0.15;
      Button3D.onAnyPress?.(pressedBy);
      this.onPress?.(pressedBy);
      return true;
    }
    return false;
  }
}

// Marcador de dónde está cada mano (útil con cámara web y ratón).
export class HandCursor extends THREE.Group {
  constructor(color) {
    super();
    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 16, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.dot.renderOrder = 10;
    this.add(this.dot);
    this.baseColor = new THREE.Color(color);
    this.pinchColor = new THREE.Color('#2ecc71');
  }

  update(hand) {
    this.visible = hand.active;
    if (!hand.active) return;
    this.position.copy(hand.position);
    const big = hand.type === 'mouse' || hand.type === 'pointer2d' ? 1.6 : 1;
    this.dot.scale.setScalar(big * (hand.pinching ? 0.8 : 1));
    this.dot.material.color.copy(hand.pinching ? this.pinchColor : this.baseColor);
  }
}
