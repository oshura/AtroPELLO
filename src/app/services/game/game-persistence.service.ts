import { Injectable, signal } from '@angular/core';
import { GameState } from './game-state.service';

interface GamePersistenceState {
  wasRunning: boolean;
  gameState: GameState;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class GamePersistenceService {
  private persistedState = signal<GamePersistenceState | null>(null);

  saveState(gameState: GameState, wasRunning: boolean): void {
    this.persistedState.set({
      wasRunning,
      gameState,
      timestamp: Date.now()
    });
  }

  getPersistedState(): GamePersistenceState | null {
    const state = this.persistedState();
    
    // Only return state if it's recent (within last 5 minutes)
    if (state && (Date.now() - state.timestamp) < 5 * 60 * 1000) {
      return state;
    }
    
    return null;
  }

  clearState(): void {
    this.persistedState.set(null);
  }

  shouldAutoResume(): boolean {
    const state = this.getPersistedState();
    return state?.wasRunning === true;
  }
}
