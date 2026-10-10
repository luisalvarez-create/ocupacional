// Actividad "Alcance": tocar esferas distribuidas alrededor del hombro.
import * as THREE from 'three';
import { BaseActivity, average, easeOutBack, randRange } from './base.js';
import { formatTime } from '../settings.js';

const LEVELS = {
  1: { radius: 0.07, life: 8, minReach: 0.25, maxReach: 0.45, maxAz: 50 },
  2: { radius: 0.055, life: 5.5, minReach: 0.3, maxReach: 0.55, maxAz: 65 },
  3: { radius: 0.045, life: 4, minReach: 0.35, maxReach: 0.65, maxAz: 80 },
};
const HAND_COLORS = { left: 0x3d8bfd, right: 0xff9f1c };
const HAND_TEXT = { left: 'izquierda (azul)', right: 'derecha (naranja)' };
const DEG = Math.PI / 180;

export class ReachActivity extends BaseActivity {
  start() {
    const { env } = this.ctx;
    env.showTable(false);
    this.level = LEVELS[this.settings.difficulty] ?? LEVELS[1];
    this.timeLeft = this.settings.duration;
    this.target = null;
    this.spawnDelay = 2;
    this.lastPos = null;
    this.handHistory = [];
    this.hint = '¡Prepárate!';
    this.stats = { hits: 0, misses: 0, wrongHand: 0, reaction: [], reach: [], byHand: { left: 0, right: 0 } };
    this.geometry = new THREE.SphereGeometry(1, 28, 18);

    this.ctx.placeHud(new THREE.Vector3(0, this.calib.headY + 0.2, -1.2), 0);
    this.ctx.placeEndButton(new THREE.Vector3(0, this.calib.shoulderY - 0.38, -0.3), -1.0);
    this.ctx.audio.speak('Alcance. ' + (this.settings.hand === 'both'
      ? 'Toca las esferas azules con la mano izquierda y las naranjas con la derecha.'
      : `Toca las esferas con la mano ${this.settings.hand === 'right' ? 'derecha' : 'izquierda'}.`));
  }

  get lookTarget() { return new THREE.Vector3(0, this.calib.shoulderY, -0.5); }

  getWorkspace() {
    const y = this.calib.shoulderY;
    return { min: new THREE.Vector3(-0.75, y - 0.42, -0.75), max: new THREE.Vector3(0.75, y + 0.45, -0.15) };
  }

  getPickables() { return this.target ? [this.target.mesh] : []; }

  getDesktopPlane() {
    return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.45); // z = -0.45
  }

  pickHand() {
    const h = this.settings.hand;
    if (h !== 'both') return h;
    // Alterna al azar evitando más de dos seguidas de la misma mano.
    const last2 = this.handHistory.slice(-2);
    let pick = Math.random() < 0.5 ? 'left' : 'right';
    if (last2.length === 2 && last2[0] === last2[1]) pick = last2[0] === 'left' ? 'right' : 'left';
    this.handHistory.push(pick);
    return pick;
  }

  spawn() {
    const L = this.level;
    const hand = this.pickHand();
    const side = hand === 'right' ? 1 : -1;
    const shoulder = new THREE.Vector3(side * 0.17, this.calib.shoulderY, -0.05);
    let pos;
    let dist;
    for (let tries = 0; tries < 12; tries++) {
      const az = randRange(-L.maxAz * 0.35, L.maxAz) * DEG; // positivo = hacia afuera
      const el = randRange(-20, 40) * DEG;
      dist = randRange(L.minReach, L.maxReach);
      const dir = new THREE.Vector3(side * Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      pos = shoulder.clone().addScaledVector(dir, dist);
      pos.y = Math.max(pos.y, 0.35);
      if (!this.lastPos || pos.distanceTo(this.lastPos) > 0.15) break;
    }
    this.lastPos = pos.clone();

    const color = HAND_COLORS[hand];
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.3 }));
    const halo = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
    mesh.position.copy(pos);
    halo.position.copy(pos);
    mesh.scale.setScalar(0.001);
    this.group.add(mesh, halo);
    this.target = { mesh, halo, hand, age: 0, dist, wrongNotified: false };
    this.hint = `Mano ${HAND_TEXT[hand]}`;
  }

  removeTarget() {
    const t = this.target;
    if (!t) return;
    t.mesh.removeFromParent();
    t.halo.removeFromParent();
    t.mesh.material.dispose();
    t.halo.material.dispose();
    this.target = null;
  }

  update(dt, hands) {
    this.elapsed += dt;
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) this.spawn();
    }
    if (this.target || this.stats.hits + this.stats.misses > 0) this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.finish(true);
      return;
    }

    const t = this.target;
    if (t) {
      const L = this.level;
      t.age += dt;
      t.mesh.scale.setScalar(L.radius * easeOutBack(Math.min(1, t.age / 0.3)));
      const lifeLeft = Math.max(0, 1 - t.age / L.life);
      t.halo.scale.setScalar(L.radius * (1.1 + 1.3 * lifeLeft));
      t.halo.material.opacity = 0.15 + 0.12 * (0.5 + 0.5 * Math.sin(t.age * 8));

      for (const hand of hands) {
        if (!hand.active) continue;
        const d = Math.min(hand.local.distanceTo(t.mesh.position), hand.grabLocal.distanceTo(t.mesh.position));
        if (d > L.radius + 0.025) continue;
        const correct = hand.type === 'mouse' || hand.handedness === t.hand;
        if (correct) {
          this.hit(hand);
          break;
        } else if (!t.wrongNotified) {
          t.wrongNotified = true;
          this.stats.wrongHand++;
          this.ctx.audio.miss();
          this.hint = `¡Usa la mano ${HAND_TEXT[t.hand]}!`;
        }
      }
      if (this.target && t.age >= L.life) {
        this.stats.misses++;
        this.ctx.audio.miss();
        this.removeTarget();
        this.spawnDelay = 0.5;
        this.hint = '¡Sigue intentando!';
      }
    }

    const s = this.stats;
    this.ctx.hud.setContent([
      { text: `⏱ ${formatTime(this.timeLeft)}    ⭐ ${s.hits}`, size: 0.055, weight: 700 },
      { text: this.hint, size: 0.034, color: '#34495e' },
    ], { valign: 'middle' });
  }

  hit(hand) {
    const t = this.target;
    const s = this.stats;
    s.hits++;
    s.byHand[t.hand]++;
    s.reaction.push(t.age);
    s.reach.push(t.dist);
    this.ctx.effects.burst(t.mesh.position, HAND_COLORS[t.hand]);
    this.ctx.audio.success();
    this.ctx.haptic(hand, 0.6, 60);
    this.hint = ['¡Muy bien!', '¡Excelente!', '¡Bien hecho!', '¡Genial!'][s.hits % 4];
    this.removeTarget();
    this.spawnDelay = 0.35;
  }

  buildResult(completed) {
    const s = this.stats;
    const attempts = s.hits + s.misses;
    const metrics = [
      { label: 'Esferas tocadas', value: s.hits },
      { label: 'Esferas no alcanzadas', value: s.misses },
      { label: 'Precisión', value: attempts ? `${Math.round((s.hits / attempts) * 100)}%` : '—' },
      { label: 'Tiempo de reacción promedio', value: s.reaction.length ? `${average(s.reaction).toFixed(2)} s` : '—' },
      { label: 'Alcance máximo', value: s.reach.length ? `${Math.round(Math.max(...s.reach) * 100)} cm` : '—' },
      { label: 'Alcance promedio', value: s.reach.length ? `${Math.round(average(s.reach) * 100)} cm` : '—' },
    ];
    if (this.settings.hand === 'both') {
      metrics.push({ label: 'Aciertos izquierda / derecha', value: `${s.byHand.left} / ${s.byHand.right}` });
      metrics.push({ label: 'Toques con la mano equivocada', value: s.wrongHand });
    }
    return {
      score: s.hits,
      completed,
      durationSec: Math.round(this.settings.duration - Math.max(0, this.timeLeft)),
      metrics,
    };
  }

  dispose() {
    this.removeTarget();
    super.dispose();
  }
}
