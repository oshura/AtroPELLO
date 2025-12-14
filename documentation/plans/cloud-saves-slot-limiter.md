# Plan · Cloud Saves Slot Limiter

## Objetivo
Limitar la experiencia del jugador a un único slot visible en la wiki como regla de juego, rediseñar el panel/tab de Cloud Saves para reflejar esta restricción inicial (con tope dinámico controlado por el personaje) y preparar la infraestructura para desbloquear slots adicionales mediante magia o módulos.

## Pasos
- [x] Documentación y wiki
  - Actualizar `Wiki_System.md`, `wiki.routes.ts`, `wiki-index.ts` y `GameRulesWikiComponent` para eliminar la página específica de Cloud Saves y describir la regla "un único slot (por ahora)" dentro de Game Rules.
  - Retirar `CloudSavesWikiComponent` y referencias.
- [x] Modelo de datos de savegames
  - Extender `SaveGameMetadata` y `SaveGameCharacterState` para incluir `characterId`, `characterSlotIndexes`, `activeSlotIndex` y `slotCapacity`.
  - Añadir getters/setters en `GameStateStore` para persistir `characterId` y los slots adjudicados; inicializar en `[0]` para campañas nuevas.
  - Ajustar `PlayerStateSerializer` y `GamePersistenceService` para capturar/aplicar estos campos.
- [x] Servicios de cloud saves
  - Crear `CloudSaveSlotFinderService.acquireNewSlot()` que identifica el siguiente índice libre en el master data evitando colisiones entre personajes.
  - Actualizar `CloudSavesService` para:
    - Sincronizar automáticamente al iniciar sesión y cargar la última partida disponible en la nube.
    - Mantener estados independientes para slots del personaje vs. master data y exponer modo "ver todos".
    - Integrarse con el slot finder para adjudicar slots adicionales al personaje y guardar la lista en metadata.
    - Cargar automáticamente el slot más reciente del personaje al arrancar.
- [x] Panel/tab de Cloud Saves
  - Rediseñar `cloud-saves-panel.component` (TS/HTML/SCSS) para mostrar un único slot-card cuando sólo existe un índice asignado.
  - Añadir botón "Ver todas las partidas" que alterna entre los slots del personaje y el master data; al habilitarlo se desactiva la acción de guardado.
  - Ajustar los botones Load/Save/Delete para que sólo se activen con slot seleccionado (>1) y siempre activos cuando sólo hay uno.
- [x] Header y opciones
  - Modificar el botón del header: si el personaje sólo tiene un slot, guardar directamente; si tiene múltiples, abrir el modal de opciones en la pestaña "Partidas".
  - Permitir que el diálogo de opciones sea forzado al tab “saves” desde el header.
- [x] QA + documentación
  - Reflejar el nuevo comportamiento en `SaveGame_Serializacion_Cloud.md` y la wiki.
  - Ejecutar `npm run build` para validar la fase.
