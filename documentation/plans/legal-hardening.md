# Plan: Refuerzo legal continuo (persona física)

## Contexto
El objetivo es dejar la landing y el proyecto en regla frente a editoras o reclamaciones, manteniendo la operación como persona física (sin sociedad). Este plan se ejecutará por fases y cada fase requerirá confirmación del usuario antes de seguir. Todos los entregables se documentarán en `/documentation/legal/` o en la carpeta indicada.

## Fases

1. **Identidad jurídica y canales de contacto**
   - Verificar los datos públicos (nombre completo, municipio, email y dirección postal) y definir cómo se expondrán/obfuscarán en la landing y documentación.
   - Entregables: actualización de la landing/legal terms con identificador oficial, checklist sobre cumplimiento de obligaciones de autónomo.

2. **Propiedad intelectual y licencias (TO3)**
   - Documentar la situación real de TO3: audio en preparación por Ari Torres sin masters entregados aún y sin contratos firmados.
   - Inventariar assets propios vs. terceros (audio, arte, códigos, capturas) y registrar su licencia/permisos, incluso si son acuerdos de buena fe pendientes de formalizar.
   - Documentar que el arte, la narrativa y el código son 100% propios; estudiar el registro de marca/obra para proteger la idea frente a terceros aunque la inspiración (Lovecraft) sea de dominio público.
   - Revisar la página de licencias de terceros para confirmar dependencias y anotar placeholders cuando la información falte (p.ej., FreeSound).
   - Entregables: `documentation/legal/asset-inventory.md` actualizado, `documentation/legal/brand-registration-checklist.md`, `documentation/legal/work-dossier-template.md` listos para completar + notas claras sobre contratos pendientes y responsabilidades asociadas.

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
- [x] Confirmar que la operación continúa como persona física (sin sociedad) y que, por ahora, basta con exponer los datos legales en la wiki + footer.

> La **Fase 2** queda en stand-by hasta el lanzamiento del producto; los documentos base para marca y dossier ya existen y solo falta completarlos cuando se retome.

## Plan activo — Fase 3 (diciembre 2025)

- [x] Inventariar los datos tratados actualmente (auth Cognito, logs técnicos, partidas guardadas en S3 sin email).
- [x] Redactar y publicar `public/privacy-policy.html` y `public/cookies-policy.html` con contactos y bases legales.
- [x] Actualizar la wiki legal para enlazar ambas políticas y describir el almacenamiento local real.
- [x] Ejecutar `npm run build` tras los cambios.

## Plan activo — Fase 4 (diciembre 2025)

- [x] Confirmar que no existen acuerdos externos activos: todo el contenido (landing, marca, juegos) es propio.
- [x] Crear `documentation/legal/third-party-agreements.md` como registro futuro y mantener la plantilla existente para acuerdos mínimos.
- [x] Mantener el canal de reclamaciones descrito en `/wiki/legal#reclamaciones` como vía oficial mientras no haya terceros.

## Fases futuras (pospuestas para crecimiento)

- [ ] **Registro internacional de marca**: evaluar EUIPO/Madrid System cuando se planee distribución fuera de España.
- [ ] **Aceptación explícita de términos in-game**: añadir modal/checkbox que referencie las políticas antes de guardar partidas.
- [ ] **Actualización continua de licencias de dependencias**: cada nuevo SDK/servicio debe reflejarse en la página de licencias y, si aplica, dentro del juego.
- [ ] **Plan automatizado de retención y purga de datos**: definir cronograma (ej. partidas inactivas >12 meses) y documentar la ejecución.
- [ ] **Seguro de responsabilidad civil/ciberseguridad**: cotizar pólizas básicas antes de firmar con editoras.
- [ ] **Términos para contenido generado por usuarios**: preparar cláusulas por si se habilitan foros, mods o uploads en el futuro.
