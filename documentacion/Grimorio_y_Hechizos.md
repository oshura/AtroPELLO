# 📜 Grimorio y Hechizos

Este documento describe el libro del grimorio (UI), el flujo de lanzamiento de hechizos y los hechizos actualmente disponibles, así como su integración con el HUD/Brújula y los servicios del motor de juego.

## Índice
- Introducción al Grimorio
- Interfaz y experiencia de usuario
- Flujo de lanzamiento estandarizado
- Recursos y restricciones (Energía del Vacío)
- Tabla de costes (Cordura y recursos)
- Hechizos disponibles
  - Rito Doble de Tiempo (Speed Rite / Double Phased Time Rite)
  - Salto al Vacío (Long Jump / Void Jump)
  - Gate Rite
  - Eternal Rite
  - Disrupt
  - Anchoring Pulse
  - Void Kinesis
  - Void Cocoon
  - Tempus Sigillum
  - Alma Mater Contact Rite (SPECIES_SCAN)
  - Arcane Contact Rite (CREATURE_SCAN)
- Integración con HUD / Brújula
- Aspectos técnicos (archivos y servicios)
- Pruebas rápidas

---

## Introducción al Grimorio

El Grimorio es un panel a pantalla completa que muestra páginas con glifos interactivos. Se renderiza en Canvas2D y se compone como textura dentro del pipeline WebGL del HUD. Permite consultar, seleccionar y equipar runas/hechizos de forma diegética, sin romper la inmersión.

Características clave:
- Panel a pantalla completa con páginas izquierda/derecha.
- Tooltips diegéticos con inversión en página derecha (se dibujan a la izquierda del cursor para no tapar).
- Selección con resaltado único (sin glow duplicado ni cintas tipo “EQUIPPED”).
- “Reading Mode”: zoom de lectura que solo amplía, invierte hit-tests y evita click-through al 3D.
- El cursor no se recentra al abrir/cerrar el panel.

## Interfaz y experiencia de usuario

- Entrada del usuario: navegación con mouse/teclado; las entradas capturadas por el panel bloquean la interacción con la escena 3D mientras está abierto.
- Persistencia de selección: si cierras el grimorio con una runa seleccionada, puedes seguir lanzándola con la tecla rápida; abrir/cerrar el panel NO borra la selección.
- Coherencia visual: los glifos usan RNG con semilla para imágenes deterministas; las áreas de runa están enmarcadas con delineado claro.

### Selección y tecla rápida

- La tecla rápida por defecto es 'h'. Para lanzar, se requiere una selección explícita (no se usa el glifo solo “hovered”).
- Al pulsar 'h' con un glifo seleccionado, la selección se deselecciona inmediatamente, independientemente de que el lanzamiento tenga éxito o sea abortado por validaciones.
- Si el grimorio está cerrado y existía una selección persistente, 'h' la utiliza y acto seguido la borra (queda sin glifo seleccionado tras la pulsación).
- Si no hay glifo seleccionado, 'h' no hace nada.
- Abrir/cerrar el libro con 'L' no cambia el estado de selección.

## Flujo de lanzamiento estandarizado

El flujo de casteo está unificado para todos los hechizos activados por la tecla rápida (por defecto, “h”):
1) Asegurar cámara “0”: si no estás en el modo de cámara base, el sistema conmuta automáticamente a la cámara 0.
2) Pre‑cast de 2s: los controles de vuelo quedan temporalmente bloqueados. Se muestra un texto/placeholder de animación.
3) Aplicar efecto: al terminar los 2s, se ejecuta la lógica del hechizo.
4) Desbloqueo: se restablecen los controles salvo que el propio hechizo requiera otra cosa.

Notas:
- Este flujo también se respeta cuando el grimorio está cerrado y disparas con tecla rápida.
- La deselección del glifo sucede en el momento de pulsar 'h' (antes de la ventana de 2s) para evitar re-lanzados accidentales en pulsaciones repetidas.
- Si el hechizo no puede ejecutarse (p. ej. falta de recursos), se muestra el placeholder y se aborta sin efectos secundarios, manteniendo la deselección ya aplicada.

## Recursos y restricciones (Energía del Vacío)

- La nave dispone de Energía del Vacío: `max = 100`, `actual = 100` al inicio.
- Algunos hechizos consumen este recurso. Si no hay suficiente energía, el lanzamiento se cancela tras el pre‑cast mostrando la animación placeholder.
- Los glifos de escaneo (habitantes / ser menor) consumen 50u y respetan el mismo alcance que la bahía auxiliar (≤ 500u desde la superficie).

## Tabla de costes (Cordura y recursos)

| Hechizo / Glifo | Cordura temporal (`temp`) | Cordura reservada (`max`) | Energía del Vacío | Requisitos adicionales |
| --- | --- | --- | --- | --- |
| Rito Doble de Tiempo | 1 | 2 | 0u | Solo requiere tener la runa aprendida; refresca la duración si ya está activo. |
| Salto al Vacío | 2 | 4 | 50u | Objetivo a > 4000u; target válido seleccionado; sin animación ocupada. |
| Gate Rite | 5 | 5 | 0u | Planeta válido a ≤ 50u de la superficie; bloquea inputs durante toda la secuencia. |
| Eternal Rite | 1 | 0 | 0u | Requiere animador disponible; congela el tiempo salvo la nave. |
| Disrupt | 1 | 1 | 0u | Target válido (portal/material) dentro de 50u. |
| Anchoring Pulse | 2 | 3 | 0u | Asteroide en ≤ 50u y bodega con espacio suficiente para el `yield`. |
| Void Kinesis | 2 | 3 | Genera energía (no consume) | Asteroide en ≤ 50u y reservas del vacío con espacio para el `gain`. |
| Void Cocoon | 3 | 3 | 0u | Despliega un capullo protector durante 30 s, absorbiendo impactos de colisión y mostrando un countdown en la brújula. |
| Tempus Sigillum | 2 | 5 | 0u | Requiere planeta válido (≤ 500u). Revierte el mundo, vuelve a tirar la probabilidad de vida y limpia seres menores conocidos. |
| Alma Mater Contact Rite (SPECIES_SCAN) | 1 | 3 | 50u | Planeta escaneable a ≤ 500u de la superficie. |
| Arcane Contact Rite (CREATURE_SCAN) | 1 | 3 | 50u | Igual que el anterior, pero consulta seres menores. |

> `temp` se descuenta inmediatamente tras ejecutar el efecto; `max` representa la fracción de cordura máxima bloqueada de forma permanente mientras el hechizo permanezca aprendido (se recalcula en `GameStateStore.enforceSanityCeiling`).

## Hechizos disponibles

### Rito Doble de Tiempo (Speed Rite / Double Phased Time Rite)

- Efecto principal: duplica temporalmente `maxSpeed`, `acceleration` y `deceleration` de la nave durante 120 s.
- Costes: 1 punto de cordura temporal, 2 puntos reservados mientras la runa esté aprendida (ver tabla), sin gasto de energía del vacío.
- HUD: activa un contador MM:SS carmesí en la brújula; se oculta automáticamente al expirar.
- Re-lanzar antes del final solo refresca la duración, nunca acumula multiplicadores.
- Al terminar, el motor recalcula velocidades (`targetSpeed` y `currentSpeed`) para impedir overshoot por encima del límite restaurado.

### Salto al Vacío (Long Jump / Void Jump)

- Efecto principal: ejecuta la animación de salto hacia el objetivo seleccionado y teleporta la nave tras completar la secuencia.
- Costes: 2 de cordura temporal, 4 reservados y 50u de Energía del Vacío consumidas al validar el objetivo.
- Requisitos: objetivo válido (planeta/portal/waypoint) situado a más de 4000u de distancia; con menos distancia aparece placeholder “ANIMATION NUMBER 2”.
- Flujo: si hay energía suficiente, `AnimationManager.startVoidJump` bloquea inputs hasta finalizar. El gasto energético sucede justo antes de disparar la animación.

### Gate Rite

- Efecto principal: colapsa el planeta objetivo (≤ 50u de la superficie), genera un portal pentagramado y teleporta la nave a un nuevo sistema enlazado.
- Costes: 5 de cordura temporal y 5 reservados; no consume Energía del Vacío pero pausa/rellena la reserva durante la secuencia (ver `GateRitePlan.md`).
- Notas clave: limpia el planeta original del snapshot, crea portales enlazados y recarga void energy al estabilizarse en el destino. Toda la secuencia bloquea inputs y activa supresión de daños.

### Eternal Rite

- Efecto principal: `AnimationManager.startEternalRite` congela el tiempo para todos los objetos salvo la nave, permitiendo reposicionarse sin amenazas dinámicas.
- Costes: 1 de cordura temporal sin reserva permanente adicional; no usa energía del vacío.
- Requisitos: el administrador de animaciones debe estar libre; cualquier error cancela el rito y mantiene la deselección del glifo.

### Disrupt

- Efecto principal: proyecta un haz sobre un objetivo dentro de 50u (portales, estructuras resonantes o entidades señaladas) para desestabilizarlos.
- Costes: 1/1 de cordura (temp/reservada) y cero energía del vacío.
- Requisitos: target válido detectado por el sistema de objetivos; si el objetivo está fuera de rango se muestra “TARGET TOO FAR (>50u)”.
- El haz dura ~1.5 s (`startDisruptionRite`) y puede combinarse con estados del HUD para representar fallas en portales hostiles.

### Anchoring Pulse

- Efecto principal: captura asteroides cercanos (≤ 50u), los desintegra y registra el material en la bodega (`CargoHoldService.registerAsteroidConversion`).
- Costes: 2/3 de cordura y cero energía del vacío.
- Requisitos: asteroide válido, distancia ≤ 50u y suficiente capacidad libre (`cargoCapacityRemaining ≥ yield`). Si la bodega está llena, muestra “BODEGA SIN ESPACIO”.
- El botón de expulsión del inventario permite revertir manualmente las entradas creadas por este rito.

### Void Kinesis

- Efecto principal: canaliza asteroides (≤ 50u) para convertirlos directamente en Energía del Vacío (`addVoidEnergyFromAsteroid`).
- Costes: 2/3 de cordura; en lugar de consumir energía, añade entre 8u y `voidUnits * 7` hasta el máximo de la nave.
- Requisitos: asteroide válido y que la reserva del vacío no esté llena; si el `projectedVoid` excede el máximo se muestra “RESERVA DEL VACÍO LLENA”.
- Tras una conversión exitosa, el HUD muestra un mensaje de marquee con el incremento aplicado.

### Void Cocoon

- Efecto principal: activa un capullo del vacío durante 30 s (`voidCocoonActiveUntilMs`). Mientras dura, todos los impactos que llegarían al casco se anulan mediante `handleVoidCocoonImpact`, generando texto en el HUD y logs de depuración.
- Costes: 3/3 de cordura y ningún gasto de Energía del Vacío.
- Feedback: en lugar del placeholder, la nave queda inscrita dentro de una esfera semitransparente animada y el HUD muestra solo el mensaje de marquee + sonido `IaIa.wav`. La brújula dibuja un countdown azul (`COCOON`) que tiene prioridad sobre otros temporizadores.
- Notas: no impide lanzar otros hechizos y puede volver a activarse tan pronto como expire. Los daños absorbidos no reducen la reserva de integridad del barco.

### Tempus Sigillum

- Efecto principal: rebobina el estado civilizatorio del planeta objetivo (≤ 500u) y vuelve a tirar la probabilidad de vida (`assignInhabitantsFromProbability`).
- Resultado: limpia el `lesserBeing`, lo marca como conocido “sin criatura” (`creatureScanned = true`), restablece la afinidad a `NEUTRAL` y borra el flag `lifeScanned` para obligar a un nuevo reconocimiento.
- Costes: 2/5 de cordura, sin energía del vacío. Ideal para buscar una raza distinta o preparar líneas de misión donde la vida debía extinguirse.
- HUD / feedback: placeholder “TEMPUS SIGILLUM” con el nombre del planeta y mensaje en el marquee. No genera countdown porque su efecto es instantáneo.

### Augurio (SPECIES_SCAN)

- **Nombre oficial** para el glifo asociado a `SpellType.SPECIES_SCAN`. Mantiene el mismo identificador interno.
- Efecto: revela la especie dominante del planeta objetivo y marca el intel de habitantes como conocido (`planet.markLifeScanned`).
- Costes: 1/3 de cordura más 50u de Energía del Vacío cuando el objetivo pasa todas las validaciones.
- Requisitos: planeta escaneable a ≤ 500u de la superficie (`GLYPH_SCAN_RANGE`), objetivo seleccionado y sin amenazas de validación. Otorga `NEW_SPECIES_DISCOVERED` la primera vez que detecta una especie distinta de `NONE`.
- Feedback: placeholder `AUGURIO` con nombre del planeta y label de habitantes.

### Revelación (CREATURE_SCAN)

- **Nombre oficial** del glifo asociado a `SpellType.CREATURE_SCAN`.
- Efecto: confirma la presencia del ser menor activo en el planeta y marca el intel correspondiente (`planet.markCreatureScanned`).
- Costes y alcance: idénticos al Alma Mater Contact Rite (1/3 de cordura + 50u de energía, rango ≤ 500u).
- Resultado: overlay textual `REVELACIÓN` cuando detecta un ser menor y `REVELACIÓN INCONCLUSA` cuando no hay presencia; muestra el nombre del planeta y la etiqueta localizada del ser menor.

## Integración con HUD / Brújula

- El `HUDManager` recibe desde el motor un `CompassCountdownPayload` que prioriza Void Cocoon (overlay cian) y, si no está activo, el Rito Doble de Tiempo (overlay carmesí).
- La Brújula dibuja el countdown en la parte superior interna del anillo, con etiqueta (`COCOON` o `SPEED RITE`). Cuando `seconds <= 0` se oculta automáticamente.
- Opcional (futuro): aplicar un fade-out adicional durante el último segundo para ambos efectos.

## Aspectos técnicos (archivos y servicios)

- Flujo de hechizos y temporizadores: `src/app/game/GameEngine.ts`
  - Gestión del temporizador del Rito Doble de Tiempo, restauración de parámetros y clamps.
  - Manejo de la tecla rápida “h”: cámara 0, pre‑cast de 2s, placeholder y ejecución.
- Nave y recursos: `src/app/game/Spaceship.ts`
  - `maxSpeed` base = 10; energía del vacío `max = 100`, `actual = 100`.
- HUD: `src/app/game/hud/HUDManager.ts` y `src/app/game/hud/elements/Compass.ts`
  - Wiring del tiempo restante hacia la Brújula y render del contador carmesí centrado.
- Animaciones / bloqueo de inputs: `src/app/game/services/animations/animation-manager.service.ts`
  - `startBlockingDelay(durationMs)` para bloquear el input durante el pre‑cast.

## Pruebas rápidas

- Abrir el juego e iniciar un vuelo normal.
- Con o sin el grimorio visible, pulsar `h` con la runa de velocidad activa:
  - Observa bloqueo de controles durante ~2 s y texto de animación.
  - Pasado ese tiempo, el contador MM:SS aparece en la Brújula y la nave acelera con el nuevo límite.
- Volver a pulsar `h` antes de expirar para refrescar la duración.
- Dejar expirar: comprobar que se oculta el contador y se restauran límites/curvas.
- Probar Salto al Vacío con energía suficiente (≥ 50) y con energía insuficiente (< 50) para validar ambos caminos.
- Seleccionar los glifos de Augurio/Revelación y probar:
  - Target cercano (≤ 500u) vs. fuera de rango para confirmar los placeholders.
  - Consumo de 50u por lanzamiento exitoso y actualización de intel (habitantes/ser menor) en HUD y documentación del planeta.
  - Confirmar que el escaneo ritual respeta el bloqueo de inputs/pre‑cast de 2s.
- Activar Void Cocoon y comprobar el countdown en la brújula (debería empezar en 30 s) y que colisiones menores solo disparan mensajes “Void Cocoon absorbió un impacto” sin dañar la nave.
- Ejecutar Tempus Sigillum sobre un planeta con habitantes conocidos: verificar que `lifeScanned` vuelve a “Desconocido”, que no hay ser menor activo y que un nuevo escaneo puede revelar resultados distintos.
- Verificar la lógica de selección: tras pulsar `h` la selección desaparece; nuevas pulsaciones de `h` no hacen nada hasta volver a seleccionar un glifo.

---

Actualizado: Noviembre 2025 — AtroPELLO