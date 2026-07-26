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

- [x] `DisembarkService` (`services/game/disembark.service.ts`, servicio puro + 7 tests):
      `landingContextToEntryCode(site)` + `canDisembark(site)` + `disembark(site)` (`window.open` a
      `oldone.html?entry=<code>&return=<url 3D>`, nueva pestaña). **Hecho + desplegado (build 51).**
- [x] Botón **"Bajar de la nave"** en `LandingPanelComponent` (footer, visible en TODAS las vistas
      cuando hay mapeo) **y** en `StationLandingPanelComponent`; menús actuales intactos. **Hecho.**
- [~] Copy/estilo del botón: estilo base puesto (verde eldritch en estación; `btn primary` en planeta).
      Pulido lovecraftiano + entrada en la bitácora del panel al desembarcar → pendiente (polish).
- [ ] Wiki/docs: actualizar `Sistema_Landing_Narrativa.md` (nueva acción del panel)
- [ ] (v2 opcional) same-tab: save antes de navegar + `?resume=landing`
- [x] Coordinar despliegue: AtroPELLO ya despliega el botón; el 2D se despliega aparte.

> **⚠️ COORDINACIÓN CON EL 2D (para la otra sesión) — 2026-07-26:** AtroPELLO **ya envía** (en prod,
> build 51) estos `entry`: **`estacion-humana`** (atraque), **`planeta-tierra`** (Tierra partida) y
> **`planeta-rocoso`** (resto de planetas aterrizables). Añade `&return=<url del 3D>` (fallback si
> `window.close()` no puede). Para el MVP: el 2D debe tener esos `ENTRY_POINTS` **o** hacer que un
> `entry` desconocido caiga al mundo inicial (`nave`) — así el botón SIEMPRE abre algo pisable.
> Si cambiáis nombres de código, avisad y actualizo el `switch` (1 línea).

## 5. Bitácora

- **2026-07-25** — Plan creado (análisis, sin implementación). Decisiones: v1 en nueva pestaña
  (sin save/restore), vuelta por cierre de pestaña desde el 2D (con fallback redirect), mapeo por
  TIPO de sitio (los planetas procedurales comparten mundo 2D por bioma), contrato canónico en el
  repo del 2D. Pendiente de que el 2D complete sus fases F0-F3 + primer mundo para tener algo que
  abrir.
- **2026-07-26** — **F6 (lado AtroPELLO) IMPLEMENTADO Y DESPLEGADO** (build 51, prod): `DisembarkService`
  + botón "Bajar de la nave" en el panel de planeta (footer, todas las vistas) y en el de estación +
  7 tests. Envía `estacion-humana`/`planeta-tierra`/`planeta-rocoso` con `&return`. Decisiones del
  usuario: v1 (nueva pestaña); MVP con inventarios **separados** por ahora, **compartidos después**
  (ver §6). Pendiente el lado 2D (F0-F4 + `oldone.html`) para probar el flujo completo end-to-end.

## 6. Estado cruzado entre juegos (inventario / XP / cordura / daño) — DISEÑO (no implementado)

> Objetivo del usuario (2026-07-26): que un **canal** lleve info de IDA y VUELTA entre el 3D y el 2D —
> equipo/inventario, experiencia, daños, cordura, algún avance clave — para que **cada juego se entere**
> de lo del otro. El MVP v1 **NO** lo hace (progresiones separadas); esto es la siguiente iteración
> ("más ajustes" pendientes). Contrato documentado aquí para coordinar ambas sesiones antes de implementar.

### 6.1 Canal — NO reutilizar la cookie de auth
`atropello-session` es el ID Token de Cognito (auth): **no** meter estado de juego ahí (tamaño, HttpOnly,
la gestiona el auth-launcher). Opciones:
- **(A) Cookie de estado dedicada** `atropello-xstate` en `.atropello-games.es`, **no** HttpOnly (legible
  por el 3D Angular vía `document.cookie` y por el 2D .NET server-side): JSON compacto y **versionado**.
  Sin infra nueva. Límite ~4KB → solo un RESUMEN. Tamperable → el receptor no debe confiar para nada
  explotable (a esta escala, riesgo bajo).
- **(B) Backend compartido** (recomendado a medio plazo para inventario REAL): el estado canónico
  (personaje/inventario) vive en UN sitio (probablemente la BD del 2D, ya autoritativa) y el 3D lo
  lee/escribe por API con el mismo ID Token. Robusto y sin límite de tamaño. Es el "más ajustes" real:
  hoy el 3D usa **Cloud Saves propio** → hay que decidir dónde vive el inventario canónico.
- **(C) Handoff por query/postMessage**: token de traspaso en la URL de ida + confirmación en la vuelta.
  Más plomería; útil si se quiere evitar cookies.

### 6.2 Contrato propuesto (v0, a acordar entre ambos repos)
`atropello-xstate` = JSON `{ v:1, at:<ts>, from:'3d'|'2d', char:{ xp, sanity, hp, credits },
inv:[{id,qty}], equip:[{slot,id}], flags:{<clave>:<valor>} }`. Reglas:
- **Ida (3D→2D)**: antes de `window.open`, el 3D escribe su snapshot relevante (o el 2D lo lee del backend si vamos por B).
- **Vuelta (2D→3D)**: el 2D escribe su snapshot antes de cerrar; al reactivarse la pestaña del 3D
  (`visibilitychange`/`focus`), el 3D lee y **reconcilia** (merge, no pisar a ciegas).
- Cada juego **lee lo que entiende e ignora el resto** (forward-compat por `v`).

### 6.3 Recomendación
- **Ahora (MVP)**: nada (separado), como está.
- **Paso 1 barato**: cookie (A) con un resumen (xp, cordura, hp, flags clave) → "el otro juego se entera"
  sin unificar inventarios. Bidireccional y versionado.
- **Paso 2 (inventario realmente compartido)**: backend (B) — decidir dónde vive el inventario canónico
  (unificar Cloud Saves del 3D con la BD del 2D). Es lo que el usuario marcó como "más ajustes".
- **A decidir con el usuario** antes de implementar: qué campos exactos viajan y quién es la fuente de
  verdad de cada uno.
