# 🔍 DIAGNÓSTICO TARGETING - NO SE VEN EFECTOS VISUALES

## **PROBLEMA REPORTADO:**
- La retícula funciona perfectamente 
- NO se ven efectos visuales cuando pasa sobre asteroides:
  - ❌ No aparece GLOW outline al hacer hover
  - ❌ No aparece PULSE outline al hacer click
  - ❌ Los asteroides no cambian de color/estado

## **FLUJO DEL SISTEMA:**
```
Mouse Move → InputHandler → ReticleManager.update() → TargetDetector.detectTargetAt() → handleTargetHovered() → OutlineRenderer.addOutline()
```

## **PUNTOS DE VERIFICACIÓN:**

### ✅ **1. Inicialización del Sistema**
- `GameEngine.initialize()` llama `reticleManager.initialize()`
- Debe inicializar: TargetDetector, OutlineRenderer, InputHandler

### ❓ **2. Detección de Mouse/Target**
- `InputHandler.getMousePosition()` debe devolver coordenadas correctas
- `TargetDetector.detectTargetAt()` debe encontrar asteroides
- Logs de debug: Buscar `🔍 detectTargetAt result:` en consola

### ❓ **3. Aplicación de Outlines**
- `handleTargetHovered()` debe llamar `outlineRenderer.addOutline()`
- `OutlineRenderer.addOutline()` debe añadir targets a la cola de renderizado
- Logs: Buscar `👁️ Target hovered:` en consola

### ❓ **4. Renderizado de Outlines**
- `GameEngine.renderOutlineSystem()` debe llamar `reticleManager.renderOutlines()`
- `OutlineRenderer.renderOutlines()` debe procesar targets con outlines
- WebGL framebuffer debe capturar objetos marcados

### ❓ **5. Shaders de Post-procesamiento**
- `OutlineRenderer.createOutlinePostProcessShader()` debe crear shaders
- Segunda pasada debe detectar bordes y aplicar colores
- Verificar que shaders se compilen correctamente

## **COMANDOS DE DEBUG:**
1. **Abrir:** http://localhost:4200
2. **Consola F12:** Buscar logs con `🔍` y `👁️`
3. **Mover mouse** sobre asteroides lentamente
4. **Verificar logs:** Aparecen detecciones?

## **HIPÓTESIS PRINCIPALES:**
1. **InputHandler no actualiza mousePosition**
2. **TargetDetector no encuentra intersecciones**
3. **OutlineRenderer no se inicializa correctamente**
4. **Shaders de outline no se compilan**
5. **Framebuffer no captura objetos correctamente**

## **SOLUCIONES RÁPIDAS A PROBAR:**
- Verificar que mouse events se registren
- Añadir logs más detallados en TargetDetector
- Verificar inicialización de OutlineRenderer
- Comprobar compilación de shaders