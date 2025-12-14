# Inventario de assets y licencias

> Última actualización: 2025-12-14

## 1. Audio (solo aplicable a TO3)
- **Autor principal:** Ari Torres Albarez (músico licenciado en el Liceo de Barcelona, especialidad guitarra flamenca).
- **Titularidad temporal:** Acuerdo de buena fe entre Ari y Oshura; todavía no existe contrato firmado ni cesión escrita, pero ambos asumen que las piezas se usarán únicamente dentro de TO3.
- **Estado actual:** Ari no ha entregado los masters definitivos (`.aup3`). En cuanto los comparta se añadirán a la tabla inferior con fecha y hash.
- **Almacenamiento previsto:** `/sound` dentro del repositorio privado de TO3 (no subir a la landing pública).
- **Sonidos adicionales:** Mezcla de grabaciones propias y descargas desde <https://freesound.org>. Conservar los enlaces directos y licencias en el registro privado de TO3.
- **Acciones pendientes inmediatas:**
	1. Formalizar un contrato/cesión simple con Ari en cuanto entregue los masters.
	2. Completar esta tabla y el documento `documentation/TO3-requests/audio-terms.md` con los datos reales cuando estén disponibles.

### 1.1 Registro Freesound (placeholder)

| Archivo `.aup3` | URL FreeSound | Licencia | Notas |
| --- | --- | --- | --- |
| _(pendiente)_ | _(pendiente)_ | _(pendiente)_ | Añadir enlace original + requisitos de atribución |
| _(pendiente)_ | _(pendiente)_ | _(pendiente)_ | Añadir fecha de descarga y evidencia |

> Completar esta tabla cuando tengas a mano los enlaces exactos; sirve como recordatorio visible. Mientras tanto, los masters siguen en `/sound` y los contratos en el repositorio privado.

## 2. Componentes visuales de la landing
- **Descripción:** Los "assets" visibles en esta landing son componentes Angular (header, hero, cards de juegos) y elementos SCSS.
- **Origen:** Todos son desarrollos propios realizados por Oshura; se consideran IP nativa de AtroPELLO/TO3.
- **Licencia interna:** Uso exclusivo dentro de los productos de AtroPELLO; no hay dependencias de terceros fuera de las fuentes tipográficas ya listadas en `public/legal/third-party-licenses.*`.
- **Acción recomendada:** Añadir capturas o renders finales a un drive privado junto con fecha/autor para reforzar la prueba de autoría.

## 3. Código fuente y narrativa
- **Código:** Todo el código (Angular, servicios, juego WebGL) es propio del proyecto; no se comparte ni sublicencia sin autorización expresa.
- **Idea/ambientación:** Inspirada en el universo de H. P. Lovecraft. Sus obras son de dominio público (> 1 siglo), por lo que no se requiere licencia para usar referencias.
- **Acciones futuras:** Evaluar registro de marca/nombre comercial para “AtroPELLO” o “TO3” y, si procede, registrar la obra/líneas argumentales como propiedad intelectual para reforzar la protección frente a copias.

## 4. Datos y materiales de juegos integrados
- **Contenido:** Logotipos, screenshots, descripciones y metadatos de los juegos publicados en la landing.
- **Permisos:** Existe (o existirá) un acuerdo firmado con cada estudio/autor antes de publicar su juego.
- **Uso previsto:** Mostrar en la landing, integrarlos en catálogos y permitir que el juego participe en los sistemas de guardado/sesión de AtroPELLO.
- **Entrega de métricas:** Se recopilan métricas de uso exclusivamente para compartirlas con el estudio propietario, nunca para terceros.
- **Acción:** Guardar los acuerdos en `/documents` (versión PDF o escaneada) y registrar su resumen en esta misma tabla cuando cada juego se active.

## 5. Próximos pasos para la Fase 2
1. Completar la tabla de juegos con nombre del título, estudio, fecha de firma y alcance concedido.
2. Verificar y documentar las licencias de sonidos descargados de FreeSound (CC0, CC BY, etc.) indicando restricciones de atribución.
3. Actualizar la página de licencias de terceros si se añaden nuevas fuentes, fuentes o librerías.
4. Rellenar la checklist de marca (`documentation/legal/brand-registration-checklist.md`) y el dossier de obra (`documentation/legal/work-dossier-template.md`) con datos reales cuando proceda.
