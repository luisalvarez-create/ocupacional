// Punto de entrada: escena, modos de juego (VR / cámara MediaPipe / ratón) y flujo entre pantallas.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { InputManager } from './input.js';
import { AudioFX } from './audio.js';
import { Environment } from './environment.js';
import { Effects } from './effects.js';
import { TextPanel, Button3D, HandCursor } from './ui3d.js';
import { MenuScreen, ResultsScreen } from './screens.js';
import { MediaPipeTracker, HAND_CONNECTIONS } from './mediapipe.js';
import { ReachActivity } from './activities/reach.js';
import { SortingActivity } from './activities/sorting.js';
import { PegboardActivity } from './activities/pegboard.js';
import * as storage from './storage.js';
import {
  settings, saveSettings, ACTIVITIES, HAND_OPTIONS, DIFFICULTY_OPTIONS, DURATION_OPTIONS,
  TABLE_OFFSET_OPTIONS, labelOf, formatTime,
} from './settings.js';

const ACTIVITY_CLASSES = { reach: ReachActivity, sorting: SortingActivity, pegboard: PegboardActivity };
const MODE_LABELS = { xr: 'VR', camera: 'Cámara', desktop: 'Ratón' };

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 50);
camera.position.set(0, 1.5, 0.45);

// `root` se coloca frente al paciente al recentrar; todo el contenido de la terapia vive dentro.
const root = new THREE.Group();
scene.add(root);

const env = new Environment(scene, root);
const effects = new Effects(root);
const audio = new AudioFX(settings);
const input = new InputManager(renderer.domElement);
const calib = { headY: 1.2, shoulderY: 0.96, tableY: 0.74 };

// Modelos de manos y controles de WebXR.
const controllerModels = new XRControllerModelFactory();
const handModels = new XRHandModelFactory();
for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModels.createControllerModel(grip));
  scene.add(grip);
  const hand = renderer.xr.getHand(i);
  hand.add(handModels.createHandModel(hand, 'mesh'));
  scene.add(hand);
}

const cursors = [new HandCursor('#3d8bfd'), new HandCursor('#ff9f1c')];
cursors.forEach((c) => scene.add(c));

// Esqueleto de mano para MediaPipe.
class HandSkeleton extends THREE.Group {
  constructor(color) {
    super();
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshStandardMaterial({ color }), 21);
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 6), 3));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ color }));
    this.lines.frustumCulled = false;
    this.joints.frustumCulled = false;
    this.add(this.joints, this.lines);
    this._m = new THREE.Matrix4();
  }

  update(hand) {
    this.visible = hand.active && (hand.type === 'camera' || hand.type === 'pointer2d');
    if (!this.visible) return;
    hand.landmarks.forEach((p, i) => this.joints.setMatrixAt(i, this._m.makeTranslation(p.x, p.y, p.z)));
    this.joints.instanceMatrix.needsUpdate = true;
    const arr = this.lineGeo.attributes.position.array;
    HAND_CONNECTIONS.forEach(([a, b], i) => {
      hand.landmarks[a].toArray(arr, i * 6);
      hand.landmarks[b].toArray(arr, i * 6 + 3);
    });
    this.lineGeo.attributes.position.needsUpdate = true;
  }
}
const skeletons = [new HandSkeleton('#3d8bfd'), new HandSkeleton('#ff9f1c')];
skeletons.forEach((s) => scene.add(s));

// HUD y botón de terminar (compartidos por todas las actividades).
const hud = new TextPanel(0.8, 0.17, { background: 'rgba(255,255,255,0.9)' });
root.add(hud);
hud.visible = false;

let endConfirmUntil = 0;
const endButton = new Button3D('Terminar', {
  width: 0.17, height: 0.07, color: '#e74c3c', fontSize: 0.026,
  onPress: () => {
    const now = performance.now();
    if (now < endConfirmUntil) {
      current?.finish?.(false);
    } else {
      endConfirmUntil = now + 3000;
      endButton.setLabel('¿Terminar?\nToca otra vez');
    }
  },
});
root.add(endButton);
endButton.visible = false;

Button3D.onAnyPress = (hand) => {
  audio.click();
  input.pulse(hand.handedness, 0.4, 30);
};

// ---------- Estado ----------
let mode = 'overlay';
let current = null; // pantalla o actividad activa
let tracker = null;
let xrFrames = -1;

const app = {
  root, settings, calib,
  startActivity, showMenu, recenter, syncForm,
  recenterAndPlace() {
    recenter();
    current?.place?.();
    lookAtCurrent();
  },
  exit() {
    if (renderer.xr.isPresenting) renderer.xr.getSession()?.end();
    else backToOverlay();
  },
  modeHint() {
    if (mode === 'camera') return 'Cámara: pellizca para pulsar · acerca la mano a la cámara para alcanzar más lejos';
    if (mode === 'desktop') return 'Ratón: haz clic para pulsar y arrastra para mover objetos';
    return 'Toca los botones con el dedo o pellizca (pulgar + índice)';
  },
};

const ctx = {
  root, env, audio, effects, hud, settings, calib,
  haptic: (hand, intensity, ms) => input.pulse(hand.handedness, intensity, ms),
  placeHud(pos, rotX) {
    hud.position.copy(pos);
    hud.rotation.set(rotX, 0, 0);
    hud.visible = true;
  },
  placeEndButton(pos, rotX) {
    endButton.position.copy(pos);
    endButton.rotation.set(rotX, 0, 0);
    endButton.setLabel('Terminar');
    endButton.visible = true;
  },
  finish: onActivityFinished,
};

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function recenter() {
  let headY = 1.2;
  if (renderer.xr.isPresenting) {
    const pos = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    root.position.set(pos.x, 0, pos.z);
    root.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
    headY = clamp(pos.y, 0.9, 2.0);
  } else {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
  }
  root.updateMatrixWorld(true);
  calib.headY = headY;
  calib.shoulderY = headY - 0.24;
  calib.tableY = clamp(headY - 0.48, 0.55, 1.0) + settings.tableOffset;
  env.setTableHeight(calib.tableY);
}

function disposeCurrent() {
  current?.dispose();
  current = null;
  hud.visible = false;
  endButton.visible = false;
  env.showTable(false);
  effects.clear();
}

function showMenu() {
  disposeCurrent();
  current = new MenuScreen(app);
  current.place();
  lookAtCurrent();
}

function startActivity(id) {
  disposeCurrent();
  settings.activity = id;
  saveSettings();
  syncForm();
  recenter();
  current = new ACTIVITY_CLASSES[id](ctx);
  current.activityId = id;
  current.start();
  lookAtCurrent();
}

function onActivityFinished(result) {
  const id = current.activityId;
  const record = {
    id: Date.now(),
    date: new Date().toISOString(),
    patient: settings.patient,
    activity: id,
    activityName: ACTIVITIES[id].name,
    hand: settings.hand,
    handLabel: labelOf(HAND_OPTIONS, settings.hand),
    difficulty: settings.difficulty,
    difficultyLabel: labelOf(DIFFICULTY_OPTIONS, settings.difficulty),
    mode: MODE_LABELS[mode] ?? mode,
    ...result,
  };
  record.metrics = [{ label: 'Duración', value: formatTime(result.durationSec) }, ...result.metrics];
  storage.saveResult(record);
  renderHistory();
  // Se difiere para no destruir la actividad dentro de su propio update.
  queueMicrotask(() => {
    disposeCurrent();
    current = new ResultsScreen(app, record);
    current.place();
    lookAtCurrent();
    effects.confetti(current.lookTarget.add(new THREE.Vector3(0, 0.3, 0)));
    audio.complete();
    audio.speak(result.completed ? '¡Excelente trabajo! Actividad completada.' : 'Actividad terminada. ¡Buen trabajo!');
  });
}

function lookAtCurrent() {
  if (renderer.xr.isPresenting || !current) return;
  const target = current.lookTarget ?? new THREE.Vector3(0, calib.tableY, -0.5);
  const isActivity = !!current.getWorkspace;
  camera.position.set(0, calib.headY + 0.3, isActivity ? 0.5 : 0.4);
  camera.lookAt(root.localToWorld(target.clone().add(new THREE.Vector3(0, isActivity ? 0.12 : 0, 0))));
}

// ---------- Bucle principal ----------
const clock = new THREE.Clock();

function updateLocalHands() {
  for (const h of input.hands) {
    h.local.copy(h.position);
    root.worldToLocal(h.local);
    h.grabLocal.copy(h.grab);
    root.worldToLocal(h.grabLocal);
  }
}

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'overlay' && !renderer.xr.isPresenting) return;

  root.updateMatrixWorld(true);
  if (frame) {
    input.updateXR(frame, renderer.xr.getReferenceSpace());
    // Recentrar cuando ya se conoce la posición real de la cabeza.
    if (xrFrames >= 0 && ++xrFrames === 15) app.recenterAndPlace();
  } else if (mode === 'camera') {
    const result = tracker?.update();
    let mapping = null;
    if (current?.getSurface) {
      mapping = { type: 'surface', ...current.getSurface() };
    } else if (current?.getWorkspace) {
      mapping = { type: 'volume', ...current.getWorkspace(), matrix: root.matrixWorld };
    }
    input.updateCamera(result, tracker?.aspect ?? 4 / 3, mapping);
  } else {
    const pickables = (current?.getPickables?.() ?? []).concat(endButton.visible ? [endButton.body] : []);
    const plane = current?.getDesktopPlane?.();
    if (plane && !current.getSurface) plane.applyMatrix4(root.matrixWorld);
    input.updateMouse(camera, pickables, plane);
  }
  updateLocalHands();

  current?.update(dt, input.hands);
  if (endButton.visible) {
    endButton.update(dt, input.hands);
    if (performance.now() > endConfirmUntil && endButton.label !== 'Terminar') endButton.setLabel('Terminar');
  }
  effects.update(dt);
  input.hands.forEach((h, i) => {
    cursors[i].update(h);
    skeletons[i].update(h);
  });
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || mode === 'overlay' || renderer.xr.isPresenting) return;
  if (current?.finish && !current.finished) current.finish(false);
  else backToOverlay();
});

// ---------- Panel HTML ----------
const $ = (id) => document.getElementById(id);
const els = {
  overlay: $('overlay'),
  patient: $('f-patient'),
  activity: $('f-activity'),
  hand: $('f-hand'),
  difficulty: $('f-difficulty'),
  duration: $('f-duration'),
  table: $('f-table'),
  voice: $('f-voice'),
  description: $('activity-description'),
  btnVR: $('btn-vr'),
  btnCamera: $('btn-camera'),
  btnDesktop: $('btn-desktop'),
  status: $('xr-status'),
  history: $('history-body'),
  btnExport: $('btn-export'),
  btnClear: $('btn-clear'),
  desktopBar: $('desktop-bar'),
  desktopHint: $('desktop-hint'),
  btnBack: $('btn-back'),
  preview: $('camera-preview'),
};

function fillSelect(select, options) {
  select.innerHTML = '';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = String(o.value);
    opt.textContent = o.label;
    select.appendChild(opt);
  }
}

fillSelect(els.activity, Object.entries(ACTIVITIES).map(([value, a]) => ({ value, label: a.name })));
fillSelect(els.hand, HAND_OPTIONS);
fillSelect(els.difficulty, DIFFICULTY_OPTIONS);
fillSelect(els.duration, DURATION_OPTIONS);
fillSelect(els.table, TABLE_OFFSET_OPTIONS);

function syncForm() {
  els.patient.value = settings.patient;
  els.activity.value = settings.activity;
  els.hand.value = settings.hand;
  els.difficulty.value = String(settings.difficulty);
  els.duration.value = String(settings.duration);
  els.table.value = String(settings.tableOffset);
  els.voice.checked = settings.voice;
  const a = ACTIVITIES[settings.activity];
  els.description.textContent = a ? `${a.name}: ${a.goal}` : '';
}

function readForm() {
  settings.patient = els.patient.value.trim();
  settings.activity = els.activity.value;
  settings.hand = els.hand.value;
  settings.difficulty = Number(els.difficulty.value);
  settings.duration = Number(els.duration.value);
  settings.tableOffset = Number(els.table.value);
  settings.voice = els.voice.checked;
  saveSettings();
  syncForm();
}

document.getElementById('settings-form').addEventListener('change', readForm);

function renderHistory() {
  const results = storage.getResults().slice().reverse();
  els.history.innerHTML = '';
  if (!results.length) {
    els.history.innerHTML = '<tr><td colspan="7" class="muted">Aún no hay resultados.</td></tr>';
    return;
  }
  for (const r of results) {
    const tr = document.createElement('tr');
    const cells = [
      new Date(r.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      r.patient || '—',
      `${r.activityName}${r.mode ? ` (${r.mode})` : ''}`,
      r.handLabel,
      r.difficultyLabel,
      r.score,
      r.metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
    ];
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i === 6) td.className = 'detail';
      tr.appendChild(td);
    });
    els.history.appendChild(tr);
  }
}

function enterScreenMode(newMode) {
  readForm();
  audio.ensure();
  mode = newMode;
  els.overlay.hidden = true;
  els.desktopBar.hidden = false;
  els.desktopHint.textContent = newMode === 'camera'
    ? 'Modo cámara: pellizca (pulgar + índice) para pulsar y agarrar. Esc termina la actividad.'
    : 'Modo ratón: clic para pulsar, arrastra para mover objetos. Esc termina la actividad.';
  recenter();
  showMenu();
}

function backToOverlay() {
  disposeCurrent();
  tracker?.stop();
  els.preview.hidden = true;
  mode = 'overlay';
  els.overlay.hidden = false;
  els.desktopBar.hidden = true;
  renderHistory();
}

els.btnDesktop.addEventListener('click', () => enterScreenMode('desktop'));

els.btnCamera.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    els.status.textContent = 'Este navegador no permite usar la cámara (se requiere HTTPS).';
    return;
  }
  enterScreenMode('camera');
  els.preview.hidden = false;
  tracker ??= new MediaPipeTracker($('webcam'), $('webcam-overlay'), $('camera-status'));
  try {
    await tracker.start();
  } catch (err) {
    console.error(err);
    backToOverlay();
    els.status.textContent = `No se pudo iniciar la cámara o MediaPipe: ${err.message ?? err}`;
  }
});

els.btnVR.addEventListener('click', async () => {
  readForm();
  audio.ensure();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    await renderer.xr.setSession(session);
    mode = 'xr';
    xrFrames = 0;
    recenter();
    showMenu();
    session.addEventListener('end', () => {
      xrFrames = -1;
      backToOverlay();
    });
  } catch (err) {
    console.error(err);
    els.status.textContent = `No se pudo iniciar la sesión VR: ${err.message ?? err}`;
  }
});

els.btnBack.addEventListener('click', backToOverlay);
els.btnExport.addEventListener('click', storage.exportCSV);
els.btnClear.addEventListener('click', () => {
  if (confirm('¿Borrar todo el historial de resultados de este dispositivo?')) {
    storage.clearResults();
    renderHistory();
  }
});

async function checkXR() {
  if (!window.isSecureContext) {
    els.status.textContent = 'WebXR y la cámara requieren HTTPS (o localhost). Publica el sitio con HTTPS para usarlo en Meta Quest.';
  }
  let supported = false;
  try {
    supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
  } catch {
    supported = false;
  }
  els.btnVR.disabled = !supported;
  if (!supported && window.isSecureContext) {
    els.status.textContent = 'Este dispositivo no tiene VR disponible. Abre esta página en el navegador de Meta Quest, o usa el modo cámara o ratón.';
  }
}

syncForm();
renderHistory();
checkXR();

// Acceso para depuración desde la consola del navegador.
window.__ot = { app, input, camera, root, get current() { return current; } };
