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
  - `sfx_thruster.wav` (3s, motor continuo mono)
  - `sfx_passby.wav` (1.5s, barrido tipo whoosh mono)
  - `ui_select.wav` (0.25s, click corto mono)
  - `sfx_spell_chant.wav` (2s, dron preparatorio)
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

Si usas el manifiesto `_manifest.json`, puedes mapear nombres lógicos a rutas y cargarlos al inicio con el `AudioEngineService`:

```ts
import manifest from '/assets/audio/_manifest.json';

await audio.load('sfx_thruster', manifest.sfx_thruster);
await audio.load('music_explore_a', manifest.music_explore_a);
// ...
```

El motor ya reproduce `sfx_thruster` y música de escena (`music_*`) cuando inicias la partida.

## Consejos de mezcla

- Volúmenes tentativos por bus: music 0.6, sfx 1.0, voice 1.0, ui 0.9.
- Usa ducking de música durante voz/narrador (`MusicDirectorService.duckMusic`).
- Para doppler, usa SFX cortos (<2 s) con ataque rápido.
