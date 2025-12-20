# Plan: Reboot modo atmosférico ligero

## Objetivo
Volver a implementar el modo atmosférico apoyándonos en el motor espacial existente, limitando la escena a dos esferas estáticas (suelo y cielo) y reusando el comportamiento/controles del `GameEngine`. Solo añadiremos las reglas específicas de atmósfera (gravedad gradual, sonidos de aire, detección automática de aterrizaje/despegue) y las animaciones ya disponibles.

## Pasos
- [ ] **Aislar prototipos anteriores**
  - [ ] Copiar la versión actual de `src/app/game/modes` y cualquier documentación auxiliar a una carpeta de archivo (p. ej. `archive/atmosphere-prototype/`).
  - [ ] Realizar rollback del resto del repositorio para volver al estado estable pre-prototipo.
- [ ] **Escena atmosférica mínima**
  - [ ] Crear un módulo que, tras el `landing:fade-out`, monte una escena 3D con solo dos esferas concéntricas (suelo y cielo) y texturas básicas derivadas de la paleta del planeta.
  - [ ] Posicionar la nave en la altitud inicial suministrada por el landing context y mantener el `GameEngine` original activo (HUD, bindings, físicas base).
- [ ] **Reglas de vuelo y física**
  - [ ] Reutilizar la física del modo espacial para los inputs y mover la nave igual que en el sistema solar.
  - [ ] Añadir la fuerza gravitatoria suave cuando la velocidad cae por debajo de los umbrales definidos y registrar telemetría.
  - [ ] Integrar los SFX de aire/stall existentes y asegurar que se disparan desde el mismo subsistema que en espacio.
- [ ] **Aterrizaje y despegue**
  - [ ] Reusar la lógica de aterrizaje existente (camara fija + tracking + polvo) al detectar colisión con la esfera del suelo o al cumplir las normas de touchdown.
  - [ ] Detectar salida por la esfera del cielo para relanzar la animación de takeoff y restaurar la escena completa del sistema solar.
- [ ] **Documentación y QA**
  - [ ] Actualizar wiki y documentación técnica con la nueva arquitectura simplificada.
  - [ ] Ejecutar `npm run build` y checklist QA (descenso, vuelo bajo, salida por cielo, aterrizaje manual y automático).
