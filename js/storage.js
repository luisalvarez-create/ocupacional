// Historial de resultados guardado localmente en el navegador.

const KEY = 'ot-xr-results';

export function getResults() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveResult(result) {
  const results = getResults();
  results.push(result);
  try {
    localStorage.setItem(KEY, JSON.stringify(results));
  } catch {
    // Almacenamiento no disponible: el resultado solo se muestra en pantalla.
  }
}

export function clearResults() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCSV() {
  const header = ['fecha', 'paciente', 'actividad', 'mano', 'dificultad', 'modo', 'duracion_s', 'puntuacion', 'completada', 'detalle'];
  const rows = getResults().map((r) => [
    new Date(r.date).toLocaleString('es-MX'),
    r.patient,
    r.activityName,
    r.handLabel,
    r.difficultyLabel,
    r.mode,
    r.durationSec,
    r.score,
    r.completed ? 'sí' : 'no',
    r.metrics.map((m) => `${m.label}: ${m.value}`).join(' | '),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  // BOM para que Excel reconozca los acentos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resultados_terapia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
