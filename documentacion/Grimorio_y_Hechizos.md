# 📜 Grimorio y Hechizos

Este documento describe el libro del grimorio (UI), el flujo de lanzamiento de hechizos y los hechizos actualmente disponibles, así como su integración con el HUD/Brújula y los servicios del motor de juego.

## Índice
- Introducción al Grimorio
- Interfaz y experiencia de usuario
- Flujo de lanzamiento estandarizado
- Recursos y restricciones (Energía del Vacío)
- Hechizos disponibles
  - Rito Doble de Tiempo (Double Phased Time Rite)
  - Salto al Vacío (Void Jump)
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
- Persistencia de selección: si cierras el grimorio con una runa seleccionada, puedes seguir lanzándola con la tecla rápida.
- Coherencia visual: los glifos usan RNG con semilla para imágenes deterministas; las áreas de runa están enmarcadas con delineado claro.

## Flujo de lanzamiento estandarizado

El flujo de casteo está unificado para todos los hechizos activados por la tecla rápida (por defecto, “h”):
1) Asegurar cámara “0”: si no estás en el modo de cámara base, el sistema conmuta automáticamente a la cámara 0.
2) Pre‑cast de 2s: los controles de vuelo quedan temporalmente bloqueados. Se muestra un texto/placeholder de animación.
3) Aplicar efecto: al terminar los 2s, se ejecuta la lógica del hechizo.
4) Desbloqueo: se restablecen los controles salvo que el propio hechizo requiera otra cosa.

Notas:
- Este flujo también se respeta cuando el grimorio está cerrado y disparas con tecla rápida.
- Si el hechizo no puede ejecutarse (p. ej. falta de recursos), se muestra el placeholder y se aborta sin efectos secundarios.

## Recursos y restricciones (Energía del Vacío)

- La nave dispone de Energía del Vacío: `max = 100`, `actual = 100` al inicio.
- Algunos hechizos consumen este recurso. Si no hay suficiente energía, el lanzamiento se cancela tras el pre‑cast mostrando la animación placeholder.

## Hechizos disponibles

### 1) Rito Doble de Tiempo (Double Phased Time Rite)

- Efecto: duplica temporalmente la velocidad máxima de la nave y sus parámetros de aceleración y frenado.
- Duración: 120 s. Re‑lanzarlo refresca la duración.
- Parámetros afectados:
  - `Spaceship.maxSpeed`: duplicado desde su base (base actual: 10).
  - `acceleration` y `deceleration`: también duplicados.
- Al expirar: se restauran los valores originales y se hacen clamps sobre `targetSpeed`/`currentSpeed` para que no superen la base restaurada.
- HUD/Brújula: muestra un contador digital MM:SS en color carmesí (sangre) centrado verticalmente dentro del anillo de la brújula, sin tapar la aguja. El contador usa “floor” para evitar el estado transitorio “00:01” cuando resta < 1 s.
- Ocultación: el contador se oculta al llegar a 0 o cuando el efecto no está activo.

Estados y bordes:
- Si se relanza antes de expirar, solo se refresca el temporizador; no se acumula el multiplicador.
- Si expira durante una maniobra, el sistema restaura aceleración/freno y recorta velocidades a la base.

### 2) Salto al Vacío (Void Jump)

- Efecto: inicia una secuencia de salto con animación; requiere objetivo válido y condiciones mínimas de distancia.
- Costo: 50 unidades de Energía del Vacío.
- Reglas de lanzamiento:
  - Si `energía < 50`: tras el pre‑cast de 2s se muestra la animación placeholder y se aborta.
  - Si el objetivo es inválido o está demasiado cerca: también se aborta tras el placeholder.
  - En caso válido: se inicia la secuencia/animación de salto y se descuenta la energía.

## Integración con HUD / Brújula

- El `HUDManager` recibe desde el motor el tiempo restante del Rito Doble de Tiempo y lo encamina a la Brújula.
- La Brújula dibuja el contador MM:SS en carmesí, centrado verticalmente. No se muestra cuando el valor es `null` o `<= 0`.
- Opcional (futuro): desvanecido del contador durante el último segundo.

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

---

Actualizado: Noviembre 2025 — AtroPELLO