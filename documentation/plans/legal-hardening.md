# Plan: Refuerzo legal continuo (persona física)

## Contexto
El objetivo es dejar la landing y el proyecto en regla frente a editoras o reclamaciones, manteniendo la operación como persona física (sin sociedad). Este plan se ejecutará por fases y cada fase requerirá confirmación del usuario antes de seguir. Todos los entregables se documentarán en `/documentation/legal/` o en la carpeta indicada.

## Fases

1. **Identidad jurídica y canales de contacto**
   - Verificar los datos públicos (nombre completo, municipio, email y dirección postal) y definir cómo se expondrán/obfuscarán en la landing y documentación.
   - Entregables: actualización de la landing/legal terms con identificador oficial, checklist sobre cumplimiento de obligaciones de autónomo.

2. **Propiedad intelectual y licencias**
   - Inventariar assets propios vs. terceros (audio, arte, códigos, capturas) y registrar su licencia/permisos.
   - Revisar la nueva página de licencias de terceros para confirmar que todas las dependencias relevantes están cubiertas y datadas.
   - Entregables: `documentation/legal/asset-inventory.md` completado + carpeta con pruebas o referencias de autoría/cesión.

3. **Privacidad, cookies y datos**
   - Enumerar datos recolectados (auth Cognito, logs, emails, cookies) con finalidad, base legal, ubicación y plazo.
   - Redactar una política de privacidad y una política de cookies (GDPR) enlazables desde la landing.
   - Entregables: `public/privacy-policy.html`, `public/cookies-policy.html` o equivalente + notas de cumplimiento.

4. **Relación con terceros y permisos**
   - Identificar proyectos/colaboradores y verificar que existe evidencia escrita de cesión/licencia.
   - Preparar plantilla de acuerdo mínimo (cesión limitada + indemnización) y definir canal formal de reclamaciones/DMCA.
   - Entregables: `documentation/legal/third-party-agreements.md`, plantilla actualizada en `documents/game-integration-minimum-agreement.md`, correo (p.ej. legal@atropello.games) configurado.

5. **Registros, fiscalidad y facturación**
   - Describir obligaciones como persona física (facturas, declaraciones, IVA/IRPF) y cómo se almacenarán los justificantes.
   - Preparar estructura de archivo (local o nube) y calendario de revisiones.
   - Entregables: guía en `documentation/legal/accounting-checklist.md` + notas sobre almacenamiento seguro.

6. **Términos legales visibles y código de conducta**
   - Expandir “Legal terms” con titular, jurisdicción, limitaciones, uso aceptable y contacto.
   - Publicar política de privacidad/cookies y añadir una sección “Code of Conduct / Uso aceptable”.
   - Versionar cada documento (fecha con `Última actualización`).
   - Entregables: sección actualizada en la landing, `public/code-of-conduct.html` o bloque equivalente.

7. **Procedimiento de incidencias y versionado**
   - Definir proceso para responder a DMCA/avisos (plazos, información requerida, log de acciones).
   - Crear plantilla de respuesta y registro de incidencias con fecha y resultado.
   - Entregables: `documentation/legal/incident-response.md`, registro en `documentation/legal/incident-log.md`.

## Próximos pasos
- Validar con el usuario que esta estructura cubre todas las necesidades.
- Una vez aprobada, iniciaremos la **Fase 1**, recopilando la información personal que se deba mostrar y definiendo los mensajes que irán en la landing/documentación.
- Tras completar cada fase, actualizaremos este plan marcando el avance y anotaremos cualquier dependencia pendiente antes de pasar a la siguiente.

## Plan activo — Fase 1 (febrero 2025)

- [x] Revisar documentación existente (legal-hardening, CleanCode, layout) y detectar el punto de inserción para los datos de contacto.
- [x] Crear la vista de “Términos legales” con datos ofuscados y sección de responsabilidades (componente standalone + ruta dedicada).
- [x] Conectar el footer y el overlay principal para que la ruta `/wiki/legal` sea accesible directamente desde el enlace “Términos Legales”.
- [x] Actualizar documentación y wiki, y validar con `npm run build` antes de cerrar la fase.
