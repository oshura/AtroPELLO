# Arquitectura del sistema de Audio y Música

Esta guía documenta cómo está organizado el audio del juego para que puedas añadir músicas, efectos, narraciones y extender servicios sin romper nada. Cubre responsabilidades, ciclo de vida, APIs y recetas comunes.

## Visión global

- Motor: Web Audio API nativo (sin dependencias)
- Buses: master, music, sfx, voice, ui (mezcla básica y ducking)
- Servicios clave:
  - `AudioEngineService` — núcleo de E/S, mezcla, reproducción, panner 3D, listener
  - `MusicDirectorService` — selección de escena musical, crossfades, ducking temporal
- Integración runtime: `GameEngine` actualiza la pose del oyente y controla sonido continuo (thruster), desbloquea audio al iniciar partida y dispara música de escena.

## Componentes y responsabilidades

### AudioEngineService (`src/app/services/audio/audio-engine.service.ts`)

Contrato principal:
- Inicialización y desbloqueo (políticas autoplay):
  - `ensureContext()` crea el `AudioContext` y buses
  - `unlock()` debe llamarse tras un gesto del usuario (Space/click)
- Carga y decodificación:
  - `load(name, url)` → guarda `AudioBuffer` en memoria
  - Se sugiere usar el manifiesto `public/assets/audio/_manifest.json`
- Reproducción:
  - `play(name, opts)` → devuelve `PlayingHandle | null`
  - `opts` relevantes:
    - `loop`, `volume`, `playbackRate`/`detune`
    - `bus`: 'music' | 'sfx' | 'voice' | 'ui'
    - `position` + `rolloff` (posicional 3D con `PannerNode`)
- Control de reproducción (handle):
  - `stop(fadeOutMs?)`, `setVolume(v)`, `setPlaybackRate(r)`, `setDetune(cents)`, `setPosition(x,y,z)`, `setRolloff(cfg)`, `isPlaying()`
- Oyente/escucha (listener):
  - `setListenerPose(pos, fwd, up)` — sincronizado con la cámara activa
- Utilidades incluidas:
  - `createThrusterController(soundName)` — loop continuo con volumen/tono vs velocidad/estado
  - `createDopplerCue({...})` — efecto Doppler simple para pasadas cercanas (<~50u)

Errores y edge cases:
- En SSR o sin `AudioContext` no hace nada (comprobación `isPlatformBrowser`)
- `play(...)` devuelve `null` si el búfer no está cargado; el sistema tolera este caso (warning en consola)

### MusicDirectorService (`src/app/services/audio/music-director.service.ts`)

- Mapea escenas lógicas → primera pista de una librería simple (`library: Record<MusicScene, TrackDef[]>`)
- Cambios de escena:
  - `setScene(scene, fadeMs)` hace crossfade lineal entre `current` y `next`
- Ducking temporal (voz/narrador):
  - `duckMusic(amount, durationMs)` baja la ganancia del bus 'music' y la restaura

Extensión típica:
- Añade más pistas a cada escena (rotación/aleatoriedad), mejores curvas de fade, playlists por cola

### Integración en GameEngine (`src/app/game/GameEngine.ts`)

- Inyección opcional de audio y música desde `GameInitializer`
- `enableAudio()`:
  - Llama `audio.ensureContext() + unlock()` tras gesto del usuario
  - Arranca música de "exploration" (por defecto) y precalienta loop del thruster en silencio
- En `update(...)` por frame:
  - `setListenerPose(camera.position, camera.forward, camera.up)`
  - Actualiza thruster: estado → volumen/tono (acelerando/frenando/crucero/idle)

### Ciclo de vida y desbloqueo

1) El usuario inicia partida (Space/click) → `Game.startGame()`
2) Llama `GameEngine.start()` y `GameEngine.enableAudio()`
3) Contexto se reanuda y música de escena entra con fade-in

## Flujo de assets

- Ubicación: `public/assets/audio`
- Manifiesto: `public/assets/audio/_manifest.json` (nombre lógico → ruta)
- Generador de maquetas WAV: `scripts/audio/generate-placeholders.ps1`
- Guía de assets: `documentacion/Audio_Assets_Guia.md`

## Recetas comunes

### Añadir un SFX 3D (p. ej. "scanner_ping")

1) Exporta/pon el archivo en `public/assets/audio` y añade entrada al manifiesto:
```json
{
  "scanner_ping": "/assets/audio/scanner_ping.wav"
}
```
2) Carga al arrancar (tras `ensureContext`):
```ts
await audio.load('scanner_ping', manifest.scanner_ping);
```
3) Reproduce con panner 3D:
```ts
const h = audio.play('scanner_ping', {
  bus: 'sfx', volume: 0.7,
  position: { x, y, z },
  rolloff: { distanceModel: 'inverse', refDistance: 8, maxDistance: 200, rolloffFactor: 2 }
});
```
4) Si el emisor se mueve, actualiza `h.setPosition(...)` cada frame.

Consejo: SFX posicionales en mono para mejor espacialización.

### Añadir un SFX UI (no posicional)
```ts
audio.play('ui_select', { bus: 'ui', volume: 0.5 });
```

### Añadir narración y ducking de música
```ts
const voice = audio.play('voice_narrator_sample', { bus: 'voice', volume: 0.9 });
music.duckMusic(0.5, 2500); // -50% música durante ~2.5s
```

### Añadir música de escena

Opción A — usando `MusicDirectorService`:
```ts
await music.setScene('combat', 1500); // crossfade 1.5s
```
Opción B — directo al bus 'music':
```ts
const loop = audio.play('music_planet', { bus: 'music', loop: true, volume: 0.6 });
// ...más tarde
loop?.stop(800);
```

### Loop continuo con modulación (thruster-like)
```ts
const thr = audio.createThrusterController('sfx_thruster');
thr.start(0.0);
// en update
thr.update(speed/maxSpeed, isAccelerating ? 1 : 0);
// al parar
thr.stop(150);
```

## Extensión del sistema

- Nuevos buses: añade entrada en `AudioBus` y crea `GainNode` en `ensureContext()`; encadénalo a `master`.
- Efectos por bus: inserta nodos (EQ, compresor) entre cada bus y `master`.
- Limitar concurrencia: mantén un registro por nombre y evita solapamientos (ej. UI click).
- Streaming/medios largos: preferible OGG/MP3; si el tamaño es grande, considera precarga selectiva y caché LRU.
- Métricas: añade medidores (RMS/peak) o logs por bus para depurar mezcla.
- Pausa global: añade `pauseAll/resumeAll` memorizando `playbackRate/gain`.

## Testing y troubleshooting

- ¿No suena nada? Asegúrate de que `enableAudio()` se llamó tras gesto del usuario y que el contexto está `running`.
- ¿Buffer no encontrado? Ver warning en consola, comprueba que llamaste `audio.load(name, url)` y la ruta existe.
- ¿Clicks al loopear? Reexporta el audio con puntos de loop limpios o añade un breve fade-in/out.
- ¿Posicional raro? Usa mono; revisa `refDistance`/`rolloffFactor`.

## Referencia rápida de APIs

- AudioEngineService
  - `ensureContext(): void`
  - `unlock(): Promise<boolean>`
  - `load(name: string, url: string): Promise<void>`
  - `play(name: string, opts: { loop?: boolean; volume?: number; playbackRate?: number; detune?: number; position?: {x,y,z}; rolloff?: { distanceModel?: DistanceModelType; refDistance?: number; maxDistance?: number; rolloffFactor?: number }; bus?: 'music'|'sfx'|'voice'|'ui'; fadeInMs?: number }): PlayingHandle | null`
  - `setListenerPose(pos, fwd, up): void`
  - `createThrusterController(name: string)`
  - `createDopplerCue(params)`
- MusicDirectorService
  - `setScene(scene: 'menu'|'exploration'|'planet_approach'|'combat'|'spell_prep'|'landing'|'silence', fadeMs?: number): Promise<void>`
  - `duckMusic(amount?: number, durationMs?: number): void`

## Roadmap sugerido

- Crossfades con curvas exponenciales + sidechain compresión para VO
- Playlists por escena con aleatoriedad ponderada
- Persistencia de volúmenes por bus (settings de usuario)
- Eventos de juego → pistas reactivas (stingers, transiciones por estados)
