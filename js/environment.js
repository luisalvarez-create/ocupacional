// Sala de terapia: luz, piso, paredes, decoración y una mesa de trabajo ajustable.
import * as THREE from 'three';

export const TABLE = { width: 1.3, depth: 0.7, centerZ: -0.55, thickness: 0.04 };
export const TABLE_BOUNDS = {
  minX: -TABLE.width / 2,
  maxX: TABLE.width / 2,
  minZ: TABLE.centerZ - TABLE.depth / 2,
  maxZ: TABLE.centerZ + TABLE.depth / 2,
};

export function onTable(x, z) {
  return x > TABLE_BOUNDS.minX && x < TABLE_BOUNDS.maxX && z > TABLE_BOUNDS.minZ && z < TABLE_BOUNDS.maxZ;
}

export class Environment {
  constructor(scene, root) {
    scene.background = new THREE.Color('#cfe6f0');

    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a68f', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(1.5, 3, 1);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshStandardMaterial({ color: '#d8c3a5', roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 48),
      new THREE.MeshStandardMaterial({ color: '#8fc1d4', roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.002;
    scene.add(rug);

    const walls = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 4, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: '#f3efe6', side: THREE.BackSide, roughness: 1 }),
    );
    walls.position.y = 2;
    scene.add(walls);

    // Ventanas luminosas.
    const windowMat = new THREE.MeshBasicMaterial({ color: '#e9f7ff' });
    for (const angle of [-0.6, 0, 0.6]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), windowMat);
      w.position.set(Math.sin(angle) * -5.95, 1.8, Math.cos(angle) * -5.95);
      w.lookAt(0, 1.8, 0);
      scene.add(w);
    }

    // Plantas decorativas.
    const potMat = new THREE.MeshStandardMaterial({ color: '#c46a3b' });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4f9d58' });
    for (const [x, z] of [[-2.2, -2.5], [2.4, -2.2], [-2.8, 1.2], [2.9, 1.5]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.35, 16), potMat);
      pot.position.set(x, 0.175, z);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), leafMat);
      leaves.position.set(x, 0.7, z);
      scene.add(pot, leaves);
    }

    // Mesa (vive dentro de root para moverse con el recentrado).
    this.table = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: '#e8d2b0', roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: '#9a7b5a' });
    this.tableTop = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth), woodMat);
    this.table.add(this.tableTop);
    this.legs = [];
    const legGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.userData.offset = new THREE.Vector2(sx * (TABLE.width / 2 - 0.06), TABLE.centerZ + sz * (TABLE.depth / 2 - 0.06));
        this.legs.push(leg);
        this.table.add(leg);
      }
    }
    root.add(this.table);
    this.setTableHeight(0.74);
    this.showTable(false);
  }

  // y = altura de la superficie de la mesa.
  setTableHeight(y) {
    this.tableY = y;
    this.tableTop.position.set(0, y - TABLE.thickness / 2, TABLE.centerZ);
    const legH = Math.max(0.1, y - TABLE.thickness);
    for (const leg of this.legs) {
      leg.scale.y = legH;
      leg.position.set(leg.userData.offset.x, legH / 2, leg.userData.offset.y);
    }
  }

  showTable(visible) {
    this.table.visible = visible;
  }
}
