# Plan — HUD Texture Pipeline & Mars Readability

## Contexto
- Los logs `logs/DuranteElJuegoAlAceptarBienvenida.log` y `logs/VolandoPorAtmosferaPlanetaMarte.log` muestran errores WebGL (`error: 1282`) al ejecutar `HUDTexture.updateTexture()` y advertencias de uniforms desincronizados justo al renderizar el HUD en cabina.
- La telemetría agregada (`Debug.Atmosphere.setTextureDebug(true)`) reporta `avgMix ≈ 0.83` y `texturedRatio = 1` sobre Marte, confirmando que los patrones procedurales se generan pero la mezcla los aplana antes de llegar al frame.
- Los cambios afectarán sobre todo a `src/app/game/hud/HUDTexture.ts`, `src/app/game/hud/HUDManager.ts`, `src/app/game/ShaderManager.ts` y a la lógica de mezcla en `src/app/game/atmosphere/AtmosphereSceneManager.ts`.
- Deberemos mantener sincronizadas `documentation/Modo_Atmosferico.md`, `documentation/Resumen_Proyecto_y_Progreso.md` y la wiki de jugador (`public/wiki/...`) según los ajustes que aterricen.

## Findings
1. **Pipeline HUD inestable**: `HUDTexture.updateTexture()` (ver [src/app/game/hud/HUDTexture.ts](../..//src/app/game/hud/HUDTexture.ts#L47-L103)) invoca `gl.texImage2D` mientras el estado GL está contaminado por el render de cabina. Los logs recientes (`logs/logs1.log`, 18:15:52Z) muestran que incluso antes de tocar la textura ya hay un `GL_INVALID_OPERATION` pendiente y el driver insiste con "UniformLocation is not from the current active Program" al aplicar `u_texture`/`u_opacity`. En la sesión anterior añadimos snapshots y guardados de estado, pero el análisis de FPS demostró que solo añadían coste sin resolver el origen: las ubicaciones de uniformes se vuelven obsoletas cuando el HUD recompila su programa (por hot reload) y seguimos reutilizando los punteros antiguos.
2. **Estado de shader sin restaurar**: `HUDManager.render()` selecciona entre `hudProgram` y `litProgram`, pero no guarda/restaura el programa previo del motor. Si otra parte del frame llama a `ShaderManager.useBasicProgram()` antes de que el HUD termine de subir texturas, las uniform locations dejan de ser válidas aunque sigamos usando los punteros cacheados.
3. **Texturas atmosféricas saturadas**: El muestreo en `sampleGroundColor()` (ver [src/app/game/atmosphere/AtmosphereSceneManager.ts](../..//src/app/game/atmosphere/AtmosphereSceneManager.ts#L250-L420)) calcula `mixStrength = clamp(textureInfluence * patternEnergy * resolvePatternMixBoost())`. Entre `textureInfluence` (0.35 + 0.75 * detailFactor + bonuses por altura) y `resolvePatternMixBoost('crater')` (1.35 - altura*0.3) el producto raramente baja de 0.8, por lo que los patrones reemplazan al color base sin dejar relieve observable aunque la telemetría confirme `texturedSamples === vertexSamples`.

## Objetivos
- Eliminar los errores `GL_INVALID_OPERATION` durante `hudTexture.updateTexture()` garantizando que la textura del HUD se actualice sin desmontar otros shaders.
- Asegurar que cada llamada que establece uniforms del HUD utilice la versión vigente del programa y restaure el estado al final de `HUDManager.render()`.
- Reducir la mezcla y contraste máximo de los patrones marcianos para que `avgMix` caiga a ~0.55 y los cráteres/dunas aporten contraste visible sin quemar la paleta base.
- Dejar instrucciones QA (en documentación y wiki) para activar logs `TEXTURE` y validar visualmente el resultado.

## Alcance
1. **HUD/WebGL**: revisión total del ciclo Canvas→Texture→Shader, incluyendo estados GL (programa actual, TEXTURE_UNITS, pixelStore, blend/depth) y caching de uniforms en `ShaderManager`.
2. **Atmósfera**: tuning de `textureInfluence`, `resolvePatternMixBoost`, `resolvePatternContrast` y posible capa de post-tonemapping para que el relieve procedimental se perciba. Ajustes se limitan al modo atmosférico.
3. **Documentación**: actualizar guía de modo atmosférico + wiki (sección de aterrizajes) explicando cómo interpretar las nuevas pistas visuales sin entrar en detalles técnicos.
4. **QA & pruebas**: build + test scripts obligatorios (`npm run build`, `npm run test -- --watch=false --browsers=ChromeHeadless --code-coverage=false`) y checklist manual para reproducir el vuelo sobre Marte con telemetría activada.

## Riesgos y mitigaciones
- **Estado GL compartido**: cualquier cambio en `HUDManager` puede interferir con otros renderers. Se mitigará centralizando push/pop de programa y restaurando estado (programa actual, active texture unit, depth/blend). Añadiremos asserts/logs.
- **Cambios visuales agresivos**: bajar `avgMix` puede hacer que planetas menos áridos parezcan demasiado limpios. Solución: usar factores dependientes del `planetType` y validar en al menos un planeta rocoso y uno arenoso.
- **Coste de logging**: el nuevo tracing podría saturar la consola. Sólo se activará bajo `LogCategory.TEXTURE` y `debugHudLogs`.

## Plan de trabajo

### Fase 1 — Diagnóstico/telemetría WebGL
- [x] Reproducir el error capturando `gl.getError()` y `gl.getParameter(this.gl.CURRENT_PROGRAM)` antes y después de `HUDTexture.updateTexture()`.
- [x] Añadir logs temporales en `ShaderManager` para detectar cuándo se recompila `hudProgram` y si `hudUniforms` siguen apuntando al programa correcto.

### Fase 2 — Corrección pipeline HUD
- [x] Resolver las ubicaciones de `u_modelMatrix`, `u_viewMatrix`, `u_projectionMatrix`, `u_texture` y `u_opacity` directamente desde `HUDManager` cada vez que se activa el shader, evitando caches obsoletos.
- [x] Actualizar `setupHUDRenderingState()` y `setupHUDMatrices()` para trabajar con esas ubicaciones puntuales y omitir cualquier `gl.uniform*` cuando la ubicación no sea válida, manteniendo el pipeline mínimo (sin snapshots ni push/pop masivos).
- [x] Restaurar el programa WebGL previo al salir de `HUDManager.render()` para no dejar el HUD como programa activo y contaminar los uniforms del render principal.
- [x] Ampliar la instrumentación en `WebGLService` para envolver todos los setters de uniforms, loggear el ID del programa esperado/actual y así localizar qué subsistema deja ubicaciones obsoletas.
- [x] Validar que, con `Debug.HUD.setLogsEnabled(true)`, la consola deja de reportar `UniformLocation is not from the current active Program` y que `HUDTexture.updateTexture()` ya no recibe `GL_INVALID_OPERATION`.

### Fase 3 — Rebalanceo visual en Marte
- [ ] Reducir `textureInfluence` base en `computeTextureInfluence()` y aplicar un clamp superior dependiente de altura/detalle para que `mixStrength` rara vez supere 0.6.
- [ ] Revisar `resolvePatternMixBoost()` para bajar el multiplicador de cráteres en alturas medias y compensar usando `resolvePatternContrast()` (contraste local en vez de mezcla total).
- [ ] Introducir un factor de preservación de paleta (ej. `lerp` hacia color base en función de `ridge`/`height`) para que las crestas mantengan el tinte rojizo original.
- [ ] Validar cambios volando sobre Marte con `Debug.enableLog('TEXTURE')` y `Debug.Atmosphere.setTextureDebug(true)` midiendo que `avgMix` baje a 0.5–0.6 y que `contrastRange` siga siendo >= 0.25.

### Fase 4 — Documentación y QA final
- [ ] Actualizar `documentation/Modo_Atmosferico.md` y `documentation/Resumen_Proyecto_y_Progreso.md` con las instrucciones para habilitar la telemetría HUD/Atmósfera y describir la nueva lectura de relieve.
- [ ] Añadir a la wiki (`public/wiki/...`) una sección breve sobre "Cómo interpretar el terreno de Marte" sin detalles técnicos.
- [ ] Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless --code-coverage=false`; adjuntar logs a `/logs`.
- [ ] Registrar una sesión QA describiendo los pasos que el jugador puede seguir para verificar el arreglo (¿cómo activar el debug, qué esperar visualmente?).

## Validación
1. Consola sin `HUDTexture update error` durante al menos 30s en cabina.
2. Telemetría atmosférica reportando `avgMix ≤ 0.6` y `contrastRange[1] ≥ 0.25` sobre Marte.
3. Jugador puede seguir las instrucciones en la wiki para visualizar cráteres sin ayuda técnica.
4. Build y tests completan sin errores.

## Checklist de comunicación/entregables
- [ ] Código y logs en repo.
- [ ] Documentación y wiki sync.
- [ ] Plan actualizado/cerrado (se puede borrar una vez completado, según guidelines).
