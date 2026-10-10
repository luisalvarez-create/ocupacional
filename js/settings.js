// Configuración compartida entre el panel HTML y el menú dentro de VR.

const KEY = 'ot-xr-settings';

export const ACTIVITIES = {
  reach: {
    name: 'Alcance',
    goal: 'Rango de movimiento de hombro y brazo, coordinación ojo-mano y tiempo de reacción.',
    instructions: 'Toca cada esfera con la mano indicada. Las azules son para la mano izquierda y las naranjas para la derecha.',
  },
  sorting: {
    name: 'Clasificar objetos',
    goal: 'Agarre, transporte y liberación de objetos; planeación motora y atención.',
    instructions: 'Toma cada objeto y suéltalo dentro de la caja del mismo color y forma.',
  },
  pegboard: {
    name: 'Tablero de clavijas',
    goal: 'Destreza manual fina y pinza (inspirado en la prueba de 9 clavijas).',
    instructions: 'Toma las clavijas con pinza y colócalas en los agujeros. Al terminar, regrésalas a la bandeja.',
  },
};

export const HAND_OPTIONS = [
  { value: 'right', label: 'Derecha' },
  { value: 'left', label: 'Izquierda' },
  { value: 'both', label: 'Ambas' },
];

export const DIFFICULTY_OPTIONS = [
  { value: 1, label: 'Fácil' },
  { value: 2, label: 'Media' },
  { value: 3, label: 'Difícil' },
];

export const DURATION_OPTIONS = [60, 90, 120, 180, 300].map((value) => ({ value, label: formatTime(value) }));

export const TABLE_OFFSET_OPTIONS = [-0.1, -0.05, 0, 0.05, 0.1].map((value) => ({
  value,
  label: `${value > 0 ? '+' : ''}${Math.round(value * 100)} cm`,
}));

const DEFAULTS = {
  patient: '',
  activity: 'reach',
  hand: 'right',
  difficulty: 1,
  duration: 90,
  tableOffset: 0,
  voice: true,
};

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Almacenamiento no disponible (modo privado): se ignora.
  }
}

export function labelOf(options, value) {
  return options.find((o) => o.value === value)?.label ?? String(value);
}

export function nextValue(options, value) {
  const i = options.findIndex((o) => o.value === value);
  return options[(i + 1) % options.length].value;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
