# Sistema de Colisiones

## Resumen
Sistema completo de detección de colisiones esfera-esfera con respuesta física diferenciada según tipo de objeto, sistema de salud genérico, daño mutuo y destrucción permanente de objetos.

## Arquitectura

### 1. Detección de Colisiones (`checkCollisions()`)
**Ubicación**: `GameEngine.ts` (línea ~2015)

**Frecuencia**: Se ejecuta cada frame del game loop

**Proceso**:
1. **Agregación de fuentes**: Recopila todos los objetos potencialmente colisionables:
   - Objetos de clusters (asteroides, super asteroides)
   - Asteroides efímeros
   - Planetas
   - Sol primario
   - Portales
   - Mega asteroides (planet debris)

2. **Test esfera-esfera**: Para cada objeto, llama a `spaceship.checkCollision(obj)`
   - Usa bounding spheres precalculadas
   - Distancia entre centros < suma de radios → colisión

3. **Clasificación de daño**: Determina daño según tipo de objeto:
   ```typescript
   Asteroid         → 10 HP
   SuperAsteroid    → 75 HP
   MegaAsteroid     → 150 HP
   Planet/variants  → 100,000 HP (fatal)
   Sun              → 100,000 HP (fatal)
   Portal           → 0 HP (etéreo)
   ClusterObject    → 10 HP
   ```

4. **Cooldown de daño**: Previene daño repetido del mismo objeto
   - 500ms cooldown por objeto (`collisionDamageCooldown` Map)
   - Usa timestamps para tracking

### 2. Respuesta Física (`handleCollisionResponse()`)
**Ubicación**: `GameEngine.ts` (línea ~2101)

#### A. Cálculo de Normal de Colisión
```typescript
// Vector desde centro del objeto hacia nave
nx = (S.x - C.x) / distance
ny = (S.y - C.y) / distance
nz = (S.z - C.z) / distance
```

#### B. Respuesta Diferenciada por Tipo

**Asteroides Pequeños** (`Asteroid`, `ClusterObject`):
- **Reflejo elástico parcial** (coeficiente 0.4):
  ```typescript
  v' = v - (1 + e) * (v·n) * n
  ```
- **Push-out**: Reposiciona nave fuera del radio de colisión + 3 unidades
- **Impulso al asteroide** (Newton 3ª ley):
  ```typescript
  masa_nave = 100
  masa_asteroide = 1
  impulso = -(1 + 0.4) * v_relativa·n / (1/m_asteroid + 1/m_ship)
  v_asteroid_nueva = v_asteroid + (impulso * n) / m_asteroid
  ```
  - El asteroide ligero recibe gran cambio de velocidad
  - Se registra nuevo vector en logs (DEBUG)

**Objetos Grandes** (`SuperAsteroid`, `MegaAsteroid`, `Planet`):
- **Desplazamiento lateral suave** (300ms):
  1. Proyecta dirección forward de la nave en plano tangente:
     ```typescript
     t = fwd - (fwd·n) * n  // tangente al objeto
     ```
  2. Calcula distancia de slide proporcional al radio:
     ```typescript
     slide = clamp(R * 0.1, 30, 250)
     ```
  3. Interpola posición durante 300ms con smoothstep
  4. Actualiza bounding sphere cada frame durante interpolación

- **Cancelación de velocidad radial**:
  ```typescript
  if (v·n < 0):  // si se acerca al objeto
    v = v - (v·n) * n  // elimina componente hacia dentro
  ```

**Otros Objetos**:
- Reflejo suave (coeficiente 0.2)

#### C. Efectos Visuales y Audio

**Vignette Rojo** (flash de impacto):
```typescript
bump = 0.08 + (damage / 250)  // 0.08..0.98
impactVignetteLevel += bump
// Decae a 1.6/segundo en update loop
```

**Audio de Colisión**:
- `damage >= 80` → `sfx_collision_heavy` (vol 0.25-0.9)
- `damage < 80` → `sfx_collision_light` (vol 0.25-0.9)
- Fallbacks: `sfx_whoosh` / `ui_select`
- Requiere `audioUnlocked = true`

### 3. Sistema de Salud Genérico

**Clase Base**: `GameObject.ts`
```typescript
public healthCurrent: number;
public healthMax: number;
```

**Valores por Tipo**:
| Tipo | HP Máximo | Impactos Nave (50 HP) |
|------|-----------|----------------------|
| Asteroid | 100 | 2 |
| SuperAsteroid | 800 | 16 |
| MegaAsteroid | 2,500 | 50 |
| Planet | 12,000 | 240 |
| Portal | 5,000 | 100 |
| Sun | 50,000 | 1,000 |

### 4. Daño Mutuo

**Daño de Nave → Objeto** (`applyDamageToObject()`):
```typescript
damage_dealt = 50 HP por impacto
obj.healthCurrent -= damage_dealt
// La destrucción es manejada automáticamente por el sistema reactivo
```

**Logs Generados** (INFO):
```typescript
{
  id: "objeto-id",
  damage: 50,
  prevHealth: 800,
  newHealth: 750,
  healthMax: 800,
  willDestroy: false
}
```

**Sistema Reactivo de Destrucción**:

El sistema de salud implementa un patrón reactivo donde **no es necesario verificar manualmente** si un objeto debe destruirse. La destrucción ocurre automáticamente mediante callbacks.

#### Arquitectura del Sistema Reactivo

**1. Clase Base `GameObject`** (`GameObject.ts`):
```typescript
// Backing field privado
protected _healthCurrent: number;

// Getter/Setter reactivo
public get healthCurrent(): number {
  return this._healthCurrent;
}

public set healthCurrent(value: number) {
  const oldValue = this._healthCurrent;
  this._healthCurrent = value;
  
  // Verificación reactiva automática
  if (value <= 0 && oldValue > 0 && this.onDestroyedCallback) {
    this.onDestroyedCallback(this);
  }
}

// Callback registrable
private onDestroyedCallback: ((obj: GameObject) => void) | null = null;

public setDestroyedCallback(callback: (obj: GameObject) => void): void {
  this.onDestroyedCallback = callback;
}
```

**Características clave**:
- El setter detecta transiciones de `> 0` a `≤ 0`
- Llama automáticamente al callback registrado
- No requiere verificaciones manuales en código de daño

**2. Registro Universal en `GameEngine`**:

Al crear cada objeto, el GameEngine registra el callback de destrucción:

```typescript
// Ejemplo: creación de asteroides
const asteroid = new Asteroid(id, position);
asteroid.setDestroyedCallback((obj) => {
  this.destroyObject(obj);
});
this.asteroids.push(asteroid);
```

Este patrón se aplica a:
- Asteroides (regulares, super, mega)
- Planetas (todas las variantes)
- Portales
- Debris planetarios
- Asteroides independizados de clusters

**3. Caso Especial: `Spaceship`** (`Spaceship.ts`):

La nave tiene un **doble callback** ya que sobreescribe el setter:

```typescript
public override set healthCurrent(value: number) {
  const oldValue = this._healthCurrent;
  this._healthCurrent = value;
  
  // Callback 1: Cambios de salud (efectos, logging)
  if (this.onHealthChangeCallback) {
    this.onHealthChangeCallback(value, oldValue);
  }
  
  // Callback 2: Muerte del jugador (death dialog)
  if (value <= 0 && oldValue > 0 && this.onDeathCallback) {
    this.onDeathCallback();
  }
}

// Dos métodos de registro separados
public setHealthChangeCallback(callback: (current: number, previous: number) => void): void {
  this.onHealthChangeCallback = callback;
}

public setDeathCallback(callback: () => void): void {
  this.onDeathCallback = callback;
}
```

**GameEngine registra ambos**:
```typescript
this.spaceship.setHealthChangeCallback((current, prev) => {
  // Efectos visuales, logging, etc.
});

this.spaceship.setDeathCallback(() => {
  this.triggerDeathDialog(); // Modal de muerte
});
```

**4. Independización de Asteroides en Clusters**:

Cuando un asteroide en cluster recibe daño, se independiza reactivamente:

```typescript
// En makeAsteroidIndependent()
const independent = new Asteroid(asteroid.id, asteroid.position);
independent.velocity = newVelocity;

// Registrar callback de destrucción para el asteroide independiente
independent.setDestroyedCallback((obj) => {
  this.destroyObject(obj);
});

this.independentAsteroids.push(independent);
```

#### Flujo Completo Reactivo

```
1. Colisión detectada
   └─> applyDamageToObject(obj, 50)
       └─> obj.healthCurrent -= 50
           └─> Setter activado automáticamente
               ├─> Verificación: healthCurrent <= 0?
               │   └─> SÍ: onDestroyedCallback(obj)
               │       └─> GameEngine.destroyObject(obj)
               │           ├─> Elimina de arrays
               │           ├─> Limpia targeting
               │           ├─> Limpia HUD
               │           ├─> Marca inactivo
               │           └─> Log INFO: "Objeto destruido"
               └─> NO: Objeto continúa activo
```

**Ventajas del Sistema Reactivo**:
- ✅ **Sin verificaciones manuales**: El código de daño solo modifica `healthCurrent`
- ✅ **Centralizado**: Toda destrucción pasa por `destroyObject()`
- ✅ **Consistente**: Funciona igual para todos los objetos
- ✅ **Mantenible**: Añadir nuevos objetos solo requiere registrar callback
- ✅ **Debug-friendly**: Breakpoints en el setter capturan todas las destrucciones
- ✅ **Thread-safe**: Un único punto de entrada para destrucción

#### Ejemplos de Uso

**Daño por colisión** (automático):
```typescript
// En checkCollisions()
this.applyDamageToObject(asteroid, 50);
// Si healthCurrent llega a 0, se destruye automáticamente
```

**Hechizo Disruption Rite** (manual):
```typescript
// En updateDisruptionBeam()
const damage = target.healthMax; // Suficiente para destruir
this.applyDamageToObject(target, damage);
// El sistema reactivo maneja la destrucción
```

**Hechizo Eternal Rite** (suicidio):
```typescript
// En EternalRiteAnimation.update()
engine.spaceship.healthCurrent = 0;
// Dispara automáticamente triggerDeathDialog()
```

### 5. Destrucción de Objetos (`destroyObject()`)

**Proceso**:
1. Identifica tipo mediante `constructor.name`
2. Elimina de array correspondiente:
   - `asteroids[]`
   - `ephemeralAsteroids[]`
   - `superAsteroids[]`
   - `planets[]`
   - `portals[]`
   - `planetDebris` Map
3. Limpia de clusters (si aplica)
4. Mensaje HUD: `"[Tipo] destruido"`
5. Log permanente (INFO)

**Tipos Soportados**:
- `Asteroid` / `_Asteroid`
- `SuperAsteroid` / `_SuperAsteroid`
- `MegaAsteroid` / `_MegaAsteroid`
- `Planet` (todas las variantes)
- `Portal`

### 6. Respawn de Nave

**Trigger**: `spaceship.healthCurrent <= 0`

**Proceso** (`respawnGame()`):
1. **Pausa game loop** temporalmente
2. **Limpieza total**:
   - Arrays de objetos → `[]`
   - Clusters → vacíos
   - Cooldowns → clear()
   - Efectos de cámara → reset
   - Portal state → reset
3. **Regeneración**:
   - Llama `createGameObjects()`
   - Recrea sistema solar humano completo
   - Nave en posición inicial del trail
   - Salud restaurada a máximo
4. **Reanuda game loop**

**Mensaje**: `"Sistema solar regenerado"`

## Optimizaciones

### Bounding Spheres
- Calculadas al construir objeto: `computeBoundingSphere()`
- Actualizadas cada frame: `updateBoundingSphere()`
- Radius basado en geometría real (vértices más lejanos)

### Logging Throttling
- Collision check debug: cada 5 segundos
- Logs críticos: sin throttle (INFO/WARN/ERROR)

### Cooldown de Daño
- 500ms por objeto
- Previene múltiples hits en un frame
- Map con timestamps: `collisionDamageCooldown`

## Casos Especiales

### Portal
- Daño 0 (etéreo, no colisión física)
- Atravesar pentacle activa `handlePortalTraversal()`
- Test separado: intersección segmento-plano

### Slide Animation
- Solo para objetos grandes
- Bounding sphere actualizada durante interpolación
- Previene re-colisión durante desplazamiento

### Nombre de Clases Minificadas
```typescript
rawName = obj.constructor.name  // "_SuperAsteroid"
name = rawName.startsWith('_') ? rawName.substring(1) : rawName
// name = "SuperAsteroid"
```

## Flujo Completo de Colisión

```
checkCollisions()
  ├─> Para cada objeto:
  │   ├─> spaceship.checkCollision(obj)
  │   │   └─> Esfera-esfera test
  │   ├─> Si colisiona:
  │   │   ├─> Determinar daño según tipo
  │   │   ├─> handleCollisionResponse(obj, name, dmg)
  │   │   │   ├─> Calcular normal
  │   │   │   ├─> Aplicar física (rebote/slide)
  │   │   │   ├─> Vignette bump
  │   │   │   └─> Audio cue
  │   │   ├─> applyDamage(obj, dmg)  // nave recibe daño
  │   │   │   ├─> Cooldown check
  │   │   │   ├─> Restar HP nave
  │   │   │   └─> Si HP <= 0 → respawnGame()
  │   │   └─> applyDamageToObject(obj, 50)  // objeto recibe daño
  │   │       ├─> Restar 50 HP objeto
  │   │       └─> Si HP <= 0 → destroyObject(obj)
  │   │           ├─> Eliminar de arrays
  │   │           ├─> Limpiar de clusters
  │   │           └─> Mensaje HUD
  └─> Log throttled: sources count cada 5s
```

## Categorías de Logging

- `LogCategory.GAME_LOOP` (DEBUG): Detección, respuesta, vignette, impulsos
- `LogCategory.GAME_LOOP` (INFO): Colisión detectada, daño aplicado, destrucción
- `LogCategory.GAME_LOOP` (WARN): Nave destruida, respawn iniciado
- `LogCategory.GAME_LOOP` (ERROR): Fallos en handleCollisionResponse

## Configuración

### Constantes Ajustables
```typescript
// En handleCollisionResponse()
REBOUND_ELASTICITY_SMALL = 0.4    // Asteroides pequeños
REBOUND_ELASTICITY_DEFAULT = 0.2  // Otros objetos
SLIDE_DURATION = 0.3              // Segundos (300ms)
SLIDE_MIN_DISTANCE = 30           // Unidades mínimas
SLIDE_MAX_DISTANCE = 250          // Unidades máximas
SLIDE_RADIUS_MULTIPLIER = 0.1     // Radio objeto × multiplicador
PUSHOUT_MARGIN = 3                // Unidades extra pequeños
PUSHOUT_MARGIN_LARGE = 5          // Unidades extra grandes

// En checkCollisions()
DAMAGE_COOLDOWN_MS = 500          // Milisegundos entre daños

// En applyDamageToObject()
SHIP_COLLISION_DAMAGE = 50        // HP por impacto

// Vignette
VIGNETTE_BASE = 0.08
VIGNETTE_SCALE = 1/250
VIGNETTE_DECAY_RATE = 1.6         // Por segundo

// Física de impulso
SHIP_MASS = 100
ASTEROID_MASS = 1
```

## Mejoras Futuras (Propuestas)

1. **Asteroides independientes post-colisión**:
   - Extraer de cluster tras impacto
   - Vector director individual
   - Culling por distancia

2. **Damage types**:
   - Kinetic, thermal, void-based
   - Resistencias por tipo de objeto

3. **Particle effects**:
   - Debris en colisión
   - Explosión en destrucción

4. **Shield system**:
   - HP shield vs HP hull
   - Shield recharge
