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
import {
  CargoManifestEntry,
  CharacterProfile,
  EquipmentSlot,
  EquipmentSlotState,
  PersonalGearItem,
  PersonalGearSlot,
  RarityTier
} from '../../game/types/inventory.types';
import { LandingStatus, LandingThreatState } from '../../game/types/landing.types';
import { SpellType, getSpellSanityCost } from '../../game/types/spell.types';

/**
 * Evento de cambio de estado del juego
 * Permite observar mutaciones en el store
 */
export interface GameStateChangeEvent {
  /** Tipo de cambio ocurrido */
  type: 'asteroid-added' | 'object-removed' | 'state-reset' | 'object-updated' | 'inventory-updated';
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
  //  CHARACTER / INVENTORY STATE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Perfil del piloto mostrado en el panel de inventario */
  public characterProfile: CharacterProfile = {
    name: 'Harvey Walters',
    sanity: 58,
    health: 100,
    memory: 0,
    level: 0,
    experience: 0,
    experienceMax: 100
  };

  /** Equipo personal (incluye slots dedicados de traje/botas) */
  public personalGear: PersonalGearItem[] = [
    {
      slot: PersonalGearSlot.SUIT,
      label: 'Traje Explorador Mk.III',
      description: 'Fibra trenzada con aislamiento básico.',
      rarity: RarityTier.UNIQUE
    },
    {
      slot: PersonalGearSlot.BOOTS,
      label: 'Boots LunarGrip',
      description: 'Amortiguan golpes y sellan atmósferas dudosas.',
      rarity: RarityTier.UNIQUE
    }
  ];

  /** Slots de la nave con módulos equipados (null = slot vacío) */
  public equipmentLoadout: Record<EquipmentSlot, EquipmentSlotState | null> = this.createDefaultEquipmentLoadout();

  /** Manifiesto de carga granular mostrado en el panel */
  public cargoManifest: CargoManifestEntry[] = [];
  /** Cache de umbrales de experiencia por nivel (estilo Fibonacci) */
  private experienceCapsCache: number[] = [100, 200];
  private readonly SANITY_BASE_MAX = 99;
  public readonly knownSpells: Set<SpellType> = new Set(Object.values(SpellType));
  
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

  /** Timestamp mínimo para reabrir inventario (cooldown) */
  public inventoryReopenAllowedAtMs: number = 0;

  /** Resultado más reciente de la evaluación de aterrizaje. */
  public landingStatus: LandingStatus = { ready: false, context: null };

  /** Estado de amenazas que bloquean o desaconsejan el aterrizaje. */
  public landingThreat: LandingThreatState = { active: false, reasons: [] };
  
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
  
  /**
   * Busca un planeta por ID.
   * Método conveniente para búsquedas específicas.
   * @param id ID del planeta
   * @returns Planeta encontrado o undefined
   */
  findPlanetById(id: string): Planet | undefined {
    return this.planets.find(p => p.id === id);
  }
  
  /**
   * Busca un portal por ID.
   * @param id ID del portal
   * @returns Portal encontrado o undefined
   */
  findPortalById(id: string): Portal | undefined {
    return this.portals.find(p => p.id === id);
  }
  
  /**
   * Verifica si un asteroide es independiente (eyectado de cluster).
   * @param asteroidId ID del asteroide
   * @returns true si está en la colección de independientes
   */
  isIndependentAsteroid(asteroidId: string): boolean {
    return this.independentAsteroids.some(a => a.id === asteroidId);
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

  /** Reemplaza completamente el perfil del piloto. */
  setCharacterProfile(profile: CharacterProfile): void {
    const level = this.normalizeLevel(profile.level ?? this.characterProfile.level ?? 0);
    const experienceMax = this.resolveExperienceCap(profile.experienceMax, level);
    const experience = this.clampExperience(profile.experience ?? this.characterProfile.experience ?? 0, experienceMax);
    this.characterProfile = {
      name: profile.name || this.characterProfile.name,
      sanity: this.clampSanity(profile.sanity ?? this.characterProfile.sanity),
      health: this.clampPercent(profile.health ?? this.characterProfile.health),
      memory: this.clampPercent(profile.memory ?? this.characterProfile.memory),
      level,
      experience,
      experienceMax
    };
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'character' } });
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Character profile updated', {
      name: this.characterProfile.name,
      sanity: this.characterProfile.sanity,
      health: this.characterProfile.health,
      memory: this.characterProfile.memory,
      level: this.characterProfile.level,
      experience: this.characterProfile.experience,
      experienceMax: this.characterProfile.experienceMax
    });
  }

  /** Ajusta parcialmente valores de cordura/salud sin reemplazar el perfil completo. */
  updateCharacterVitals(partial: Partial<Pick<CharacterProfile, 'sanity' | 'health' | 'memory'>>): void {
    if (typeof partial.sanity === 'number') {
      this.characterProfile.sanity = this.clampSanity(partial.sanity);
    }
    if (typeof partial.health === 'number') {
      this.characterProfile.health = this.clampPercent(partial.health);
    }
    if (typeof partial.memory === 'number') {
      this.characterProfile.memory = this.clampPercent(partial.memory);
    }
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'character' } });
  }

  /** Ajusta la experiencia del piloto aplicando reglas de nivel. */
  adjustExperience(delta: number, metadata?: { reason?: string }): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    if (delta > 0) {
      this.applyExperienceGain(delta);
    } else {
      const nextValue = this.characterProfile.experience + delta;
      this.characterProfile.experience = Math.max(0, nextValue);
    }

    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'character', reason: metadata?.reason ?? 'experience' } });
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Experience adjusted', {
      delta,
      reason: metadata?.reason,
      level: this.characterProfile.level,
      experience: this.characterProfile.experience,
      experienceMax: this.characterProfile.experienceMax
    });
  }

  /** Reemplaza la lista de equipo personal (traje, botas, accesorios). */
  replacePersonalGear(items: PersonalGearItem[]): void {
    this.personalGear = [...items];
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'personalGear' } });
    this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'Personal gear updated', { count: this.personalGear.length });
  }

  /** Elimina un ítem de equipo personal por índice. */
  removePersonalGearAtIndex(index: number): PersonalGearItem | null {
    if (index < 0 || index >= this.personalGear.length) {
      return null;
    }
    const [removed] = this.personalGear.splice(index, 1);
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'personalGear', index } });
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Personal gear removed', {
      index,
      slot: removed.slot,
      label: removed.label
    });
    return removed;
  }

  /** Define o vacía un slot de equipo de la nave. */
  setEquipmentSlot(slot: EquipmentSlot, state: EquipmentSlotState | null): void {
    this.equipmentLoadout[slot] = state ? { ...state, slot } : null;
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'equipment', slot } });
  }

  /** Reemplaza todo el manifiesto de carga. */
  setCargoManifest(entries: CargoManifestEntry[]): void {
    this.cargoManifest = [...entries];
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'cargo' } });
    this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'Cargo manifest replaced', { count: this.cargoManifest.length });
  }

  /** Inserta o actualiza una entrada de carga. */
  upsertCargoEntry(entry: CargoManifestEntry): void {
    const idx = this.cargoManifest.findIndex(c => c.id === entry.id);
    if (idx >= 0) {
      this.cargoManifest[idx] = entry;
    } else {
      this.cargoManifest.push(entry);
    }
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'cargo', entryId: entry.id } });
  }

  /** Elimina una entrada de carga por ID. */
  removeCargoEntry(entryId: string): boolean {
    const idx = this.cargoManifest.findIndex(c => c.id === entryId);
    if (idx < 0) return false;
    this.cargoManifest.splice(idx, 1);
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'cargo', entryId } });
    return true;
  }

  /** Actualiza el estado de preparación de aterrizaje utilizado por el HUD. */
  setLandingStatus(status: LandingStatus): void {
    this.landingStatus = {
      ready: status.ready,
      context: status.context ? { ...status.context } : null
    };
  }

  /** Actualiza las amenazas detectadas para el piloto rojo del HUD. */
  setLandingThreat(state: LandingThreatState): void {
    this.landingThreat = {
      active: state.active,
      reasons: [...state.reasons]
    };
  }

  /** Marca un hechizo como aprendido y recalcula la reserva de cordura máxima. */
  learnSpell(spell: SpellType): void {
    if (this.knownSpells.has(spell)) {
      return;
    }
    this.knownSpells.add(spell);
    this.enforceSanityCeiling();
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'spells', action: 'learn', spell } });
  }

  /** Elimina un hechizo aprendido, liberando cordura máxima. */
  forgetSpell(spell: SpellType): void {
    if (!this.knownSpells.delete(spell)) {
      return;
    }
    this.enforceSanityCeiling();
    this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'spells', action: 'forget', spell } });
  }

  hasSpell(spell: SpellType): boolean {
    return this.knownSpells.has(spell);
  }

  getKnownSpells(): SpellType[] {
    return Array.from(this.knownSpells);
  }

  getSanityBaseMax(): number {
    return this.SANITY_BASE_MAX;
  }

  getSanityReservedFromSpells(): number {
    let total = 0;
    for (const spell of this.knownSpells) {
      total += getSpellSanityCost(spell).max;
    }
    const maxReservable = Math.max(0, this.SANITY_BASE_MAX - 1);
    return Math.max(0, Math.min(maxReservable, total));
  }

  getSanityCap(): number {
    const reserved = this.getSanityReservedFromSpells();
    return Math.max(1, this.SANITY_BASE_MAX - reserved);
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
    if (this.cargoManifest.length) {
      this.setCargoManifest([]);
    }
    
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
    this.landingStatus = { ready: false, context: null };
    this.landingThreat = { active: false, reasons: [] };
    
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

  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  private clampSanity(value: number): number {
    if (!Number.isFinite(value)) {
      return Math.max(1, Math.min(this.getSanityCap(), 0));
    }
    return Math.max(1, Math.min(this.getSanityCap(), Math.round(value)));
  }

  private enforceSanityCeiling(): void {
    const capped = this.clampSanity(this.characterProfile.sanity);
    if (capped !== this.characterProfile.sanity) {
      this.characterProfile.sanity = capped;
      this._notifyChange({ type: 'inventory-updated', metadata: { scope: 'character', reason: 'sanity-cap' } });
    }
  }

  private clampExperience(value: number, max: number): number {
    if (!Number.isFinite(value) || max <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(max, value));
  }

  private normalizeLevel(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.floor(value));
  }

  private resolveExperienceCap(candidate: number | undefined, level: number): number {
    if (typeof candidate === 'number' && candidate > 0) {
      return candidate;
    }
    return this.getExperienceCapForLevel(level);
  }

  private getExperienceCapForLevel(level: number): number {
    if (level < this.experienceCapsCache.length) {
      return this.experienceCapsCache[level];
    }
    while (this.experienceCapsCache.length <= level) {
      const len = this.experienceCapsCache.length;
      const next = this.experienceCapsCache[len - 1] + this.experienceCapsCache[len - 2];
      this.experienceCapsCache.push(next);
    }
    return this.experienceCapsCache[level];
  }

  private applyExperienceGain(amount: number): void {
    let remaining = amount;
    while (remaining > 0) {
      const needed = this.characterProfile.experienceMax - this.characterProfile.experience;
      if (needed <= 0) {
        this.promoteLevel();
        continue;
      }
      if (remaining < needed) {
        this.characterProfile.experience += remaining;
        remaining = 0;
      } else {
        this.characterProfile.experience += needed;
        remaining -= needed;
        this.promoteLevel();
      }
    }
  }

  private promoteLevel(): void {
    this.characterProfile.level += 1;
    this.characterProfile.experience = 0;
    this.characterProfile.experienceMax = this.getExperienceCapForLevel(this.characterProfile.level);
  }

  private createDefaultEquipmentLoadout(): Record<EquipmentSlot, EquipmentSlotState | null> {
    return {
      [EquipmentSlot.CORE]: {
        slot: EquipmentSlot.CORE,
        label: 'Cabina Basilisco v2',
        rarity: RarityTier.UNIQUE,
        description: 'Centro de control y computación integrado.',
        capabilities: [
          'Telemetría panorámica de sobrepresión y targeting routines.'
        ]
      },
      [EquipmentSlot.REACTOR]: {
        slot: EquipmentSlot.REACTOR,
        label: 'Thruster Cyclopean',
        rarity: RarityTier.UNIQUE,
        description: 'Convierte vacío densificado en empuje silencioso.',
        capabilities: []
      },
      [EquipmentSlot.WINGS]: null,
      [EquipmentSlot.HULL]: {
        slot: EquipmentSlot.HULL,
        label: 'Placas Umbra-Lattice',
        rarity: RarityTier.UNIQUE,
        description: 'Paneles alveolares que difunden impacto cinético.',
        capabilities: []
      },
      [EquipmentSlot.SHIELD]: null,
      [EquipmentSlot.DRONE_BAY]: null,
      [EquipmentSlot.AUXILIARY]: {
        slot: EquipmentSlot.AUXILIARY,
        label: 'Bahía Auxiliar Mk. I',
        rarity: RarityTier.RARE,
        description: 'Módulo de soporte para equipamiento científico.',
        capabilities: [
          'Aloja el Escáner Auxiliar de Habitantes (tecla 1).',
          'Permite detectar civilizaciones y criaturas a <500u.'
        ]
      }
    };
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
