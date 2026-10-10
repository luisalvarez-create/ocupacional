// Clase base de las actividades. Todas trabajan en coordenadas locales de `root`:
// el paciente está en el origen mirando hacia -Z y el piso es y = 0.
import * as THREE from 'three';

export class BaseActivity {
  constructor(ctx) {
    this.ctx = ctx;
    this.settings = ctx.settings;
    this.calib = ctx.calib;
    this.group = new THREE.Group();
    ctx.root.add(this.group);
    this.elapsed = 0;
    this.finished = false;
  }

  // ¿Esta mano puede interactuar según la configuración de mano a trabajar?
  allowed(hand) {
    if (hand.type === 'mouse') return true;
    const h = this.settings.hand;
    return h === 'both' || hand.handedness === h;
  }

  start() {}
  update() {}

  // Objetos que el ratón puede tocar directamente.
  getPickables() { return []; }
  // Plano (local) sobre el que se mueve el ratón al arrastrar.
  getDesktopPlane() { return null; }
  // Caja (local) donde se mapea la mano detectada por MediaPipe.
  getWorkspace() {
    const y = this.calib.tableY;
    return { min: new THREE.Vector3(-0.6, y + 0.005, -0.85), max: new THREE.Vector3(0.6, y + 0.3, -0.22) };
  }
  // Punto hacia donde mira la cámara en modo navegador.
  get lookTarget() { return new THREE.Vector3(0, this.calib.tableY, -0.5); }

  buildResult() { return { score: 0, completed: false, durationSec: Math.round(this.elapsed), metrics: [] }; }

  finish(completed) {
    if (this.finished) return;
    this.finished = true;
    this.ctx.finish(this.buildResult(completed));
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    });
    this.group.removeFromParent();
  }
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
export const average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
export const randRange = (a, b) => a + Math.random() * (b - a);

// Animación simple de posición (y escala opcional) con easing.
export function startTween(obj, to, duration, onDone) {
  obj.tween = { from: obj.position.clone(), to: to.clone(), t: 0, duration, onDone };
}

export function stepTween(obj, dt) {
  const tw = obj.tween;
  if (!tw) return false;
  tw.t = Math.min(1, tw.t + dt / tw.duration);
  obj.position.lerpVectors(tw.from, tw.to, easeOutCubic(tw.t));
  if (tw.t >= 1) {
    obj.tween = null;
    tw.onDone?.();
  }
  return true;
}
