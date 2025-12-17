<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

- Aclarar los requisitos del proyecto.
Este proyecto es un Angular 20 SPA con encabezado, pie de página y área de contenido principal para juegos web OpenGL (webGL). Creado con routing, SCSS, SSR y configuración zoneless.

- En la carpera /documentation existe la documentacion técnica del proyecto, escrita en español. Utiliza esta documentación para conocer el proyecto cuando se analiza codigo relacionado con una de las funcionalidades documentadas.

- Manten la documentación si es necesario al generar código nuevo o modificar el existente.

- Existe un desarrollo en la aplicacion SPA de una wiki para el usuario. La wiki se encuentra en la ruta /wiki y el código relacionado con la wiki se encuentra en la carpeta /src/app/wiki. /documentation Wiki_System.md documenta el sistema de la wiki.

- La wiki, debe ser actualizada con el comportamiento (funcionalidades) que se implementan nuevas o se modifican. Debe tenerse en cuenta para completar cada desarrollo.

- Los desarrollos complejos, deben siempre partir con un analisis previo del código existente, analisis de la documentación técnica relacionada, y un plan de desarrollo que debe ser aprobado antes de comenzar a escribir código. El plan debe detallarse en /documentation/plans/ para poder retomar el desarrollo en cualquier momento con una lista con checks para marcar el progreso.

- En caso de estar ejecutando un plan, en una prueba detectar un problema y dedicarnos a corregirlo, es posible que nos entretengamos y desviemos un poco del plan, incluso que la tarea de correccion sea compleja. Por ello, siempre revisaras el plan, modificaras los steps o fases, y gracias a ello, la correccion/subtarea compleja estará reflejada y simplemente estaremos siguiendo un paso mas del plan. Sincronizado estará.

- Siempre ten en cuenta sobretodo /documentation/CleanCode_Arquitectura.md y /documentation/Resumen_Proyecto_y_Progreso.md.

- Por último, cada fase completada del desarrollo debe ser compilada con 'npm run build' para asegurar que el proyecto compila correctamente tras los cambios.

- Completado el plan y la documentación al respecto, puedes eliminar el plan.