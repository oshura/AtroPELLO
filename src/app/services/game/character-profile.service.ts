import { Injectable } from '@angular/core';
import { GameStateStore } from './game-state.store';
import { CharacterProfile, PersonalGearItem } from '../../game/types/inventory.types';

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

  /** Reemplaza la lista de equipo personal mostrada junto al perfil. */
  setPersonalGear(items: PersonalGearItem[]): void {
    this.gameState.replacePersonalGear(items);
  }
}
