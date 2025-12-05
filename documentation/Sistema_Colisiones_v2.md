# Sistema de Física de Colisiones 3D

## Resumen

Sistema completamente refactorizado de colisiones inelásticas realistas entre esferas en 3D, siguiendo principios de Clean Code y arquitectura de servicios.

## Arquitectura

### 1. **CollisionPhysicsService** - Física Pura
**Ubicación**: `src/app/game/services/physics/collision-physics.service.ts`

**Responsabilidades**:
- Cálculos matemáticos de física de colisión
- Conservación de momento lineal
- Aplicación de impulsos según normal de colisión
- Sin dependencias de lógica de juego

**Principios de Física Implementados**:

```typescript
// 1. Normal de colisión (de objeto 1 hacia objeto 2)
n = normalize(p2 - p1)

// 2. Velocidad relativa
v_rel = v1 - v2

// 3. Velocidad relativa normal
v_rel_n = v_rel · n

// 4. Condición de colisión
if (v_rel_n > 0) return; // Objetos separándose

// 5. Magnitud del impulso
j = -(1 + e) × v_rel_n / (1/m1 + 1/m2)

// 6. Nuevas velocidades
v1' = v1 - (j × n) / m1
v2' = v2 + (j × n) / m2

// 7. Vector de separación
overlap = (r1 + r2) - distance
separation = -n × (overlap + margin)
```

**Coeficiente de Restitución (e)**:
- `e = 0`: Colisión completamente inelástica (objetos se quedan juntos)
- `e = 0.3`: Semi-inelástico (realista para asteroides)
- `e = 1`: Colisión elástica perfecta (conserva energía cinética)

### 2. **CollisionResponseService** - Lógica de Juego
**Ubicación**: `src/app/game/services/physics/collision-response.service.ts`

**Responsabilidades**:
- Configuración de física según tipo de objeto
- Gestión de casos especiales (objetos inmóviles)
- Eyección de asteroides de clusters
- Logging de eventos

### Configuraciones por Tipo

| Tipo | Restitución | Masa | Móvil | Comportamiento |
|------|-------------|------|-------|----------------|
| `Asteroid` | 0.3 | 1 | ✅ | **Física completa 3D** - Rebota según ángulo |
| `ClusterObject` | 0.3 | 1 | ✅ | **Física completa 3D** - Igual que Asteroid |
| `SuperAsteroid` | N/A | N/A | ❌ | **Slide suave** - Aparta la nave |
| `MegaAsteroid` | N/A | N/A | ❌ | **Slide suave** - Aparta la nave |
| `Planet`* | N/A | N/A | ❌ | **Slide suave** - Inmóvil |
| `Sun` | N/A | N/A | ❌ | **Slide suave** - Inmóvil |
| `Portal` | N/A | N/A | ❌ | Etéreo, sin física |

*Incluye: RingedPlanet, GaseousPlanet, GiantPlanet, DwarfPlanet, Protoplanet, EarthSplitPlanet

**Nota**: Solo los asteroides pequeños (`Asteroid` y `ClusterObject`) utilizan el sistema de física de colisión inelástica 3D completo. Los asteroides grandes (Super y Mega) y objetos masivos utilizan el sistema de "slide suave" que aparta la nave lateralmente para mejor UX y evitar daño repetitivo.

### 3. **GameEngine Integration**
**Ubicación**: `src/app/game/GameEngine.ts` (método `handleCollisionResponse`)

**Flujo de Colisión**:

```
checkCollisions()
  └─> Para cada objeto colisionado:
      └─> handleCollisionResponse(obj, type, dmg)
          ├─> if (isSmallAsteroid): // Asteroid, ClusterObject
          │   ├─> calculateShipCollisionResponse()
          │   ├─> Aplicar física 3D completa
          │   ├─> Asteroide sale según ángulo de impacto
          │   └─> if (shouldEject): makeAsteroidIndependent()
          │
          ├─> else if (isLargeAsteroid || isMassiveObject):
          │   ├─> calculateImmovableObjectResponse()
          │   ├─> Aplicar slide suave (300ms)
          │   └─> Cancelar velocidad radial
          │
          └─> else (default):
              └─> Cancelar velocidad radial simple
```

## Comportamiento Físico

### Colisión Nave vs Asteroide Pequeño (masa 1)

**Escenario**: Nave (masa 100, v=10 m/s) impacta asteroide (masa 1, v=0)

```
Antes:
- Nave: v = (10, 0, 0), m = 100
- Asteroide: v = (0, 0, 0), m = 1

Cálculo (e=0.3):
- v_rel = (10, 0, 0)
- n = (1, 0, 0)
- j = -(1 + 0.3) × 10 / (1/1 + 1/100) = -12.87

Después:
- Nave: v ≈ (9.87, 0, 0) [cambio pequeño]
- Asteroide: v ≈ (12.87, 0, 0) [sale disparado]
```

### Colisión Nave vs Planeta (masa infinita)

**Escenario**: Nave impacta planeta inmóvil

```
Antes:
- Nave: v = (10, 5, 0)
- Planeta: v = (0, 0, 0), inmóvil

Resultado:
- Nave: Slide suave tangencial (300ms)
- Nave: Velocidad radial cancelada
- Planeta: Sin cambio (inmóvil)
```

## Tests Unitarios

**Ubicación**: `src/app/game/services/physics/collision-physics.service.spec.ts`

**Casos de Prueba**:
1. ✅ Conservación de momento en colisión frontal
2. ✅ Colisión objeto pesado vs ligero
3. ✅ No aplicar impulso a objetos que se separan
4. ✅ Colisión 3D con vectores complejos
5. ✅ Generación de vector de separación
6. ✅ Magnitud y normalización de vectores

**Ejecutar Tests**:
```bash
npm test -- collision-physics.service.spec.ts
```

## Ventajas del Nuevo Sistema

### Clean Code ✅
- **Single Responsibility**: Cada servicio tiene una única responsabilidad
- **Dependency Injection**: Servicios desacoplados y testeables
- **Open/Closed**: Fácil añadir nuevos tipos sin modificar código core
- **No Magic Numbers**: Todas las constantes físicas documentadas

### Física Realista ✅
- **Conservación de Momento**: Garantizada matemáticamente
- **Dirección del Impacto**: El asteroide sale en la dirección correcta según el ángulo
- **Masa Importa**: Objetos pesados se mueven menos que ligeros
- **3D Completo**: Funciona en todas las direcciones del espacio

### Mantenibilidad ✅
- **Testeado**: Tests unitarios con casos físicos verificables
- **Documentado**: JSDoc completo en todos los métodos
- **Logs Detallados**: Debugging fácil con información de velocidades, impulsos y normales
- **Configurable**: Fácil ajustar parámetros por tipo de objeto

## Comparación: Antes vs Después

### Antes (Sistema Antiguo)
```typescript
// Código duplicado, magic numbers
if (name === 'Asteroid') {
  reflect(0.4); // ¿Qué es 0.4?
  const wallNx = -nx, wallNy = -ny, wallNz = -nz;
  const impulseMag = -(1 + 0.6) * relVdotWall / (1/1 + 1/100);
  // ... código mezclado con lógica de juego
}
```

**Problemas**:
- Física mezclada con lógica de juego
- No testeado
- Magic numbers sin documentar
- Difícil modificar o extender

### Después (Sistema Nuevo)
```typescript
// Clean, testeable, documentado
const response = this.collisionResponseService.calculateShipCollisionResponse(
  ship, target, objectType
);
this.spaceship.position = response.newPosition;
this.spaceship.velocity = response.newVelocity;
```

**Ventajas**:
- Física pura en servicio dedicado
- 100% testeado con Jasmine
- Constantes documentadas
- Fácil extender con nuevos tipos

## Configuración

Para añadir un nuevo tipo de objeto:

```typescript
// En CollisionResponseService.getCollisionConfig()
case 'NuevoTipo':
  return {
    restitution: 0.3,  // Elasticidad (0-1)
    mass: 5,           // Masa relativa
    immovable: false   // ¿Se puede mover?
  };
```

## Constantes Físicas

```typescript
// Masas relativas
SHIP_MASS = 100
ASTEROID_MASS = 1
SUPER_ASTEROID_MASS = 10
MEGA_ASTEROID_MASS = 100
PLANET_MASS = 1e6

// Coeficientes de restitución
ASTEROID_RESTITUTION = 0.3   // Semi-inelástico
SUPER_RESTITUTION = 0.2      // Más inelástico
MEGA_RESTITUTION = 0.1       // Casi inelástico
PLANET_RESTITUTION = 0.05    // Muy inelástico

// Márgenes
SEPARATION_MARGIN = 0.1      // Unidades extra de separación
LARGE_OBJECT_SLIDE_TIME = 300 // ms para slide suave
```

## Logging

Todos los eventos de colisión se registran con:

```typescript
GameLogger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision response calculated', {
  objectType,
  objectId,
  impulseMagnitude,
  shipOldVel,
  shipNewVel,
  targetOldVel,
  targetNewVel,
  collisionNormal
});
```

## Referencias

- **Física de Colisiones**: [Wikipedia - Elastic Collision](https://en.wikipedia.org/wiki/Elastic_collision)
- **Conservación de Momento**: p = m₁v₁ + m₂v₂
- **Impulso**: J = ∫F dt = Δp
