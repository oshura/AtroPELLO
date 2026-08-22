import { Injectable, inject } from '@angular/core';
import { getRaceDefinition } from '../../game/config/race-catalog.config';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { RaceShopOffer } from '../../game/types/race.types';
import { CargoCompositionKind } from '../../game/types/inventory.types';
import { GameStateStore } from './game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';

/**
 * Puente entre lo que ocurre en una conversación y lo que le pasa a la nave (Fase 13).
 *
 * El diálogo no debe conocer el motor ni el motor los diálogos: este servicio traduce "los Grises
 * te reacondicionan la nave" en las llamadas concretas, y sabe esperar a que el motor exista.
 */

/** Lo que el puente necesita del motor. Lo cumple `GameEngine`. */
export interface RaceOutfittingEngine {
  applyGreysShipUpgrade(): boolean;
  applyRaceShopEffect(effect: 'weapon' | 'weapon_slot' | 'engine_tier', weaponId?: string): boolean;
  tuneNextGateRite(elderGod: string | null): void;
}

@Injectable({ providedIn: 'root' })
export class RaceOutfittingBridgeService {
  private readonly gameState = inject(GameStateStore);
  private readonly logger = inject(LoggingService);
  private engine: RaceOutfittingEngine | null = null;

  /** Lo llama el inicializador cuando el motor está en pie. */
  attachEngine(engine: RaceOutfittingEngine | null): void {
    this.engine = engine;
  }

  /**
   * Reacondicionamiento que una raza regala al aceptar su encargo.
   * Devuelve true si la nave cambió realmente.
   */
  applyRaceUpgrade(race: PlanetInhabitants): boolean {
    if (race !== PlanetInhabitants.GRISES || !this.engine) {
      return false;
    }
    try {
      return this.engine.applyGreysShipUpgrade();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'No se pudo aplicar la mejora de raza', { race, error });
      return false;
    }
  }

  /** Sintoniza el próximo Rito de la Puerta hacia un dominio. */
  tuneNextGateRite(elderGod: string | null): void {
    try {
      this.engine?.tuneNextGateRite(elderGod);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'No se pudo sintonizar el rito', { elderGod, error });
    }
  }

  /** Ofertas disponibles de una raza, una vez es aliada. */
  getShopOffers(race: PlanetInhabitants): RaceShopOffer[] {
    const standing = this.gameState.getRaceStanding(race);
    if (standing.standing !== 'ally') {
      return [];
    }
    return getRaceDefinition(race)?.shop ?? [];
  }

  /**
   * Compra una oferta: cobra los recursos y aplica el efecto. Devuelve por qué falló, o null si
   * salió bien.
   */
  purchase(race: PlanetInhabitants, offerId: string): string | null {
    const offer = this.getShopOffers(race).find(o => o.id === offerId);
    if (!offer) {
      return 'Esa oferta ya no está disponible.';
    }
    if (!this.engine) {
      return 'La nave no responde.';
    }
    const costEntries = Object.entries(offer.cost) as Array<[CargoCompositionKind, number]>;
    for (const [kind, units] of costEntries) {
      if (this.gameState.getRawMaterialUnits(kind) < units) {
        return `Faltan materiales: ${kind}.`;
      }
    }
    for (const [kind, units] of costEntries) {
      this.gameState.spendRawMaterial(kind, units);
    }
    const applied = this.engine.applyRaceShopEffect(offer.effect, offer.weaponId);
    if (!applied) {
      return 'No se pudo instalar.';
    }
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Compra a una raza aplicada', { race, offerId });
    return null;
  }
}
