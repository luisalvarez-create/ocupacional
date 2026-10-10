# Terapia Ocupacional XR

Juego de terapia ocupacional para rehabilitación de miembro superior, hecho con **WebXR** y **Three.js**.
Funciona en el navegador, sin instalar nada:

| Modo | Dispositivo | Interacción |
| --- | --- | --- |
| 🥽 **VR** | Meta Quest 2 / 3 / 3S / Pro (navegador Meta Quest Browser) | Seguimiento de manos nativo (tocar con el índice, pellizcar) o controles (gatillo / botón lateral) |
| 📷 **Cámara (MediaPipe)** | PC, laptop o tablet con cámara web | Seguimiento de manos con MediaPipe Hand Landmarker: pellizco para agarrar/pulsar; acercar la mano a la cámara = alcanzar más lejos |
| 🖱️ **Ratón** | Cualquier computadora | Clic para pulsar, arrastrar para mover objetos (útil para que el terapeuta pruebe) |

## Actividades

1. **Alcance** – Toca esferas que aparecen alrededor del hombro. Trabaja rango de movimiento de hombro y codo, coordinación ojo‑mano y tiempo de reacción. En modo *Ambas*, las esferas azules son para la mano izquierda y las naranjas para la derecha (coordinación bilateral).
2. **Clasificar objetos** – Toma objetos de la mesa y suéltalos en la caja del mismo color y forma. Trabaja agarre, transporte, liberación, planeación motora y atención. La forma acompaña al color para pacientes con dificultades de visión de color.
3. **Tablero de clavijas** – Coloca 9 clavijas en el tablero usando pinza fina y después regrésalas a la bandeja (inspirado en la *Nine‑Hole Peg Test*). La bandeja se coloca del lado de la mano evaluada.

Opciones configurables (en el panel web o dentro de VR): mano a trabajar (derecha, izquierda, ambas), dificultad (tamaño de objetos, distancias, tolerancia), duración máxima y altura de la mesa.
El juego **calibra automáticamente** la altura de la cabeza al iniciar cada actividad, por lo que funciona sentado o de pie; el botón *Recentrar* vuelve a colocar todo frente al paciente.

## Resultados

Al terminar cada actividad se muestra un resumen y se guarda en el historial del dispositivo (almacenamiento local del navegador): aciertos, errores, tiempos de reacción, alcance máximo en cm, tiempo de colocación/retiro de clavijas, objetos caídos, etc.
Desde el panel web se puede **exportar a CSV** (compatible con Excel).

> Esta aplicación es una herramienta de apoyo para la práctica terapéutica y no sustituye una evaluación clínica estandarizada.

## Cómo usarlo en Meta Quest

WebXR y la cámara requieren **HTTPS**. La forma más fácil es publicarlo con GitHub Pages:

1. En GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. Al hacer *merge* a `main`, el flujo `.github/workflows/pages.yml` publica el sitio en `https://<usuario>.github.io/ocupacional/`.
3. En los lentes, abre esa dirección en **Meta Quest Browser** y pulsa **Entrar en VR**.
4. Para usar las manos sin controles: activa *Configuración → Movimiento → Seguimiento de manos* en el Quest y deja los controles a un lado.

### Probar en tu computadora

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

`localhost` cuenta como contexto seguro, así que los modos cámara y ratón funcionan.
Para probar en el Quest conectado por USB sin publicar: `adb reverse tcp:8080 tcp:8080` y abre `http://localhost:8080` en el navegador del Quest.
También puedes usar el emulador [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) en Chrome para simular el Quest.

## Estructura

```
index.html              Panel web (configuración, historial) + importmap de Three.js
css/styles.css
js/main.js              Escena, modos (VR / cámara / ratón) y flujo de pantallas
js/input.js             Entrada unificada: manos y controles WebXR, MediaPipe y ratón
js/mediapipe.js         Cámara web + MediaPipe Hand Landmarker (se carga bajo demanda)
js/ui3d.js              Paneles y botones 3D (se pulsan tocando, pellizcando o con clic)
js/screens.js           Menú y pantalla de resultados dentro de la escena
js/environment.js       Sala y mesa ajustable
js/effects.js           Partículas de retroalimentación
js/audio.js             Sonidos (WebAudio) y voz guía (speechSynthesis)
js/storage.js           Historial local y exportación CSV
js/activities/          Alcance, Clasificar objetos y Tablero de clavijas
```

No requiere compilación: las librerías (Three.js 0.170 y MediaPipe tasks‑vision 0.10.14) se cargan desde jsDelivr.

### Agregar una actividad nueva

Crea una clase que extienda `BaseActivity` (`js/activities/base.js`) con `start()`, `update(dt, hands)` y `buildResult(completed)`, regístrala en `ACTIVITY_CLASSES` (`js/main.js`) y en `ACTIVITIES` (`js/settings.js`), y añade su botón en `MenuScreen` (`js/screens.js`).
Cada mano (`hands`) expone `local` (punta del índice), `grabLocal` (punto de pellizco), `pinching`, `justPressed`, `justReleased`, `handedness` y `type`, sin importar si viene de WebXR, MediaPipe o el ratón.
