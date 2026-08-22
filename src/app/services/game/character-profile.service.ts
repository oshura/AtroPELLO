import { Injectable } from '@angular/core';
import { ExperienceGainResult, GameStateStore } from './game-state.store';
import { CharacterProfile, PersonalGearItem } from '../../game/types/inventory.types';

export enum ExperienceEventType {
  ENEMY_SHIP_DESTROYED = 'enemy-ship-destroyed',
  PRIMIGENIO_DEFEATED_PLANET = 'primigenio-defeated-planet',
  PLANET_LANDING = 'planet-landing',
  NEW_SPECIES_DISCOVERED = 'new-species-discovered',
  SPELL_CAST = 'spell-cast',
  PORTAL_SPELL = 'portal-spell',
  PLAYER_DEATH = 'player-death'
}

const EXPERIENCE_EVENT_VALUES: Record<ExperienceEventType, number> = {
  [ExperienceEventType.ENEMY_SHIP_DESTROYED]: 25,
  [ExperienceEventType.PRIMIGENIO_DEFEATED_PLANET]: 50,
  [ExperienceEventType.PLANET_LANDING]: 3,
  [ExperienceEventType.NEW_SPECIES_DISCOVERED]: 100,
  [ExperienceEventType.SPELL_CAST]: 1,
  [ExperienceEventType.PORTAL_SPELL]: 5,
  [ExperienceEventType.PLAYER_DEATH]: -50
};

@Injectable({ providedIn: 'root' })
export class CharacterProfileService {
  constructor(private readonly gameState: GameStateStore) {}

  /** Snapshot inmutable del perfil actual. */
  get profile(): CharacterProfile {
    return { ...this.gameState.characterProfile };
  }

  /** Actualiza completamente el perfil del piloto. */
  setProfile(profile: CharacterProfile): void {
    this.gameState.setCharacterProfile(profile);
  }

  /** Aplica delta a salud/cordura/memoria. */
  adjustVitals(delta: { sanity?: number; health?: number; memory?: number }): void {
    const next = {
      sanity: delta.sanity !== undefined ? this.gameState.characterProfile.sanity + delta.sanity : undefined,
      health: delta.health !== undefined ? this.gameState.characterProfile.health + delta.health : undefined,
      memory: delta.memory !== undefined ? this.gameState.characterProfile.memory + delta.memory : undefined
    };
    this.gameState.updateCharacterVitals(next);
  }

  /** Aplica experiencia directa con un motivo opcional para logging. */
  /** Otorga experiencia y devuelve si el piloto ha subido de nivel (la barra se reinicia al hacerlo). */
  awardExperience(points: number, reason: string = 'manual'): ExperienceGainResult {
    return this.gameState.adjustExperience(points, { reason });
  }

  /** Registra eventos comunes descritos en documentación (destruir naves, aterrizar, etc.). */
  registerExperienceEvent(event: ExperienceEventType): void {
    const delta = EXPERIENCE_EVENT_VALUES[event];
    if (delta === undefined) {
      return;
    }
    this.gameState.adjustExperience(delta, { reason: event });
  }

  /** Reemplaza la lista de equipo personal mostrada junto al perfil. */
  setPersonalGear(items: PersonalGearItem[]): void {
    this.gameState.replacePersonalGear(items);
  }

  /** Suma días a la edad del piloto y devuelve información del cambio. */
  addDaysToAge(days: number) {
    return this.gameState.addDaysToAge(days);
  }

  /** Ajusta la supervivencia (0-100) aplicando delta y devolviendo el resultado. */
  adjustSurvivability(delta: number): number {
    return this.gameState.adjustSurvivability(delta);
  }

  /** Define directamente la supervivencia (clamp 0-100). */
  setSurvivability(value: number): number {
    return this.gameState.setSurvivability(value);
  }
}
