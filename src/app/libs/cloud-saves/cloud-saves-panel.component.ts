import { Component, Input } from '@angular/core';
import { DatePipe, JsonPipe, NgFor, NgIf } from '@angular/common';
import { CloudSavesService, CloudSlotLoadResult } from './cloud-saves.service';
import { CloudSaveSlotData, CloudSaveSlotMetadata, CloudSaveSlotRef } from './cloud-saves.models';
import { LoadGameResult } from '../../services/game/game-persistence.service';
import { SaveGamePayload } from '../../game/types/save-game.types';

export interface CloudSavesPanelCopy {
  eyebrow: string;
  title: string;
  subtitleAuth: string;
  subtitleAnon: string;
  loggedAsLabel: string;
  requirements: string;
  actionSync: string;
  actionLoadLatest: string;
  actionSaveSlot: string;
  actionLoadSlot: string;
  actionDelete: string;
  listHeaderSlot: string;
  listHeaderSavedAt: string;
  listHeaderActions: string;
  listEmpty: string;
  loadedFeedback: string;
  actionManage: string;
  note: string;
  confirmLoad: string;
  metadataHeading: string;
  metadataSystem: string;
  metadataAnchor: string;
  metadataPlaytime: string;
  metadataDuration: string;
  metadataSavedAt: string;
  metadataBuild: string;
}

export const DEFAULT_CLOUD_SAVES_COPY: CloudSavesPanelCopy = {
  eyebrow: 'Cloud saves',
  title: 'Saved Games',
  subtitleAuth: 'Manage your private slots through the REST saves service.',
  subtitleAnon: 'Sign in with Cognito to enable cloud saves.',
  loggedAsLabel: 'Signed in as',
  requirements: 'You need an active session before sending authenticated REST calls.',
  actionSync: 'Sync slots',
  actionLoadLatest: 'Load latest slot',
  actionSaveSlot: 'Save slot 0',
  actionLoadSlot: 'Load slot',
  actionDelete: 'Delete',
  listHeaderSlot: 'Slot',
  listHeaderSavedAt: 'Saved at',
  listHeaderActions: 'Actions',
  listEmpty: 'No slots yet. Use “Save slot 0” to create the first payload.',
  loadedFeedback: 'Last load',
  actionManage: 'Manage slots',
  note: 'If something fails check the console for LogCategory.SAVE_SYSTEM traces.',
  confirmLoad: 'Load this slot and overwrite the current session? The ship state will be replaced.',
  metadataHeading: 'Runtime metadata',
  metadataSystem: 'System',
  metadataAnchor: 'Anchor',
  metadataPlaytime: 'Playtime',
  metadataDuration: 'Load duration',
  metadataSavedAt: 'Captured',
  metadataBuild: 'Build'
};

@Component({
  selector: 'app-cloud-saves-panel',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, JsonPipe],
  templateUrl: './cloud-saves-panel.component.html',
  styleUrl: './cloud-saves-panel.component.scss'
})
export class CloudSavesPanelComponent {
  @Input() copy: CloudSavesPanelCopy = DEFAULT_CLOUD_SAVES_COPY;
  @Input() username: string | null = null;
  protected lastLoadedIndex: number | null = null;
  protected lastLoadedSlot: CloudSaveSlotData | null = null;
  protected lastLoadedMetadata: CloudSaveSlotMetadata | null = null;
  protected lastLoadResult: LoadGameResult | null = null;

  constructor(protected readonly saves: CloudSavesService) {}

  protected sync() {
    void this.runSafely(() => this.saves.syncSlots());
  }

  protected isBusy(): boolean {
    return this.saves.loading() || this.saves.saving();
  }

  protected loadLatest() {
    const slots = this.saves.slots();
    if (!slots.length) {
      return;
    }
    void this.runSafely(() => this.loadAndApply(slots[0].index, 'latest'));
  }

  protected saveSlotZero() {
    void this.runSafely(() =>
      this.saves.saveCurrentGame(0, {
        reason: 'cloud-panel-save-slot-0',
        label: 'Panel slot 0'
      })
    );
  }

  protected loadSlot(index: number) {
    void this.runSafely(() => this.loadAndApply(index, `slot-${index}`));
  }

  protected deleteSlot(index: number) {
    void this.runSafely(async () => {
      await this.saves.deleteSave(index);
      if (this.lastLoadedIndex === index) {
        this.lastLoadedIndex = null;
        this.lastLoadedSlot = null;
        this.lastLoadedMetadata = null;
        this.lastLoadResult = null;
      }
    });
  }

  protected trackSlot(_index: number, slot: CloudSaveSlotRef): string {
    return slot.key ?? `${slot.index}-${slot.savedAt}`;
  }

  protected manage() {
    // Placeholder for future UI (slots table, delete, etc.)
  }

  private async loadAndApply(index: number, reasonSuffix: string): Promise<void> {
    if (!this.confirmLoadAction(index)) {
      return;
    }
    const outcome = await this.saves.loadGameFromSlot(index, {
      reason: `cloud-panel-load-${reasonSuffix}`
    });
    if (!outcome) {
      return;
    }
    this.applyOutcome(outcome);
  }

  private async runSafely<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work();
    } catch (error) {
      console.warn('[CloudSavesPanel] Acción de cloud saves fallida', error);
      return null;
    }
  }

  private applyOutcome(outcome: CloudSlotLoadResult): void {
    this.lastLoadedSlot = outcome.slot;
    this.lastLoadedIndex = outcome.slot.index;
    this.lastLoadedMetadata = this.resolveMetadata(outcome.slot);
    this.lastLoadResult = outcome.result;
  }

  private confirmLoadAction(index: number): boolean {
    return window.confirm(`${this.copy.confirmLoad}\n(#${index})`);
  }

  private resolveMetadata(slot: CloudSaveSlotData): CloudSaveSlotMetadata | null {
    if (slot.metadata) {
      return slot.metadata;
    }
    const payload = slot.savegame as SaveGamePayload;
    if (!payload || typeof payload !== 'object' || !('metadata' in payload)) {
      return null;
    }
    const meta = payload.metadata;
    return {
      title: meta.systemName ?? meta.anchorLabel ?? null,
      systemId: meta.systemId ?? null,
      systemName: meta.systemName ?? null,
      anchorLabel: meta.anchorLabel ?? null,
      anchorPlanetName: meta.anchorPlanetName ?? null,
      savedAt: meta.savedAt ?? null,
      playTimeMs: meta.elapsedPlayTimeMs ?? null,
      buildLabel: meta.buildLabel ?? null
    };
  }

  protected formatSeconds(value?: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return `${Math.round(value / 1000)}s`;
  }

  protected formatMilliseconds(value?: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return `${Math.round(value)} ms`;
  }
}
