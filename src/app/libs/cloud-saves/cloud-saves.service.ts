import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { CloudSavesClient } from './cloud-saves.client';
import { CloudSaveSlotData, CloudSaveSlotRef } from './cloud-saves.models';
import { CLOUD_SAVES_GAME_CONTEXT, CLOUD_SAVES_SESSION_BRIDGE, CLOUD_SAVES_SETTINGS, CloudSavesGameContext, CloudSavesSessionBridge, CloudSavesSettings } from './cloud-saves.tokens';

@Injectable()
export class CloudSavesService {
  private readonly settings = inject(CLOUD_SAVES_SETTINGS);
  private readonly gameContext = inject(CLOUD_SAVES_GAME_CONTEXT);
  private readonly sessionBridge = inject(CLOUD_SAVES_SESSION_BRIDGE);
  private readonly client = new CloudSavesClient(this.settings);

  private readonly slotsState = signal<CloudSaveSlotRef[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly tokenState = signal<string | null>(null);

  readonly slots: Signal<CloudSaveSlotRef[]> = this.slotsState.asReadonly();
  readonly loading: Signal<boolean> = this.loadingState.asReadonly();
  readonly error: Signal<string | null> = this.errorState.asReadonly();
  readonly hasSession = computed(() => !!this.tokenState());

  constructor() {
    void this.refreshToken();
    this.sessionBridge.onSessionChange?.((token) => {
      this.tokenState.set(token);
    });
  }

  async syncSlots(): Promise<void> {
    const token = await this.ensureToken();
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const response = await this.client.listSlots(token, this.gameContext.gameId);
      this.slotsState.set(response.saves);
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.loadingState.set(false);
    }
  }

  async loadLatest(): Promise<CloudSaveSlotData | null> {
    await this.syncSlots();
    const slots = this.slotsState();
    if (!slots.length) {
      return null;
    }
    return this.loadSlotContent(slots[0].index);
  }

  async loadSlot(index: number): Promise<CloudSaveSlotData | null> {
    return this.loadSlotContent(index);
  }

  async putSave(index: number, payload: unknown): Promise<void> {
    const token = await this.ensureToken();
    await this.sendWithRetry(() => this.client.putSave(token, this.gameContext.gameId, index, payload));
    await this.syncSlots();
  }

  async deleteSave(index: number): Promise<void> {
    const token = await this.ensureToken();
    await this.sendWithRetry(() => this.client.deleteSave(token, this.gameContext.gameId, index));
    await this.syncSlots();
  }

  private async sendWithRetry(work: () => Promise<void>): Promise<void> {
    try {
      this.loadingState.set(true);
      this.errorState.set(null);
      await work();
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      this.loadingState.set(false);
    }
  }

  private async ensureToken(): Promise<string> {
    if (!this.tokenState()) {
      await this.refreshToken();
    }
    const token = this.tokenState();
    if (!token) {
      this.errorState.set('Missing session token');
      throw new Error('Missing session token');
    }
    return token;
  }

  private async refreshToken(): Promise<void> {
    const token = await this.sessionBridge.getToken();
    this.tokenState.set(token);
  }
  private async loadSlotContent(index: number): Promise<CloudSaveSlotData | null> {
    const token = await this.ensureToken();
    const target = Math.max(0, Math.floor(index));
    try {
      this.loadingState.set(true);
      this.errorState.set(null);
      return await this.client.getSlot(token, this.gameContext.gameId, target);
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      this.loadingState.set(false);
    }
  }
}
