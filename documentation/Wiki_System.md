# Sistema de Wiki Estática

> Guía para mantener la nueva wiki pública servida como HTML puro desde `public/wiki/**`. El objetivo principal es que los buscadores puedan indexar cada página sin depender del bundle Angular ni del canvas WebGL.

## Resumen
- Ubicación del código: `public/wiki/` + `public/wiki/wiki.css`.
- Cada ruta es una carpeta con `index.html` (por ejemplo `/wiki/game-rules/index.html`).
- El header del juego abre la wiki en una pestaña nueva con `href="/wiki/index.html"` y `target="_blank"`.
- No existe ya `WikiNavigationService` ni overlays Angular: todo el contenido se edita directamente como HTML estático.

## Estructura actual

| URL pública | Archivo fuente | Propósito |
| --- | --- | --- |
| `/wiki/index.html` | `public/wiki/index.html` | Índice con tarjetas destacadas y guía de uso de la wiki estática. |
| `/wiki/legal/index.html` | `public/wiki/legal/index.html` | Aviso legal, licencias y contacto. |
| `/wiki/game-objects/index.html` | `public/wiki/game-objects/index.html` | Catálogo de objetos del universo. |
| `/wiki/glyphs/index.html` | `public/wiki/glyphs/index.html` | Grimorio y ritmos del vacío. |
| `/wiki/spaceship/index.html` | `public/wiki/spaceship/index.html` | Especificaciones de la nave y HUD. |
| `/wiki/solar-systems/index.html` | `public/wiki/solar-systems/index.html` | Generación de sistemas y Gate Rite. |
| `/wiki/planets/index.html` | `public/wiki/planets/index.html` | Biomas, checklist de aterrizaje y datos del sistema humano. |
| `/wiki/inventory/index.html` | `public/wiki/inventory/index.html` | Panel de inventario, estadísticas y atajos. |
| `/wiki/game-rules/index.html` | `public/wiki/game-rules/index.html` | Reglas de guardado, colisiones, hechizos y respawn. |

## Diseño y estilos
- `public/wiki/wiki.css` centraliza tipografía, layout, tarjetas, tablas y botones. Reutilízalo en todas las páginas para evitar duplicar estilos.
- Cada `index.html` debe:
	- Declarar `<!doctype html>` y `lang="es"`.
	- Incluir metadatos SEO (title, description, canonical, Open Graph/Twitter) con URLs absolutas.
	- Cargar el CSS compartido con `<link rel="stylesheet" href="/wiki/wiki.css" />`.
	- Mostrar un botón “↩ Volver al índice” (o al juego en el caso del índice principal) en la esquina superior derecha.
	- Organizar el contenido en secciones semánticas (`<section>`, `<header>`, `<ul>/<ol>`...).

## Flujo de edición
1. Editar directamente el archivo HTML correspondiente. Se recomienda usar secciones cortas y listas para mantenerlo escaneable.
2. Cuando se añadan nuevas páginas, crear la carpeta bajo `public/wiki/<slug>/` con su `index.html` y enlazarla desde el índice.
3. Actualizar `public/sitemap.xml` con la URL `https://to3.atropello-games.es/wiki/<slug>/index.html` para cada nueva entrada.
4. Ajustar la documentación (`documentation/Wiki_System.md` y `documentation/Resumen_Proyecto_y_Progreso.md`) para reflejar cambios relevantes.
5. Ejecutar `npm run build` y `npm run test -- --watch=false --browsers=ChromeHeadless --code-coverage=false` para validar la build.

## Accesibilidad y estilo editorial
- Mantén el contenido en castellano neutral orientado al jugador, conservando los términos propios del juego (Void Jump, Gate Rite, etc.).
- Usa encabezados jerárquicos (`h1`, `h2`, `h3`) y tablas/listas para datos densos.
- Añade `alt` descriptivos a cualquier imagen o icono que no sea puramente decorativo.
- Evita copiar bloques técnicos o fragmentos de código; la wiki es un manual para jugadores, no para desarrolladores.

## Navegación desde el juego
- El icono de la wiki en el header abre `/wiki/index.html` en una pestaña nueva y no interrumpe el canvas.
- Como las páginas ya no viven dentro de Angular, no se puede usar `routerLink`. Todos los enlaces deben ser URLs absolutas o relativas dentro de `public/wiki/`.
- El índice NO lleva botón "Volver al juego": como la wiki se abre en pestaña nueva, ese botón cargaba una segunda
  instancia del juego en la pestaña de la wiki en lugar de devolver el foco a la partida. Se vuelve cerrando la pestaña.
- Las subpáginas sí conservan "↩ Volver al índice" (`.wiki-back-button` fijo arriba a la derecha).

## Checklist para nuevas entradas
- [ ] Crear carpeta y `index.html` con metadatos completos.
- [ ] Añadir contenido con secciones semánticas y botones de retorno.
- [ ] Enlazar la página desde `public/wiki/index.html` (tarjeta o lista).
- [ ] Actualizar `public/sitemap.xml` y, si aplica, `public/robots.txt`.
- [ ] Documentar cambios en `documentation/Resumen_Proyecto_y_Progreso.md`.
- [ ] Ejecutar build y tests.

Actualizado: Diciembre 2025.
