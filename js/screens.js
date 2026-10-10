// Menú principal y pantalla de resultados dentro de la escena.
import * as THREE from 'three';
import { TextPanel, Button3D } from './ui3d.js';
import {
  ACTIVITIES, HAND_OPTIONS, DIFFICULTY_OPTIONS, DURATION_OPTIONS, TABLE_OFFSET_OPTIONS,
  labelOf, nextValue, saveSettings,
} from './settings.js';

class PanelScreen {
  constructor(app, width, height) {
    this.app = app;
    this.group = new THREE.Group();
    this.panel = new TextPanel(width, height);
    this.group.add(this.panel);
    this.buttons = [];
    app.root.add(this.group);
  }

  addButton(label, x, y, opts, onPress) {
    const b = new Button3D(label, { ...opts, onPress });
    b.position.set(x, y, 0.012);
    this.group.add(b);
    this.buttons.push(b);
    return b;
  }

  place() {
    const { headY } = this.app.calib;
    this.group.position.set(0, headY - 0.28, -0.5);
    this.group.rotation.set(-0.5, 0, 0);
  }

  update(dt, hands) {
    for (const b of this.buttons) b.update(dt, hands);
  }

  getPickables() { return this.buttons.map((b) => b.body); }

  getDesktopPlane() {
    this.group.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.panel.matrixWorld);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.panel.getWorldPosition(new THREE.Vector3()));
  }

  // Superficie para mapear MediaPipe en modo puntero.
  getSurface() { return { object: this.panel, width: this.panel.panelWidth, height: this.panel.panelHeight }; }

  get lookTarget() {
    this.group.updateMatrixWorld(true);
    return this.app.root.worldToLocal(this.panel.getWorldPosition(new THREE.Vector3()));
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.group.removeFromParent();
  }
}

export class MenuScreen extends PanelScreen {
  constructor(app) {
    super(app, 0.95, 0.68);
    const s = app.settings;
    const opt = { width: 0.27, height: 0.065, color: '#5b6b7a', fontSize: 0.024 };

    this.handBtn = this.addButton('', -0.3, 0.115, opt, () => {
      s.hand = nextValue(HAND_OPTIONS, s.hand);
      this.refresh();
    });
    this.diffBtn = this.addButton('', 0, 0.115, opt, () => {
      s.difficulty = nextValue(DIFFICULTY_OPTIONS, s.difficulty);
      this.refresh();
    });
    this.durBtn = this.addButton('', 0.3, 0.115, opt, () => {
      s.duration = nextValue(DURATION_OPTIONS, s.duration);
      this.refresh();
    });

    const act = { width: 0.27, height: 0.12, color: '#2f80ed', fontSize: 0.03 };
    this.addButton('Alcance', -0.3, -0.055, { ...act, color: '#f08a24' }, () => app.startActivity('reach'));
    this.addButton('Clasificar\nobjetos', 0, -0.055, { ...act, color: '#27ae60' }, () => app.startActivity('sorting'));
    this.addButton('Tablero de\nclavijas', 0.3, -0.055, { ...act, color: '#8e44ad' }, () => app.startActivity('pegboard'));

    const small = { width: 0.27, height: 0.06, color: '#7f8c8d', fontSize: 0.022 };
    this.addButton('Recentrar', -0.3, -0.255, small, () => app.recenterAndPlace());
    this.tableBtn = this.addButton('', 0, -0.255, small, () => {
      s.tableOffset = nextValue(TABLE_OFFSET_OPTIONS, s.tableOffset);
      app.recenter();
      this.refresh();
    });
    this.exitBtn = this.addButton('Salir', 0.3, -0.255, { ...small, color: '#c0392b' }, () => app.exit());
    this.refresh();
  }

  refresh() {
    const s = this.app.settings;
    saveSettings();
    this.app.syncForm();
    this.handBtn.setLabel(labelOf(HAND_OPTIONS, s.hand));
    this.diffBtn.setLabel(labelOf(DIFFICULTY_OPTIONS, s.difficulty));
    this.durBtn.setLabel(labelOf(DURATION_OPTIONS, s.duration));
    this.tableBtn.setLabel(`Mesa ${labelOf(TABLE_OFFSET_OPTIONS, s.tableOffset)}`);
    const muted = '#5d6f7f';
    this.panel.paint([
      { text: 'Terapia Ocupacional XR', x: 0, y: 0.285, size: 0.044, weight: 700, color: '#1b5e8c' },
      { text: s.patient ? `Paciente: ${s.patient}` : 'Elige las opciones y una actividad', x: 0, y: 0.232, size: 0.024, color: muted },
      { text: 'Mano', x: -0.3, y: 0.168, size: 0.022, color: muted },
      { text: 'Dificultad', x: 0, y: 0.168, size: 0.022, color: muted },
      { text: 'Duración máx.', x: 0.3, y: 0.168, size: 0.022, color: muted },
      { text: 'Toca una actividad para comenzar', x: 0, y: 0.045, size: 0.024, weight: 600 },
      { text: 'Hombro y brazo', x: -0.3, y: -0.14, size: 0.019, color: muted },
      { text: 'Agarre y soltar', x: 0, y: -0.14, size: 0.019, color: muted },
      { text: 'Pinza fina', x: 0.3, y: -0.14, size: 0.019, color: muted },
      { text: this.app.modeHint(), x: 0, y: -0.195, size: 0.018, color: muted },
    ]);
  }
}

export class ResultsScreen extends PanelScreen {
  constructor(app, result) {
    super(app, 0.8, 0.62);
    const lines = [
      { text: result.completed ? '¡Actividad completada!' : 'Actividad terminada', size: 0.042, weight: 700, color: '#1b5e8c' },
      { text: `${ACTIVITIES[result.activity].name} · Mano ${result.handLabel.toLowerCase()} · ${result.difficultyLabel}`, size: 0.024, color: '#5d6f7f' },
      { text: ' ', size: 0.012 },
      ...result.metrics.map((m) => ({ text: `${m.label}: ${m.value}`, size: 0.027 })),
    ];
    this.panel.setContent(lines);
    this.addButton('Repetir', -0.17, -0.245, { width: 0.26, height: 0.075, color: '#27ae60' }, () => app.startActivity(result.activity));
    this.addButton('Menú', 0.17, -0.245, { width: 0.26, height: 0.075, color: '#2f80ed' }, () => app.showMenu());
  }
}
