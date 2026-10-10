// Unifica todas las fuentes de entrada en dos "manos" (izquierda / derecha):
//  - Seguimiento de manos de WebXR (Meta Quest): punta del índice + pellizco.
//  - Controles de WebXR: punta del control + gatillo / botón lateral.
//  - MediaPipe Hand Landmarker (cámara web): mapeo 2D/3D + pellizco.
//  - Ratón (para pruebas en el navegador).
import * as THREE from 'three';

const PINCH_START = 0.022; // metros entre pulgar e índice (WebXR)
const PINCH_END = 0.04;
const CAM_PINCH_START = 0.3; // proporción respecto al tamaño de la palma (MediaPipe)
const CAM_PINCH_END = 0.45;
const CONTROLLER_TIP = new THREE.Vector3(0, -0.01, -0.06);
const PALM_LENGTH = 0.09; // muñeca → nudillo medio, en metros (adulto promedio)

// Tipos de mano que se comportan como un puntero 2D (los botones se pulsan con clic/pellizco).
export const POINTER_TYPES = new Set(['mouse', 'pointer2d']);

export class HandState {
  constructor(handedness) {
    this.handedness = handedness;
    this.active = false;
    this.type = 'none'; // 'hand' | 'controller' | 'camera' | 'pointer2d' | 'mouse'
    this.position = new THREE.Vector3(); // punto de contacto (mundo)
    this.grab = new THREE.Vector3(); // punto de agarre (mundo)
    this.local = new THREE.Vector3(); // igual que position, en coordenadas de la actividad
    this.grabLocal = new THREE.Vector3();
    this.pinching = false;
    this.wasPinching = false;
    this.justPressed = false;
    this.justReleased = false;
    this.source = null;
    this.landmarks = Array.from({ length: 21 }, () => new THREE.Vector3()); // solo MediaPipe
  }
}

export class InputManager {
  constructor(domElement) {
    this.left = new HandState('left');
    this.right = new HandState('right');
    this.hands = [this.left, this.right];

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.mouseInside = false;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._smooth = { left: null, right: null };

    domElement.addEventListener('pointermove', (e) => {
      const r = domElement.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouseInside = true;
    });
    domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    window.addEventListener('pointerup', () => { this.mouseDown = false; });
    domElement.addEventListener('pointerleave', () => { this.mouseInside = false; });
  }

  beginFrame() {
    for (const h of this.hands) {
      h.wasPinching = h.pinching;
      h.active = false;
    }
  }

  endFrame() {
    for (const h of this.hands) {
      if (!h.active) h.pinching = false;
      h.justPressed = h.pinching && !h.wasPinching;
      h.justReleased = !h.pinching && h.wasPinching;
    }
  }

  handFor(handedness) {
    return handedness === 'left' ? this.left : handedness === 'right' ? this.right : null;
  }

  // ---- WebXR (Meta Quest) ----
  updateXR(frame, refSpace) {
    this.beginFrame();
    for (const source of frame.session.inputSources) {
      const h = this.handFor(source.handedness);
      if (!h) continue;
      if (source.hand) {
        const tipJoint = source.hand.get('index-finger-tip');
        const thumbJoint = source.hand.get('thumb-tip');
        const tip = tipJoint && frame.getJointPose(tipJoint, refSpace);
        const thumb = thumbJoint && frame.getJointPose(thumbJoint, refSpace);
        if (!tip || !thumb) continue;
        this._v.copy(tip.transform.position);
        this._v2.copy(thumb.transform.position);
        const d = this._v.distanceTo(this._v2);
        h.pinching = h.pinching ? d < PINCH_END : d < PINCH_START;
        h.position.copy(this._v);
        h.grab.lerpVectors(this._v, this._v2, 0.5);
        h.type = 'hand';
      } else if (source.gripSpace) {
        const pose = frame.getPose(source.gripSpace, refSpace);
        if (!pose) continue;
        const o = pose.transform.orientation;
        this._q.set(o.x, o.y, o.z, o.w);
        h.position.copy(CONTROLLER_TIP).applyQuaternion(this._q).add(pose.transform.position);
        h.grab.copy(h.position);
        const b = source.gamepad?.buttons ?? [];
        h.pinching = !!(b[0]?.pressed || b[1]?.pressed);
        h.type = 'controller';
      } else {
        continue;
      }
      h.source = source;
      h.active = true;
    }
    this.endFrame();
  }

  pulse(handedness, intensity = 0.5, duration = 50) {
    const h = this.handFor(handedness);
    const gamepad = h?.source?.gamepad;
    if (!gamepad) return;
    try {
      const actuator = gamepad.hapticActuators?.[0];
      if (actuator?.pulse) actuator.pulse(intensity, duration);
      else gamepad.vibrationActuator?.playEffect?.('dual-rumble', { duration, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch {
      // La vibración es opcional.
    }
  }

  // ---- Ratón ----
  // pickables: objetos que el ratón puede "tocar"; plane: plano (mundo) sobre el que se mueve la mano.
  updateMouse(camera, pickables, plane) {
    this.beginFrame();
    const h = this.right;
    if (this.mouseInside) {
      this.raycaster.setFromCamera(this.mouse, camera);
      let point = null;
      // Mientras se arrastra, la mano se mueve sobre el plano de trabajo.
      if (!h.wasPinching && pickables.length) {
        const hit = this.raycaster.intersectObjects(pickables, true)[0];
        if (hit) point = hit.point;
      }
      if (!point && plane && this.raycaster.ray.intersectPlane(plane, this._v)) point = this._v;
      if (point) {
        h.position.copy(point);
        h.grab.copy(point);
        h.pinching = this.mouseDown || this.mouseClicked;
        h.type = 'mouse';
        h.source = null;
        h.active = true;
      }
    }
    this.mouseClicked = false;
    this.endFrame();
  }

  // ---- MediaPipe ----
  // result: salida de HandLandmarker.detectForVideo; aspect: ancho/alto del video.
  // mapping:
  //   { type: 'volume', min, max, matrix } → caja de trabajo (coordenadas locales + matriz a mundo)
  //   { type: 'surface', object, width, height } → superficie de un panel (menús)
  updateCamera(result, aspect, mapping) {
    this.beginFrame();
    const seen = new Set();
    const count = result?.landmarks?.length ?? 0;
    for (let i = 0; i < count; i++) {
      const lms = result.landmarks[i];
      // MediaPipe asume imagen espejo; la cámara entrega imagen sin espejo, así que se invierte.
      const label = result.handedness?.[i]?.[0]?.categoryName;
      const handedness = label === 'Left' ? 'right' : 'left';
      if (seen.has(handedness) || !mapping) continue;
      seen.add(handedness);
      this.applyCameraHand(this.handFor(handedness), lms, aspect, mapping);
    }
    for (const key of ['left', 'right']) if (!seen.has(key)) this._smooth[key] = null;
    this.endFrame();
  }

  applyCameraHand(h, lms, aspect, mapping) {
    // Suavizado exponencial para reducir el temblor de la detección.
    let sm = this._smooth[h.handedness];
    if (!sm) {
      sm = this._smooth[h.handedness] = lms.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    } else {
      const a = 0.5;
      for (let j = 0; j < 21; j++) {
        sm[j].x += (lms[j].x - sm[j].x) * a;
        sm[j].y += (lms[j].y - sm[j].y) * a;
        sm[j].z += (lms[j].z - sm[j].z) * a;
      }
    }
    // Unidades isotrópicas (proporcionales a la altura de la imagen).
    const P = (j) => this._v.set(sm[j].x * aspect, sm[j].y, sm[j].z * aspect);
    const palm = P(0).distanceTo(this._v2.set(sm[9].x * aspect, sm[9].y, sm[9].z * aspect)) || 0.15;
    const pinch = P(4).distanceTo(this._v2.set(sm[8].x * aspect, sm[8].y, sm[8].z * aspect)) / palm;
    h.pinching = h.pinching ? pinch < CAM_PINCH_END : pinch < CAM_PINCH_START;

    // Posición normalizada de la punta del índice (vista espejo: derecha del paciente → +x).
    const clamp01 = THREE.MathUtils.clamp;
    const u = clamp01((1 - sm[8].x - 0.15) / 0.7, 0, 1);
    const v = clamp01((1 - sm[8].y - 0.12) / 0.76, 0, 1);
    const k = PALM_LENGTH / palm; // metros por unidad de imagen
    const anchor = new THREE.Vector3();
    let toWorld;

    if (mapping.type === 'surface') {
      anchor.set((u - 0.5) * mapping.width, (v - 0.5) * mapping.height, 0.02);
      toWorld = (p) => mapping.object.localToWorld(p);
      h.type = 'pointer2d';
    } else {
      // Profundidad estimada con el tamaño aparente de la mano: más cerca de la cámara = más lejos en la escena.
      const t = clamp01((palm - 0.13) / (0.3 - 0.13), 0, 1);
      const { min, max } = mapping;
      anchor.set(
        THREE.MathUtils.lerp(min.x, max.x, u),
        THREE.MathUtils.lerp(min.y, max.y, v),
        THREE.MathUtils.lerp(max.z, min.z, t),
      );
      toWorld = (p) => p.applyMatrix4(mapping.matrix);
      h.type = 'camera';
    }

    const flat = mapping.type === 'surface' ? 0 : 1;
    for (let j = 0; j < 21; j++) {
      const lp = h.landmarks[j].set(
        anchor.x - (sm[j].x - sm[8].x) * aspect * k,
        anchor.y - (sm[j].y - sm[8].y) * k,
        anchor.z + (sm[j].z - sm[8].z) * aspect * k * flat,
      );
      toWorld(lp);
    }
    h.position.copy(h.landmarks[8]);
    h.grab.lerpVectors(h.landmarks[8], h.landmarks[4], 0.5);
    h.source = null;
    h.active = true;
  }
}
