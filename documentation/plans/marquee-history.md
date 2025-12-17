# Plan: Memoria de mensajes del HUD Marquee

## Contexto
El panel de marquee del HUD necesita una mecánica adicional: conservar una pila con los últimos mensajes emitidos (hasta 10) y permitir que el jugador reproduzca el más reciente usando `Backspace`. Esto impacta al `HUDManager`, al `MarqueePanel` y a los atajos descritos en `documentation/Input_Bindings.md` y en la wiki (apartado de HUD en `/wiki/spaceship`).

## Pasos propuestos

1. **Revisión técnica y documental**
   - Confirmar el flujo actual en `HUDManager` y `MarqueePanel` para saber dónde se eliminan mensajes.
   - Revisar `documentation/Input_Bindings.md` y `documentation/Layout.md` para mantener consistencia con los controles y la descripción del HUD.

2. **Implementar pila de historial en el HUD**
   - Añadir una estructura LIFO (máx. 10 elementos) a `HUDManager`, alimentada cuando un mensaje completa sus loops.
   - Asegurar que la pila elimina el elemento más antiguo cuando se excede el límite y que solo usa operaciones push/pop.

3. **Añadir la interacción con `Backspace`**
   - Extender los listeners de teclado del HUD para capturar `Backspace` (cuando no haya inputs enfocados).
   - Al activarse, hacer `pop` del historial, encolar el mensaje con 1 loop y prioridad máxima, y permitir que al finalizar vuelva a la pila automáticamente.

4. **Actualizar documentación y wiki**
   - Documentar la nueva tecla en `documentation/Input_Bindings.md` y el comportamiento en `documentation/Resumen_Proyecto_y_Progreso.md` (sección HUD).
   - Actualizar la wiki (`src/app/wiki/pages/spaceship/spaceship.ts`) donde se describe el HUD marquee para reflejar la mecánica de replay.

5. **Validación final**
   - Ejecutar `npm run build` y anotar cualquier ajuste pendiente antes de cerrar el plan.

## Seguimiento
- [x] Paso 1 completado
- [x] Paso 2 completado
- [x] Paso 3 completado
- [x] Paso 4 completado
- [ ] Paso 5 completado
- [x] Paso 5 completado
