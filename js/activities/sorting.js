// Actividad "Clasificar objetos": tomar objetos y soltarlos en la caja del mismo color y forma.
import * as THREE from 'three';
import { BaseActivity, average, randRange, startTween, stepTween } from './base.js';
import { onTable } from '../environment.js';
import { formatTime } from '../settings.js';

const CATEGORIES = [
  { name: 'roja', color: 0xe63946, shape: 'sphere' },
  { name: 'azul', color: 0x1d7ed8, shape: 'cube' },
  { name: 'verde', color: 0x2a9d47, shape: 'cylinder' },
  { name: 'amarilla', color: 0xf4c430, shape: 'diamond' },
];
const LEVELS = {
  1: { cats: 2, total: 8, size: 0.075, spread: 0.45 },
  2: { cats: 3, total: 12, size: 0.065, spread: 0.7 },
  3: { cats: 4, total: 16, size: 0.055, spread: 0.96 },
};
const BIN = { w: 0.2, d: 0.18, h: 0.1, z: -0.7 };
const SLOTS_X = [-0.22, 0, 0.22];
const SPAWN_Z = -0.36;
const GRAVITY = 9.8;

function shapeGeometry(shape, size) {
  switch (shape) {
    case 'sphere': return { geo: new THREE.SphereGeometry(size / 2, 24, 16), half: size / 2 };
    case 'cube': return { geo: new THREE.BoxGeometry(size * 0.85, size * 0.85, size * 0.85), half: size * 0.425 };
    case 'cylinder': return { geo: new THREE.CylinderGeometry(size * 0.42, size * 0.42, size * 0.9, 24), half: size * 0.45 };
    default: return { geo: new THREE.OctahedronGeometry(size * 0.58), half: size * 0.58 };
  }
}

export class SortingActivity extends BaseActivity {
  start() {
    const { env } = this.ctx;
    env.showTable(true);
    this.level = LEVELS[this.settings.difficulty] ?? LEVELS[1];
    this.tableY = this.calib.tableY;
    this.time = 0;
    this.stats = { correct: 0, errors: 0, drops: 0, itemTimes: [] };
    this.hint = 'Toma un objeto y suéltalo en su caja';
    this.endDelay = -1;

    const cats = CATEGORIES.slice(0, this.level.cats);
    this.cats = cats;
    this.bins = cats.map((cat, i) => this.createBin(cat, i, cats.length));

    // Mazo barajado con la misma cantidad de cada categoría.
    this.deck = [];
    for (let i = 0; i < this.level.total; i++) this.deck.push(cats[i % cats.length]);
    this.deck.sort(() => Math.random() - 0.5);
    this.spawned = 0;
    this.slots = SLOTS_X.map(() => null);
    this.objects = [];
    this.slots.forEach((_, i) => this.spawnInSlot(i));

    this.ctx.placeHud(new THREE.Vector3(0, this.tableY + 0.55, -1.05), 0);
    this.ctx.placeEndButton(new THREE.Vector3(-0.55, this.tableY + 0.008, -0.28), -Math.PI / 2);
    this.ctx.audio.speak('Clasificar. Toma cada objeto y suéltalo dentro de la caja del mismo color.');
  }

  createBin(cat, index, count) {
    const x = count === 1 ? 0 : THREE.MathUtils.lerp(-this.level.spread / 2, this.level.spread / 2, index / (count - 1));
    const g = new THREE.Group();
    g.position.set(x, this.tableY, BIN.z);
    const mat = new THREE.MeshStandardMaterial({ color: cat.color, roughness: 0.6 });
    const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cat.color).multiplyScalar(0.6) });
    const t = 0.01;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(BIN.w, t, BIN.d), floorMat);
    floor.position.y = t / 2;
    g.add(floor);
    for (const [w, d, px, pz] of [
      [BIN.w, t, 0, BIN.d / 2], [BIN.w, t, 0, -BIN.d / 2],
      [t, BIN.d, BIN.w / 2, 0], [t, BIN.d, -BIN.w / 2, 0],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, BIN.h, d), mat);
      wall.position.set(px, BIN.h / 2, pz);
      g.add(wall);
    }
    // Icono flotante con la forma de la categoría.
    const { geo } = shapeGeometry(cat.shape, 0.05);
    const icon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cat.color, emissive: cat.color, emissiveIntensity: 0.3 }));
    icon.position.y = BIN.h + 0.08;
    g.add(icon);
    this.group.add(g);
    return { cat, x, z: BIN.z, group: g, icon, count: 0 };
  }

  spawnInSlot(i) {
    if (this.spawned >= this.level.total) return;
    const cat = this.deck[this.spawned++];
    const { geo, half } = shapeGeometry(cat.shape, this.level.size);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cat.color, roughness: 0.45 }));
    const home = new THREE.Vector3(SLOTS_X[i] + randRange(-0.03, 0.03), this.tableY + half, SPAWN_Z + randRange(-0.03, 0.03));
    mesh.position.copy(home).add(new THREE.Vector3(0, 0.12, 0));
    mesh.rotation.y = randRange(0, Math.PI);
    this.group.add(mesh);
    const obj = { mesh, cat, half, home, slot: i, held: null, offset: new THREE.Vector3(), vel: new THREE.Vector3(), resting: true, done: false, firstGrab: -1, respawn: -1 };
    startTween(mesh, home, 0.35);
    this.slots[i] = obj;
    this.objects.push(obj);
  }

  getPickables() { return this.objects.filter((o) => !o.done).map((o) => o.mesh); }

  getDesktopPlane() { return new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.tableY + 0.12)); }

  update(dt, hands) {
    this.elapsed += dt;
    this.time += dt;
    if (this.endDelay > 0) {
      this.endDelay -= dt;
      if (this.endDelay <= 0) this.finish(true);
    } else if (this.time >= this.settings.duration) {
      this.finish(false);
      return;
    }

    // Agarrar.
    for (const hand of hands) {
      if (!hand.active || !hand.justPressed || !this.allowed(hand)) continue;
      let best = null;
      let bestD = Infinity;
      for (const o of this.objects) {
        if (o.done || o.held || o.respawn > 0) continue;
        const d = hand.grabLocal.distanceTo(o.mesh.position);
        if (d < this.level.size * 0.5 + 0.045 && d < bestD) {
          best = o;
          bestD = d;
        }
      }
      if (best) {
        best.held = hand.handedness;
        best.mesh.tween = null;
        best.resting = false;
        best.offset.copy(best.mesh.position).sub(hand.grabLocal);
        if (hand.type === 'mouse' || hand.type === 'pointer2d') best.offset.set(0, 0, 0);
        if (best.firstGrab < 0) best.firstGrab = this.time;
        this.ctx.audio.grab();
        this.ctx.haptic(hand, 0.3, 30);
      }
    }

    for (const o of this.objects) {
      const m = o.mesh;
      if (o.held) {
        const hand = hands.find((h) => h.handedness === o.held);
        if (!hand.active || !hand.pinching) {
          this.release(o, hand);
        } else {
          m.position.copy(hand.grabLocal).add(o.offset);
        }
      } else if (o.respawn > 0) {
        o.respawn -= dt;
        if (o.respawn <= 0) {
          m.visible = true;
          m.position.copy(o.home).add(new THREE.Vector3(0, 0.12, 0));
          startTween(m, o.home, 0.35, () => { o.resting = true; });
        }
      } else if (stepTween(m, dt)) {
        // animación en curso
      } else if (!o.resting && !o.done) {
        o.vel.y -= GRAVITY * dt;
        m.position.addScaledVector(o.vel, dt);
        const onT = onTable(m.position.x, m.position.z);
        const ground = (onT ? this.tableY : 0) + o.half;
        if (m.position.y <= ground) {
          m.position.y = ground;
          o.vel.set(0, 0, 0);
          if (onT) {
            o.resting = true;
          } else {
            // Se cayó al piso: vuelve a la mesa.
            this.stats.drops++;
            this.ctx.audio.drop();
            this.hint = 'Se cayó, aparecerá de nuevo en la mesa';
            m.visible = false;
            o.respawn = 0.8;
          }
        }
      }
      // Resaltado cuando una mano permitida está cerca.
      if (!o.done) {
        const near = hands.some((h) => h.active && this.allowed(h) && (o.held === h.handedness || h.grabLocal.distanceTo(m.position) < this.level.size * 0.5 + 0.045));
        m.material.emissive.setHex(near ? o.cat.color : 0x000000);
        m.material.emissiveIntensity = near ? 0.35 : 0;
      }
    }

    for (const b of this.bins) b.icon.rotation.y += dt * 1.2;

    const s = this.stats;
    this.ctx.hud.setContent([
      { text: `⏱ ${formatTime(this.time)}    ✔ ${s.correct}/${this.level.total}`, size: 0.055, weight: 700 },
      { text: this.hint, size: 0.034, color: '#34495e' },
    ], { valign: 'middle' });
  }

  release(o, hand) {
    o.held = null;
    const p = o.mesh.position;
    const bin = this.bins.find((b) => Math.abs(p.x - b.x) < BIN.w / 2 + 0.02 && Math.abs(p.z - b.z) < BIN.d / 2 + 0.02 && p.y < this.tableY + BIN.h + 0.3);
    if (!bin) {
      o.resting = false;
      o.vel.set(0, 0, 0);
      return;
    }
    if (bin.cat === o.cat) {
      o.done = true;
      this.stats.correct++;
      this.stats.itemTimes.push(this.time - o.firstGrab);
      bin.count++;
      const inside = new THREE.Vector3(bin.x + randRange(-0.05, 0.05), this.tableY + 0.01 + o.half * 0.9, bin.z + randRange(-0.04, 0.04));
      startTween(o.mesh, inside, 0.3);
      o.mesh.material.emissiveIntensity = 0;
      this.ctx.effects.burst(new THREE.Vector3(bin.x, this.tableY + BIN.h + 0.02, bin.z), o.cat.color);
      this.ctx.audio.success();
      this.ctx.haptic(hand, 0.6, 60);
      this.hint = ['¡Muy bien!', '¡Correcto!', '¡Excelente!', '¡Así se hace!'][this.stats.correct % 4];
      if (this.slots[o.slot] === o) {
        this.slots[o.slot] = null;
        setTimeout(() => { if (!this.finished) this.spawnInSlot(o.slot); }, 400);
      }
      if (this.stats.correct >= this.level.total) {
        this.hint = '¡Terminaste!';
        this.endDelay = 1.2;
      }
    } else {
      this.stats.errors++;
      this.ctx.audio.error();
      this.hint = `Esa caja es ${bin.cat.name}. Busca la caja ${o.cat.name}.`;
      startTween(o.mesh, o.home, 0.5, () => { o.resting = true; });
    }
  }

  buildResult(completed) {
    const s = this.stats;
    return {
      score: s.correct,
      completed,
      durationSec: Math.round(this.time),
      metrics: [
        { label: 'Objetos clasificados', value: `${s.correct} de ${this.level.total}` },
        { label: 'Errores de caja', value: s.errors },
        { label: 'Objetos caídos', value: s.drops },
        { label: 'Tiempo total', value: formatTime(this.time) },
        { label: 'Tiempo promedio por objeto', value: s.itemTimes.length ? `${average(s.itemTimes).toFixed(1)} s` : '—' },
      ],
    };
  }
}
