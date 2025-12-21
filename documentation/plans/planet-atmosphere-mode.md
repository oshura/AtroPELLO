# Plan: Modo Atmosférico Planetario Compartiendo GameStateStore

## Contexto
Queremos añadir un segundo sistema jugable que utilice el mismo `GameStateStore` y servicios que el motor espacial actual, pero renderice una escena 3D alternativa en la atmósfera de un planeta. La nave, piloto, HUD y controles se mantienen, pero el escenario cambia a un entorno planetario con dos límites esféricos (suelo y cielo). El “suelo” debe ser una malla irregular con montañas, valles y dunas según el tipo de planeta, con texturizado dependiente de la altura y LOD progresivo (detalle alto <50u, medio 50‑100u, bajo >100u). El límite superior será una cúpula de nubes teñidas por el color dominante del planeta. Al cruzar el límite superior debemos lanzar la animación de despegue y volver al modo espacial; al acercarnos al suelo con el ángulo y velocidad adecuados se activa el piloto de aterrizaje y se reproduce una animación específica con humo antes de abrir el diálogo de landing. Los hechizos que dependían de seleccionar un planeta deben considerar automáticamente el planeta actual. Los paneles HUD, controles y bindings deben funcionar sin cambios perceptibles y las escalas deben variar por tipo de mundo (gaseoso = sin aterrizaje, giant = ×3, protoplanet = ×0.7, planetoide = materiales según paleta).

## Referencias
- `documentation/CleanCode_Arquitectura.md` — lineamientos de separación de sistemas y dependencias.
- `documentation/Resumen_Proyecto_y_Progreso.md` — estado actual del GameEngine, HUD y landing.
- `documentation/Sistema_Landing_Narrativa.md` — comportamiento del HUD de aterrizaje.

## Estrategia
Descomponeremos el desarrollo en fases claras que puedan retomarse en cualquier momento. Cada fase cerrará con build (`npm run build`) y actualización de documentación/wiki cuando aplique. Para el arte y shading, investigaremos referencias existentes (terrain synthesis, cielos volumétricos, renders NASA/ESA) para fundamentar paletas y ruidos antes de implementar y definiremos un board de inspiración con muestras clasificadas por tipo de planeta.

## Fases
1. **Análisis y diseño compartido**
   - Revisar GameEngine, GameStateStore y servicios dependientes (landing, HUD, hechizos) para identificar puntos de extensión.
   - Definir el API para instanciar el nuevo modo atmosférico reutilizando el store y compartiendo bindings/servicios.

2. **Infraestructura del modo atmosférico**
   - Crear scaffold del nuevo "motor" (p. ej. `PlanetAtmosphereEngine`) que se monte/desmonte desde `GameInitializer` y comparta `GameStateStore`.
   - Configurar escena base con sky dome de nubes tintadas por planeta, luz atmosférica y compatibilidad con HUDManager.
   - Encapsular la lógica de transición (espacio⇄atmósfera) en un orquestador para que otras features puedan enganchar callbacks.
   - Documentar referencias visuales recopiladas (fotografía satelital, renders procedurales) para orientar shaders y texturas y archivar enlaces en `/documentation/research/planet-atmosphere.md` (archivo nuevo).

3. **Geometrías y límites del planeta**
   - Implementar las dos superficies concéntricas con radios configurables y al menos 50u de separación.
   - Crear malla irregular para el suelo usando ruidos combinados (ridge, fbm) y bancos de material: montañas peladas o nevadas, dunas para arenosos, llanuras heladas con reflejos especulares controlados.
   - Añadir colorización por altura (gradientes escalonados) y mapas de textura dependientes del tipo de planeta:
     - **Gaseoso:** impedir aterrizaje; el suelo se convierte en tormenta volumétrica navegable pero sin contacto.
     - **Giant:** escalar radios, montañas y límites ×3 y reforzar densidad de nubes.
     - **Protoplanet:** reducir geometrías a 0.7× para transmitir juventud.
     - **Planetoide:** elegir preset (rocoso rojizo, dunas, hielo) según color dominante.
   - Integrar LOD y blend de texturas (alto detalle <50u, medio hasta 100u, bajo a partir de 100u) para evitar popping.
   - Implementar el cielo superior como mar de nubes semitransparentes que heredan el tono del planeta.
   - Integrar detección de cruces: activar aterrizaje cuando se cumplan las condiciones cerca del suelo; disparar secuencia de despegue al atravesar la esfera superior.

4. **Paridad de controles y HUD**
   - Conectar los mismos `GameInputHandler`, HUD y paneles diegéticos para que las teclas (movimiento, paneles, hechizos, Backspace del marquee, etc.) funcionen igual.
   - Validar que los paneles puedan abrirse en el modo atmosférico y que la cámara/HUD sigan sincronizados independientemente del LOD o la posición relativa al suelo.
   - Añadir telemetría ligera (stats overlay) para monitorear FPS y latencia del HUD en ambos modos.
   - Integrar un horizonte artificial en la brújula cuando estemos en modo atmosférico: dividir el anillo en cielo (azules graduales) y tierra (ocres/arena) con líneas de pitch/roll sincronizadas con la nave.
   - Superponer un altímetro dentro de la brújula (escala circular o columna lateral) que muestre altura sobre el suelo local y marcas clave (50u, 100u) para anticipar el comportamiento del terreno/LOD.

5. **Integración de hechizos dependientes de planeta**
   - Detectar hechizos que requieren seleccionar un planeta objetivo y resolver automáticamente el planeta actual cuando estemos en la atmósfera.
   - Ajustar validaciones de distancia para que usen el radio del planeta activo e introducir callbacks para hechizos que cambien el clima/terreno.
   - Agregar pruebas manuales/documentadas para Gate Rite/Eternal Rite dentro de la atmósfera y registrar resultados.

6. **Secuencias y animaciones de aterrizaje/despegue**
   - Crear la animación de aterrizaje planetario: bloqueo de controles, descenso a altura 0 en 2s, cámara lateral/oblicua que se posiciona a ras del suelo y tracking de la nave, con efectos de polvo o vapor según material (humo rojizo, spray de hielo, etc.).
   - Mantener la escena congelada ~2s tras el touchdown antes de mostrar el diálogo existente.
   - Implementar la animación de despegue cuando se cruza la esfera superior, incluyendo fundido de nubes y transición progresiva al modo espacial.

7. **Documentación, QA y research continuo**
   - Actualizar documentación (Resumen, Landing, Wiki/hud) con el nuevo modo y anexar el board de inspiración.
   - Ejecutar `npm run build`, preparar checklist QA cruzada (modo espacial vs atmósfera) y añadir pruebas manuales/registros en la bitácora QA.
   - Evaluar rendimiento en targets de 32 FPS con el compensador del HUD y registrar métricas antes/después.

8. **Opcional — Variaciones climáticas y narrativa**
   - Añadir presets de clima (tormenta de polvo, aurora, blizzard) que modifiquen el shading y la densidad de nubes.
   - Coordinar con narrativa para definir eventos únicos cuando aterrizas en determinados biomas.

## Seguimiento
- [ ] Fase 1 completada
- [ ] Fase 2 completada
- [ ] Fase 3 completada
- [ ] Fase 4 completada
- [ ] Fase 5 completada
- [ ] Fase 6 completada
- [ ] Fase 7 completada

## Instrumentación HUD atmosférica (fase 4 detalle)
- [x] Análisis matemático: documentar las inconsistencias actuales del horizonte artificial comparando los vectores forward/right/up con la normal planetaria real y registrar escenarios límite (inversión, nariz abajo, alabeo completo).
- [x] Refactorizar el cálculo de pitch/roll atmosférico en un util independiente reutilizable por GameEngine y HUD, garantizando ortonormalización y manejo de centros planetarios arbitrarios.
- [x] Ajustar el renderizado del horizonte y la telemetría del Compass para consumir los nuevos valores, incluyendo depuración visible (altitud, flags) para QA.
- [x] Añadir pruebas unitarias que cubran los escenarios documentados (nivelado, nariz arriba/abajo, alabeo ±90°, inversión) y asegurar que el componente HUD cae en modo horizonte con datos consistentes.
- [x] Ejecutar `npm run build`, validar resultados en la wiki (/wiki) y actualizar la documentación correspondiente.
