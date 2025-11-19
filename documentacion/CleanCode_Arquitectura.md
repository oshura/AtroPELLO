# Guía de Clean Code y Arquitectura - Proyecto AtroPELLO

## Filosofía General

Este documento establece los principios de clean code aplicados en el proyecto AtroPELLO, un juego espacial 3D con WebGL. Estos principios deben mantenerse en futuras modificaciones y ampliaciones del código.

---

## 1. Sistema de Tipos Fuerte y Explícito

### Principio
**Evitar identificación de tipos mediante `constructor.name` o comparaciones de strings**. Usar enumeraciones TypeScript como fuente única de verdad.

### Implementación en AtroPELLO

#### ❌ Antipatrón (Código Legacy)
```typescript
const name = obj.constructor.name;
if (name === 'Asteroid') {
  // lógica específica
} else if (name === 'SuperAsteroid') {
  // otra lógica
}
```

**Problemas:**
- Vulnerable a minificación (nombres cambian a `_Asteroid`, `a`, etc.)
- No type-safe
- Strings mágicos dispersos por el código
- Difícil de refactorizar

#### ✅ Patrón Clean Code
```typescript
// 1. Definir enum centralizado
export enum GameObjectType {
  ASTEROID = 'ASTEROID',
  SUPER_ASTEROID = 'SUPER_ASTEROID',
  MEGA_ASTEROID = 'MEGA_ASTEROID',
  PLANET = 'PLANET',
  // ... etc
}

// 2. Base class expone el tipo
export abstract class GameObject {
  protected gameObjectType: GameObjectType = GameObjectType.UNKNOWN;
  
  public getType(): GameObjectType {
    return this.gameObjectType;
  }
  
  protected setType(type: GameObjectType): void {
    this.gameObjectType = type;
  }
}

// 3. Subclases establecen su tipo
export class Asteroid extends GameObject {
  constructor(...) {
    super(...);
    this.setType(GameObjectType.ASTEROID);
  }
}

// 4. Uso en código
const type = obj.getType();
if (type === GameObjectType.ASTEROID) {
  // lógica específica
}

// O usar switch para exhaustiveness checking
switch (obj.getType()) {
  case GameObjectType.ASTEROID:
    // ...
    break;
  case GameObjectType.SUPER_ASTEROID:
    // ...
    break;
  // TypeScript nos avisará si falta un caso
}
```

**Ventajas:**
- Robusto contra minificación
- Type-safe (autocompletado, detección de errores)
- Refactoring seguro (renombrar es trivial)
- Documentación implícita (todos los tipos visibles en un lugar)

---

## 2. Categorización y Agrupación

### Principio
**Cuando hay múltiples tipos que comparten comportamiento, crear categorías explícitas**.

### Implementación

```typescript
export enum GameObjectCategory {
  ASTEROID = 'ASTEROID',  // Agrupa: Asteroid, SuperAsteroid, MegaAsteroid
  PLANET = 'PLANET',       // Agrupa: Planet, DwarfPlanet, GiantPlanet, etc.
  SHIP = 'SHIP',
  STAR = 'STAR',
  PORTAL = 'PORTAL'
}

// Mapa de tipo → categoría
export const TYPE_TO_CATEGORY: Record<GameObjectType, GameObjectCategory> = {
  [GameObjectType.ASTEROID]: GameObjectCategory.ASTEROID,
  [GameObjectType.SUPER_ASTEROID]: GameObjectCategory.ASTEROID,
  [GameObjectType.MEGA_ASTEROID]: GameObjectCategory.ASTEROID,
  // ...
};

// Helper functions
export function getCategory(type: GameObjectType): GameObjectCategory {
  return TYPE_TO_CATEGORY[type] || GameObjectCategory.UNKNOWN;
}

export function isCategory(type: GameObjectType, category: GameObjectCategory): boolean {
  return TYPE_TO_CATEGORY[type] === category;
}
```

**Uso:**
```typescript
// En lugar de múltiples comparaciones
if (type === GameObjectType.ASTEROID || 
    type === GameObjectType.SUPER_ASTEROID || 
    type === GameObjectType.MEGA_ASTEROID) {
  // lógica para asteroides
}

// Simplificado:
if (getCategory(type) === GameObjectCategory.ASTEROID) {
  // lógica para asteroides
}

// O directamente desde el objeto:
if (obj.getCategory() === GameObjectCategory.ASTEROID) {
  // lógica para asteroides
}
```

---

## 3. Organización de Archivos y Módulos

### Principio
**Agrupar archivos relacionados en carpetas temáticas**. Facilita navegación y evita "flat folders" con decenas de archivos.

### Estructura Aplicada

```
src/app/game/
├── game-objects/          # ← TODOS los GameObjects aquí
│   ├── index.ts           # Barrel export centralizado
│   ├── Asteroid.ts
│   ├── SuperAsteroid.ts
│   ├── MegaAsteroid.ts
│   ├── Planet.ts
│   ├── DwarfPlanet.ts
│   ├── GiantPlanet.ts
│   ├── RingedPlanet.ts
│   ├── GaseousPlanet.ts
│   ├── EarthSplitPlanet.ts
│   ├── Protoplanet.ts
│   ├── Sun.ts
│   ├── Portal.ts
│   ├── Spaceship.ts
│   └── Cluster.ts
├── types/                 # Definiciones de tipos
│   ├── game-object.types.ts
│   ├── targeting.types.ts
│   └── solar-system.types.ts
├── services/              # Lógica de negocio
├── rendering/             # Renderizado
├── hud/                   # UI en pantalla
├── targeting/             # Sistema de targeting
└── GameEngine.ts          # Motor principal
```

### Barrel Exports (index.ts)

```typescript
// game-objects/index.ts
export * from '../types/game-object.types';
export * from './Asteroid';
export * from './SuperAsteroid';
export * from './Planet';
// ... etc

// Permite imports limpios:
import { 
  Asteroid, 
  SuperAsteroid, 
  Planet, 
  GameObjectType 
} from './game-objects';

// En lugar de:
import { Asteroid } from './game-objects/Asteroid';
import { SuperAsteroid } from './game-objects/SuperAsteroid';
import { GameObjectType } from './types/game-object.types';
```

---

## 4. Tipado Explícito vs `any`

### Principio
**Evitar `any` siempre que sea posible**. Usar tipos específicos o `GameObject` como base.

### Comparación

#### ❌ Antipatrón
```typescript
function processObject(obj: any) {
  const name = obj.constructor.name; // No type checking
  if (name === 'Asteroid') {
    // obj. ← Sin autocompletado
    obj.velocity = ...;
  }
}
```

#### ✅ Patrón Clean Code
```typescript
function processObject(obj: GameObject) {
  const type = obj.getType(); // Type-safe
  
  switch (type) {
    case GameObjectType.ASTEROID:
      if (obj instanceof Asteroid) { // Type narrowing
        // obj. ← Autocompletado disponible
        obj.velocity = ...;
      }
      break;
  }
}

// O usar genéricos cuando sea apropiado
function processAsteroid<T extends Asteroid>(asteroid: T) {
  // asteroid es correctamente tipado
  asteroid.velocity = ...;
}
```

**Regla:** Si no sabes el tipo exacto pero sabes que es un GameObject, usa `GameObject` como tipo base. Solo usa `any` como último recurso.

---

## 5. Herencia y Polimorfismo

### Principio
**Las subclases pueden cambiar su tipo, pero siempre deben hacerlo explícitamente**.

### Implementación

```typescript
export class Asteroid extends GameObject {
  constructor(id: string, position: Vector3, size: number) {
    super(id, position, ...);
    this.setType(GameObjectType.ASTEROID);
    // Configuración específica de Asteroid
  }
}

export class SuperAsteroid extends Asteroid {
  constructor(id: string, position: Vector3, size: number) {
    super(id, position, size);
    // Cambiar tipo heredado a SuperAsteroid
    this.setType(GameObjectType.SUPER_ASTEROID);
    // Configuración específica de SuperAsteroid
  }
}

export class MegaAsteroid extends SuperAsteroid {
  constructor(id: string, position: Vector3, size: number) {
    super(id, position, size * 25); // Escalar tamaño
    // Cambiar tipo heredado a MegaAsteroid
    this.setType(GameObjectType.MEGA_ASTEROID);
    // Configuración específica de MegaAsteroid
  }
}
```

**Ventaja:** Un `MegaAsteroid` hereda comportamiento de `SuperAsteroid` y `Asteroid`, pero su tipo es inequívocamente `MEGA_ASTEROID`.

---

## 6. Sistemas de Daño y Física: Tablas de Configuración

### Principio
**Extraer valores mágicos a constantes o tablas configurables**.

### Aplicación Futura (Recomendada)

#### ❌ Valores dispersos en el código
```typescript
if (type === GameObjectType.ASTEROID) dmg = 10;
else if (type === GameObjectType.SUPER_ASTEROID) dmg = 75;
else if (type === GameObjectType.MEGA_ASTEROID) dmg = 150;
// ...
```

#### ✅ Tabla centralizada
```typescript
// game-config.ts
export const COLLISION_DAMAGE_TABLE: Record<GameObjectType, number> = {
  [GameObjectType.ASTEROID]: 10,
  [GameObjectType.SUPER_ASTEROID]: 75,
  [GameObjectType.MEGA_ASTEROID]: 150,
  [GameObjectType.PLANET]: 100000,
  [GameObjectType.GIANT_PLANET]: 100000,
  [GameObjectType.SUN]: 100000,
  [GameObjectType.PORTAL]: 0, // ethereal
  [GameObjectType.CLUSTER]: 10,
  // ...
};

export const COLLISION_MASS_TABLE: Record<GameObjectType, number> = {
  [GameObjectType.ASTEROID]: 1,
  [GameObjectType.SUPER_ASTEROID]: 5,
  [GameObjectType.MEGA_ASTEROID]: 10,
  // ...
};

// Uso
const damage = COLLISION_DAMAGE_TABLE[obj.getType()] ?? 0;
const mass = COLLISION_MASS_TABLE[obj.getType()] ?? 1;
```

**Ventajas:**
- Fácil balanceo (cambiar valores en un solo lugar)
- Documentación implícita (todos los valores visibles)
- Extensible (añadir nuevos tipos es trivial)

---

## 7. Logging y Debugging

### Principio
**Incluir información de tipo en logs para facilitar debugging**.

### Implementación

```typescript
this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Collision detected', {
  id: obj.id,
  type: obj.getType(), // ← Tipo explícito
  category: obj.getCategory(),
  damage: dmg
});
```

Antes:
```
Collision detected: { name: '_Asteroid', id: 'ast-123' }
```

Después:
```
Collision detected: { 
  id: 'ast-123', 
  type: 'ASTEROID', 
  category: 'ASTEROID',
  damage: 10 
}
```

---

## 8. Inmutabilidad de Tipos vs Propiedades

### Principio
**El tipo de un GameObject es inmutable después de la construcción**. Las propiedades pueden cambiar.

```typescript
// ✅ Correcto: Establecer tipo en constructor
constructor() {
  super(...);
  this.setType(GameObjectType.ASTEROID);
  this.health = 100; // Propiedad mutable
}

// ❌ Incorrecto: Cambiar tipo en runtime
someMethod() {
  this.setType(GameObjectType.SUPER_ASTEROID); // NO HACER ESTO
}
```

**Razón:** El tipo define la identidad del objeto. Si el comportamiento cambia drásticamente, crear un nuevo objeto es más claro que mutar el tipo.

---

## 9. Type Guards y Narrowing

### Principio
**Usar type guards para type narrowing seguro**.

```typescript
function isDamageable(obj: GameObject): obj is Asteroid | Planet {
  const category = obj.getCategory();
  return category === GameObjectCategory.ASTEROID || 
         category === GameObjectCategory.PLANET;
}

function processCollision(obj: GameObject) {
  if (isDamageable(obj)) {
    // TypeScript sabe que obj es Asteroid | Planet
    obj.healthCurrent -= 50;
  }
}
```

---

## 10. Mantenimiento y Evolución

### Checklist para Añadir Nuevos GameObjects

1. **Añadir tipo al enum** en `game-object.types.ts`:
   ```typescript
   export enum GameObjectType {
     // ...
     NEW_OBJECT = 'NEW_OBJECT'
   }
   ```

2. **Añadir categoría** (si aplica):
   ```typescript
   [GameObjectType.NEW_OBJECT]: GameObjectCategory.XXX
   ```

3. **Crear clase** en `game-objects/`:
   ```typescript
   export class NewObject extends GameObject {
     constructor(...) {
       super(...);
       this.setType(GameObjectType.NEW_OBJECT);
     }
   }
   ```

4. **Exportar en index.ts**:
   ```typescript
   export * from './NewObject';
   ```

5. **Actualizar tablas de configuración** (daño, masa, etc.)

6. **Actualizar lógica que use tipos** (colisiones, rendering, etc.)

---

## 11. Ventajas Demostradas

### Rendimiento
- ✅ Comparaciones de enums son más rápidas que string comparisons
- ✅ Menos llamadas a `constructor.name` (acceso a prototipo)

### Mantenibilidad
- ✅ Refactoring seguro con TypeScript
- ✅ Autocompletado en IDE
- ✅ Búsquedas precisas (Find All References)

### Robustez
- ✅ Inmune a minificación
- ✅ Type checking en tiempo de compilación
- ✅ Detección temprana de errores

### Escalabilidad
- ✅ Añadir nuevos tipos es sistemático
- ✅ Lógica centralizada en tablas
- ✅ Reducción de código duplicado

---

## 12. Antipatrones a Evitar

### ❌ Strings Mágicos
```typescript
if (obj.type === "asteroid") // ← No type checking
```

### ❌ Constructor.name en Producción
```typescript
const name = obj.constructor.name; // ← Se rompe con minificación
```

### ❌ Lógica Dispersa
```typescript
// Daño definido en 5 archivos diferentes
```

### ❌ Type Casting Innecesario
```typescript
(obj as any).velocity = ...; // ← Pierdes type safety
```

### ❌ Deep Nesting
```typescript
if (name === 'A') {
  if (subtype === 'X') {
    if (state === 'active') {
      // ← Difícil de leer
    }
  }
}
```

**Preferir:** Early returns, switch statements, o tablas de configuración.

---

## Resumen

### Reglas de Oro

1. **Tipos explícitos**: Usar `GameObjectType` enum, nunca `constructor.name`
2. **Organización**: Agrupar archivos relacionados en carpetas
3. **Tipado fuerte**: Preferir `GameObject` sobre `any`
4. **Configuración centralizada**: Tablas de valores en lugar de dispersión
5. **Inmutabilidad de tipos**: Establecer en constructor, no cambiar después
6. **Documentación implícita**: El código debe explicarse a sí mismo

### Aplicar en Futuros Chats

Cuando pidas cambios o nuevas features, puedes solicitar:
> "Implementa X respetando la filosofía de clean code documentada en `CleanCode_Arquitectura.md`"

Y se debe:
- Usar enums para tipos
- Mantener organización de carpetas
- Evitar `any` y `constructor.name`
- Centralizar configuraciones
- Documentar decisiones de diseño

---

## Referencias Internas

- `src/app/game/types/game-object.types.ts` - Sistema de tipos
- `src/app/game/game-objects/` - Todos los GameObjects
- `src/app/game/GameObject.ts` - Clase base
- Este documento - `documentacion/CleanCode_Arquitectura.md`

---

**Última actualización:** 19 de Noviembre, 2025  
**Autor:** Sistema de IA (Claude Sonnet 4.5) + Desarrollador (Olles)  
**Proyecto:** AtroPELLO - Juego espacial 3D WebGL
