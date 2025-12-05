# 🏗️ Layout Principal - AtroPELLO

## 📋 Índice
- [Descripción General](#descripción-general)
- [Arquitectura Flexbox](#arquitectura-flexbox)
- [Componentes del Layout](#componentes-del-layout)
- [Responsividad](#responsividad)
- [Optimización para Juegos](#optimización-para-juegos)
- [Estructura de Archivos](#estructura-de-archivos)

---

## 🎯 Descripción General

El layout de AtroPELLO está diseñado específicamente para **maximizar el área de juego** mientras mantiene una interfaz elegante y funcional. Utiliza **CSS Flexbox** de manera jerárquica para garantizar que el canvas del juego ocupe todo el espacio disponible entre el header y footer.

### 🎮 Principio de Diseño
> **"Espacio máximo para el juego, interfaz mínima pero elegante"**

---

## 🧱 Arquitectura Flexbox

### Jerarquía de Contenedores

```
App (:host - flex column, 100vh)
├── Header (60px fijo)
├── Main (.main-content - flex: 1)     ← ÁREA EXPANDIBLE
│   └── app-game (flex: 1)
│       └── .game-container (flex: 1)
│           └── canvas (flex: 1)       ← CANVAS MÁXIMO
└── Footer (50px fijo)
```

### 📏 Configuración de Niveles

#### **Nivel 1: App Container**
```scss
// src/app/app.scss
:host {
  display: flex;
  flex-direction: column;
  height: 100vh;          // Ocupa toda la ventana
  margin: 0;
  padding: 0;
}
```

#### **Nivel 2: Main Content**
```scss
.main-content {
  flex: 1;                // Ocupa todo el espacio disponible
  display: flex;
  position: relative;
  overflow: hidden;
}

app-game {
  flex: 1;                // El componente game se expande
  display: flex;
  width: 100%;
  height: 100%;
}
```

#### **Nivel 3: Game Component**
```scss
// src/app/components/game/game.scss
:host {
  flex: 1;                // Host se expande
  display: flex;
  width: 100%;
  height: 100%;
}

.game-container {
  flex: 1;                // Contenedor se expande
  display: flex;
  flex-direction: column;
}

.game-canvas {
  flex: 1;                // Canvas ocupa todo el espacio
  width: 100%;
  height: 100%;
}
```

---

## 🧩 Componentes del Layout

### 🎯 Header Component

**Ubicación:** `src/app/components/header/`  
**Altura:** `60px` (fijo)  
**Función:** Navegación y branding  

**Características:**
- Logo con SVG personalizado
- Título de la aplicación
- Botones de navegación (Opciones, Login)
- Gradiente de fondo atractivo
- Sombra sutil para separación visual

```scss
.header-container {
  height: 60px;           // Altura fija
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

### 🎮 Main Content (Game Area)

**Ubicación:** `src/app/components/game/`  
**Altura:** `flex: 1` (expandible)  
**Función:** Área principal de juego  

**Características:**
- Canvas WebGL para renderizado
- Fondo con gradiente temático
- Sistema de overlay para modales
- Inicialización automática de WebGL
- Redimensionamiento automático

### 🏢 Footer Component

**Ubicación:** `src/app/components/footer/`  
**Altura:** `50px` (fijo)  
**Función:** Enlaces legales y branding  

**Características:**
- Enlaces de políticas y contacto
- Marca y copyright
- Diseño minimalista
- Colores sutiles para no distraer

---

## 📱 Responsividad

### 🖥️ Desktop (> 768px)
- Layout completo con todos los elementos visibles
- Botones de navegación completos
- Espaciado óptimo

### 📱 Mobile (≤ 768px)
```scss
@media (max-width: 768px) {
  .header-container {
    padding: 0 15px;      // Menor padding
  }
  
  .logo h1 {
    font-size: 20px;      // Título más pequeño
  }
  
  .nav-button {
    padding: 6px 12px;    // Botones más compactos
    font-size: 14px;
  }
}
```

---

## 🎮 Optimización para Juegos

### ⚡ Rendimiento
- **`overflow: hidden`** previene scroll no deseado
- **`image-rendering: pixelated`** para gráficos de pixel art
- **`position: relative`** para overlays eficientes

### 🎯 UX Gaming
- **Canvas full-screen** para inmersión máxima
- **Interfaz mínima** para no distraer
- **Transiciones suaves** sin afectar rendimiento
- **Z-index organizados** para modales y overlays

### 🚀 WebGL Ready
```typescript
// Inicialización optimizada del canvas
private resizeCanvas() {
  const canvas = this.canvas.nativeElement;
  const container = canvas.parentElement;
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (this.gl) {
      this.gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }
}
```

---

## 📂 Estructura de Archivos

```
src/app/
├── app.scss                    # Layout principal y estilos globales
├── app.html                    # Estructura HTML principal
├── app.ts                      # Importaciones de componentes
├── components/
│   ├── header/
│   │   ├── header.scss         # Estilos del header
│   │   ├── header.html         # Template del header
│   │   └── header.ts           # Lógica del header
│   ├── footer/
│   │   ├── footer.scss         # Estilos del footer
│   │   ├── footer.html         # Template del footer
│   │   └── footer.ts           # Lógica del footer
│   └── game/
│       ├── game.scss           # Estilos del área de juego
│       ├── game.html           # Template del juego
│       └── game.ts             # Lógica WebGL y canvas
└── styles.scss                 # Estilos globales y reset
```

---

## 🔧 Mantenimiento y Extensión

### ✅ Buenas Prácticas
1. **Mantener `flex: 1`** en la cadena de contenedores
2. **No usar `height: 100%`** en contenedores flex
3. **Preservar `overflow: hidden`** en el main-content
4. **Testear en múltiples resoluciones**

### 🚀 Extensiones Futuras
- Sidebar retráctil para herramientas de juego
- Header expandible con menú desplegable
- Footer con información dinámica del juego
- Sistema de notificaciones overlay

---

*Documentación actualizada: Octubre 2025 - AtroPELLO v1.0*