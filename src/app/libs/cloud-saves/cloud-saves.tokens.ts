import { InjectionToken } from '@angular/core';
import { UserIdentity } from '../../types/identity';

export interface CloudSavesSettings {
  /** Base URL del API REST que gestiona los guardados. */
  apiBaseUrl: string;
  /** Latencia simulada para el stub REST (ms). */
  mockLatencyMs: number;
}

export interface CloudSavesGameContext {
  gameId: string;
}

export interface CloudSavesSessionBridge {
  getToken(): Promise<string | null>;
  onSessionChange?(cb: (token: string | null) => void): () => void;
  getIdentity?(): Promise<UserIdentity | null>;
  onIdentityChange?(cb: (identity: UserIdentity | null) => void): () => void;
}

export const CLOUD_SAVES_SETTINGS = new InjectionToken<CloudSavesSettings>('CLOUD_SAVES_SETTINGS');
export const CLOUD_SAVES_GAME_CONTEXT = new InjectionToken<CloudSavesGameContext>('CLOUD_SAVES_GAME_CONTEXT');
export const CLOUD_SAVES_SESSION_BRIDGE = new InjectionToken<CloudSavesSessionBridge>('CLOUD_SAVES_SESSION_BRIDGE');
