# Análisis: Game State Store Injectable

**Fecha**: 21 Noviembre 2025  
**Contexto**: Evaluando centralización del estado del juego en un servicio inyectable

---

## 🎯 Problema Actual

### Estado Disperso en GameEngine

```typescript
// GameEngine.ts - Estado fragmentado en ~80+ propiedades
export class GameEngine {
  // Objetos del juego (20+ arrays)
  private independentAsteroids: Asteroid[] = [];
  private superAsteroids: SuperAsteroid[] = [];
  private megaAsteroids: MegaAsteroid[] = [];
  private planets: Planet[] = [];
  private portals: Portal[] = [];
  private planetDebris: { planetId: string; asteroids: MegaAsteroid[] }[] = [];
  
  // Entidades principales
  private spaceship!: Spaceship;
  private sun: Sun | null = null;
  
  // Estado del juego
  private gameRunning: boolean = false;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  
  // Mapeos y cachés
  private mapIdToTarget = new Map<string, any>();
  private dopplerCues: Map<string, ...> = new Map();
  
  // Flags de comportamiento
  private mapReopenAllowedAtMs: number = 0;
  private grimoireReopenAllowedAtMs: number = 0;
  private collisionDamageCooldown = new Map<string, number>();
  
  // Cámara y controles
  private camera: Camera | null = null;
  
  // ... 60+ propiedades más
}
```

### Problemas Identificados

1. **Acoplamiento**: Servicios necesitan `GameEngine` inyectado solo para acceder a 1-2 propiedades
2. **Testing difícil**: Mockear GameEngine completo para testear servicio pequeño
3. **Circular dependencies**: Riesgo al inyectar GameEngine en servicios que GameEngine usa
4. **Violación SRP**: GameEngine hace demasiado (render + state + logic + coordination)
5. **Estado oculto**: No hay single source of truth, estado repartido entre GameEngine y servicios

---

## 💡 Propuesta: GameStateStore Injectable

### Arquitectura del Store

```typescript
/**
 * GameStateStore
 * 
 * Single source of truth para el estado del juego.
 * Responsabilidades:
 * - Almacenar colecciones de GameObjects
 * - Gestionar referencias a entidades principales (ship, camera, sun)
 * - Mantener flags de estado del juego
 * - Proporcionar métodos de búsqueda/filtrado
 * - Notificar cambios (opcional: RxJS Subjects)
 * 
 * NO responsable de:
 * - Lógica de juego (eso es GameEngine)
 * - Renderizado (eso es GameEngine)
 * - Física (eso es CollisionManagerService, etc.)
 */
@Injectable({ providedIn: 'root' })
export class GameStateStore {
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  GAME OBJECTS COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Asteroides independientes (eyectados de clusters) */
  public readonly independentAsteroids: Asteroid[] = [];
  
  /** Super asteroides */
  public readonly superAsteroids: SuperAsteroid[] = [];
  
  /** Mega asteroides */
  public readonly megaAsteroids: MegaAsteroid[] = [];
  
  /** Planetas del sistema */
  public readonly planets: Planet[] = [];
  
  /** Portales activos */
  public readonly portals: Portal[] = [];
  
  /** Debris de planetas destruidos */
  public readonly planetDebris: Array<{ planetId: string; asteroids: MegaAsteroid[] }> = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MAIN ENTITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Nave del jugador (puede ser null antes de inicializar) */
  public spaceship: Spaceship | null = null;
  
  /** Sol del sistema actual */
  public sun: Sun | null = null;
  
  /** Cámara del juego */
  public camera: Camera | null = null;
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  GAME STATE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Si el juego está corriendo (game loop activo) */
  public gameRunning: boolean = false;
  
  /** Timestamp del último frame */
  public lastFrameTime: number = 0;
  
  /** Contador de frames totales */
  public frameCount: number = 0;
  
  /** Cooldowns de reapertura de paneles */
  public mapReopenAllowedAtMs: number = 0;
  public grimoireReopenAllowedAtMs: number = 0;
  
  /** Cooldowns de colisiones (evita daño repetitivo) */
  public readonly collisionCooldowns = new Map<string, number>();
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MAPPINGS & CACHES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Mapeo de IDs de mapa a objetos targetables */
  public readonly mapIdToTarget = new Map<string, ITargetable>();
  
  /** Cache de doppler cues por objeto */
  public readonly dopplerCues = new Map<string, any>();
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REACTIVE STATE (Opcional - para observabilidad)
  // ═══════════════════════════════════════════════════════════════════════════
  
  private readonly _stateChanged$ = new Subject<GameStateChangeEvent>();
  public readonly stateChanged$ = this._stateChanged$.asObservable();
  
  constructor(private logger: LoggingService) {}
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  QUERY METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Obtiene todos los asteroides (independientes + super + mega)
   */
  getAllAsteroids(): Asteroid[] {
    return [
      ...this.independentAsteroids,
      ...this.superAsteroids,
      ...this.megaAsteroids
    ];
  }
  
  /**
   * Obtiene todos los objetos colisionables (excluye portales etéreos)
   */
  getAllCollidables(): GameObject[] {
    return [
      ...this.independentAsteroids,
      ...this.superAsteroids,
      ...this.megaAsteroids,
      ...this.planets,
      ...(this.sun ? [this.sun] : [])
    ];
  }
  
  /**
   * Busca un objeto por ID en todas las colecciones
   */
  findObjectById(id: string): GameObject | null {
    // Buscar en todas las colecciones
    let obj = this.independentAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.superAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.megaAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.planets.find(p => p.id === id);
    if (obj) return obj;
    
    obj = this.portals.find(p => p.id === id);
    if (obj) return obj;
    
    if (this.sun?.id === id) return this.sun;
    if (this.spaceship?.id === id) return this.spaceship;
    
    return null;
  }
  
  /**
   * Filtra objetos por tipo
   */
  getObjectsByType(type: GameObjectType): GameObject[] {
    return this.getAllObjects().filter(obj => obj.getType() === type);
  }
  
  /**
   * Obtiene todos los objetos del juego
   */
  getAllObjects(): GameObject[] {
    return [
      ...this.getAllAsteroids(),
      ...this.planets,
      ...this.portals,
      ...(this.sun ? [this.sun] : []),
      ...(this.spaceship ? [this.spaceship] : [])
    ];
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MUTATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Añade un asteroide independiente
   */
  addIndependentAsteroid(asteroid: Asteroid): void {
    this.independentAsteroids.push(asteroid);
    this._notifyChange({ type: 'asteroid-added', object: asteroid });
    
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 
      'Asteroid added to independent collection', {
        asteroidId: asteroid.id,
        totalIndependent: this.independentAsteroids.length
      });
  }
  
  /**
   * Elimina un objeto del juego (busca en todas las colecciones)
   */
  removeObject(obj: GameObject): boolean {
    const id = obj.id;
    let removed = false;
    
    // Asteroides independientes
    let idx = this.independentAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.independentAsteroids.splice(idx, 1);
      removed = true;
    }
    
    // Super asteroides
    idx = this.superAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.superAsteroids.splice(idx, 1);
      removed = true;
    }
    
    // Mega asteroides
    idx = this.megaAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.megaAsteroids.splice(idx, 1);
      removed = true;
    }
    
    // Planetas
    idx = this.planets.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.planets.splice(idx, 1);
      removed = true;
    }
    
    // Portales
    idx = this.portals.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.portals.splice(idx, 1);
      removed = true;
    }
    
    // Planet debris
    for (const debris of this.planetDebris) {
      idx = debris.asteroids.findIndex(a => a.id === id);
      if (idx >= 0) {
        debris.asteroids.splice(idx, 1);
        removed = true;
      }
    }
    
    if (removed) {
      this._notifyChange({ type: 'object-removed', object: obj });
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 
        'Object removed from store', { objectId: id, objectType: obj.getType() });
    }
    
    return removed;
  }
  
  /**
   * Limpia todo el estado (reset del juego)
   */
  reset(): void {
    this.independentAsteroids.length = 0;
    this.superAsteroids.length = 0;
    this.megaAsteroids.length = 0;
    this.planets.length = 0;
    this.portals.length = 0;
    this.planetDebris.length = 0;
    
    this.spaceship = null;
    this.sun = null;
    this.camera = null;
    
    this.gameRunning = false;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    
    this.collisionCooldowns.clear();
    this.mapIdToTarget.clear();
    this.dopplerCues.clear();
    
    this._notifyChange({ type: 'state-reset' });
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 
      'Game state store reset');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private _notifyChange(event: GameStateChangeEvent): void {
    this._stateChanged$.next(event);
  }
}

/**
 * Evento de cambio de estado (para subscribers)
 */
export interface GameStateChangeEvent {
  type: 'asteroid-added' | 'object-removed' | 'state-reset' | 'object-updated';
  object?: GameObject;
  metadata?: any;
}
```

---

## 📊 Impacto del Refactor

### 1. GameEngine Simplificado

**ANTES** (6,499 líneas):
```typescript
export class GameEngine {
  private independentAsteroids: Asteroid[] = [];
  private superAsteroids: SuperAsteroid[] = [];
  // ... 80+ propiedades
  
  destroyObject(obj: GameObject) {
    // Buscar en 10+ arrays
    let idx = this.independentAsteroids.findIndex(a => a.id === obj.id);
    if (idx >= 0) this.independentAsteroids.splice(idx, 1);
    // ... repetir para cada colección
  }
}
```

**DESPUÉS** (~5,800 líneas estimadas):
```typescript
export class GameEngine {
  constructor(
    // ... otros servicios
    private gameState: GameStateStore
  ) {}
  
  destroyObject(obj: GameObject) {
    // Delegar al store
    this.gameState.removeObject(obj);
    
    // GameEngine solo maneja limpieza de recursos GL
    this.cleanupGLResources(obj);
  }
}
```

**Reducción**: -700 líneas (~11%)

---

### 2. Servicios Desacoplados

**ANTES**:
```typescript
@Injectable()
export class CollisionManagerService {
  constructor(private gameEngine: GameEngine) {} // ❌ Dependencia pesada
  
  checkCollisions() {
    const asteroids = this.gameEngine.getAsteroids(); // Acceso indirecto
    // ...
  }
}
```

**DESPUÉS**:
```typescript
@Injectable()
export class CollisionManagerService {
  constructor(private gameState: GameStateStore) {} // ✅ Dependencia ligera
  
  checkCollisions() {
    const asteroids = this.gameState.getAllAsteroids(); // Acceso directo
    // ...
  }
}
```

---

### 3. Testing Simplificado

**ANTES**:
```typescript
describe('CollisionManagerService', () => {
  let service: CollisionManagerService;
  let mockGameEngine: jasmine.SpyObj<GameEngine>;
  
  beforeEach(() => {
    mockGameEngine = jasmine.createSpyObj('GameEngine', [
      'getAsteroids', 'getSuperAsteroids', 'getMegaAsteroids',
      'getPlanets', 'getSun', 'getSpaceship', 
      // ... 50+ métodos más
    ]);
    
    service = new CollisionManagerService(mockGameEngine);
  });
});
```

**DESPUÉS**:
```typescript
describe('CollisionManagerService', () => {
  let service: CollisionManagerService;
  let gameState: GameStateStore;
  
  beforeEach(() => {
    gameState = new GameStateStore(mockLogger);
    gameState.independentAsteroids.push(new Asteroid('ast1', {x:0,y:0,z:0}));
    // Manipular estado directamente - mucho más simple
    
    service = new CollisionManagerService(gameState);
  });
});
```

---

### 4. Observabilidad (Opcional)

```typescript
// Cualquier servicio puede subscribirse a cambios
export class DebugOverlayService {
  constructor(private gameState: GameStateStore) {
    this.gameState.stateChanged$.subscribe(event => {
      if (event.type === 'asteroid-added') {
        this.updateAsteroidCount();
      }
    });
  }
}
```

---

## ✅ Beneficios

### 1. **Single Responsibility Principle**
- GameEngine → Solo renderizado y coordinación
- GameStateStore → Solo gestión de estado
- Servicios → Solo su lógica específica

### 2. **Dependency Injection más limpia**
- Servicios pequeños solo inyectan GameStateStore
- No necesitan GameEngine completo
- Evita circular dependencies

### 3. **Testabilidad mejorada**
- Mock de GameStateStore es trivial
- Estado manipulable directamente en tests
- No necesitas 50+ métodos mockeados

### 4. **Código más legible**
```typescript
// ANTES: indirecto y verboso
const asteroids = this.gameEngine.getIndependentAsteroids();
asteroids.push(newAsteroid);

// DESPUÉS: directo y claro
this.gameState.independentAsteroids.push(newAsteroid);
```

### 5. **Debugging más fácil**
- Estado centralizado en una clase
- Fácil inspeccionar en DevTools
- Logging centralizado de mutaciones

### 6. **Performance tracking**
```typescript
// Store puede medir estadísticas automáticamente
get objectCount(): number {
  return this.independentAsteroids.length 
    + this.superAsteroids.length 
    + this.megaAsteroids.length
    + this.planets.length;
}
```

---

## ⚠️ Desventajas y Riesgos

### 1. **Mutabilidad Expuesta**
```typescript
// Arrays públicos son mutables - posible abuso
this.gameState.independentAsteroids.length = 0; // ⚠️ No notifica cambios
```

**Mitigación**: Usar getters con copias defensivas (pero impacto en performance)

### 2. **No es Redux/NgRx**
- Sin time-travel debugging
- Sin immutabilidad garantizada
- Sin reducers/actions formales

**Decisión**: Aceptable - no necesitamos complejidad de state management avanzado

### 3. **Migración Gradual**
- No se puede hacer de golpe
- Requiere refactor coordinado de 10+ servicios
- Riesgo de estado duplicado temporal

**Mitigación**: Migrar por fases (ver plan abajo)

---

## 📋 Plan de Implementación

### FASE 7a: Crear GameStateStore (2-3 horas)

1. Crear `game-state.store.ts`
2. Mover definiciones de colecciones desde GameEngine
3. Implementar métodos de query (getAllAsteroids, etc.)
4. Implementar métodos de mutación (addIndependentAsteroid, removeObject)
5. Añadir logging de operaciones

### FASE 7b: Migrar GameEngine (3-4 horas)

1. Inyectar GameStateStore en GameEngine
2. Reemplazar arrays privados por delegación a store
3. Actualizar todos los métodos que acceden a colecciones
4. Eliminar código duplicado

### FASE 7c: Migrar Servicios (2-3 horas)

1. CollisionManagerService → usar GameStateStore
2. AsteroidClusterService → usar GameStateStore
3. SolarSystemService → usar GameStateStore
4. Otros servicios según necesidad

### FASE 7d: Testing (2 horas)

1. Tests unitarios de GameStateStore
2. Tests de integración GameEngine + Store
3. Manual testing de funcionalidad completa

**TOTAL**: 9-12 horas de trabajo

---

## 🎯 Recomendación

✅ **SÍ, implementar GameStateStore**

**Razones**:
1. Arquitectura más limpia (SRP)
2. Testing mucho más simple
3. Servicios desacoplados
4. Debugging más fácil
5. Escalable (fácil añadir nuevas colecciones)

**Prioridad**: Alta (después de FASE 6, antes de FASE 8)

**Riesgo**: Medio (requiere refactor coordinado pero bien acotado)

**ROI**: Alto (mejora significativa en mantenibilidad)

---

## 🚀 Próximos Pasos

1. ✅ Completar FASE 6 (PanelEventCoordinator)
2. ⏩ FASE 6e: GameObject Physics (Opción A)
3. ⏩ **FASE 7a-7d: GameStateStore** (este análisis)
4. ⏩ FASE 8: Documentación final

**Orden recomendado**: 6 → 6e → 7 → 8

El GameStateStore es un cambio arquitectónico importante que facilita FASE 6e (física en GameObject) y futuras mejoras.
