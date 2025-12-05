# Generación de Sistemas Solares y Respawn

## Resumen
Sistema de generación procedural de sistemas solares con enfoque en el sistema humano inicial, gestión de snapshots para viajes por portales, y respawn completo tras destrucción de nave.

## Arquitectura General

### Servicios Principales
```
GameEngine
  ├─> HumanSolarSystemService (sistema inicial)
  ├─> SolarSystemService (generación procedural)
  ├─> PortalPersistenceService (snapshots)
  └─> AsteroidClusterService (gestión de clusters)
```

---

## 1. Sistema Solar Humano (Inicial)

### Servicio: `HumanSolarSystemService`
**Ubicación**: `src/app/game/services/game/human-solar-system.service.ts`

### Método Principal: `createSolarSystem()`

#### Componentes Generados

**A. Sol**
```typescript
Sol {
  id: "human-sun",
  radius: 3000,
  position: (0, 0, 0),
  health: 50,000 HP,
  type: TargetType.SUN
}
```

**B. Planetas** (órbitas elípticas)
Sistema completo con 8 planetas clásicos:

| Planeta | Radio | Semi-mayor | Semi-menor | Color | Salud |
|---------|-------|------------|------------|-------|-------|
| Mercurio | 400 | 10,000 | 9,700 | gris | 12,000 |
| Venus | 950 | 15,000 | 14,800 | marron | 12,000 |
| Tierra | 1000 | 20,000 | 19,600 | azul_hielo | 12,000 |
| Marte | 530 | 30,000 | 29,100 | rojo_carmesi | 12,000 |
| Júpiter | 11,000 | 100,000 | 95,000 | marron | 12,000 |
| Saturno | 9,000 | 180,000 | 171,000 | azul_marino | 12,000 |
| Urano | 4,000 | 360,000 | 342,000 | azul_hielo | 12,000 |
| Neptuno | 3,900 | 600,000 | 570,000 | azul_marino | 12,000 |

**Características Orbitales**:
- Plano orbital: XZ (normal +Y)
- Orientación: aleatorizada por planeta
- Velocidad angular: inversamente proporcional al radio
- Inclinación axial: ~23.44° (como Tierra)

**C. Tierra Dividida** (Easter Egg)
```typescript
EarthSplitPlanet {
  hemisferios: 2,
  separación: 800 unidades,
  anillo_debris: 40 MegaAsteroides,
  radius_anillo: 6,000,
  health: 12,000 HP c/u
}
```
- Dos hemisferios orbitando en formación
- Anillo de mega-asteroides sincronizado
- Debris con vida local relativa al centro del anillo

**D. Nave Inicial**
```typescript
Spaceship {
  position: origen (0, 0, 0),
  health: 540 HP,
  velocity: (0, 0, 0)
}
```
- Se reposiciona más adelante por `createGameObjects()`

#### Proceso de Creación
```
createSolarSystem()
  ├─> Crear Sol en origen
  ├─> Para cada planeta:
  │   ├─> Calcular posición orbital inicial
  │   ├─> Crear Planet/RingedPlanet/GaseousPlanet
  │   ├─> Asignar parámetros orbitales
  │   └─> Configurar tipo planetario
  ├─> Crear Tierra Dividida (si enabled)
  │   ├─> Dos hemisferios
  │   └─> Generar anillo de MegaAsteroides
  └─> Retornar SolarSystemSnapshot
```

---

## 2. Trail de Asteroides (Inicialización Completa)

### Método: `GameEngine.createGameObjects()`
**Ubicación**: `GameEngine.ts` (línea ~755)

#### Fase 1: Aplicar Snapshot Humano
```typescript
const humanSnapshot = humanSolarSystemService.createSolarSystem();
applySolarSystemSnapshot(humanSnapshot);
```
- Carga planetas, sol, Tierra dividida
- Inicializa portales persistentes (si existen)

#### Fase 2: Generar Trail de Clusters
**Configuración**:
```typescript
const TRAIL_CONFIG = {
  rows: 6,
  clustersPerRow: [20, 40, 50, 60, 40, 20],  // total: 230 clusters
  baseSpacing: 1500,
  rowSpread: 3000,
  orbitRadius: 20000,  // órbita de la Tierra
  asteroidMode: 'varied'  // pequeños y super
};
```

**Matemática del Trail**:
1. Obtener centro y radio de órbita terrestre
2. Dividir órbita en N segmentos equiespaciados
3. Para cada fila (6 filas):
   ```typescript
   angle_per_cluster = (2 * PI * coverage) / clusters_in_row
   radial_offset = earthRadius + fila * rowSpread
   ```
4. Posicionar clusters a lo largo de la elipse:
   ```typescript
   // Punto en órbita terrestre
   P = (a * cos(θ), 0, b * sin(θ))
   // Offset radial desde centro orbital
   dir = normalize(P - earthCenter)
   cluster_pos = earthCenter + dir * radial_offset
   ```

**Contenido de Cada Cluster** (~8 asteroides):
- 4-6 asteroides pequeños (radius 1.0, scale 1.0)
- 1-2 super asteroides (radius 1.0, scale 3-5x)
- Velocidad orbital heredada de formación
- IDs únicos: `trail-{row}-{cluster}-ast{index}`

#### Fase 3: Reposicionar Nave
```typescript
// Nave al final del trail, mirando perpendicular a Tierra
shipPosition = lastClusterCenter + offsetDirection * 5000
shipLookAt = perpendicular_to_earth
```

#### Fase 4: Registro en Catálogo
```typescript
targetCatalog.add(TargetType.PLANET, planets);
targetCatalog.add(TargetType.ASTEROID, allAsteroids);
targetCatalog.add(TargetType.SUPER_ASTEROID, superAsteroids);
targetCatalog.add(TargetType.MEGA_ASTEROID, megaDebris);
```

---

## 3. Sistema de Snapshots (Portales)

### Servicio: `PortalPersistenceService`

#### Estructura de Snapshot
```typescript
interface SolarSystemSnapshot {
  id: string;
  name: string;
  sun: SunData | null;
  planets: PlanetData[];
  portals: PortalSnapshot[];
  timestamp: number;
}

interface PortalSnapshot {
  id: string;
  position: Vector3;
  linkedPortalId?: string;
  radius: number;
}
```

#### Operaciones Principales

**Capturar Estado Actual**:
```typescript
captureSnapshot(name: string): SolarSystemSnapshot {
  return {
    id: generate_uuid(),
    name,
    sun: serializeSun(primarySun),
    planets: planets.map(serializePlanet),
    portals: portals.map(serializePortal),
    timestamp: Date.now()
  };
}
```

**Aplicar Snapshot** (`applySolarSystemSnapshot()`):
```typescript
applySolarSystemSnapshot(snapshot: SolarSystemSnapshot) {
  // 1. Limpiar estado actual
  planets = [];
  portals = [];
  
  // 2. Reconstruir desde snapshot
  if (snapshot.sun) {
    primarySun = new Sun(snapshot.sun.id, snapshot.sun.radius, snapshot.sun.position);
  }
  
  for (const pData of snapshot.planets) {
    const planet = reconstructPlanet(pData);
    planets.push(planet);
    planet.initBuffers(gl);
  }
  
  for (const pData of snapshot.portals) {
    const portal = new Portal(pData.id, pData.position, pData.radius);
    portal.linkedPortalId = pData.linkedPortalId;
    portals.push(portal);
    portal.initBuffers(gl);
  }
  
  // 3. Actualizar referencia
  lastAppliedSnapshotId = snapshot.id;
}
```

#### Gestión de Portales Persistentes
- Portales sobreviven transiciones entre sistemas
- Mantenidos en `PortalPersistenceService`
- Enlaces bidireccionales: `linkedPortalId`

---

## 4. Respawn Completo

### Método: `GameEngine.respawnGame()`
**Ubicación**: `GameEngine.ts` (línea ~2215)

**Trigger**: `spaceship.healthCurrent <= 0` en `checkCollisions()`

#### Proceso de Respawn

**Fase 1: Pausa**
```typescript
const wasRunning = this.isRunning;
this.isRunning = false;  // detiene game loop
```

**Fase 2: Limpieza Total**
```typescript
// Arrays principales
this.asteroids = [];
this.ephemeralAsteroids = [];
this.superAsteroids = [];
this.planets = [];
this.portals = [];
this.primarySun = null;
this.planetDebris.clear();

// Estado de runtime
this.collisionDamageCooldown.clear();
this.dopplerCues.clear();
this.lastObjPos.clear();

// Efectos visuales
this.impactVignetteLevel = 0;
this.collisionSlide = null;

// Estado de portales
this.portalTraversalCooldownSec = 0;
this.portalPrevDistances.clear();
this.lastShipPos = null;
```

**Fase 3: Regeneración**
```typescript
this.createGameObjects();
// ↓
// Vuelve a ejecutar todo el proceso de inicialización:
//   1. Aplicar snapshot humano
//   2. Generar trail de clusters
//   3. Reposicionar nave
//   4. Registrar en catálogo
```

**Fase 4: Restauración**
```typescript
// Salud de nave restaurada automáticamente por createGameObjects()
spaceship.healthCurrent = spaceship.healthMax;  // 540 HP

// Reanuda game loop
if (wasRunning) {
  this.isRunning = true;
  this.lastFrameTime = performance.now();
}
```

**Fase 5: Feedback**
```typescript
hudManager.addMarqueeMessage('Sistema solar regenerado');
logger.log(LogLevel.INFO, 'Respawn complete');
```

---

## 5. Clusters de Asteroides

### Servicio: `AsteroidClusterService`

#### Estructura de Cluster
```typescript
interface AsteroidCluster {
  id: string;
  center: Vector3;
  objects: GameObject[];  // asteroides miembros
  lodMode: 'full' | 'proxy' | 'transition';
  proxy?: ClusterObject;  // representante único para LOD
  representativeId?: string;
}
```

#### Creación de Cluster
```typescript
createCluster(center: Vector3, asteroids: Asteroid[]) {
  const cluster = {
    id: generate_id(),
    center,
    objects: asteroids,
    lodMode: 'full'
  };
  
  // Calcular offsets locales
  for (const ast of asteroids) {
    ast.localOffset = {
      x: ast.position.x - center.x,
      y: ast.position.y - center.y,
      z: ast.position.z - center.z
    };
  }
  
  return cluster;
}
```

#### Sistema LOD (Level of Detail)
**Estados**:
- **full**: Renderiza todos los asteroides individuales
- **proxy**: Renderiza solo un objeto representativo (ClusterObject)
- **transition**: Interpolando entre estados

**Switching Automático**:
```typescript
updateLOD(cameraPos: Vector3) {
  const distance = distanceToCamera(cluster.center, cameraPos);
  
  if (distance > LOD_THRESHOLD_FAR && cluster.lodMode === 'full') {
    cluster.lodMode = 'proxy';
    createProxyObject(cluster);
  } else if (distance < LOD_THRESHOLD_NEAR && cluster.lodMode === 'proxy') {
    cluster.lodMode = 'full';
    destroyProxyObject(cluster);
  }
}
```

---

## 6. Asteroides Efímeros

### Sistema de Spawn Dinámico
**Ubicación**: `GameEngine.update()` - checkEphemeralAsteroidSpawn()

**Configuración**:
```typescript
const EPHEMERAL_CONFIG = {
  checkInterval: 10000,  // ms (cada 10s)
  maxCount: 20,
  spawnRadius: 8000,     // alrededor de nave
  maxPerSpawn: 3,
  minSize: 0.8,
  maxSize: 2.0
};
```

**Proceso de Spawn**:
```typescript
if (now > nextEphemeralCheckMs) {
  const current = ephemeralAsteroids.length;
  
  if (current < MAX_COUNT) {
    const toSpawn = min(MAX_PER_SPAWN, MAX_COUNT - current);
    
    for (let i = 0; i < toSpawn; i++) {
      // Posición aleatoria en esfera alrededor de nave
      const offset = randomPointInSphere(SPAWN_RADIUS);
      const pos = shipPosition + offset;
      
      // Dirección aleatoria
      const dir = randomUnitVector();
      
      // Crear asteroide
      const ast = new Asteroid(generate_id(), pos, randomSize(), dir);
      ephemeralAsteroids.push(ast);
      ast.initBuffers(gl);
    }
  }
  
  nextEphemeralCheckMs = now + CHECK_INTERVAL;
}
```

---

## 7. Órbitas Planetarias

### Actualización Orbital
**Método**: `Planet.updateOrbitalPosition(deltaTime)`

**Matemática Elíptica**:
```typescript
// Actualizar ángulo orbital
orbitAngle += orbitAngularSpeed * deltaTime;

// Posición en elipse (plano XZ por defecto)
const x = orbitCenter.x + semiMajor * cos(orbitAngle);
const z = orbitCenter.z + semiMinor * sin(orbitAngle);
const y = orbitCenter.y;

// Aplicar rotación de orientación orbital
const rotatedPos = rotateAroundY([x, y, z], orbitOrientation);

// Soporte para planos orbitales arbitrarios (futuro)
if (orbitNormal !== [0,1,0]) {
  finalPos = projectToOrbitPlane(rotatedPos, orbitNormal, orbitU);
}

position = finalPos;
```

**Rotación Axial** (spin del planeta):
```typescript
// Aplicar inclinación axial antes de rotación diaria
rotation.x += axialTiltRad;
rotation.y += rotationRate * deltaTime;
```

---

## 8. Flujo Completo de Inicialización

```
GameEngine.initialize(canvas)
  ├─> Inicializar WebGL context
  ├─> Crear ShaderManager
  ├─> Crear TextureManager
  ├─> Inicializar ParticleEffects
  ├─> Crear HUDManager
  ├─> Crear Camera
  └─> (espera a start() para objetos)

GameEngine.start()
  ├─> createGameObjects()
  │   ├─> Crear spaceship en origen
  │   ├─> initializeAllBuffers()
  │   │   ├─> spaceship.initBuffers()
  │   │   ├─> applySolarSystemSnapshot(humanSnapshot)
  │   │   │   ├─> Crear Sol
  │   │   │   ├─> Crear Planetas (8)
  │   │   │   ├─> Crear Tierra Dividida
  │   │   │   └─> Crear anillo MegaAsteroides
  │   │   └─> Generar Trail de Clusters
  │   │       ├─> 6 filas × [20,40,50,60,40,20] clusters
  │   │       ├─> ~230 clusters × 8 asteroides
  │   │       └─> ~1840 asteroides totales
  │   ├─> Reposicionar nave al final del trail
  │   └─> Registrar todos en targetCatalog
  ├─> enableAudio()
  ├─> isRunning = true
  └─> requestAnimationFrame(gameLoop)

gameLoop()
  ├─> update(deltaTime)
  │   ├─> Actualizar órbitas planetarias
  │   ├─> Actualizar posiciones de asteroides
  │   ├─> Actualizar nave (física, input)
  │   ├─> checkCollisions()
  │   ├─> checkEphemeralAsteroidSpawn()
  │   └─> Actualizar efectos visuales
  └─> render()
      ├─> Renderizar Sol (core + glow)
      ├─> Renderizar Planetas
      ├─> Renderizar Asteroides (full o LOD proxy)
      ├─> Renderizar Nave
      ├─> Renderizar Portales
      ├─> Renderizar HUD
      └─> Renderizar overlays (vignette, fade)
```

---

## 9. Persistencia y Transiciones

### Viaje por Portal
```
handlePortalTraversal()
  ├─> Detectar cruce de plano portal
  ├─> Obtener snapshot destino
  ├─> Fade out (negro opaco)
  ├─> applySolarSystemSnapshot(destSnapshot)
  ├─> Reposicionar nave en portal destino
  ├─> Fade in (transparente)
  └─> Cooldown 3s anti-rebote
```

---

## 10. Ajustes recientes (Gate Rite & Gigantes)

### Portales tras Gate Rite
- `Portal` expone ahora `getTargetingRadius()` y `getTargetingSuppressionRadius()` (`src/app/game/game-objects/Portal.ts`). El objetivo es desacoplar el radio visual del radio usado por el targeting.
- `AdaptiveTargetingSystem` detecta si la cámara/nave está dentro del disco del portal. Mientras permanezcas en esa burbuja de supresión, el raycast ignora el portal y deja pasar clicks a otros objetos; si apuntas directo al ojo, el fallback por píxel permite seleccionarlo igualmente.
- Resultado práctico: después de atravesar un portal Gate Rite ya no es necesario alejarse decenas de kilómetros para volver a seleccionar planetas u objetivos cercanos.

### Escalado de planetas gigantes/anillados
- El generador (`SystemGeneratorService.radiusForKind`) emite radios base mucho más contenidos: `Giant` ≈ 320‑580 u y `Ringed` ≈ 1300‑2100 u antes de que las clases específicas apliquen sus multiplicadores (x4 y x2 respectivamente).
- Esto deja los gigantes procedural en un rango final de 1.3k‑2.3k unidades y los anillados en 2.6k‑4.2k, alineados con las proporciones descritas para el sistema humano. Los valores opcionales como `maxGiantRadius` siguen operando sobre el radio base.
- Documentar cualquier snapshot legado con radios mayores, porque tras esta actualización se verán más contenidos y acordes a Júpiter/Saturno.

### Datos Preservados Entre Sistemas
- **Portales persistentes**: Mantenidos en PortalPersistenceService
- **Enlaces portales**: linkedPortalId bidireccional
- **Nave**: Posición, velocidad, orientación, salud

### Datos NO Preservados
- Asteroides (regenerados por sistema destino)
- Planetas (definidos por snapshot destino)
- Clusters (recalculados)
- Ephemeral asteroids (spawn fresh)

---

## 10. Configuración y Constantes

### Sistema Humano
```typescript
// En HumanSolarSystemService
SUN_RADIUS = 3000
PLANET_RADII = {
  mercury: 400, venus: 950, earth: 1000,
  mars: 530, jupiter: 11000, saturn: 9000,
  uranus: 4000, neptune: 3900
}
ORBITAL_SPEEDS_BASE = 0.00002  // rad/s, ajustado por distancia
```

### Trail de Asteroides
```typescript
// En GameEngine.createGameObjects()
TRAIL_ROWS = 6
CLUSTERS_PER_ROW = [20, 40, 50, 60, 40, 20]
BASE_SPACING = 1500
ROW_SPREAD = 3000
EARTH_ORBIT_RADIUS = 20000
ASTEROIDS_PER_CLUSTER = 8
SUPER_ASTEROID_CHANCE = 0.25
```

### Respawn
```typescript
SHIP_STARTING_HEALTH = 540
RESPAWN_DELAY = 0  // inmediato tras clear
FADE_DURATION = 0  // sin fade en respawn (directo)
```

---

## Mejoras Futuras

1. **Generación Procedural Completa**:
   - Sistemas solares aleatorios
   - Variación en número de planetas
   - Tipos estelares (enanas, gigantes)

2. **Asteroides Independientes**:
   - Extraer de cluster tras colisión
   - Vectores de movimiento individuales
   - Culling por distancia

3. **Persistencia Completa**:
   - Guardar estado entre sesiones
   - Múltiples saves
   - Progreso de destrucción de objetos

4. **Biomas Planetarios**:
   - Atmósferas
   - Superficies detalladas
   - Vida orgánica

5. **Anillos Dinámicos**:
   - Debris orbitales
   - Colisiones con anillos
   - Captura gravitacional
