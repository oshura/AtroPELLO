import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { LoggingService, LogLevel, LogCategory } from '../logging.service';
import { GameObject } from '../../game/GameObject';
import { Asteroid } from '../../game/game-objects/Asteroid';
import { SuperAsteroid } from '../../game/game-objects/SuperAsteroid';
import { MegaAsteroid } from '../../game/game-objects/MegaAsteroid';
import { Planet } from '../../game/game-objects/Planet';
import { Portal } from '../../game/game-objects/Portal';
import { Sun } from '../../game/game-objects/Sun';
import { Spaceship } from '../../game/game-objects/Spaceship';
import { Camera } from '../../game/Camera';
import { GameObjectType } from '../../game/types/game-object.types';
import { ITargetable } from '../../game/types/targeting.types';

/**
 * Evento de cambio de estado del juego
 * Permite observar mutaciones en el store
 */
export interface GameStateChangeEvent {
  /** Tipo de cambio ocurrido */
  type: 'asteroid-added' | 'object-removed' | 'state-reset' | 'object-updated';
  /** Objeto afectado (si aplica) */
  object?: GameObject;
  /** Metadata adicional del evento */
  metadata?: any;
}

/**
 * GameStateStore
 * 
 * Single source of truth para el estado del juego.
 * 
 * Responsabilidades:
 * - Almacenar colecciones de GameObjects (asteroides, planetas, portales, etc.)
 * - Gestionar referencias a entidades principales (ship, camera, sun)
 * - Mantener flags de estado del juego (gameRunning, frameCount, etc.)
 * - Proporcionar métodos de búsqueda/filtrado eficientes
 * - Notificar cambios mediante RxJS Subjects (opcional)
 * - Logging centralizado de mutaciones de estado
 * 
 * NO responsable de:
 * - Lógica de juego (eso es GameEngine)
 * - Renderizado (eso es GameEngine)
 * - Física (eso es CollisionManagerService, etc.)
 * - Coordinación de servicios (eso es GameEngine)
 * 
 * Beneficios:
 * - Testing simplificado (estado manipulable directamente)
 * - Servicios desacoplados (no necesitan GameEngine completo)
 * - Debugging más fácil (estado centralizado inspectable)
 * - SRP: separación clara entre estado y lógica
 * 
 * @example
 * ```typescript
 * constructor(private gameState: GameStateStore) {}
 * 
 * doSomething() {
 *   // Acceso directo a colecciones
 *   const asteroids = this.gameState.getAllAsteroids();
 *   
 *   // Mutación con logging automático
 *   this.gameState.addIndependentAsteroid(newAsteroid);
 *   
 *   // Búsqueda eficiente
 *   const obj = this.gameState.findObjectById('planet-1');
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class GameStateStore {
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  GAME OBJECTS COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** 
   * Asteroides independientes (eyectados de clusters).
   * Arrays públicos para acceso directo y performance.
   * Usar métodos de mutación para logging/notificaciones.
   */
  public readonly independentAsteroids: Asteroid[] = [];
  
  /** Super asteroides (grandes, pesados) */
  public readonly superAsteroids: SuperAsteroid[] = [];
  
  /** Mega asteroides (enormes, muy pesados) */
  public readonly megaAsteroids: MegaAsteroid[] = [];
  
  /** Planetas del sistema solar actual */
  public readonly planets: Planet[] = [];
  
  /** Portales activos (void jumps) */
  public readonly portals: Portal[] = [];
  
  /** Debris de planetas destruidos (asteroides generados) */
  public readonly planetDebris: Array<{ planetId: string; asteroids: MegaAsteroid[] }> = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MAIN ENTITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Nave del jugador (null antes de inicializar) */
  public spaceship: Spaceship | null = null;
  
  /** Sol del sistema solar actual */
  public sun: Sun | null = null;
  
  /** Cámara del juego */
  public camera: Camera | null = null;
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  GAME STATE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Si el game loop está activo */
  public gameRunning: boolean = false;
  
  /** Timestamp del último frame (performance.now()) */
  public lastFrameTime: number = 0;
  
  /** Contador de frames totales desde inicio */
  public frameCount: number = 0;
  
  /** Timestamp mínimo para reabrir mapa (cooldown) */
  public mapReopenAllowedAtMs: number = 0;
  
  /** Timestamp mínimo para reabrir grimorio (cooldown) */
  public grimoireReopenAllowedAtMs: number = 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MAPPINGS & CACHES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** 
   * Mapeo de IDs de mapa a objetos targetables.
   * Usado por sistema de targeting y mapa del sistema.
   */
  public readonly mapIdToTarget = new Map<string, ITargetable>();
  
  /** 
   * Cooldowns de colisiones por objeto ID.
   * Evita aplicar daño repetitivo en frames consecutivos.
   */
  public readonly collisionCooldowns = new Map<string, number>();
  
  /** 
   * Cache de doppler cues por objeto ID.
   * Usado por sistema de audio espacial.
   */
  public readonly dopplerCues = new Map<string, any>();
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REACTIVE STATE (Observabilidad)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Subject para notificar cambios de estado.
   * Los servicios pueden subscribirse para reaccionar a mutaciones.
   */
  private readonly _stateChanged$ = new Subject<GameStateChangeEvent>();
  
  /**
   * Observable de cambios de estado.
   * @example
   * ```typescript
   * this.gameState.stateChanged$.subscribe(event => {
   *   if (event.type === 'asteroid-added') {
   *     console.log('New asteroid:', event.object?.id);
   *   }
   * });
   * ```
   */
  public readonly stateChanged$: Observable<GameStateChangeEvent> = this._stateChanged$.asObservable();
  
  constructor(private logger: LoggingService) {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 
      '✅ GameStateStore initialized');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  QUERY METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Obtiene todos los asteroides del juego (independientes + super + mega).
   * @returns Array concatenado de todos los tipos de asteroides
   */
  getAllAsteroids(): Asteroid[] {
    return [
      ...this.independentAsteroids,
      ...this.superAsteroids,
      ...this.megaAsteroids
    ];
  }
  
  /**
   * Obtiene todos los objetos colisionables (excluye portales etéreos).
   * Usado por sistema de colisiones.
   * @returns Array de GameObjects con física de colisión
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
   * Obtiene todos los objetos del juego (incluyendo nave, portales, etc.).
   * @returns Array completo de todos los GameObjects
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
  
  /**
   * Busca un objeto por ID en todas las colecciones.
   * Búsqueda exhaustiva pero eficiente (early return).
   * 
   * @param id ID del objeto a buscar
   * @returns GameObject encontrado o null
   */
  findObjectById(id: string): GameObject | null {
    // Early returns para performance
    let obj: GameObject | undefined = this.independentAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.superAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.megaAsteroids.find(a => a.id === id);
    if (obj) return obj;
    
    obj = this.planets.find(p => p.id === id);
    if (obj) return obj;
    
    obj = this.portals.find(p => p.id === id);
    if (obj) return obj;
    
    // Entidades únicas
    if (this.sun?.id === id) return this.sun;
    if (this.spaceship?.id === id) return this.spaceship;
    
    return null;
  }
  
  /**
   * Filtra objetos por tipo (GameObjectType).
   * @param type Tipo de objeto a filtrar
   * @returns Array de objetos del tipo especificado
   */
  getObjectsByType(type: GameObjectType): GameObject[] {
    return this.getAllObjects().filter(obj => obj.getType() === type);
  }
  
  /**
   * Cuenta total de objetos en el juego.
   * Útil para debugging y estadísticas.
   */
  get objectCount(): number {
    return this.independentAsteroids.length 
      + this.superAsteroids.length 
      + this.megaAsteroids.length
      + this.planets.length
      + this.portals.length
      + (this.sun ? 1 : 0)
      + (this.spaceship ? 1 : 0);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  MUTATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Añade un asteroide a la colección de independientes.
   * Notifica cambio y registra en log.
   * 
   * @param asteroid Asteroide a añadir
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
   * Elimina un objeto del juego.
   * Busca en todas las colecciones y remueve la primera coincidencia.
   * 
   * @param obj GameObject a eliminar
   * @returns true si se eliminó, false si no se encontró
   */
  removeObject(obj: GameObject): boolean {
    const id = obj.id;
    let removed = false;
    
    // Buscar y eliminar de colecciones
    let idx = this.independentAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.independentAsteroids.splice(idx, 1);
      removed = true;
    }
    
    idx = this.superAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.superAsteroids.splice(idx, 1);
      removed = true;
    }
    
    idx = this.megaAsteroids.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.megaAsteroids.splice(idx, 1);
      removed = true;
    }
    
    idx = this.planets.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.planets.splice(idx, 1);
      removed = true;
    }
    
    idx = this.portals.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.portals.splice(idx, 1);
      removed = true;
    }
    
    // Planet debris (buscar en subarrays)
    for (const debris of this.planetDebris) {
      idx = debris.asteroids.findIndex(a => a.id === id);
      if (idx >= 0) {
        debris.asteroids.splice(idx, 1);
        removed = true;
        
        // Limpiar debris vacío
        if (debris.asteroids.length === 0) {
          const debrisIdx = this.planetDebris.indexOf(debris);
          if (debrisIdx >= 0) {
            this.planetDebris.splice(debrisIdx, 1);
          }
        }
      }
    }
    
    if (removed) {
      // Limpiar mapeos relacionados
      this.mapIdToTarget.delete(id);
      this.collisionCooldowns.delete(id);
      this.dopplerCues.delete(id);
      
      this._notifyChange({ type: 'object-removed', object: obj });
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 
        'Object removed from store', { 
          objectId: id, 
          objectType: obj.getType(),
          remainingObjects: this.objectCount
        });
    } else {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 
        'Attempted to remove object not in store', { objectId: id });
    }
    
    return removed;
  }
  
  /**
   * Limpia todo el estado del juego (reset completo).
   * Usado al cambiar de sistema solar o reiniciar partida.
   */
  reset(): void {
    // Limpiar colecciones
    this.independentAsteroids.length = 0;
    this.superAsteroids.length = 0;
    this.megaAsteroids.length = 0;
    this.planets.length = 0;
    this.portals.length = 0;
    this.planetDebris.length = 0;
    
    // Resetear entidades principales
    this.spaceship = null;
    this.sun = null;
    this.camera = null;
    
    // Resetear flags
    this.gameRunning = false;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.mapReopenAllowedAtMs = 0;
    this.grimoireReopenAllowedAtMs = 0;
    
    // Limpiar mapeos
    this.collisionCooldowns.clear();
    this.mapIdToTarget.clear();
    this.dopplerCues.clear();
    
    this._notifyChange({ type: 'state-reset' });
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 
      '🔄 Game state store reset complete');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Notifica un cambio de estado a los subscribers.
   * @param event Evento de cambio a emitir
   */
  private _notifyChange(event: GameStateChangeEvent): void {
    this._stateChanged$.next(event);
  }
  
  /**
   * Método de debug para inspeccionar estado completo.
   * No usar en producción (performance cost).
   */
  debugState(): void {
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 
      '🔍 GameStateStore Debug Snapshot', {
        independentAsteroids: this.independentAsteroids.length,
        superAsteroids: this.superAsteroids.length,
        megaAsteroids: this.megaAsteroids.length,
        planets: this.planets.length,
        portals: this.portals.length,
        planetDebris: this.planetDebris.length,
        hasSpaceship: !!this.spaceship,
        hasSun: !!this.sun,
        hasCamera: !!this.camera,
        gameRunning: this.gameRunning,
        frameCount: this.frameCount,
        totalObjects: this.objectCount,
        mapIdToTarget: this.mapIdToTarget.size,
        collisionCooldowns: this.collisionCooldowns.size,
        dopplerCues: this.dopplerCues.size
      });
  }
}
