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

- [x] 3. Política de privacidad y cookies
  - Inventario actualizado: auth Cognito, logs propios, partidas guardadas en S3 con identificador interno sin correo.
  - Publicadas `public/privacy-policy.html` y `public/cookies-policy.html` con contacto y base legal.
  - La wiki legal enlaza ambas políticas y describe el almacenamiento local real.

- [x] 4. Contratos y relación con terceros
  - Situación actual: no hay terceros ni acuerdos externos; todo el contenido es propio.
  - Registro preventivo en `documentation/legal/third-party-agreements.md` para anotar colaboradores futuros.
  - El canal de reclamaciones documentado en `/wiki/legal#reclamaciones` permanece como vía oficial.

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
