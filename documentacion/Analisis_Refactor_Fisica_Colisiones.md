# Análisis: Generalización de Física de Colisiones en GameObject

**Fecha**: 21 Noviembre 2025  
**Contexto**: FASE 6 completada, evaluando mejoras arquitectónicas para física de colisiones

---

## 🎯 Objetivo del Análisis

Evaluar si la lógica de colisiones actualmente específica para asteroides puede generalizarse a **todos los GameObjects no etéreos**, manteniendo la capacidad de añadir comportamientos específicos antes/después del comportamiento base.

---

## 📊 Estado Actual de la Arquitectura

### 1. **CollisionResponseService** (✅ Ya generalizado)

El servicio ya maneja múltiples tipos de objetos mediante configuración:

```typescript
private getCollisionConfig(objectType: GameObjectType): CollisionConfig {
  switch (objectType) {
    case GameObjectType.ASTEROID:
      return { restitution: 0.3, mass: 1, immovable: false };
    
    case GameObjectType.SUPER_ASTEROID:
      return { restitution: 0.2, mass: 10, immovable: false };
    
    case GameObjectType.PLANET:
      return { restitution: 0.05, mass: 1e6, immovable: true };
    
    // etc...
  }
}
```

**Fortalezas**:
- ✅ Usa `GameObjectType` enum (tipo seguro)
- ✅ Configuración centralizada
- ✅ Fácil añadir nuevos tipos
- ✅ Responsabilidad única (física pura)

**Limitaciones**:
- ❌ Solo calcula física, no aplica consecuencias (ejection, etc.)
- ❌ Retorna `CollisionResponse` pero GameEngine decide qué hacer

---

### 2. **GameEngine.handleCollisionResponse()** (⚠️ Específico para asteroides)

```typescript
// Línea 2323: Solo asteroides se eyectan
if (result.impulseMagnitude > 0.1 && isClusterMember) {
  this.makeAsteroidIndependent(obj);
}

// Línea 2330: Solo asteroides reciben velocidad nueva
if (result.targetNewVelocity && obj.velocity) {
  obj.velocity.x = result.targetNewVelocity.x;
  obj.velocity.y = result.targetNewVelocity.y;
  obj.velocity.z = result.targetNewVelocity.z;
}
```

**Problemas**:
- ❌ Lógica acoplada a asteroides (`isClusterMember`, `makeAsteroidIndependent`)
- ❌ SuperAsteroids, MegaAsteroids, otros objetos móviles NO reciben velocidad post-colisión
- ❌ Dificulta extensión a nuevos tipos

---

### 3. **makeAsteroidIndependent()** (❌ Altamente específico)

```typescript
private makeAsteroidIndependent(obj: any): void {
  // 1. Marcar flags específicos de asteroides
  (obj as any)._pendingEjection = true;
  (obj as any)._isIndependent = true;
  
  // 2. Buscar y eliminar de clusters
  this.asteroidClusterService.getClusters().forEach(cluster => {
    const idx = cluster.objects.findIndex(o => o.id === objId);
    if (idx >= 0) cluster.objects.splice(idx, 1);
  });
  
  // 3. Añadir a array específico
  this.independentAsteroids.push(obj);
  
  // 4. Marcar tiempo de spawn para culling
  (obj as any)._independentSince = performance.now();
}
```

**Problemas**:
- ❌ Hardcoded para asteroides (`_isIndependent`, `independentAsteroids`)
- ❌ Asume que solo asteroides están en clusters
- ❌ No aplica a SuperAsteroids/MegaAsteroids que podrían beneficiarse del mismo comportamiento

---

### 4. **GameObject Base Class** (⚠️ Sin soporte para física de colisión)

```typescript
export abstract class GameObject {
  public velocity: Vector3;
  public boundingSphere: { center: Vector3; radius: number } | null = null;
  protected gameObjectType: GameObjectType = GameObjectType.UNKNOWN;
  
  // Sistema de salud reactivo (✅ ya generalizado)
  public get healthCurrent(): number { return this._healthCurrent; }
  public set healthCurrent(value: number) {
    // ...trigger onDestroyedCallback if value <= 0
  }
}
```

**Estado actual**:
- ✅ Tiene `velocity` (base para física)
- ✅ Tiene `boundingSphere` (detección de colisiones)
- ✅ Sistema de salud reactivo ya generalizado (FASE 5)
- ❌ Sin métodos para aplicar física de colisión
- ❌ Sin propiedad `ethereal` (portal = no colisiona)

---

## 🔍 Casos de Uso Identificados

### Caso 1: Asteroide en Cluster → Eyección + Física

**Actual**:
```typescript
// GameEngine.handleCollisionResponse()
if (isClusterMember && impulse > 0.1) {
  makeAsteroidIndependent(obj); // Específico
}
obj.velocity = result.targetNewVelocity; // Manual
```

**Ideal**:
```typescript
// GameObject.onCollision()
obj.onCollision(result);
// → Asteroid override:
//   1. super.onCollision(result) // Aplicar física base
//   2. this.ejectFromParent()    // Comportamiento específico
```

---

### Caso 2: SuperAsteroid → Solo Física (sin ejection)

**Actual**: NO recibe velocidad post-colisión (bug)

**Ideal**:
```typescript
// SuperAsteroid no override onCollision → solo base
superAst.onCollision(result);
// → Aplica velocidad automáticamente (ningún comportamiento extra)
```

---

### Caso 3: Planeta → Desplazar nave (slide)

**Actual**:
```typescript
// GameEngine.handleCollisionResponse()
if (result.collisionType === 'large-immovable') {
  // Slide manual en GameEngine
  this.spaceship.position.x += normal.x * slide;
  // ...
}
```

**Ideal**:
```typescript
// Planet.onCollision()
planet.onCollision(result);
// → Planet override: no hace nada (immovable)
// → Nave recibe slide desde CollisionResponseService
```

---

### Caso 4: Portal → Sin colisión (etéreo)

**Actual**: GameEngine filtra portales antes de calcular física

**Ideal**:
```typescript
if (obj.isEthereal()) return; // Skip física completamente
```

---

## 💡 Propuesta de Refactor

### Opción A: **Método en GameObject Base** (Recomendado)

#### 1. Añadir soporte de física en GameObject

```typescript
export abstract class GameObject {
  // Nueva propiedad: objetos etéreos no colisionan físicamente
  public isEthereal(): boolean { 
    return this.getType() === GameObjectType.PORTAL; 
  }
  
  /**
   * Aplica resultado de colisión física al objeto.
   * Template Method: subclases pueden override para añadir comportamiento específico.
   * 
   * @param response Respuesta de CollisionResponseService
   * @param context Contexto adicional (nave, GameEngine, etc.)
   */
  public applyCollisionResponse(
    response: CollisionResponse, 
    context: CollisionContext
  ): void {
    // 1. Aplicar física base (si móvil)
    if (!this.isImmovable() && response.targetNewVelocity) {
      this.velocity.x = response.targetNewVelocity.x;
      this.velocity.y = response.targetNewVelocity.y;
      this.velocity.z = response.targetNewVelocity.z;
      
      context.logger?.log(LogLevel.DEBUG, LogCategory.COLLISION_PHYSICS, 
        'Velocity applied to object', {
          objectType: this.getType(),
          objectId: this.id,
          newVelocity: this.velocity
        });
    }
    
    // 2. Subclases pueden override y llamar super.applyCollisionResponse()
    //    para añadir comportamiento adicional (ej: ejection)
  }
  
  /**
   * Determina si el objeto es inamovible (planetas, sol)
   */
  public isImmovable(): boolean {
    const size = getPhysicsSize(this.getType());
    return size === GameObjectSize.PLANET || size === GameObjectSize.STAR;
  }
}
```

#### 2. Asteroid override con ejection

```typescript
export class Asteroid extends GameObject {
  private _isIndependent: boolean = false;
  private _pendingEjection: boolean = false;
  
  public override applyCollisionResponse(
    response: CollisionResponse,
    context: CollisionContext
  ): void {
    // 1. Aplicar física base primero
    super.applyCollisionResponse(response, context);
    
    // 2. Comportamiento específico: eyección de cluster
    if (response.targetEjected && !this._isIndependent) {
      this.ejectFromCluster(context);
    }
  }
  
  private ejectFromCluster(context: CollisionContext): void {
    this._pendingEjection = true;
    this._isIndependent = true;
    
    // Notificar a GameEngine para que lo mueva a independentAsteroids
    context.onAsteroidEjected?.(this);
    
    context.logger?.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS,
      '🚀 Asteroid ejected from cluster', { asteroidId: this.id });
  }
}
```

#### 3. SuperAsteroid hereda comportamiento base automáticamente

```typescript
export class SuperAsteroid extends GameObject {
  // NO override applyCollisionResponse()
  // → Hereda comportamiento base: aplica velocidad, sin ejection
}
```

#### 4. Planet sin física (immovable)

```typescript
export class Planet extends GameObject {
  public override applyCollisionResponse(
    response: CollisionResponse,
    context: CollisionContext
  ): void {
    // Planetas no se mueven, pero podrían registrar el impacto
    context.logger?.log(LogLevel.DEBUG, LogCategory.COLLISION_PHYSICS,
      'Planet collision (immovable)', { planetId: this.id });
    
    // NO llamar super → no aplicar velocidad
  }
}
```

#### 5. GameEngine simplificado

```typescript
private handleCollisionResponse(obj: GameObject, result: CollisionResponse): void {
  // Skip objetos etéreos
  if (obj.isEthereal()) return;
  
  // Aplicar física al objeto (delega comportamiento)
  obj.applyCollisionResponse(result, {
    logger: this.logger,
    gameEngine: this,
    onAsteroidEjected: (ast) => this.moveAsteroidToIndependent(ast)
  });
  
  // Aplicar física a la nave
  this.spaceship.position = result.newPosition;
  this.spaceship.velocity = result.newVelocity;
  this.spaceship.updateModelMatrix();
}

private moveAsteroidToIndependent(ast: Asteroid): void {
  // Buscar y eliminar de clusters
  this.asteroidClusterService.removeFromAllClusters(ast.id);
  
  // Añadir a independientes
  this.independentAsteroids.push(ast);
  (ast as any)._independentSince = performance.now();
  
  // Registrar callback de destrucción si no existe
  this.registerDestructionCallback(ast);
}
```

---

### Opción B: **Servicio Injectable `PhysicsResponseHandler`** (Alternativa)

#### 1. Crear servicio especializado

```typescript
@Injectable({ providedIn: 'root' })
export class PhysicsResponseHandler {
  applyToGameObject(
    obj: GameObject, 
    response: CollisionResponse,
    context: PhysicsContext
  ): void {
    // Lógica similar a Opción A pero en servicio
    if (obj.isEthereal()) return;
    
    // Aplicar velocidad base
    if (!obj.isImmovable() && response.targetNewVelocity) {
      obj.velocity = response.targetNewVelocity;
    }
    
    // Delegar comportamientos específicos a handlers
    if (obj instanceof Asteroid && response.targetEjected) {
      this.asteroidEjectionHandler.handle(obj, context);
    }
  }
}
```

**Pros**:
- ✅ Más testeable (servicio aislado)
- ✅ Dependency Injection
- ✅ No modifica GameObject base

**Contras**:
- ❌ Menos orientado a objetos (lógica fuera de la clase)
- ❌ Requiere instanceof checks (menos type-safe)
- ❌ Más complejo (otra capa de abstracción)

---

## 📋 Comparación de Opciones

| Criterio | Opción A (GameObject) | Opción B (Service) |
|----------|----------------------|-------------------|
| **OOP** | ✅ Encapsulación natural | ❌ Lógica externa |
| **Testabilidad** | ⚠️ Requiere mocks | ✅ Servicio aislado |
| **Type Safety** | ✅ Override type-safe | ❌ instanceof checks |
| **Extensibilidad** | ✅ Herencia clara | ⚠️ Añadir handlers |
| **Separación** | ⚠️ Lógica en modelo | ✅ Servicio separado |
| **Complejidad** | ✅ Simple, directo | ❌ Capa extra |
| **DI Angular** | ❌ No usa DI | ✅ Injectable |

---

## 🎯 Recomendación Final

### **Opción A: Método en GameObject** (70% recomendado)

**Razones**:

1. **Orientación a Objetos**: GameObject debe saber cómo responder a física
2. **Template Method Pattern**: Perfecto para este caso (base + overrides)
3. **Type Safety**: Compiler verifica overrides correctamente
4. **Simplicidad**: Una capa menos que mantener
5. **Consistencia**: Ya usamos este patrón para salud (`healthCurrent` setter)

**Contraargumento**: "No usa DI de Angular"
- **Respuesta**: No todos los métodos necesitan ser servicios. GameObject es un modelo del dominio, no un servicio Angular. La física es intrínseca al objeto.

---

### Plan de Implementación (FASE 6e - Opcional)

#### Paso 1: Extender GameObject base
```typescript
// GameObject.ts
+ public isEthereal(): boolean
+ public isImmovable(): boolean
+ public applyCollisionResponse(response, context): void
```

#### Paso 2: Override en Asteroid
```typescript
// Asteroid.ts
+ public override applyCollisionResponse(): void
+   - super.applyCollisionResponse()
+   - ejectFromCluster() si targetEjected
```

#### Paso 3: Simplificar GameEngine
```typescript
// GameEngine.ts
- makeAsteroidIndependent() → moveAsteroidToIndependent()
- handleCollisionResponse() simplificado
- Delegar a obj.applyCollisionResponse()
```

#### Paso 4: Testing
- Verificar SuperAsteroids ahora se mueven post-colisión
- Verificar MegaAsteroids funcionan igual
- Verificar planetas siguen inmóviles
- Verificar asteroides se eyectan correctamente

---

## 🔬 Casos Edge Detectados

### 1. **SuperAsteroids no reciben velocidad** (BUG ACTUAL)

**Código actual**:
```typescript
// Solo asteroides pequeños reciben velocidad
if (result.targetNewVelocity && obj.velocity) {
  obj.velocity = result.targetNewVelocity; // Solo ejecuta para asteroides
}
```

**Con refactor**:
```typescript
// TODOS los objetos móviles reciben velocidad
obj.applyCollisionResponse(result, context);
// → SuperAsteroid hereda comportamiento base automáticamente
```

---

### 2. **MegaAsteroids podrían eyectarse de planetDebris**

**Actual**: Solo asteroides pequeños se eyectan

**Con refactor**: MegaAsteroid podría override para eyectarse de `planetDebris` arrays si recibe impulso suficiente.

---

### 3. **Portales necesitan flag `ethereal`**

**Actual**: GameEngine filtra portales manualmente

**Con refactor**:
```typescript
if (obj.isEthereal()) return; // Skip automático
```

---

## 📊 Impacto Estimado

### Líneas de código

| Componente | Antes | Después | Delta |
|------------|-------|---------|-------|
| GameObject.ts | 519 | 570 | **+51** |
| Asteroid.ts | ~200 | ~250 | **+50** |
| GameEngine.ts | 6,499 | 6,350 | **-149** |
| **TOTAL** | 7,218 | 7,170 | **-48 líneas** |

### Complejidad ciclomática

- **GameEngine.handleCollisionResponse()**: 15 → 8 (-47%)
- **GameObject.applyCollisionResponse()**: 0 → 5 (nuevo)
- **Asteroid.applyCollisionResponse()**: 0 → 3 (nuevo)

**Net**: Complejidad distribuida, más fácil de entender y extender.

---

## ✅ Conclusión

La generalización de física de colisiones a GameObject base es **viable y beneficiosa**:

1. ✅ **Corrige bug**: SuperAsteroids/MegaAsteroids recibirán física correctamente
2. ✅ **Reduce GameEngine**: -149 líneas, menos responsabilidades
3. ✅ **Mejora extensibilidad**: Nuevos tipos heredan comportamiento automáticamente
4. ✅ **Mantiene especialización**: Asteroid puede añadir ejection sin romper base
5. ✅ **Consistente con FASE 5**: Ya usamos patrón similar para sistema de salud

**Prioridad**: Media (no bloquea funcionalidad actual, pero mejora arquitectura)

**Esfuerzo**: 2-3 horas (modificación de 3 archivos, testing manual)

**Riesgo**: Bajo (cambio aislado, fácil de revertir)

---

## 🚀 Siguiente Paso Recomendado

Si decides proceder:

1. Completar FASE 6b-6d primero (PanelStateManager, UIAudio, CursorManager)
2. Luego abordar esto como **FASE 6e: GameObject Physics Integration**
3. O dejarlo para **FASE 7** durante documentación de arquitectura final

**No es urgente**, pero es una mejora arquitectónica sólida que vale la pena considerar.
