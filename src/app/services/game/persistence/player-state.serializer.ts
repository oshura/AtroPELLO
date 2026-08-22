import { Injectable } from '@angular/core';
import { Spaceship } from '../../../game/game-objects/Spaceship';
import {
  SaveGameCharacterState,
  SaveGameGrimoireLayout,
  SaveGameInventoryState,
  SaveGamePlayerSection,
  SaveGameRespawnState,
  SaveGameShipState
} from '../../../game/types/save-game.types';
import { GameStateStore } from '../game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../logging.service';
import { Vector3 } from '../../../types/game.types';
import { OrientationSnapshot, RespawnAnchorMetadata } from '../../../game/types/respawn.types';
import { EquipmentSlot, EquipmentSlotState } from '../../../game/types/inventory.types';
import { SpellType } from '../../../game/types/spell.types';
import { HealthSnapshot, PlayerResetState } from '../../../game/types/universe-state.types';
import { SaveGamePayloadInvalidError } from './save-game.errors';

@Injectable({ providedIn: 'root' })
export class PlayerStateSerializer {
  constructor(
    private readonly gameState: GameStateStore,
    private readonly logger: LoggingService
  ) {}

  capture(): SaveGamePlayerSection {
    return {
      ship: this.captureShipState(),
      character: this.captureCharacterState(),
      inventory: this.captureInventoryState(),
      respawn: this.captureRespawnState()
    };
  }

  apply(section: SaveGamePlayerSection | null | undefined): PlayerResetState {
    if (!section || typeof section !== 'object') {
      throw new SaveGamePayloadInvalidError('SaveGame payload is missing the player section.');
    }
    const resetState = this.buildPlayerResetState(section);
    // La nave entrante trae su propia dinámica: invalidar la baseline publicada para no arrastrar
    // la de la partida anterior (el motor la republica en el primer frame).
    this.gameState.setShipSpeedBaseline(null);
    // El motor recoge el equipamiento del store al reponer la nave (applyPlayerResetState).
    this.gameState.setShipOutfit(section.ship?.outfit ?? null);
    this.applyCharacterState(section.character);
    this.applyInventoryState(section.inventory);
    this.applyRespawnState(section.respawn);
    this.logger.log(LogLevel.INFO, LogCategory.SAVE_SYSTEM, 'SaveGame player section applied', {
      cargoEntries: section.inventory?.cargoManifest?.length ?? 0,
      spells: section.inventory?.knownSpells?.length ?? 0,
      hasActiveAnchor: Boolean(section.respawn?.activeAnchor ?? section.respawn?.defaultAnchor)
    });
    return resetState;
  }

  private captureShipState(): SaveGameShipState {
    const spaceship = this.gameState.spaceship;
    if (!spaceship) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'PlayerStateSerializer invoked without an active spaceship instance');
      return this.buildEmptyShipState();
    }

    const driftVelocity = this.cloneVec((spaceship as any)?.driftVelocity) ?? null;
    const voidEnergyPaused = Boolean((spaceship as any)?.voidEnergyPaused);
    const outOfVoidEnergy = Boolean((spaceship as any)?.outOfVoidEnergy);
    const basis = this.safeOrientationBasis(spaceship);
    // Dinámica BASE (sin el Rito del Tiempo Doblado): guardar la instantánea fosilizaba el doble
    // en el savegame si el jugador guardaba con el rito activo.
    const speedBaseline = this.gameState.getShipSpeedBaseline();

    return {
      position: this.cloneVec(spaceship.position) ?? this.zeroVec(),
      velocity: this.cloneVec(spaceship.velocity) ?? this.zeroVec(),
      driftVelocity,
      orientation: this.captureOrientation(spaceship),
      forward: this.cloneVec(spaceship.forwardDirection) ?? null,
      up: basis?.up ?? null,
      speed: {
        current: this.safeNumber(spaceship.currentSpeed),
        target: this.safeNumber(spaceship.targetSpeed),
        max: this.safeNumber(speedBaseline?.maxSpeed ?? spaceship.maxSpeed),
        acceleration: this.safeNumber(speedBaseline?.acceleration ?? spaceship.acceleration),
        deceleration: this.safeNumber(speedBaseline?.deceleration ?? spaceship.deceleration),
        rotationSpeed: this.safeNumber(spaceship.rotationSpeed),
        minRotationSpeed: this.safeNumber(spaceship.minRotationSpeed)
      },
      voidEnergy: {
        current: this.safeNumber((spaceship as any)?.voidEnergyCurrent ?? spaceship.voidEnergyCurrent),
        max: this.safeNumber((spaceship as any)?.voidEnergyMax ?? spaceship.voidEnergyMax),
        paused: voidEnergyPaused
      },
      cargoCapacity: {
        max: this.safeNumber(spaceship.cargoCapacityMax),
        current: this.safeNumber(spaceship.cargoCapacityCurrent)
      },
      status: {
        outOfVoidEnergy,
        thrusterState: String(spaceship.thrusterState ?? '') || undefined
      },
      health: this.captureHealth(spaceship),
      outfit: this.gameState.getShipOutfit()
    };
  }

  private buildEmptyShipState(): SaveGameShipState {
    return {
      position: this.zeroVec(),
      velocity: this.zeroVec(),
      driftVelocity: null,
      orientation: null,
      forward: null,
      up: null,
      speed: {
        current: 0,
        target: 0,
        max: 0,
        acceleration: 0,
        deceleration: 0
      },
      voidEnergy: {
        current: 0,
        max: 0,
        paused: false
      },
      cargoCapacity: {
        max: 0,
        current: 0
      },
      status: {
        outOfVoidEnergy: false,
        thrusterState: undefined
      },
      health: { current: 0, max: 0 }
    };
  }

  private captureOrientation(spaceship: Spaceship): OrientationSnapshot | null {
    try {
      const quatValue = spaceship.getOrientationQuaternion();
      const basis = this.safeOrientationBasis(spaceship);
      const quaternion: [number, number, number, number] = [
        quatValue[0] ?? 0,
        quatValue[1] ?? 0,
        quatValue[2] ?? 0,
        quatValue[3] ?? 1
      ];
      return {
        quaternion,
        forward: basis?.forward ?? null,
        up: basis?.up ?? null
      };
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed to capture ship orientation', { error });
      return null;
    }
  }

  private safeOrientationBasis(spaceship: Spaceship): { forward: Vector3 | null; up: Vector3 | null } | null {
    try {
      const basis = spaceship.getOrientationBasis();
      return {
        forward: this.cloneVec(basis.forward) ?? null,
        up: this.cloneVec(basis.up) ?? null
      };
    } catch {
      return null;
    }
  }

  private captureHealth(spaceship: Spaceship): HealthSnapshot {
    const max = this.safeNumber((spaceship as any)?.healthMax ?? spaceship.healthMax);
    const current = this.safeNumber((spaceship as any)?.healthCurrent ?? spaceship.healthCurrent);
    return { current, max };
  }

  private captureCharacterState(): SaveGameCharacterState {
    const profile = this.gameState.characterProfile;
    return {
      profile: {
        ...profile,
        age: { ...profile.age }
      },
      memoryPercent: this.safeNumber(this.gameState.memoryPercent),
      characterId: this.gameState.getCharacterId(),
      slotCapacity: this.gameState.getCloudSaveSlotCapacity(),
      availableSlotIndexes: this.gameState.getCloudSaveSlotIndexes(),
      activeSlotIndex: this.gameState.getActiveCloudSaveSlotIndex(),
      storyFlags: this.gameState.getStoryFlags().slice().sort(),
      raceStandings: this.gameState.getRaceStandings(),
      gateTuning: this.gameState.peekGateTuning()
    };
  }

  private captureInventoryState(): SaveGameInventoryState {
    return {
      personalGear: this.gameState.personalGear.map(item => ({ ...item })),
      equipmentLoadout: this.cloneEquipmentLoadout(),
      cargoManifest: this.gameState.cargoManifest.map(entry => ({ ...entry })),
      knownSpells: this.gameState.getKnownSpells().slice().sort() as SpellType[],
      grimoireLayout: this.cloneGrimoireLayout(this.gameState.getGrimoireGlyphLayoutSnapshot())
    };
  }

  private cloneEquipmentLoadout(): Record<EquipmentSlot, EquipmentSlotState | null> {
    const source = this.gameState.equipmentLoadout;
    const clone: Record<EquipmentSlot, EquipmentSlotState | null> = {} as Record<EquipmentSlot, EquipmentSlotState | null>;
    for (const slot of Object.keys(source) as EquipmentSlot[]) {
      const state = source[slot];
      clone[slot] = state ? this.cloneEquipmentSlotState(state) : null;
    }
    return clone;
  }

  private cloneEquipmentSlotState(state: EquipmentSlotState): EquipmentSlotState {
    return {
      ...state,
      capabilities: state.capabilities ? [...state.capabilities] : undefined
    };
  }

  private captureRespawnState(): SaveGameRespawnState {
    const activeAnchor = this.gameState.getRespawnAnchor();
    const defaultAnchor = this.gameState.getDefaultRespawnAnchor();
    return {
      activeAnchor,
      defaultAnchor,
      lastAnchorLabel: activeAnchor?.label ?? defaultAnchor?.label ?? activeAnchor?.snapshotLabel ?? defaultAnchor?.snapshotLabel ?? null
    };
  }

  private buildPlayerResetState(section: SaveGamePlayerSection): PlayerResetState {
    const ship = section.ship ?? this.buildEmptyShipState();
    const position = this.cloneVec(ship.position) ?? this.zeroVec();
    const velocity = this.cloneVec(ship.velocity) ?? this.zeroVec();
    const orientation = this.cloneOrientationSnapshot(ship.orientation);
    const shipHealth = this.cloneHealthSnapshot(ship.health);
    const voidEnergy = this.safeNumber(ship.voidEnergy?.current ?? ship.voidEnergy?.max ?? 0);
    const profile = section.character?.profile;
    const sanity = this.clampPercent(profile?.sanity ?? this.gameState.characterProfile.sanity);
    const vitality = this.clampPercent(profile?.health ?? this.gameState.characterProfile.health);
    return {
      position,
      velocity,
      orientation,
      shipHealth,
      voidEnergy: Math.max(0, voidEnergy),
      sanity,
      vitality,
      restoredStat: null
    };
  }

  private applyCharacterState(state: SaveGameCharacterState | null | undefined): void {
    if (state?.profile) {
      this.gameState.setCharacterProfile(state.profile);
    }
    if (typeof state?.memoryPercent === 'number') {
      this.gameState.setMemoryPercent(state.memoryPercent);
    }
    if (state?.characterId) {
      this.gameState.setCharacterId(state.characterId);
    }
    if (Array.isArray(state?.availableSlotIndexes)) {
      this.gameState.setCloudSaveSlotIndexes(state.availableSlotIndexes);
    }
    if (typeof state?.slotCapacity === 'number') {
      this.gameState.setCloudSaveSlotCapacity(state.slotCapacity);
    }
    if (state && 'activeSlotIndex' in state) {
      this.gameState.setActiveCloudSaveSlotIndex(state.activeSlotIndex ?? null);
    }
    this.gameState.replaceStoryFlags(state?.storyFlags ?? []);
    this.gameState.replaceRaceStandings(state?.raceStandings ?? []);
    this.gameState.setGateTuning(state?.gateTuning ?? null);
  }

  private applyInventoryState(state: SaveGameInventoryState | null | undefined): void {
    const gear = state?.personalGear?.map(item => ({ ...item })) ?? [];
    this.gameState.replacePersonalGear(gear);

    const snapshotLoadout: Partial<Record<EquipmentSlot, EquipmentSlotState | null>> = state?.equipmentLoadout ?? {};
    const slots = Object.keys(this.gameState.equipmentLoadout) as EquipmentSlot[];
    for (const slot of slots) {
      const entry = snapshotLoadout[slot];
      const cloned = entry ? this.cloneEquipmentSlotState(entry as EquipmentSlotState) : null;
      this.gameState.setEquipmentSlot(slot, cloned);
    }

    const cargo = state?.cargoManifest?.map(entry => ({ ...entry })) ?? [];
    this.gameState.setCargoManifest(cargo);

    this.gameState.applyGrimoireGlyphLayout(state?.grimoireLayout ?? {});
    this.replaceKnownSpells(state?.knownSpells ?? []);
  }

  private applyRespawnState(state: SaveGameRespawnState | null | undefined): void {
    const active = this.cloneRespawnAnchor(state?.activeAnchor ?? null);
    const fallback = this.cloneRespawnAnchor(state?.defaultAnchor ?? null);
    this.gameState.setRespawnAnchor(active);
    this.gameState.setDefaultRespawnAnchor(fallback);
  }

  private replaceKnownSpells(spells: SpellType[]): void {
    const current = this.gameState.getKnownSpells();
    for (const spell of current) {
      this.gameState.forgetSpell(spell);
    }
    for (const spell of spells) {
      if (!spell) {
        continue;
      }
      this.gameState.learnSpell(spell as SpellType);
    }
  }

  private cloneRespawnAnchor(anchor: RespawnAnchorMetadata | null): RespawnAnchorMetadata | null {
    if (!anchor) {
      return null;
    }
    return {
      ...anchor,
      shipPosition: { ...anchor.shipPosition },
      shipForward: this.cloneVec(anchor.shipForward) ?? null,
      shipVelocity: this.cloneVec(anchor.shipVelocity) ?? null,
      shipOrientation: this.cloneOrientationSnapshot(anchor.shipOrientation),
      landingSite: anchor.landingSite
        ? {
            surfacePoint: { ...anchor.landingSite.surfacePoint },
            surfaceNormal: { ...anchor.landingSite.surfaceNormal },
            radius: anchor.landingSite.radius
          }
        : undefined
    };
  }

  private cloneGrimoireLayout(snapshot: Partial<Record<SpellType, { nx: number; ny: number }>>): SaveGameGrimoireLayout {
    const layout: SaveGameGrimoireLayout = {};
    for (const [spell, pos] of Object.entries(snapshot)) {
      if (!pos) {
        continue;
      }
      layout[spell as SpellType] = {
        nx: this.clamp01(pos.nx),
        ny: this.clamp01(pos.ny)
      };
    }
    return layout;
  }

  private cloneOrientationSnapshot(snapshot?: OrientationSnapshot | null): OrientationSnapshot | null {
    if (!snapshot) {
      return null;
    }
    return {
      quaternion: snapshot.quaternion ? [...snapshot.quaternion] as [number, number, number, number] : undefined,
      matrix: snapshot.matrix ? [...snapshot.matrix] : undefined,
      forward: snapshot.forward ? this.cloneVec(snapshot.forward) : null,
      up: snapshot.up ? this.cloneVec(snapshot.up) : null
    };
  }

  private cloneHealthSnapshot(snapshot?: HealthSnapshot | null): HealthSnapshot {
    const current = this.safeNumber(snapshot?.current ?? 0);
    const max = this.safeNumber(snapshot?.max ?? Math.max(current, 0));
    return {
      current: Math.max(0, current),
      max: Math.max(0, max)
    };
  }

  private cloneVec(vec?: Vector3 | null): Vector3 | null {
    if (!vec) {
      return null;
    }
    return {
      x: this.safeNumber(vec.x),
      y: this.safeNumber(vec.y),
      z: this.safeNumber(vec.z)
    };
  }

  private zeroVec(): Vector3 {
    return { x: 0, y: 0, z: 0 };
  }

  private clamp01(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(1, Math.max(0, Number(value)));
  }

  private clampPercent(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Number(value)));
  }

  private safeNumber(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Number(value);
  }
}
