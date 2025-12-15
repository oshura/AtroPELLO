# Plan de Mejora SEO — TO³ y Wiki

Fecha: 14 de diciembre de 2025

## Objetivo
Incrementar la visibilidad en buscadores de https://to3.atropello-games.es/ y de todas las páginas de la wiki integrada, añadiendo metadatos ricos, etiquetas sociales y datos estructurados que describan el juego, el estudio y cada sección clave.

## Referencias previas
- Layout y composición general: `documentation/Layout.md`
- Resumen del proyecto: `documentation/Resumen_Proyecto_y_Progreso.md`
- Estructura de la wiki: `documentation/Wiki_System.md`

## Pasos

- [x] **Head base optimizado**: Actualizar `src/index.html` con título semántico, descripción, palabras clave, canonical a to3.atropello-games.es, preloads críticos y metadatos Open Graph / Twitter Card.
- [x] **Datos estructurados**: Inyectar JSON-LD (WebSite + VideoGame + Organization) en `index.html` para que Google entienda el producto y su publisher.
- [x] **Servicio SEO reutilizable**: Crear `SeoService` que maneje `<title>`, `<meta>`, canonical y structured data desde Angular (SSR compatible) y exponer helper para páginas internas.
- [x] **Metadatos por ruta**: Anotar `app.routes.ts` y `wiki.routes.ts` con `data.seo` (título, descripción, URL, imagen) y hacer que `App` escuche los cambios de ruta para aplicarlos mediante `SeoService`.
- [x] **Wiki específica**: Definir copys por sección (Spaceship, Glyphs, Inventory, etc.) basados en la documentación actual para mejorar long-tail SEO.
- [x] **Documentación**: Actualizar `Resumen_Proyecto_y_Progreso.md` con una nota sobre la nueva infraestructura SEO y cómo extenderla.
- [x] **Verificación**: Ejecutar `npm run build` para validar que SSR + Angular compilan con los nuevos proveedores.
- [x] **Robots y sitemap**: Alinear `public/robots.txt` y `public/sitemap.xml` con el dominio `https://to3.atropello-games.es/`, añadir URLs faltantes de la wiki y declarar `xmlns:xhtml` para evitar errores al usar `xhtml:link`.

> Al finalizar todos los pasos y validar en build, eliminar este plan.
