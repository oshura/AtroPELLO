# Plan: Alternador de pantalla completa para usuarios autenticados

## Objetivo
Agregar un control flotante minimalista que permita a los jugadores con sesión iniciada ocultar el header y el footer para aprovechar todo el lienzo del juego, manteniendo una forma compacta del mismo control para restaurar el layout.

## Pasos
- [ ] Analizar y definir el estado compartido de "full screen" en AppComponent, incluyendo las dependencias con `AuthService`, el layout principal y las restricciones de accesibilidad.
- [ ] Diseñar e implementar el botón flotante (icono tipo `[ ]` verde) con sus dos estados visibles (expandir/reducir), mostrando el control solo cuando el usuario esté autenticado.
- [ ] Actualizar las plantillas y estilos globales (header, footer, contenedor principal) para responder al estado de pantalla completa con transiciones progresivas y garantizar que el canvas ocupe el 100% del viewport.
- [ ] Documentar el nuevo comportamiento en la wiki del juego y, si procede, en documentación técnica relacionada con el layout.
- [ ] Ejecutar `npm run build` para validar que el proyecto compila correctamente tras los cambios.
