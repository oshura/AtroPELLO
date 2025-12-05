# 🚀 Debug Overlay - Documentación de Usuario

## ¿Qué es el Debug Overlay?

El **Debug Overlay** es una herramienta visual que muestra información en tiempo real sobre la nave espacial durante el juego. Te permite monitorear la posición, orientación, velocidad y otros datos técnicos de la nave mientras juegas.

## 🎯 Activación del Debug Overlay

### Tecla de acceso rápido:
- **F1**: Activa/desactiva el overlay de debug

### Estados de activación:
- ✅ **Activo**: El overlay se muestra y actualiza automáticamente a 60 FPS
- ❌ **Inactivo**: El overlay está oculto y no consume recursos

## 📊 Información mostrada

### 📍 Posición (Coordenadas Cartesianas)
- **X, Y, Z**: Posición exacta de la nave en el espacio 3D
- Unidades: En unidades del mundo del juego
- Actualización: Tiempo real (60 FPS)

### 🌐 Posición (Coordenadas Esféricas)
- **Radius**: Distancia desde el origen (0,0,0)
- **Theta (θ)**: Ángulo azimutal (0-360°) - rotación horizontal
- **Phi (φ)**: Ángulo polar (0-180°) - rotación vertical

### 🔄 Orientación
- **Pitch**: Rotación en eje X (cabeceo)
- **Yaw**: Rotación en eje Y (guiñada)
- **Roll**: Rotación en eje Z (alabeo)
- Unidades: Grados (°)

### 💨 Velocidad
- **Speed**: Velocidad total (magnitud del vector velocidad)
- **VX, VY, VZ**: Componentes de velocidad en cada eje
- Unidades: Unidades por segundo

## 🎮 Controles del Overlay

### Cerrar el overlay:
- **F1**: Toggle on/off
- **× (botón)**: Cerrar overlay
- **ESC**: Pausa el juego (mantiene overlay activo si está abierto)

### Funcionalidades automáticas:
- 🔄 **Auto-actualización**: 60 FPS cuando está visible
- 💾 **Auto-pausa**: Se pausa cuando el overlay se oculta
- 🧹 **Auto-limpieza**: Se limpia automáticamente al cerrar el juego

## 🛠️ Características técnicas

### Rendimiento:
- **Frecuencia de actualización**: 60 FPS
- **Impacto en rendimiento**: Mínimo (solo cuando está visible)
- **Compatible con SSR**: Sí (no se ejecuta en servidor)

### Cálculos automáticos:
- **Coordenadas esféricas**: Calculadas automáticamente desde cartesianas
- **Velocidad total**: Calculada como magnitud del vector velocidad
- **Conversión angular**: De radianes a grados automáticamente

## 🎨 Diseño visual

### Estilo:
- **Tema**: Matrix/Sci-fi (fondo negro, texto verde neón)
- **Posición**: Esquina superior derecha
- **Transparencia**: Fondo semi-transparente con blur effect
- **Fuente**: Courier New (monoespaciada)

### Organización:
```
🚀 Spaceship Debug Info                    [×]
┌─────────────────────────────────────────────┐
│ 📍 Position (Cartesian)                     │
│ X: 125.432  Y: -45.123  Z: 200.876         │
│                                             │
│ 🌐 Position (Spherical)                     │
│ Radius: 251.234  Theta: 342.1°  Phi: 78.5° │
│                                             │
│ 🔄 Rotation                                 │
│ Pitch: 15.2°  Yaw: 45.8°  Roll: -2.1°      │
│                                             │
│ 💨 Velocity                                 │
│ Speed: 23.456  VX: 12.3  VY: -5.4  VZ: 18.2│
└─────────────────────────────────────────────┘
```

## 🐛 Solución de problemas

### El overlay no aparece:
1. ✅ Verificar que el juego esté inicializado
2. ✅ Presionar F1 para activar
3. ✅ Verificar que no hay errores en consola

### Los datos no se actualizan:
1. ✅ Verificar que la nave esté activa en el juego
2. ✅ Verificar que el GameEngine esté corriendo
3. ✅ Refrescar la página si es necesario

### Problemas de rendimiento:
1. 🎯 El overlay se auto-desactiva cuando no está visible
2. 🎯 Usar F1 para ocultar si no se necesita
3. 🎯 El impacto es mínimo (< 1% CPU)

## 🚀 Casos de uso

### Para desarrolladores:
- 🔧 **Debug de física**: Monitorear posición y velocidad
- 🔧 **Calibración de controles**: Verificar rotaciones
- 🔧 **Testing de colisiones**: Monitorear coordenadas
- 🔧 **Optimización**: Verificar comportamiento de la nave

### Para jugadores avanzados:
- 🎮 **Navegación precisa**: Coordenadas exactas
- 🎮 **Análisis de vuelo**: Patrones de movimiento
- 🎮 **Speedrun**: Optimizar rutas y velocidad
- 🎮 **Exploración**: Mapear el espacio del juego

## 💡 Tips y trucos

### Navegación eficiente:
- Usar coordenadas esféricas para navegación orbital
- Theta indica dirección horizontal (como brújula)
- Phi indica elevación (0° = polo norte, 180° = polo sur)

### Análisis de vuelo:
- Speed > 0 indica movimiento activo
- Valores XYZ de velocidad muestran dirección de movimiento
- Rotaciones indican hacia dónde apunta la nave

### Coordenadas de referencia:
- Origen (0,0,0) = centro del mundo
- +X = derecha, +Y = arriba, +Z = hacia atrás/alejándose
- Radius muestra distancia total desde el centro

---

**🎮 ¡Disfruta explorando el espacio con información precisa en tiempo real!**