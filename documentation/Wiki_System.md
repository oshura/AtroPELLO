# Sistema de Wiki In-Game

> Referencia rápida para desarrolladores sobre la wiki accesible desde el botón del header. Describe cómo se organiza, cómo se añaden páginas y qué requisitos deben cumplir para que el buscador funcione.

## Resumen
- Ubicación del código: `src/app/wiki`.
- Entrada única mediante `WikiNavigationService` que memoriza la última ruta visitada para el botón “Back to Game”.
- Cada página es un componente standalone cargado con `loadComponent` desde `wiki.routes.ts`.
- El índice (`wiki-index`) renderiza tarjetas y expone un buscador client-side que filtra por título, descripción y palabras clave.

## Estructura actual

| Ruta | Archivo | Propósito | Palabras clave sugeridas |
| --- | --- | --- | --- |
| `/wiki/legal` | `pages/legal-terms/legal-terms.ts` | Aviso legal, contacto ofuscado y procedimiento de reclamaciones. | `legal`, `contacto`, `cookies`, `reclamaciones`, `licencias` |
| `/wiki` | `pages/wiki-index/wiki-index.ts` | Portada con buscador y mosaico de entradas. | `wiki`, `buscador`, `indice` |
| `/wiki/glyphs` | `pages/glyphs/glyphs.ts` | Descripción de hechizos/glifos y sus costes. | `hechizos`, `glifos`, `rituales` |
| `/wiki/game-objects` | `pages/game-objects/game-objects.ts` | Catálogo de objetos físicos del juego. | `asteroides`, `planetas` |
| `/wiki/spaceship` | `pages/spaceship/spaceship.ts` | Información del fuselaje, módulos y ahora la Marquesina del HUD (eventos visibles). | `nave`, `thrusters`, `hud` |
| `/wiki/solar-systems` | `pages/solar-systems/solar-systems.ts` | Generación de sistemas solares. | `procedural`, `orbita` |
| `/wiki/planets` | `pages/planets/planets.ts` | Tipos de planeta y trasfondo. | `planetas`, `habitabilidad` |
| `/wiki/game-rules` | `pages/game-rules/game-rules.ts` | Reglas básicas, aterrizaje, supervivencia y limitaciones actuales de Cloud Saves (un slot por piloto salvo mejoras). | `controles`, `aterrizaje`, `cloud saves` |
| (nuevo) `/wiki/inventory` | `pages/inventory/inventory.ts` | Panel de inventario, estadísticas y slots. | `inventario`, `equipo`, `cordura` |

## Reglas para añadir páginas
1. **Registrar la ruta** en `wiki.routes.ts` usando `loadComponent` para mantener lazy loading.
2. **Actualizar el índice** (`wiki-index.ts`) agregando una entrada a `entries` con `keywords` relevantes, ya que el buscador se alimenta de ese arreglo.
3. **Diseño consistente**: reutilizar el layout existente (`.wiki-page`, `.arcade-back`, etc.) para conservar la identidad visual. Las hojas de estilo se escriben en el propio componente.
4. **Accesibilidad**: utilizar `<section>`, `<header>` y listas semánticas. Evitar párrafos excesivamente largos; separar el contenido en tarjetas o bloques fácilmente escaneables.
5. **Idioma**: aunque el juego mezcla castellano e inglés, el texto orientado al jugador debe priorizar mensajes claros y cortos en castellano neutral, manteniendo términos propios (Void Energy, Gate Rite, etc.).

## Buscador
- Entrada ligada a `searchQuery` (signal). El filtro divide la cadena por espacios y exige que cada término aparezca en el título, descripción o keywords de una tarjeta.
- Para que una nueva página sea descubrible, define 3‑6 keywords (`keyword: string[]`).
- El botón “✕” resetea el estado; no hace falta tocarlo al añadir páginas.

## Flujo de navegación
1. `WikiNavigationService.setLastRoute(url)` se invoca en cada `ngOnInit` de las páginas para recordar dónde estaba el usuario.
2. El enlace “BACK TO GAME >>” simplemente navega a `/` (el juego reanuda input al cerrar la wiki).
3. Mantén esta llamada en nuevas páginas y evita redirecciones manuales.

## Checklist de nuevas entradas
- [ ] Ruta registrada en `wiki.routes.ts`.
- [ ] Entrada añadida al índice con `keywords` útiles.
- [ ] Contenido dividido en secciones con encabezados y listas cortas.
- [ ] Texto validado con la versión actual del juego (nada “TBD” si ya está implementado).
- [ ] Referencias cruzadas (ej. enlaces a otras páginas) usan `routerLink` para evitar recargas.

Actualizado: Noviembre 2025.
