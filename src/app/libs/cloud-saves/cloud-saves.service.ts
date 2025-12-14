import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { CloudSavesClient } from './cloud-saves.client';
import { CloudSaveSlotData, CloudSaveSlotMetadata, CloudSaveSlotRef } from './cloud-saves.models';
import { CLOUD_SAVES_GAME_CONTEXT, CLOUD_SAVES_SESSION_BRIDGE, CLOUD_SAVES_SETTINGS, CloudSavesGameContext, CloudSavesSessionBridge, CloudSavesSettings } from './cloud-saves.tokens';
import { GamePersistenceService, LoadGameResult } from '../../services/game/game-persistence.service';
import { SaveGamePayload } from '../../game/types/save-game.types';
import {
  LoadGameInProgressError,
  SaveGameCaptureError,
  SaveGameEngineUnavailableError,
  SaveGameInProgressError,
  SaveGamePayloadInvalidError,
  SaveGameSchemaVersionMismatchError
} from '../../services/game/persistence/save-game.errors';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { GameStateStore } from '../../services/game/game-state.store';
import { CloudSaveSlotFinderService } from './cloud-save-slot-finder.service';

@Injectable()
export class CloudSavesService {
  private readonly settings = inject(CLOUD_SAVES_SETTINGS);
  private readonly gameContext = inject(CLOUD_SAVES_GAME_CONTEXT);
  private readonly sessionBridge = inject(CLOUD_SAVES_SESSION_BRIDGE);
  private readonly persistence = inject(GamePersistenceService);
  private readonly logger = inject(LoggingService);
  private readonly client = new CloudSavesClient(this.settings);

  private readonly masterSlotsState = signal<CloudSaveSlotRef[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly tokenState = signal<string | null>(null);
  private readonly savingState = signal(false);

  readonly slots: Signal<CloudSaveSlotRef[]> = this.masterSlotsState.asReadonly();
  readonly characterSlots: Signal<CloudSaveSlotRef[]> = computed(() => this.filterSlotsByCharacter(this.masterSlotsState()));
  readonly loading: Signal<boolean> = this.loadingState.asReadonly();
  readonly error: Signal<string | null> = this.errorState.asReadonly();
  readonly hasSession = computed(() => !!this.tokenState());
  readonly saving: Signal<boolean> = this.savingState.asReadonly();

  private readonly defaultSaveReason = 'cloud-persist-slot';

  private readonly gameState = inject(GameStateStore);
  private readonly slotFinder = inject(CloudSaveSlotFinderService);
  private autoLoadPerformed = false;

  constructor() {
    void this.refreshToken().then(() => {
      if (this.tokenState()) {
        void this.bootstrapFromSession();
      }
    });
    this.sessionBridge.onSessionChange?.((token) => {
      this.tokenState.set(token);
      if (token) {
        void this.bootstrapFromSession();
      }
    });
  }

  async saveCurrentGame(index: number, options?: SaveGameSlotOptions): Promise<SaveGamePayload> {
    const targetIndex = this.normalizeIndex(index);
    const reason = options?.reason ?? `${this.defaultSaveReason}-${targetIndex}`;
    this.logger.info(LogCategory.SAVE_SYSTEM, 'Cloud save requested', { index: targetIndex, reason });
    this.savingState.set(true);
    try {
      const payload = await this.persistence.saveGame({
        reason,
        label: options?.label ?? null,
        includeUiState: options?.includeUiState ?? false,
        includeAudioState: options?.includeAudioState ?? false,
        skipPause: options?.skipPause ?? false
      });
      const metadata = this.buildSlotMetadata(payload, options?.metadataOverrides);
      await this.putSave(targetIndex, payload, metadata);
      this.gameState.setActiveCloudSaveSlotIndex(targetIndex);
      this.logger.info(LogCategory.SAVE_SYSTEM, 'Cloud save uploaded', {
        index: targetIndex,
        schemaVersion: payload.schemaVersion,
        systemId: payload.metadata.systemId,
        anchorLabel: payload.metadata.anchorLabel ?? null
      });
      return payload;
    } catch (error) {
      const friendly = this.handleError(error, 'save');
      this.logger.error(LogCategory.SAVE_SYSTEM, 'Cloud save failed', { index: targetIndex, reason, error, friendly });
      throw error;
    } finally {
      this.savingState.set(false);
    }
  }

  async loadGameFromSlot(index: number, options?: LoadGameSlotOptions): Promise<CloudSlotLoadResult | null> {
    const targetIndex = this.normalizeIndex(index);
    this.logger.info(LogCategory.SAVE_SYSTEM, 'Cloud load requested', { index: targetIndex });
    const slot = await this.loadSlotContent(targetIndex);
    if (!slot) {
      this.logger.warn(LogCategory.SAVE_SYSTEM, 'Cloud load skipped (slot empty)', { index: targetIndex });
      return null;
    }
    const payload = this.ensurePayload(slot.savegame);
    const reason = options?.reason ?? `cloud-load-slot-${slot.index}`;
    try {
      const result = await this.persistence.loadGame(payload, {
        reason,
        skipPause: options?.skipPause ?? false
      });
      this.gameState.setActiveCloudSaveSlotIndex(slot.index);
      this.logger.info(LogCategory.SAVE_SYSTEM, 'Cloud load completed', {
        index: slot.index,
        durationMs: result.durationMs,
        systemId: result.metadata.systemId
      });
      return { slot, result };
    } catch (error) {
      const friendly = this.handleError(error, 'load');
      this.logger.error(LogCategory.SAVE_SYSTEM, 'Cloud load failed', { index: slot.index, error, friendly });
      throw error;
    }
  }

  async syncSlots(): Promise<void> {
    const token = await this.ensureToken();
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const response = await this.client.listSlots(token, this.gameContext.gameId);
      const sorted = this.sortSlots(response.saves ?? []);
      this.masterSlotsState.set(sorted);
      this.alignCharacterSlotsWithMaster(sorted);
    } catch (error) {
      this.handleError(error, 'sync');
    } finally {
      this.loadingState.set(false);
    }
  }

  async loadLatest(): Promise<CloudSaveSlotData | null> {
    await this.syncSlots();
    const slots = this.masterSlotsState();
    if (!slots.length) {
      return null;
    }
    return this.loadSlotContent(slots[0].index);
  }

  async loadSlot(index: number): Promise<CloudSaveSlotData | null> {
    return this.loadSlotContent(index);
  }

  characterSlotCount(): number {
    return this.gameState.getCloudSaveSlotCount();
  }

  hasMultipleSlots(): boolean {
    return this.characterSlotCount() > 1;
  }

  getDefaultSaveSlotIndex(): number {
    return this.gameState.getDefaultCloudSaveSlotIndex();
  }

  async putSave(index: number, payload: unknown, metadata?: CloudSaveSlotMetadata | null): Promise<void> {
    const token = await this.ensureToken();
    await this.sendWithRetry('save', () => this.client.putSave(token, this.gameContext.gameId, index, payload, metadata));
    await this.syncSlots();
  }

  async deleteSave(index: number): Promise<void> {
    const token = await this.ensureToken();
    await this.sendWithRetry('delete', () => this.client.deleteSave(token, this.gameContext.gameId, index));
    await this.syncSlots();
  }

  private async sendWithRetry(context: CloudSaveErrorContext, work: () => Promise<void>): Promise<void> {
    try {
      this.loadingState.set(true);
      this.errorState.set(null);
      await work();
    } catch (error) {
      this.handleError(error, context);
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
      const error = new Error('Missing session token');
      this.handleError(error, 'token');
      throw error;
    }
    return token;
  }

  private async refreshToken(): Promise<void> {
    const token = await this.sessionBridge.getToken();
    this.tokenState.set(token);
  }

  private async bootstrapFromSession(): Promise<void> {
    try {
      await this.syncSlots();
      await this.autoLoadLatestForCharacter();
    } catch (error) {
      this.logger.warn(LogCategory.SAVE_SYSTEM, 'Cloud bootstrap failed', { error });
    }
  }

  private async autoLoadLatestForCharacter(): Promise<void> {
    if (this.autoLoadPerformed) {
      return;
    }
    const target = this.pickPreferredSlot();
    if (!target) {
      return;
    }
    try {
      await this.loadGameFromSlot(target.index, { reason: 'cloud-auto-load-on-session', skipPause: false });
      this.autoLoadPerformed = true;
    } catch (error) {
      this.logger.warn(LogCategory.SAVE_SYSTEM, 'Automatic load skipped', { error });
    }
  }

  private pickPreferredSlot(): CloudSaveSlotRef | null {
    const personal = this.characterSlots();
    if (personal.length) {
      return personal[0];
    }
    const master = this.masterSlotsState();
    return master[0] ?? null;
  }

  private async loadSlotContent(index: number): Promise<CloudSaveSlotData | null> {
    const token = await this.ensureToken();
    const target = Math.max(0, Math.floor(index));
    try {
      this.loadingState.set(true);
      this.errorState.set(null);
      return await this.client.getSlot(token, this.gameContext.gameId, target);
    } catch (error) {
      this.handleError(error, 'load');
      throw error;
    } finally {
      this.loadingState.set(false);
    }
  }

  private normalizeIndex(index: number): number {
    if (!Number.isFinite(index)) {
      return 0;
    }
    return Math.max(0, Math.floor(index));
  }

  describeError(error: unknown, context: CloudSaveErrorContext): string {
    return this.mapErrorToMessage(error, context);
  }

  private buildSlotMetadata(
    payload: SaveGamePayload,
    overrides?: Partial<CloudSaveSlotMetadata> | null
  ): CloudSaveSlotMetadata {
    const base: CloudSaveSlotMetadata = {
      title: payload.metadata.systemName ?? payload.metadata.anchorLabel ?? null,
      systemId: payload.metadata.systemId ?? null,
      systemName: payload.metadata.systemName ?? null,
      anchorLabel: payload.metadata.anchorLabel ?? null,
      anchorPlanetName: payload.metadata.anchorPlanetName ?? null,
      savedAt: payload.metadata.savedAt ?? Date.now(),
      playTimeMs: payload.metadata.elapsedPlayTimeMs ?? null,
      buildLabel: payload.metadata.buildLabel ?? null,
      characterId: payload.metadata.characterId ?? null,
      characterSlotIndexes: payload.metadata.characterSlotIndexes ?? null,
      slotCapacity: payload.metadata.slotCapacity ?? null,
      activeSlotIndex: payload.metadata.activeSlotIndex ?? null
    };
    return { ...base, ...(overrides ?? {}) };
  }

  private sortSlots(slots: CloudSaveSlotRef[]): CloudSaveSlotRef[] {
    return [...slots].sort((a, b) => {
      const left = Date.parse(b.savedAt ?? '') || 0;
      const right = Date.parse(a.savedAt ?? '') || 0;
      return left - right;
    });
  }

  private filterSlotsByCharacter(slots: CloudSaveSlotRef[]): CloudSaveSlotRef[] {
    const characterId = this.gameState.getCharacterId();
    const assigned = new Set(this.gameState.getCloudSaveSlotIndexes());
    return slots.filter(slot => {
      if (slot.metadata?.characterId && slot.metadata.characterId === characterId) {
        return true;
      }
      return assigned.has(slot.index);
    });
  }

  private alignCharacterSlotsWithMaster(slots: CloudSaveSlotRef[]): void {
    const characterId = this.gameState.getCharacterId();
    const assigned = new Set(this.gameState.getCloudSaveSlotIndexes());
    const discovered = new Set<number>();
    let capacity: number | null = null;
    let active: number | null = null;

    for (const slot of slots) {
      const metadata = slot.metadata;
      if (!metadata) {
        continue;
      }
      if (metadata.characterId && metadata.characterId !== characterId) {
        continue;
      }
      const normalizedIndex = this.normalizeSlotIndex(slot.index);
      if (normalizedIndex !== null) {
        discovered.add(normalizedIndex);
      }
      for (const idx of metadata.characterSlotIndexes ?? []) {
        const normalized = this.normalizeSlotIndex(idx);
        if (normalized !== null) {
          discovered.add(normalized);
        }
      }
      if (typeof metadata.slotCapacity === 'number') {
        const candidate = Math.max(1, Math.floor(metadata.slotCapacity));
        capacity = capacity === null ? candidate : Math.max(capacity, candidate);
      }
      if (typeof metadata.activeSlotIndex === 'number') {
        active = this.normalizeSlotIndex(metadata.activeSlotIndex);
      }
    }

    const merged = new Set<number>([...assigned, ...discovered]);
    if (!merged.size) {
      const fallback = this.slotFinder.acquireNewSlot(slots, [...assigned]);
      merged.add(fallback);
      active = fallback;
    }

    this.gameState.setCloudSaveSlotIndexes([...merged]);
    if (capacity !== null) {
      this.gameState.setCloudSaveSlotCapacity(capacity);
    }
    if (active !== null) {
      this.gameState.setActiveCloudSaveSlotIndex(active);
    } else if (!this.gameState.getActiveCloudSaveSlotIndex()) {
      this.gameState.setActiveCloudSaveSlotIndex(this.gameState.getDefaultCloudSaveSlotIndex());
    }
  }

  private normalizeSlotIndex(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.floor(value));
  }

  private ensurePayload(candidate: SaveGamePayload | unknown): SaveGamePayload {
    if (!candidate || typeof candidate !== 'object') {
      throw new SaveGamePayloadInvalidError('Cloud slot does not contain a valid savegame payload.');
    }
    const schemaVersion = (candidate as Partial<SaveGamePayload>).schemaVersion;
    const metadata = (candidate as Partial<SaveGamePayload>).metadata;
    if (typeof schemaVersion !== 'number' || !metadata) {
      throw new SaveGamePayloadInvalidError('Cloud slot payload is missing schema metadata.');
    }
    return candidate as SaveGamePayload;
  }

  private handleError(error: unknown, context: CloudSaveErrorContext): string {
    const friendly = this.mapErrorToMessage(error, context);
    this.errorState.set(friendly);
    return friendly;
  }

  private mapErrorToMessage(error: unknown, context: CloudSaveErrorContext): string {
    if (error instanceof SaveGameSchemaVersionMismatchError) {
      return 'La partida usa un esquema incompatible con esta build. Actualiza el cliente antes de volver a intentarlo.';
    }
    if (error instanceof SaveGamePayloadInvalidError) {
      return 'El slot seleccionado está dañado o incompleto. Guarda una partida nueva o elimina el slot.';
    }
    if (error instanceof SaveGameInProgressError) {
      return 'Ya hay un guardado en curso. Espera a que termine para enviar otro a la nube.';
    }
    if (error instanceof LoadGameInProgressError) {
      return 'Ya hay una carga en curso. Espera a que finalice antes de cargar otra partida.';
    }
    if (error instanceof SaveGameEngineUnavailableError) {
      return 'El motor del juego aún no está listo. Espera unos segundos e inténtalo otra vez.';
    }
    if (error instanceof SaveGameCaptureError) {
      return context === 'load'
        ? 'No se pudo restaurar la partida. Revisa los logs de SAVE_SYSTEM y vuelve a intentarlo.'
        : 'No se pudo serializar la partida actual. Revisa los logs de SAVE_SYSTEM.';
    }

    const extracted = this.extractErrorMessage(error);
    if (this.isTokenError(extracted)) {
      return 'La sesión de autenticación expiró. Inicia sesión para guardar o cargar partidas en la nube.';
    }
    if (this.isNetworkError(extracted, error)) {
      return 'No se pudo contactar con el servicio de guardado en la nube. Comprueba tu conexión e inténtalo más tarde.';
    }
    if (extracted && extracted.trim().length && !this.isGenericMessage(extracted)) {
      return extracted;
    }
    return this.defaultErrorMessage(context);
  }

  private extractErrorMessage(error: unknown): string | null {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error && typeof error.message === 'string') {
      return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const record = error as Record<string, unknown>;
      if (typeof record['message'] === 'string') {
        return record['message'] as string;
      }
    }
    return null;
  }

  private isTokenError(message: string | null): boolean {
    if (!message) {
      return false;
    }
    return /token|session|unauthorized|401/i.test(message);
  }

  private isNetworkError(message: string | null, error: unknown): boolean {
    if (message && /network|fetch|timeout|503|504/i.test(message)) {
      return true;
    }
    return error instanceof TypeError;
  }

  private isGenericMessage(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    return normalized === 'unknown error' || normalized === 'error' || normalized === 'request failed';
  }

  private defaultErrorMessage(context: CloudSaveErrorContext): string {
    switch (context) {
      case 'save':
        return 'No se pudo guardar la partida en la nube. Inténtalo de nuevo en unos segundos.';
      case 'load':
        return 'No se pudo cargar la partida seleccionada. Comprueba los slots o vuelve a intentarlo más tarde.';
      case 'delete':
        return 'No se pudo eliminar el slot remoto. Repite la acción más tarde.';
      case 'token':
        return 'Necesitas iniciar sesión para usar los slots en la nube.';
      case 'sync':
      default:
        return 'No se pudo sincronizar con el servicio de Cloud Saves. Revisaremos en el siguiente intento.';
    }
  }
}

interface SaveGameSlotOptions {
  reason?: string;
  label?: string | null;
  includeUiState?: boolean;
  includeAudioState?: boolean;
  skipPause?: boolean;
  metadataOverrides?: Partial<CloudSaveSlotMetadata> | null;
}

interface LoadGameSlotOptions {
  reason?: string;
  skipPause?: boolean;
}

export interface CloudSlotLoadResult {
  slot: CloudSaveSlotData;
  result: LoadGameResult;
}

export type CloudSaveErrorContext = 'save' | 'load' | 'sync' | 'delete' | 'token';
