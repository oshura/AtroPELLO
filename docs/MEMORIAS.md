# AtroPELLO — Memorias y animaciones‑cómic (plan)

> **Documento de diseño.** Planifica (a) la **página de Memorias** (tipo wiki, tiles reveladas /
> ensombrecidas) y (b) el **reproductor de animación‑cómic** (viñetas con tiempos, efectos y voces) que
> narra la historia (`docs/HISTORIA.md`) usando las viñetas B/N del pipeline (`docs/COMIC.md`).
> Respeta las reglas de `CLAUDE.md`: **el GameEngine no crece** → todo va en componentes/servicios
> nuevos; **campos persistentes vía el serializador de estado de jugador**; logging vía `LoggingService`.

---

## 1. Concepto

Una **animación‑cómic** es una secuencia de viñetas que se muestran con **tiempos, efectos y voces**
(narrador + personajes) sobre el viewport del juego. Es lo que el usuario llama "novela gráfica con
tiempos". Se disparan en el juego:

- **Intro del juego** (al empezar partida nueva): la memoria `MEM_INTRO` (El Incidente).
- **Al ganar memoria** (descansar en la estación sube `memoryPercent`, ver `HISTORIA.md §6`): se
  **revela** una memoria nueva y su animación se reproduce.
- **Reproducción manual** desde la **página de Memorias**.

Cada memoria revelada queda **guardada en la partida** para poder revisarla.

---

## 2. Modelo de datos

### 2.1 Contenido estático (definición de cada memoria) — asset/config, NO persistente
```ts
interface MemoryDefinition {
  id: string;                 // 'MEM_INTRO', 'MEM_DESPERTAR', 'MEM_ESTACION_01'...
  title: string;              // titular de la tile ("El Incidente")
  cover: string;              // ruta a la viñeta de portada (assets/comic/...)
  act: string;                // agrupación ("Prólogo", "El Despertar"...)
  order: number;              // orden en la rejilla
  unlock: MemoryUnlock;       // cómo se revela (ver 2.3)
  sequence: ComicBeat[];      // la animación en sí
}

interface ComicBeat {
  images: string[];           // 1..n viñetas del beat (varios = ángulos de cámara)
  durationMs: number;         // cuánto dura el beat
  caption?: string;           // rótulo/cartela opcional
  effects: TimedEffect[];     // efectos con su ventana temporal (ver 3)
  audio?: BeatAudio;          // voces/narrador de este beat (ver 4)
}
```

### 2.2 Estado en partida (persistente) — vía `PlayerStateSerializer`
El array de memorias reveladas es **un campo más del jugador**, hermano de `memoryPercent`:

- Tipo: añadir `revealedMemories: string[]` a **`SaveGameCharacterState`**
  (`src/app/game/types/save-game.types.ts`).
- Captura/aplicación: 2 líneas en **`PlayerStateSerializer`**
  (`persistence/player-state.serializer.ts`, junto a `memoryPercent`):
  - `captureCharacterState()` → `revealedMemories: this.gameState.getRevealedMemories()`
  - `applyCharacterState()` → `if (Array.isArray(state?.revealedMemories)) this.gameState.setRevealedMemories(...)`
- SSOT en runtime: `GameStateStore` (`game-state.store.ts`) expone
  `getRevealedMemories()/revealMemory(id)/setRevealedMemories(ids)`.

> Esto sigue la regla de persistencia: campo de jugador = tipo + par de líneas en el serializador. Nada
> se copia a mano en otros sitios.

### 2.3 Desbloqueo
```ts
type MemoryUnlock =
  | { kind: 'intro' }                          // al iniciar partida nueva
  | { kind: 'memoryPercent'; atLeast: number } // al alcanzar X% de memoria (HISTORIA §6)
  | { kind: 'event'; event: string };          // trigger explícito (p.ej. hallar hechizo en estación)
```
Un `MemoriesService` observa los triggers; cuando se cumple un `unlock`, llama a
`gameState.revealMemory(id)` (persistente) y **encola la animación** para reproducirla.

---

## 3. Reproductor y efectos (funcionalidades reutilizables)

Componente `ComicSequencePlayer` (overlay Angular a pantalla completa sobre el viewport). Reproduce una
`MemoryDefinition.sequence` como una **línea de tiempo**. Los efectos son **componibles** y se activan
por ventanas de tiempo dentro de cada beat.

### 3.1 Catálogo de efectos (los que pediste + base extensible)
```ts
type TimedEffect =
  | { type: 'fadeToBlack'; durationMs: number }         // cubre TODO en negro (default 1000)
  | { type: 'fadeFromBlack'; durationMs: number }       // de negro a imagen (default 500)
  | { type: 'fadeOut'; durationMs: number }             // imagen -> negro (default 500)
  | { type: 'fadeIn'; durationMs: number }              // negro -> imagen (default 500)
  | { type: 'appear'; durationMs: number; easing: Easing } // 0->1 con curva (p.ej. '1/x')
  | { type: 'shake'; from: number; to: number; intensity?: number } // activable/desactivable
  | { type: 'kenBurns'; from: Rect; to: Rect; durationMs: number };  // futuro: pan/zoom
```
- **fade a negro (1s)**, **aparecer de negro (0.5s)** y **transición (0.5s out + 0.5s in)** son los que
  describiste literalmente.
- **shake**: se **activa en un instante y se desactiva en otro** (`from`/`to` en ms dentro del beat).
- **appear exponencial "1/x"**: opacidad `α(p)` con `p∈[0,1]` el progreso normalizado. Ejemplo de curva
  fuerte tipo 1/x (ease‑out): `α(p) = 1 - 1 / (1 + k·p)` normalizada a `[0,1]`, o
  `α(p) = 1 - (1-p)^n` con `n` configurable. Se implementa como función `Easing` intercambiable.

### 3.2 Contrato de easing
```ts
type Easing = (p: number) => number; // p y retorno en [0,1]
const EASINGS = {
  linear:  (p) => p,
  expo:    (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),   // ease-out exponencial
  inv:     (p) => 1 - 1 / (1 + 8 * p),                        // "1/x" (k=8), normalizar al final
};
```

### 3.3 Motor
- Un `requestAnimationFrame` avanza un reloj; cada frame evalúa qué beats/efectos están activos y aplica
  opacidad/transform/clase `shake` a los elementos `<img>`.
- Respeta `prefers-reduced-motion` (sin shake/parallax; corta los fades a instantáneos si procede).
- API imperativa mínima: `player.play(memory): Promise<void>`, `player.skip()`, `player.stop()`.
- Un beat con **varias `images`** encadena micro‑transiciones (0.5s) entre ellas → sensación de
  **ángulos de cámara** casi como cine.

---

## 4. Voces y narrador
```ts
interface BeatAudio {
  narrator?: string;              // ruta a pista del narrador
  voices?: { speaker: string; clip: string; atMs?: number }[]; // voces de personajes
}
```
- Reproducción con `HTMLAudioElement`/Web Audio, sincronizada al inicio del beat (o `atMs`).
- El **texto** (cartelas/bocadillos) se superpone como HTML (no va quemado en la imagen; ver
  `COMIC.md §5`). Alineado con las voces.
- La duración del beat puede derivarse de la pista de audio (si `durationMs` no se fija).

---

## 5. Página de Memorias (tipo wiki)

- **Ruta `/memorias`** (hermana de `/wiki`). Igual que la wiki, **auto‑pausa el juego** al entrar
  (patrón ya existente en `components/game/game.ts`, `router.events` + `startsWith('/wiki')`; se añade
  `/memorias`). *(Si se quiere pestaña de navegador real, `window.open('/memorias')`; recomiendo ruta
  interna para compartir estado de partida.)*
- **Rejilla de tiles** generada de `MemoryDefinition[]`:
  - **No revelada** → tile **ensombrecida**: silueta/tinta oscurecida + candado + título oculto ("???").
  - **Revelada** (`id ∈ revealedMemories`) → tile con **portada** (`cover`, viñeta del cómic) + **título**.
    Al pulsar → `ComicSequencePlayer.play(memory)` (revisión).
- Componente `MemoriesPage` + `MemoryTile`. Datos desde `MemoriesService` (definiciones + estado).

---

## 6. Catálogo inicial de memorias (desde HISTORIA.md)

| id | Título | Act | Unlock | Beats (viñetas ya generadas) |
|----|--------|-----|--------|------------------------------|
| `MEM_INTRO` | El Incidente | Prólogo | `intro` | P1, P2, P3, P4, P5 |
| `MEM_DESPERTAR` | El Despertar | Prólogo | `intro` (tras MEM_INTRO) | D1, D2, D3 |
| `MEM_ESTACION_01` | La estación herida | Estación | `event: dock_human_station` | *(por generar §5)* |
| `MEM_RECUERDO_01…` | Recuerdos | Recuerdos | `memoryPercent: ≥X` | *(por generar §6, sepia)* |

Las viñetas viven en `src/app/assets/comic/` (export B/N del pipeline `D:\Olles\Comic\output`).

### Ejemplo de secuencia (`MEM_INTRO`, resumido)
```jsonc
{ "id": "MEM_INTRO", "title": "El Incidente", "cover": "assets/comic/P1.jpg", "act": "Prólogo",
  "unlock": { "kind": "intro" },
  "sequence": [
    { "images": ["assets/comic/P1.jpg"], "durationMs": 4000,
      "effects": [ {"type":"fadeToBlack","durationMs":1000}, {"type":"fadeFromBlack","durationMs":500} ],
      "caption": "Harvey Walters roba una nave de vacío…",
      "audio": { "narrator": "assets/audio/mem_intro/01.mp3" } },
    { "images": ["assets/comic/P3.jpg"], "durationMs": 3500,
      "effects": [ {"type":"fadeOut","durationMs":500}, {"type":"fadeIn","durationMs":500},
                   {"type":"shake","from":800,"to":2000,"intensity":6} ],
      "caption": "La Tierra se parte en dos." }
  ] }
```

---

## 7. Encaje con la arquitectura (CLAUDE.md)

- **GameEngine NO crece**: todo en piezas nuevas → `MemoriesService`, `ComicSequencePlayer` (componente),
  `MemoriesPage`/`MemoryTile` (ruta `/memorias`), `memory-catalog` (config de `MemoryDefinition[]`).
- **Persistencia**: `revealedMemories` en `SaveGameCharacterState` + 2 líneas en `PlayerStateSerializer`
  (patrón `memoryPercent`). SSOT en `GameStateStore`.
- **Trigger de intro/ganar‑memoria**: engancha en el flujo existente de `memoryPercent` (descanso en
  estación, `HISTORIA.md §6`) vía `MemoriesService`, sin meter lógica en el engine.
- **Assets**: viñetas B/N + audios en `src/app/assets/comic|audio/`.
- Logging con `LoggingService`/`LogCategory`; sin `console.*`. Ficheros nuevos ≤ 400 líneas.

---

## 8. Fases

1. **Datos + persistencia**: `revealedMemories` (tipo + serializador + store). Test de round‑trip
   (savegame-harness).
2. **Reproductor**: `ComicSequencePlayer` con fade a negro / fade in‑out / shake / appear(easing). Sin
   audio aún. Efectos unitarios probados.
3. **Página `/memorias`**: rejilla de tiles reveladas/ensombrecidas + auto‑pausa (patrón wiki).
4. **Triggers**: intro al empezar partida; revelar al subir `memoryPercent`.
5. **Voces/narrador**: `BeatAudio` sincronizado.
6. **Contenido**: cargar `MEM_INTRO` + `MEM_DESPERTAR` con las viñetas ya generadas; luego Estación y
   Recuerdos según se produzcan (`COMIC.md §6`).
