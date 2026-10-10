// Efectos de sonido sintetizados con WebAudio y voz guía opcional.

export class AudioFX {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
  }

  // Debe llamarse desde un gesto del usuario (clic) para habilitar el audio.
  ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  tone(freq, duration, { type = 'sine', gain = 0.18, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  click() { this.tone(1100, 0.05, { type: 'square', gain: 0.05 }); }
  grab() { this.tone(520, 0.07, { type: 'triangle', gain: 0.1 }); }
  success() {
    this.tone(660, 0.12);
    this.tone(990, 0.2, { delay: 0.09 });
  }
  error() { this.tone(200, 0.3, { type: 'triangle', gain: 0.16 }); }
  miss() { this.tone(330, 0.15, { type: 'sine', gain: 0.08 }); }
  drop() { this.tone(150, 0.12, { type: 'sine', gain: 0.12 }); }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { delay: i * 0.12 }));
  }

  speak(text) {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-MX';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch {
      // La voz es opcional.
    }
  }
}
