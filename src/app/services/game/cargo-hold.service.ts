import { Injectable } from '@angular/core';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import { GameStateStore } from './game-state.store';
import { Asteroid } from '../../game/game-objects/Asteroid';
import { CargoManifestEntry, CargoItemType, RarityTier } from '../../game/types/inventory.types';
import { GameObjectType } from '../../game/types/game-object.types';

@Injectable({ providedIn: 'root' })
export class CargoHoldService {
  constructor(private readonly gameState: GameStateStore, private readonly logger: LoggingService) {}

  /**
   * Registra la conversión de un asteroide en carga granular y añade/actualiza el manifiesto.
   */
  public registerAsteroidConversion(asteroid: Asteroid, storedUnits: number): CargoManifestEntry | null {
    if (!asteroid || storedUnits <= 0) {
      return null;
    }

    const entry: CargoManifestEntry = {
      id: this.buildCargoId(asteroid.id),
      type: this.resolveCargoType(asteroid),
      label: (asteroid as any).customName || `Fragmento ${asteroid.id}`,
      massTons: this.resolveMass(asteroid),
      units: storedUnits,
      source: asteroid.getType?.() ?? GameObjectType.UNKNOWN,
      rarity: this.resolveRarity(asteroid),
      notes: (asteroid as any).composition || undefined
    };

    this.gameState.upsertCargoEntry(entry);
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Cargo entry registered', entry);
    return entry;
  }

  /** Elimina una entrada puntual del manifiesto. */
  public removeCargoEntry(entryId: string): boolean {
    const removed = this.gameState.removeCargoEntry(entryId);
    if (removed) {
      this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Cargo entry removed', { entryId });
    }
    return removed;
  }

  /** Limpia completamente el manifiesto de carga. */
  public clearManifest(): void {
    this.gameState.setCargoManifest([]);
  }

  private buildCargoId(sourceId: string): string {
    const stamp = Date.now();
    return `cargo-${sourceId}-${stamp}`;
  }

  private resolveCargoType(asteroid: Asteroid): CargoItemType {
    const comp = ((asteroid as any).composition || '').toLowerCase();
    if (comp.includes('crystal') || comp.includes('lumen')) return CargoItemType.ARTIFACT;
    if (comp.includes('organic')) return CargoItemType.ORGANIC_SAMPLE;
    if (comp.includes('core')) return CargoItemType.ENERGY_CORE;
    return CargoItemType.RAW_MATERIAL;
  }

  private resolveMass(asteroid: Asteroid): number {
    const mass = Number((asteroid as any).massTons);
    if (Number.isFinite(mass) && mass > 0) return mass;
    const size = asteroid.size ?? 1;
    return Math.max(10, size * 50);
  }

  private resolveRarity(asteroid: Asteroid): RarityTier {
    const mass = this.resolveMass(asteroid);
    if (mass >= 2000) return RarityTier.LEGENDARY;
    if (mass >= 800) return RarityTier.EPIC;
    if (mass >= 300) return RarityTier.RARE;
    if (mass >= 120) return RarityTier.UNCOMMON;
    return RarityTier.COMMON;
  }
}
