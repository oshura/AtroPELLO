# Guía de assets de audio (placeholders y grabación)

Este proyecto usa Web Audio API nativo. Organizamos el audio en buses (music/sfx/voice/ui) y cargamos ficheros por nombre lógico según un manifiesto.

## Dónde van los ficheros

- Carpeta de publicación: `public/assets/audio`
- Manifiesto de rutas: `public/assets/audio/_manifest.json` (nombre lógico → ruta)
- Script para generar maquetas (WAV): `scripts/audio/generate-placeholders.ps1`

## Generar maquetas (Windows PowerShell)

Ejecuta el script para crear WAVs de prueba reproducibles por el motor de audio:

```powershell
# Desde la raíz del repo
powershell -ExecutionPolicy Bypass -File .\scripts\audio\generate-placeholders.ps1
# ó con pwsh
pwsh -File .\scripts\audio\generate-placeholders.ps1
```

Esto crea los siguientes ficheros:

- SFX
  - `sfx_thruster.wav` (loop espacial clásico, grave, mapeado como `sfx_thruster`)
  - `Airthrust.wav` (loop atmosférico mono para el thruster, mapeado como `sfx_thruster_atmo`)
  - `Landing.wav` (1.1s, swell cinematográfico usado en el cue `sfx_autoland_touchdown`)
  - `sfx_passby.wav` (1.5s, barrido tipo whoosh mono)
  - `sfx_passby_air.wav` (1.2s, estela de aire previa al stall)
  - `ui_select.wav` (0.25s, click corto mono)
  - `sfx_spell_chant.wav` (2s, dron preparatorio)
  - `sfx_stall.wav` (loop 2s, sirena de pérdida de sustentación)
- VOZ
  - `voice_narrator_sample.wav` (3s, dron placeholder)
- MÚSICA
  - `music_menu.wav` (12s, acorde mayor simple)
  - `music_explore_a.wav` (15s, dron grave)
  - `music_planet.wav` (15s, acorde medio)
  - `music_combat.wav` (12s, barrido energético)
  - `music_spell_prep.wav` (6s, dron bajo)
  - `music_landing.wav` (10s, acorde cálido)

Puedes reemplazar cualquiera de estos ficheros por tus propias grabaciones.

## Recomendaciones de formato

- Música: OGG o MP3 (44.1/48 kHz, estéreo). WAV también es válido durante desarrollo.
- SFX posicionales: WAV/OGG en mono (mejor para panning 3D).
- Normaliza picos a -1 dBFS y evita recortes. Exporta a 44.1 kHz si no necesitas 48 kHz.
- Bucle (loop): usa inicio/fin limpios; si exportas WAV, deja un cero en ambos extremos para evitar clicks.

## Grabación casera rápida (para reemplazar placeholders)

- Thruster: soplo constante en el micrófono a ~20–30 cm; filtra graves o recorta con un HPF (~80 Hz).
- Pass-by: mueve un objeto ruidoso (papel, tela) rápido frente al micro para un whoosh corto.
- UI click: chasquido de lengua o click de bolígrafo muy suave.
- Cántico (pre-cast): tarareo grave y sostenido de ~2 s.
- Narrador: frase corta (3–5 s), en un entorno silencioso; distancia ~15–20 cm, pop-filter si es posible.
- Música: un pad o acorde tocado en instrumento virtual o sintetizador sencillo.

## Carga en el juego

El sistema usa un manifiesto JSON (`src/app/assets/audio/_manifest.json`) que mapea nombres lógicos a rutas de archivos. 

### ✅ Checklist rápido para añadir un nuevo sonido

1. **Coloca el archivo** en `public/assets/audio/` (ej: `select-glifo.wav`)
2. **Registra en manifiesto** (`src/app/assets/audio/_manifest.json`):
   ```json
   "ui_select_glyph": "/assets/audio/select-glifo.wav"
   ```
3. **Pasa AudioEngineService** al componente/clase que dispara el evento
4. **Reproduce** en el método del evento:
   ```typescript
   this.audio.play('ui_select_glyph', { volume: 0.6, bus: 'ui' });
   ```

📖 **Proceso completo documentado en:** `Audio_Sistema_Arquitectura.md` → sección "PROCESO COMPLETO: Añadir un nuevo sonido"

### Carga programática (avanzado)

Si usas el manifiesto `_manifest.json`, puedes mapear nombres lógicos a rutas y cargarlos al inicio con el `AudioEngineService`:

```ts
import manifest from '/assets/audio/_manifest.json';

await audio.load('sfx_thruster', manifest.sfx_thruster);
await audio.load('music_explore_a', manifest.music_explore_a);
// ...
```

El motor ya reproduce `sfx_thruster` y música de escena (`music_*`) cuando inicias la partida.

## Alertas atmosféricas (dic 2025)

- `sfx_passby_air` sirve como cue previo al stall cuando el modo atmosférico detecta velocidad crítica; se reproduce en loop suave (bus `sfx`, volumen 0.4) y se corta automáticamente al recuperar velocidad o al entrar al stall real.
- `sfx_stall` es el loop principal de emergencia. Se dispara al entrar en stall, reemplaza el cue anterior y mantiene activo el borde rojo brillante de la brújula hasta que la nave recupera sustentación o aterriza.
- `Landing.wav` registrado como `sfx_autoland_touchdown` se dispara junto a la cámara bloqueada y el burst de polvo al realizar un auto-landing suave; si el clip no está disponible, el motor vuelve a `sfx_collision_light`/`sfx_passby_air` como respaldo.
- `sfx_thruster` vs `sfx_thruster_atmo`: el `GameEngine` alterna automáticamente el loop base (`sfx_thruster.wav`) y el loop atmosférico (`Airthrust.wav`) al entrar/salir de la escena atmosférica mediante `requestThrusterClip()`, manteniendo el mismo controlador de aceleración.
- Todos estos cues atmosféricos residen en `src/app/assets/audio/` y se precargan desde el manifiesto, por lo que basta con invocar `audio.play('sfx_passby_air', ...)`, `audio.play('sfx_stall', ...)`, `audio.play('sfx_autoland_touchdown', ...)` o dejar que el controlador de thruster resuelva el loop correspondiente.

## Consejos de mezcla

- Volúmenes tentativos por bus: music 0.6, sfx 1.0, voice 1.0, ui 0.9.
- Usa ducking de música durante voz/narrador (`MusicDirectorService.duckMusic`).
- Para doppler, usa SFX cortos (<2 s) con ataque rápido.
