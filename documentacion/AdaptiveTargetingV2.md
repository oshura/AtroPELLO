# Targeting Adaptativo v2

Este documento resume la nueva implementación del sistema de targeting y los cambios de HUD/outliner introducidos durante la refactorización reciente.

## Objetivos y alcance

- Mejorar precisión de hover/selección en escenas densas y de gran escala.
- Reducir parpadeos y “stutter” en overlays (hover/seleccionado) con una frecuencia de refresco más alta y cacheo por contenido.
- Evitar que objetivos gigantes dominen la selección salvo cerca de su centro (“gating”).
- Impedir que el ciclo de selección elija objetivos fuera de pantalla.
- Añadir el tipo de target SUN (Sol) y ajustar etiquetas/masas de algunos objetos especiales.

## Componentes principales

- AdaptiveTargetingSystem (src/app/game/targeting/v2/AdaptiveTargetingSystem.ts)
  - Clasifica targets por categorías de distancia: immediate, close, medium, far, extreme.
  - Calcula proyección a pantalla anclando en el centro de la bounding sphere.
  - Hover por raycasting: genera un rayo desde el mouse y comprueba intersección con la esfera de cada target (ray-sphere).
  - Si el raycast impacta un objetivo cuyo centro no tiene proyección válida, se usa el punto exacto del impacto para reconstruir `screenPosition` y mantener activo el HUD/hover.
  - Gating de objetivos dominantes: si el radio proyectado ocupa ≥ fracción de la pantalla, sólo se selecciona cerca del centro.
  - Enforce on-screen: si la proyección cae fuera del volumen de clip/NDC, ese target no es candidato visible.
  - Tratamiento para objetivos gigantes: cuando el radio proyectado supera ~30 % del lado corto, se muestrean puntos sobre la superficie orientada a cámara y, si aún así el centro queda fuera del frustum, se clampa el ancla al borde de la pantalla para que el HUD y el ciclo de selección sigan teniendo coordenadas válidas.
  - Tuning por categoría: tolerancia en píxeles, frecuencia de actualización y pequeña histéresis para evitar flicker.

- AdaptiveTargetingIntegrator (src/app/game/targeting/v2/AdaptiveTargetingIntegrator.ts)
  - Integra con la retícula existente, trackea velocidad del mouse y administra el ciclo de selección (Tab / Shift+Tab).
  - Al construir la lista de candidatos, respeta on-screen + gating y prioriza por tipo + distancia en píxeles.
  - Prioridad de tipos (baja cifra = más prioridad): spaceship, portal, sun/planet, cluster, super_asteroid, mega_asteroid, asteroid, waypoint.

- Outliner 2D (src/app/game/hud/TargetOutline2DRenderer.ts)
  - Canales independientes para hover y seleccionado (sin contaminación cruzada).
  - Caché por contenido + throttling por canal.
  - Ajuste de brillo y grosor: parámetros intensity/thickness incluidos en la clave de caché.
  - Snap a píxel entero y alpha premultiplicado para reducir parpadeo.
  - Frecuencia de refresco elevable; por defecto ~120 ms (~8 Hz) desde GameEngine.

- GameEngine (src/app/game/GameEngine.ts)
  - Exposición de toggles de depuración en consola:
    - Debug.setOutlinerEnabled(bool)
    - Debug.setOutlinerUpdateMs(number)
    - Debug.Targeting.useRaycastHover(bool)
    - Debug.Targeting.dominantGate(bool)
    - Debug.Targeting.setDominantFraction(number)
  - Panel de target del HUD alimentado con hovered/selected del sistema adaptativo.
  - Etiquetas coherentes: MegaAsteroid tiene precedencia sobre SuperAsteroid.

## Cambios de tipos y etiquetas

- Nuevo tipo TargetType.SUN ("sun").
  - El objeto `Sun` ahora reporta `getTargetType() = SUN`.
  - Se mapea la etiqueta "Sun" en el HUD.
  - Relación por defecto del Sol: neutral (ver RelationService).

- MegaAsteroid
  - Etiqueta en HUD: "MegaAsteroid" (ya no se muestra como "SuperAsteroid").
  - voidMassUnits > 0 proporcional al tamaño base (aprox. 500 * baseSize).

## Comportamientos clave

- Hover preciso en escenas densas: el raycasting evita seleccionar objetos ocultos.
- Gating de objetivos gigantes: previene que un planeta o el Sol capturen siempre el hover; sólo cerca del centro del objeto.
- Ciclo de selección en pantalla: Tab/Shift+Tab ignora objetivos fuera de NDC.
- Outliner más suave: mayor frecuencia de refresco con caches y snapping.
- Anclas resilientes para objetos que llenan la vista: MegaAsteroides y planetas cercanos mantienen un `screenPosition` aunque el centro salga del frustum —ya sea usando los samples superficiales o, en última instancia, proyectando el centro y clampándolo al borde—, de modo que `hover`, tecla `T` y el panel HUD no “pierdan” el target.

## Toggles de runtime (consola)

- Outliner:
  - `Debug.setOutlinerEnabled(true|false)`
  - `Debug.setOutlinerUpdateMs(120)`

- Targeting:
  - `Debug.Targeting.useRaycastHover(true|false)`
  - `Debug.Targeting.dominantGate(true|false)`
  - `Debug.Targeting.setDominantFraction(0.35)`

## Puntos de integración

- `RelationService.getRelation(target)`: el Sol (SUN) es neutral por defecto. Asteroides, clusters y planetas también.
- `TargetCatalogService`: mantiene buckets por tipo (asteroid, super_asteroid, mega_asteroid, planet, cluster,…).
- HUDManager/TargetPanel: utiliza la info del adaptativo; muestra distancia, relación, detalles y preview 3D.

## Cómo probar

1) Hover y selección:
   - Mover el cursor sobre objetivos cercanos y lejanos; confirmar que hover no salta a objetos detrás.
   - Probar con objetos gigantes en pantalla: sólo seleccionan cerca del centro.

2) Ciclo de selección:
   - Pulsar Tab y Shift+Tab manteniendo el ratón sobre un grupo de candidatos; confirmar que no aparece un objetivo off-screen.

3) Outliner:
   - Desactivar con `Debug.setOutlinerEnabled(false)` para comparar FPS y reactivar.
   - Subir/bajar la frecuencia con `Debug.setOutlinerUpdateMs(ms)` y observar suavidad.

4) Tipos y etiquetas:
   - Seleccionar el Sol: tipo "Sun", relación neutral.
   - Seleccionar un MegaAsteroid de un anillo: etiqueta "MegaAsteroid" y `voidMassUnits > 0`.

## Próximos pasos (ideas)

- Prioridad dinámica por contexto (amenaza/cercanía).
- Decaimiento temporal para evitar “ping-pong” al ciclar.
- Raycasting jerárquico (BVH) para escenas con miles de objetos.
- UI de ajustes para toggles sin usar consola.
