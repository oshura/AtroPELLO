# Plan — Desembarco al juego 2D ("Bajar de la nave") y vuelta

> **Plan vivo** (2026-07-25, ANALIZADO — nada implementado). Contraparte AtroPELLO del spinoff
> tile 2D "The Old and Only One" (motor ReTimeline). El plan del lado 2D — motor, mundos,
> personajes por juego, entrada/salida — es **`D:\Olles\ReTimeline\docs\PLAN-OLDONE.md`**;
> el **contrato de códigos `entry` es CANÓNICO allí (§4)**. Mantener ambos al día.

## 1. Concepto

En cada **aterrizaje/atraque** del 3D, además de los menús actuales (Descanso / Exploración /
Diplomacia — **se quedan tal cual**), TODOS los forms de aterrizado ganan un botón
**"Bajar de la nave"**: abre el juego 2D de tiles en el mundo que corresponde al sitio
(interior de la nave, estación toroide, bioma del planeta, guarida). El jugador pasea a pie como
astronauta (Harvey), y **vuelve al 3D reentrando en la nave** dentro del 2D.

## 2. Análisis técnico

- **Login transparente**: el 2D vive en `r-menace.atropello-games.es` y valida el ID Token de la
  cookie compartida `atropello-session` (dominio `.atropello-games.es`) → mismo usuario, sin
  pantalla de login. El 2D asocia a la cuenta UN personaje POR JUEGO (segregación en su BD).
- **Salto (v1 = NUEVA PESTAÑA)**: `window.open('https://r-menace.atropello-games.es/oldone.html?entry='+code)`.
  El 3D queda vivo en su pestaña, aparcado en el panel de aterrizaje (input ya bloqueado por la
  secuencia) → **no hace falta guardar/restaurar estado**, no se toca la persistencia.
- **Vuelta (v1)**: dentro del 2D, pisar la compuerta de la nave dispara la salida y su pestaña
  **se cierra sola** (`window.close()` es válido porque la abrió un `window.open` nuestro); el
  jugador cae de vuelta a la pestaña del 3D exactamente donde estaba. El 2D implementa un
  fallback (redirect a URL de retorno) para pestañas abiertas a mano.
- **v2 opcional (misma pestaña)**: si algún día se quiere sin pestañas: guardar partida ANTES de
  navegar (`game-persistence.service` / Cloud Saves) + volver con `?resume=landing` que restaure
  el estado aterrizado. Más fricción (save/restore) — solo si la UX de pestañas molesta.
- **Reglas CLAUDE.md respetadas**: el botón vive en los componentes Angular del panel
  (`LandingPanelComponent` / `LandingMenuComponent`), no en `GameEngine.ts`; el mapeo es un
  servicio/función pura nueva (fichero ≤400 líneas); logging via `LoggingService`.

## 3. Mapeo sitio → `entry` (contrato)

Función pura `landingContextToEntryCode(ctx): string | null` (servicio nuevo, testeable):

| Contexto de aterrizaje | `entry` |
|---|---|
| Atraque en la estación humana | `estacion-humana` |
| Touchdown en planeta | `planeta-<bioma>` (del terreno/tipo del planeta) |
| Sitio de historia (guaridas) | `guarida-<n>` |
| Sin mapeo (sitio sin mundo 2D) | `null` → el botón NO se muestra |

La lista canónica vive en `ReTimeline/docs/PLAN-OLDONE.md §4` (y en runtime, en la tabla
`defs.ENTRY_POINTS` del 2D). **Código nuevo = PR en los dos repos** (fila allí + case aquí).

## 4. Checklist

- [ ] `DisembarkService` (o similar): `landingContextToEntryCode()` + `openTileGame(code)`
      (`window.open` con la URL del contrato) + tests unitarios del mapeo
- [ ] Botón **"Bajar de la nave"** en `LandingPanelComponent` (header o footer contextual),
      visible en TODAS las pestañas del panel cuando hay mapeo; menús actuales intactos
- [ ] Copy/estilo lovecraftiano del botón + entrada en la bitácora del panel al desembarcar
- [ ] Wiki/docs: actualizar `Sistema_Landing_Narrativa.md` (nueva acción del panel)
- [ ] (v2 opcional) same-tab: save antes de navegar + `?resume=landing`
- [ ] Coordinar despliegue SOLO cuando cambie el contrato de códigos (el 2D se despliega solo)

## 5. Bitácora

- **2026-07-25** — Plan creado (análisis, sin implementación). Decisiones: v1 en nueva pestaña
  (sin save/restore), vuelta por cierre de pestaña desde el 2D (con fallback redirect), mapeo por
  TIPO de sitio (los planetas procedurales comparten mundo 2D por bioma), contrato canónico en el
  repo del 2D. Pendiente de que el 2D complete sus fases F0-F3 + primer mundo para tener algo que
  abrir.
