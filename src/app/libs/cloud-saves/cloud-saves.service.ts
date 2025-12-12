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

@Injectable()
export class CloudSavesService {
  private readonly settings = inject(CLOUD_SAVES_SETTINGS);
  private readonly gameContext = inject(CLOUD_SAVES_GAME_CONTEXT);
  private readonly sessionBridge = inject(CLOUD_SAVES_SESSION_BRIDGE);
  private readonly persistence = inject(GamePersistenceService);
  private readonly logger = inject(LoggingService);
  private readonly client = new CloudSavesClient(this.settings);

  private readonly slotsState = signal<CloudSaveSlotRef[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly tokenState = signal<string | null>(null);
  private readonly savingState = signal(false);

  readonly slots: Signal<CloudSaveSlotRef[]> = this.slotsState.asReadonly();
  readonly loading: Signal<boolean> = this.loadingState.asReadonly();
  readonly error: Signal<string | null> = this.errorState.asReadonly();
  readonly hasSession = computed(() => !!this.tokenState());
  readonly saving: Signal<boolean> = this.savingState.asReadonly();

  private readonly defaultSaveReason = 'cloud-persist-slot';

  constructor() {
    void this.refreshToken();
    this.sessionBridge.onSessionChange?.((token) => {
      this.tokenState.set(token);
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
      this.slotsState.set(response.saves);
    } catch (error) {
      this.handleError(error, 'sync');
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
      buildLabel: payload.metadata.buildLabel ?? null
    };
    return { ...base, ...(overrides ?? {}) };
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
