# Plan: Atmosphere surface upgrade

## Objetivo
Corregir el suelo blanco en Mercurio y mejorar la fidelidad visual del modo atmosférico con paletas estratificadas (picos, media montaña, planicie y valle), más detalle geométrico/texel al acercarse al suelo y un cielo que se aclara gradualmente debajo de 300u de altitud. El resultado debe respetar las pautas descritas en `CleanCode_Arquitectura.md` y `Resumen_Proyecto_y_Progreso.md`.

## Pasos
- [x] **Análisis de estado actual**
  - [x] Revisar `AtmosphereSceneManager` (meshes, shading, ruido) y `GameEngine` (paletas) para identificar dónde inyectar capas por altitud.
  - [x] Validar en `Resumen_Proyecto_y_Progreso.md` y `Wiki_System.md` si existe documentación previa que deba extenderse.
- [ ] **Paletas estratificadas + Mercurio**
  - [x] Ampliar `AtmosphereGroundPalette` y los descriptores en `GameEngine.getPlanetPaletteDescriptor()`/`createFallbackGroundPalette()` para incluir colores específicos por zona (picos, media montaña, planicie, valle) y ajustar valores de Mercurio para evitar saturación blanca.
  - [x] Actualizar la función de muestreo en `AtmosphereSceneManager` para usar las cuatro zonas diferenciadas, mezclando en función de la altura relativa y latitud.
- [ ] **Detalle geométrico y texturas dependientes de altitud**
  - [x] Guardar posiciones base del mesh y un mapa de ruido de detalle fino; re-subir el VBO aplicando extrusión adicional escalada por altitud (solo cuando <600u) para simular relieve rocoso.
  - [x] Aplicar una capa de color microtexturizada (variaciones de tono) sincronizada con la extrusión para reforzar la sensación de roca.
- [ ] **Gradiente de cielo por altitud**
  - [x] Detectar la altitud actual del jugador (o cámara) y mezclar `skyColor` hacia un tono azul claro cuando esté por debajo de 300u, manteniéndolo sin cambios a mayor altitud.
- [ ] **Documentación, wiki y build**
  - [x] Actualizar `documentation/Resumen_Proyecto_y_Progreso.md` y la wiki de la nave (`/src/app/wiki/pages/spaceship`) con la nueva descripción visual.
  - [x] Ejecutar `npm run build` para validar.
