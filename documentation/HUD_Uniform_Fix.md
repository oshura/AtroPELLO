# Correccion HUD Uniforms

## Problema Detectado
El shader del HUD y el shader lit de la nave comparten el estado global de WebGL. Diversos metodos de `ShaderManager` (como `setLitColor`, `setLighting`, `setLitMatrices`, etc.) escribian uniforms del programa iluminado aun cuando el programa activo en WebGL era otro (por ejemplo, el del HUD). Cuando `gl.uniform*` recibe una ubicacion perteneciente a un programa distinto al actualmente ligado, WebGL devuelve `GL_INVALID_OPERATION` y deja ubicaciones obsoletas para la siguiente llamada. Esto provocaba que `HUDTexture.updateTexture()` heredara el error y que el navegador mostrara "UniformLocation is not from the current active Program".

## Solucion Aplicada
1. **Nuevo helper en `ShaderManager`:**
   - Metodo `ensureProgramActive(program: WebGLProgram | null, label: string)` que compara el programa solicitado con `gl.getParameter(gl.CURRENT_PROGRAM)` y, si difieren, llama a `gl.useProgram(program)` antes de escribir uniforms.
2. **Actualizacion de todos los setters relevantes:**
   - Se llamo al helper desde `setBasicMatrices`, `setLitMatrices`, `setLighting`, `setSpecular`, `setPointLightLit`, `setLitColor`, `setLitOpacity`, `setTexturedMatrices` y `setTexturedLighting`.
   - De esta forma, cualquier servicio que escriba en los uniforms garantizara que el programa correcto este activo incluso si otra parte del motor cambio el estado entre llamadas.
3. **Sincronizacion con el HUD:**
   - `HUDManager` sigue restaurando el programa previo tras dibujar, pero ya no depende de eso para que los demas sistemas eviten errores; cada setter se protege a si mismo.

## Pasos para Reaplicar en Otra Rama
1. Abrir `src/app/game/ShaderManager.ts` y agregar el metodo `ensureProgramActive` junto a las importaciones existentes de `GameLogger` y `LogCategory`.
2. Antes de cada bloque `gl.uniform*` que opere sobre `basicProgram`, `litProgram` o `texturedProgram`, llamar a `this.ensureProgramActive(<program>, '<contexto>')`.
3. Recompilar con `npm run build` para verificar que no haya errores de tipo.
4. Ejecutar el juego; los warnings de `GL_INVALID_OPERATION` y "UniformLocation is not from the current active Program" deben desaparecer incluso con `Debug.HUD.setLogsEnabled(true)`.

## Verificacion
- `npm run build` finaliza sin errores.
- Durante una sesion en cabina, el log ya no contiene mensajes de uniforms desincronizados ni errores previos a `HUDTexture.updateTexture()`.
