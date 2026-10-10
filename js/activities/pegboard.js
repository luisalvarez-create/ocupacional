// Actividad "Tablero de clavijas" (inspirada en la prueba de 9 clavijas):
// fase 1 colocar las 9 clavijas en el tablero, fase 2 regresarlas a la bandeja.
import * as THREE from 'three';
import { BaseActivity, randRange } from './base.js';
import { onTable } from '../environment.js';
import { formatTime } from '../settings.js';

const LEVELS = {
  1: { spacing: 0.07, pegR: 0.012, pegL: 0.08, snap: 0.03 },
  2: { spacing: 0.06, pegR: 0.01, pegL: 0.075, snap: 0.022 },
  3: { spacing: 0.05, pegR: 0.008, pegL: 0.07, snap: 0.016 },
};
const PEG_COLORS = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x38d9a9, 0x4dabf7, 0x748ffc, 0xda77f2, 0xf783ac];
const BOARD_H = 0.03;
const TRAY = { size: 0.18, floor: 0.01, rim: 0.025 };
const GRAVITY = 9.8;

export class PegboardActivity extends BaseActivity {
  start() {
    const { env } = this.ctx;
    env.showTable(true);
    const L = (this.level = LEVELS[this.settings.difficulty] ?? LEVELS[1]);
    this.tableY = this.calib.tableY;
    this.boardTop = this.tableY + BOARD_H;
    this.trayY = this.tableY + TRAY.floor;
    this.phase = 'place';
    this.timer = 0;
    this.timing = false;
    this.placeTime = 0;
    this.drops = 0;
    this.hint = 'Toma una clavija con pinza (pulgar e índice)';
    this.endDelay = -1;

    // Disposición según la mano: la bandeja va del lado de la mano evaluada.
    const hand = this.settings.hand;
    if (hand === 'both') {
      this.boardPos = new THREE.Vector2(0, -0.55);
      this.trayPos = new THREE.Vector2(0, -0.32);
    } else {
      const side = hand === 'right' ? 1 : -1;
      this.boardPos = new THREE.Vector2(-side * 0.08, -0.47);
      this.trayPos = new THREE.Vector2(side * 0.2, -0.42);
    }

    // Tablero.
    const boardSize = L.spacing * 2 + 0.09;
    this.boardSize = boardSize;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(boardSize, BOARD_H, boardSize),
      new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.8 }),
    );
    board.position.set(this.boardPos.x, this.tableY + BOARD_H / 2, this.boardPos.y);
    this.group.add(board);

    const holeGeo = new THREE.CylinderGeometry(L.pegR * 1.45, L.pegR * 1.45, 0.002, 20);
    const holeMat = new THREE.MeshBasicMaterial({ color: '#3b3b3b' });
    this.holes = [];
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        const pos = new THREE.Vector3(this.boardPos.x + c * L.spacing, this.boardTop + 0.001, this.boardPos.y + r * L.spacing);
        const mesh = new THREE.Mesh(holeGeo, holeMat);
        mesh.position.copy(pos);
        this.group.add(mesh);
        this.holes.push({ pos, peg: null });
      }
    }

    // Bandeja.
    const trayMat = new THREE.MeshStandardMaterial({ color: '#6c8ebf', roughness: 0.6 });
    const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(TRAY.size, TRAY.floor, TRAY.size), trayMat);
    trayFloor.position.set(this.trayPos.x, this.tableY + TRAY.floor / 2, this.trayPos.y);
    this.group.add(trayFloor);
    const t = 0.008;
    for (const [w, d, px, pz] of [
      [TRAY.size, t, 0, TRAY.size / 2], [TRAY.size, t, 0, -TRAY.size / 2],
      [t, TRAY.size, TRAY.size / 2, 0], [t, TRAY.size, -TRAY.size / 2, 0],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, TRAY.rim, d), trayMat);
      wall.position.set(this.trayPos.x + px, this.tableY + TRAY.rim / 2, this.trayPos.y + pz);
      this.group.add(wall);
    }

    // Clavijas: el origen del grupo es la base de la clavija.
    const pegGeo = new THREE.CylinderGeometry(L.pegR, L.pegR, L.pegL, 18);
    const capGeo = new THREE.SphereGeometry(L.pegR, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.pegs = PEG_COLORS.map((color) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const body = new THREE.Mesh(pegGeo, mat);
      body.position.y = L.pegL / 2;
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.y = L.pegL;
      g.add(body, cap);
      this.group.add(g);
      return { group: g, mat, color, state: 'free', hole: null, held: null, offset: new THREE.Vector3(), vy: 0, respawn: -1, falling: false };
    });
    this.scatterInTray(this.pegs);

    this.ctx.placeHud(new THREE.Vector3(0, this.tableY + 0.5, -1.0), 0);
    this.ctx.placeEndButton(new THREE.Vector3(-0.55, this.tableY + 0.008, -0.28), -Math.PI / 2);
    this.ctx.audio.speak('Tablero de clavijas. Coloca todas las clavijas en los agujeros y después regrésalas a la bandeja.');
  }

  inTray(x, z) {
    const h = TRAY.size / 2 - 0.005;
    return Math.abs(x - this.trayPos.x) < h && Math.abs(z - this.trayPos.y) < h;
  }

  onBoard(x, z) {
    const h = this.boardSize / 2;
    return Math.abs(x - this.boardPos.x) < h && Math.abs(z - this.boardPos.y) < h;
  }

  surfaceAt(x, z) {
    if (this.inTray(x, z)) return this.trayY;
    if (this.onBoard(x, z)) return this.boardTop;
    if (onTable(x, z)) return this.tableY;
    return 0;
  }

  scatterInTray(pegs) {
    const placed = this.pegs.filter((p) => !pegs.includes(p) && p.state === 'free' && this.inTray(p.group.position.x, p.group.position.z)).map((p) => p.group.position);
    const half = TRAY.size / 2 - 0.022;
    for (const peg of pegs) {
      let pos;
      for (let i = 0; i < 40; i++) {
        pos = new THREE.Vector3(this.trayPos.x + randRange(-half, half), this.trayY, this.trayPos.y + randRange(-half, half));
        if (placed.every((q) => Math.hypot(q.x - pos.x, q.z - pos.z) > 0.034)) break;
      }
      placed.push(pos);
      peg.group.position.copy(pos);
      peg.state = 'free';
      peg.falling = false;
    }
  }

  // Distancia del punto de agarre al eje de la clavija.
  distanceToPeg(point, peg) {
    const base = peg.group.position;
    const y = THREE.MathUtils.clamp(point.y, base.y, base.y + this.level.pegL);
    return Math.hypot(point.x - base.x, point.y - y, point.z - base.z);
  }

  canGrab(peg) {
    if (peg.held || peg.respawn > 0 || peg.falling) return false;
    if (this.phase === 'place') return peg.state === 'free';
    return peg.state === 'hole' || !this.inTray(peg.group.position.x, peg.group.position.z);
  }

  getPickables() { return this.pegs.filter((p) => p.respawn <= 0).flatMap((p) => p.group.children); }

  getDesktopPlane() { return new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.boardTop + 0.06)); }

  get lookTarget() { return new THREE.Vector3(0, this.tableY, -0.45); }

  update(dt, hands) {
    const L = this.level;
    this.elapsed += dt;
    if (this.timing) this.timer += dt;
    if (this.endDelay > 0) {
      this.endDelay -= dt;
      if (this.endDelay <= 0) this.finish(true);
    } else if (this.elapsed >= this.settings.duration) {
      this.finish(false);
      return;
    }

    // Agarrar.
    const grabRadius = Math.max(0.028, L.pegR + 0.018);
    for (const hand of hands) {
      if (!hand.active || !hand.justPressed || !this.allowed(hand)) continue;
      let best = null;
      let bestD = grabRadius;
      for (const peg of this.pegs) {
        if (!this.canGrab(peg)) continue;
        const d = this.distanceToPeg(hand.grabLocal, peg);
        if (d < bestD) {
          best = peg;
          bestD = d;
        }
      }
      if (!best) continue;
      if (best.state === 'hole') {
        best.hole.peg = null;
        best.hole = null;
      }
      best.state = 'held';
      best.held = hand.handedness;
      if (hand.type === 'mouse' || hand.type === 'pointer2d') {
        best.offset.set(0, -L.pegL * 0.7, 0);
      } else {
        best.offset.copy(best.group.position).sub(hand.grabLocal);
        best.offset.x = THREE.MathUtils.clamp(best.offset.x, -0.015, 0.015);
        best.offset.z = THREE.MathUtils.clamp(best.offset.z, -0.015, 0.015);
        best.offset.y = THREE.MathUtils.clamp(best.offset.y, -L.pegL, 0);
      }
      this.timing = true;
      this.ctx.audio.grab();
      this.ctx.haptic(hand, 0.3, 30);
    }

    for (const peg of this.pegs) {
      const pos = peg.group.position;
      if (peg.state === 'held') {
        const hand = hands.find((h) => h.handedness === peg.held);
        if (!hand.active || !hand.pinching) this.release(peg, hand);
        else pos.copy(hand.grabLocal).add(peg.offset);
      } else if (peg.respawn > 0) {
        peg.respawn -= dt;
        if (peg.respawn <= 0) {
          peg.group.visible = true;
          this.scatterInTray([peg]);
        }
      } else if (peg.falling) {
        peg.vy -= GRAVITY * dt;
        pos.y += peg.vy * dt;
        const surface = this.surfaceAt(pos.x, pos.z);
        if (pos.y <= surface) {
          pos.y = surface;
          peg.falling = false;
          peg.vy = 0;
          this.land(peg, surface);
        }
      }
      const near = hands.some((h) => h.active && this.allowed(h) && (peg.held === h.handedness || (this.canGrab(peg) && this.distanceToPeg(h.grabLocal, peg) < grabRadius)));
      peg.mat.emissive.setHex(near ? peg.color : 0x000000);
      peg.mat.emissiveIntensity = near ? 0.4 : 0;
    }

    const placed = this.holes.filter((h) => h.peg).length;
    const returned = this.countReturned();
    const line1 = this.phase === 'place'
      ? `Fase 1 · Colocar ${placed}/9`
      : `Fase 2 · Regresar ${returned}/9`;
    this.ctx.hud.setContent([
      { text: `⏱ ${formatTime(this.timer)}    ${line1}`, size: 0.048, weight: 700 },
      { text: this.hint, size: 0.032, color: '#34495e' },
    ], { valign: 'middle' });
  }

  countReturned() {
    return this.pegs.filter((p) => p.state === 'free' && !p.falling && p.respawn <= 0 && this.inTray(p.group.position.x, p.group.position.z)).length;
  }

  nearestFreeHole(pos) {
    let best = null;
    let bestD = this.level.snap;
    for (const hole of this.holes) {
      if (hole.peg) continue;
      const d = Math.hypot(hole.pos.x - pos.x, hole.pos.z - pos.z);
      if (d < bestD) {
        best = hole;
        bestD = d;
      }
    }
    return best;
  }

  release(peg, hand) {
    peg.held = null;
    peg.state = 'free';
    const pos = peg.group.position;
    if (this.phase === 'place' && pos.y < this.boardTop + 0.07) {
      const hole = this.nearestFreeHole(pos);
      if (hole) {
        this.insert(peg, hole, hand);
        return;
      }
    }
    peg.falling = true;
    peg.vy = 0;
  }

  insert(peg, hole, hand) {
    const sink = Math.min(this.level.pegL * 0.4, BOARD_H - 0.004);
    peg.group.position.set(hole.pos.x, this.boardTop - sink, hole.pos.z);
    peg.state = 'hole';
    peg.hole = hole;
    peg.falling = false;
    hole.peg = peg;
    this.ctx.audio.success();
    if (hand) this.ctx.haptic(hand, 0.5, 50);
    this.ctx.effects.burst(hole.pos, peg.color, { count: 10, speed: 0.4 });
    const placed = this.holes.filter((h) => h.peg).length;
    this.hint = ['¡Bien!', '¡Muy bien!', '¡Excelente!'][placed % 3];
    if (placed === 9) {
      this.phase = 'remove';
      this.placeTime = this.timer;
      this.ctx.audio.complete();
      this.hint = '¡Ahora regresa las clavijas a la bandeja!';
      this.ctx.audio.speak('Muy bien. Ahora regresa las clavijas a la bandeja.');
    }
  }

  land(peg, surface) {
    const pos = peg.group.position;
    if (surface === 0) {
      this.drops++;
      this.ctx.audio.drop();
      this.hint = 'Se cayó una clavija; vuelve a la bandeja';
      peg.group.visible = false;
      peg.respawn = 0.8;
      return;
    }
    // Perdona soltar desde un poco más alto si cae alineada con un agujero.
    if (this.phase === 'place' && surface === this.boardTop) {
      const hole = this.nearestFreeHole(pos);
      if (hole) {
        this.insert(peg, hole, null);
        return;
      }
    }
    if (this.phase === 'remove' && this.countReturned() === 9) {
      this.hint = '¡Terminaste!';
      this.endDelay = 1;
      this.ctx.effects.confetti(new THREE.Vector3(this.trayPos.x, this.trayY + 0.1, this.trayPos.y));
    }
  }

  buildResult(completed) {
    const placed = this.phase === 'remove' ? 9 : this.holes.filter((h) => h.peg).length;
    const returned = this.phase === 'remove' ? this.countReturned() : 0;
    return {
      score: placed + returned,
      completed,
      durationSec: Math.round(this.elapsed),
      metrics: [
        { label: 'Clavijas colocadas', value: `${placed} de 9` },
        { label: 'Clavijas regresadas', value: `${returned} de 9` },
        { label: 'Tiempo de colocación', value: this.phase === 'remove' ? formatTime(this.placeTime) : '—' },
        { label: 'Tiempo de retiro', value: completed ? formatTime(this.timer - this.placeTime) : '—' },
        { label: 'Tiempo total (desde la primera clavija)', value: formatTime(this.timer) },
        { label: 'Clavijas caídas', value: this.drops },
      ],
    };
  }
}
