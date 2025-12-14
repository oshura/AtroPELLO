import { Component, Input, computed, effect, signal } from '@angular/core';
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
  actionSave: string;
  actionLoad: string;
  actionDelete: string;
  actionViewAll: string;
  actionViewAssigned: string;
  listEmpty: string;
  loadedFeedback: string;
  note: string;
  confirmLoad: string;
  ruleSingleSlot: string;
  selectionHint: string;
  viewAllWarning: string;
  metadataHeading: string;
  metadataSystem: string;
  metadataAnchor: string;
  metadataPlaytime: string;
  metadataDuration: string;
  metadataSavedAt: string;
  metadataBuild: string;
  metadataCharacter: string;
  metadataSlots: string;
}

export const DEFAULT_CLOUD_SAVES_COPY: CloudSavesPanelCopy = {
  eyebrow: 'Cloud saves',
  title: 'Saved Games',
  subtitleAuth: 'Manage your private slots through the REST saves service.',
  subtitleAnon: 'Sign in with Cognito to enable cloud saves.',
  loggedAsLabel: 'Signed in as',
  requirements: 'You need an active session before sending authenticated REST calls.',
  actionSave: 'Save slot',
  actionLoad: 'Load slot',
  actionDelete: 'Delete slot',
  actionViewAll: 'View all saves',
  actionViewAssigned: 'View my slots',
  listEmpty: 'No slots yet. Use "Save slot" to capture your current run.',
  loadedFeedback: 'Last load',
  note: 'If something fails check the console for LogCategory.SAVE_SYSTEM traces.',
  confirmLoad: 'Load this slot and overwrite the current session? The ship state will be replaced.',
  ruleSingleSlot: 'Every pilot begins with a single slot. Spells or ship modules can grant more.',
  selectionHint: 'Select a slot to enable save/load/delete.',
  viewAllWarning: 'Viewing all saves disables the save action to avoid overwriting other pilots.',
  metadataHeading: 'Runtime metadata',
  metadataSystem: 'System',
  metadataAnchor: 'Anchor',
  metadataPlaytime: 'Playtime',
  metadataDuration: 'Load duration',
  metadataSavedAt: 'Captured',
  metadataBuild: 'Build',
  metadataCharacter: 'Pilot id',
  metadataSlots: 'Slot capacity'
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
  protected selectedSlotIndex = signal<number | null>(null);
  protected viewAll = signal(false);
  protected displayedSlots = computed(() => (this.viewAll() ? this.saves.slots() : this.saves.characterSlots()));

  constructor(protected readonly saves: CloudSavesService) {
    effect(() => {
      const slots = this.displayedSlots();
      const current = this.selectedSlotIndex();
      if (!slots.length) {
        this.selectedSlotIndex.set(null);
        return;
      }
      if (slots.length === 1) {
        this.selectedSlotIndex.set(slots[0].index);
        return;
      }
      if (!slots.some(slot => slot.index === current)) {
        this.selectedSlotIndex.set(null);
      }
    });
  }

  protected isBusy(): boolean {
    return this.saves.loading() || this.saves.saving();
  }

  protected toggleViewAll(): void {
    this.viewAll.update(value => !value);
  }

  protected selectSlot(index: number): void {
    if (this.isBusy()) {
      return;
    }
    this.selectedSlotIndex.set(index);
  }

  protected trackSlot(_index: number, slot: CloudSaveSlotRef): string {
    return slot.key ?? `${slot.index}-${slot.savedAt}`;
  }

  protected requiresSelection(): boolean {
    return this.displayedSlots().length > 1;
  }

  protected isSaveDisabled(): boolean {
    if (!this.saves.hasSession() || this.isBusy()) {
      return true;
    }
    if (this.viewAll()) {
      return true;
    }
    if (this.requiresSelection() && this.selectedSlotIndex() === null) {
      return true;
    }
    return false;
  }

  protected isLoadDisabled(): boolean {
    if (!this.saves.hasSession() || this.isBusy()) {
      return true;
    }
    if (!this.displayedSlots().length) {
      return true;
    }
    if (this.requiresSelection() && this.selectedSlotIndex() === null) {
      return true;
    }
    return false;
  }

  protected isDeleteDisabled(): boolean {
    return this.isLoadDisabled();
  }

  protected saveSelectedSlot(): void {
    if (this.isSaveDisabled()) {
      return;
    }
    const index = this.selectedSlotIndex() ?? this.saves.getDefaultSaveSlotIndex();
    void this.runSafely(() =>
      this.saves.saveCurrentGame(index, {
        reason: `cloud-panel-save-slot-${index}`,
        label: `Panel slot ${index}`
      })
    );
  }

  protected loadSelectedSlot(): void {
    if (this.isLoadDisabled()) {
      return;
    }
    const index = this.selectedSlotIndex() ?? this.saves.getDefaultSaveSlotIndex();
    void this.runSafely(() => this.loadAndApply(index, `slot-${index}`));
  }

  protected deleteSelectedSlot(): void {
    if (this.isDeleteDisabled()) {
      return;
    }
    const index = this.selectedSlotIndex() ?? this.saves.getDefaultSaveSlotIndex();
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
      console.warn('[CloudSavesPanel] Accion de cloud saves fallida', error);
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
      buildLabel: meta.buildLabel ?? null,
      characterId: meta.characterId ?? null,
      characterSlotIndexes: meta.characterSlotIndexes ?? null,
      slotCapacity: meta.slotCapacity ?? null,
      activeSlotIndex: meta.activeSlotIndex ?? null
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
