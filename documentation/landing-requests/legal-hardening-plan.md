# Plan: Refuerzo legal de AtroPELLO Games

## Contexto
El objetivo es dejar la landing y el proyecto alineados con buenas prácticas legales aun operando como persona física. No se constituirá una sociedad por ahora, pero se quiere evitar riesgos comunes (propiedad intelectual, privacidad, fiscalidad, comunicación con terceros y respuesta a reclamaciones).

## Fases
- [x] 1. Identidad y datos de contacto oficiales
  - Nombre publicado: **Oshura Domo** (persona física), con ámbito **Granollers (08401), España**.
  - Contacto expuesto: `zargantana@gmail.com`, renderizado mediante decodificación en runtime para evitar spiders simples.
  - Dirección postal (C./ Aragó 15 casa) aparece en la sección "Legal" con la misma técnica de ofuscación.
  - El enlace «Términos Legales» del footer abre `/wiki/legal`, donde la información se revela tras la acción del usuario y nunca en el HTML generado por SSR.

- [ ] 2. Propiedad intelectual y licencias
  - Inventariar assets propios vs. de terceros (fuentes, música, capturas, arte). Confirmar permisos o licencias para cada caso.
  - Verificar que la página de licencias de terceros lista todo lo requerido y decidir si se registran marcas o dominios adicionales.
  - Documentar internamente las pruebas de autoría/cesión (ubicación en repo o drive).
  - Progreso: Registro inicial en `documentation/legal/asset-inventory.md` (audio TO3, componentes visuales, datos de juegos) y texto solicitado para TO3 en `documentation/TO3-requests/audio-terms.md`. Pendiente completar tabla de juegos y licencias detalladas de FreeSound.

- [ ] 3. Política de privacidad y cookies
  - Enumerar qué datos se procesan (logs, emails, Cognito, etc.), dónde se almacenan y con qué finalidad.
  - Redactar una política de privacidad simple (GDPR friendly): base legal, derechos ARCO, contacto y procedimientos.
  - Alinear la política de cookies: ya se usa localStorage para Cognito; revisar si hay otras herramientas.

- [ ] 4. Contratos y relación con terceros
  - Identificar juegos/colaboradores alojados en la landing y garantizar que existen permisos escritos.
  - Preparar un acuerdo sencillo para terceros (cesión de derechos limitada + cláusula de indemnización) o recopilar los existentes.
  - Definir canal para reclamaciones (DMCA, contenido ofensivo, etc.).
  - Progreso: Plantilla base creada en `documents/game-integration-minimum-agreement.md`; falta personalizar por juego y definir canal de reclamaciones.

- [ ] 5. Registros y fiscalidad
  - Revisar obligaciones como autónomo/persona física: facturación, declaraciones de ingresos, almacenamiento de recibos.
  - Determinar si se necesita un NIF/IVA en las facturas emitidas.
  - Establecer un procedimiento para guardar documentos (por ejemplo en `/documentation/legal/` o un drive privado).

- [ ] 6. Términos legales y políticas visibles
  - Actualizar la sección "Legal terms" con: titular, jurisdicción aplicable, limitación de responsabilidad, uso aceptable.
  - Añadir enlace a la política de privacidad nueva y al mecanismo de reclamaciones.
  - Versionar y fechar cada documento (ej. `Última actualización: <fecha>`).

- [ ] 7. Respuesta a incidencias
  - Definir un flujo para responder a una notificación (plazos, qué datos pedir, cómo documentar la respuesta).
  - Redactar una plantilla básica de respuesta.
  - Guardar un registro (log) de incidencias y su resolución.

## Notas
- Trabajaremos fase por fase; cuando completes una, pasaremos a la siguiente.
- Cualquier información personal sensible se manejará fuera del repositorio público.
- Al finalizar cada fase actualizaremos el plan y la documentación visible en la landing.
