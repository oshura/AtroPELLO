# AtroPELLO — Guía operativa

Juego 3D de naves lovecraftiano. **Angular 20 + WebGL2 propio (sin three.js, solo gl-matrix). 100 % navegador.**

## Comandos
- `npm start` — dev server (ng serve)
- `npm run build` — build de producción (debe quedar verde antes de cualquier merge)
- `npm test` — Karma/Jasmine (usar `ng test --watch=false --browsers=ChromeHeadless` para una pasada)

## Documento de arquitectura
**Lee `docs/ARQUITECTURA.md` antes de tocar snapshots, persistencia, terreno o el motor.**
Contiene el análisis completo, la arquitectura objetivo y el plan por fases. Toda tarea debe
referenciar una fase de ese plan; si lo contradices, actualiza el documento primero.

## Reglas duras (no negociables)
1. **`src/app/game/GameEngine.ts` (15k+ líneas) NO crece.** Funcionalidad nueva → servicio/sistema
   externo que el engine invoca. Solo se aceptan diffs que reduzcan sus líneas.
2. **Campos persistentes solo via códecs.** Los campos de planeta se capturan/aplican ÚNICAMENTE en
   `src/app/game/services/game/planet-state.codec.ts`. Añadir un campo persistente = tipo + 2 líneas
   en el códec. Si te ves copiando campos a mano en serializadores, para: estás duplicando.
3. **El terreno tiene una sola fuente**: `src/app/game/atmosphere/terrain-sampler.ts` (ruido con
   semilla + muestreo exacto contra la malla). Prohibido escribir fórmulas de altura de terreno en
   cualquier otro fichero (incluido `AtmosphereSceneManager`).
4. **Nada de `(x as any)` para acceder a internos del engine** desde servicios. Exponer método
   tipado o bajar el dato a `GameStateStore`.
5. Logging via `LoggingService`/`GameLogger` con `LogCategory`; prohibido `console.*`.
6. Ficheros nuevos ≤ 400 líneas; sin `any` nuevos; `Math.random()` solo para FX sin estado
   (lo procedural usa semillas persistidas).

## Mapa rápido
- Motor/loop/render: `src/app/game/GameEngine.ts` (god object en descomposición, ver plan Fase 5)
- Estado central: `src/app/services/game/game-state.store.ts` (SSOT de colecciones del mundo)
- Snapshots de sistemas: tipos en `game/types/solar-system.types.ts`; captura en
  `game/services/game/solar-system-runtime-serializer.service.ts`; almacén por label en
  `portal-persistence.service.ts`; aplicación en `GameEngine.applySolarSystemSnapshot`
- Savegames (Cloud Saves): `services/game/game-persistence.service.ts` + `services/game/persistence/*`
- Respawn/muerte: `game/services/state/respawn.service.ts` + `universe-state-snapshot.service.ts`
- Aterrizaje/atmósfera: `game/atmosphere/*` + métodos `*Atmosphere*` del engine
- Hechizos: `game/types/spell.types.ts`, paneles en `game/hud/GrimoirePanel.ts`

## Idioma
El equipo trabaja en español; identificadores de código en inglés. Mantén el idioma del fichero en comentarios.
