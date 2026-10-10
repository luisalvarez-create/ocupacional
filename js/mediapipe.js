// Seguimiento de manos con cámara web usando MediaPipe Hand Landmarker (tasks-vision).
// Se carga bajo demanda solo cuando se elige el modo "cámara".

const VERSION = '0.10.14';
const LIB_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
export { CONNECTIONS as HAND_CONNECTIONS };

export class MediaPipeTracker {
  constructor(video, overlay, statusEl) {
    this.video = video;
    this.overlay = overlay;
    this.statusEl = statusEl;
    this.landmarker = null;
    this.stream = null;
    this.result = null;
    this.lastVideoTime = -1;
    this.running = false;
  }

  get aspect() {
    return this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 4 / 3;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  async start() {
    this.setStatus('Solicitando cámara…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.landmarker) {
      this.setStatus('Cargando modelo de MediaPipe…');
      const { FilesetResolver, HandLandmarker } = await import(LIB_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
      } catch {
        this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
      }
    }
    this.running = true;
    this.setStatus('Muestra tus manos a la cámara');
  }

  stop() {
    this.running = false;
    this.result = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  // Llamar una vez por cuadro; devuelve el último resultado disponible.
  update() {
    if (!this.running || !this.landmarker || this.video.readyState < 2) return this.result;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      try {
        this.result = this.landmarker.detectForVideo(this.video, performance.now());
      } catch {
        // Un cuadro fallido no detiene el juego.
      }
      this.draw();
      const n = this.result?.landmarks?.length ?? 0;
      this.setStatus(n ? `Manos detectadas: ${n}` : 'Muestra tus manos a la cámara');
    }
    return this.result;
  }

  draw() {
    const c = this.overlay;
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (const lms of this.result?.landmarks ?? []) {
      ctx.strokeStyle = '#7CFC9A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(lms[a].x * w, lms[a].y * h);
        ctx.lineTo(lms[b].x * w, lms[b].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of lms) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
