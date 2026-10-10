// Partículas sencillas para dar retroalimentación visual positiva.
import * as THREE from 'three';

export class Effects {
  constructor(parent) {
    this.parent = parent;
    this.particles = [];
    this.geometry = new THREE.SphereGeometry(0.008, 6, 4);
  }

  burst(position, color, { count = 16, speed = 0.7, size = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, transparent: true }));
      mesh.position.copy(position);
      mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.parent.add(mesh);
      this.particles.push({ mesh, vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.6)), life: 0.7, max: 0.7, scale: mesh.scale.x });
    }
  }

  confetti(position) {
    for (const color of ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff']) {
      this.burst(position, color, { count: 14, speed: 1.2, size: 1.4 });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 1.6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.mesh.material.opacity = k;
      p.mesh.scale.setScalar(p.scale * (0.4 + 0.6 * k));
    }
  }

  clear() {
    for (const p of this.particles) {
      p.mesh.removeFromParent();
      p.mesh.material.dispose();
    }
    this.particles = [];
  }
}
