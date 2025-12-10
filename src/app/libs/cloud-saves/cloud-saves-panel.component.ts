import { Component, Input } from '@angular/core';
import { DatePipe, JsonPipe, NgFor, NgIf } from '@angular/common';
import { CloudSavesService } from './cloud-saves.service';
import { CloudSaveSlotData, CloudSaveSlotRef } from './cloud-saves.models';

export interface CloudSavesPanelCopy {
  eyebrow: string;
  title: string;
  subtitleAuth: string;
  subtitleAnon: string;
  loggedAsLabel: string;
  requirements: string;
  actionSync: string;
  actionLoadLatest: string;
  actionSaveStub: string;
  actionLoadSlot: string;
  actionDelete: string;
  listHeaderSlot: string;
  listHeaderSavedAt: string;
  listHeaderActions: string;
  listEmpty: string;
  loadedFeedback: string;
  actionManage: string;
  note: string;
}

export const DEFAULT_CLOUD_SAVES_COPY: CloudSavesPanelCopy = {
  eyebrow: 'Cloud saves',
  title: 'Saved Games',
  subtitleAuth: 'Manage your private slots through the REST saves service.',
  subtitleAnon: 'Sign in with Cognito to enable cloud saves.',
  loggedAsLabel: 'Signed in as',
  requirements: 'You need an active session before sending authenticated REST calls.',
  actionSync: 'Sync slots',
  actionLoadLatest: 'Load latest',
  actionSaveStub: 'Save demo slot',
  actionLoadSlot: 'Load slot',
  actionDelete: 'Delete',
  listHeaderSlot: 'Slot',
  listHeaderSavedAt: 'Saved at',
  listHeaderActions: 'Actions',
  listEmpty: 'No slots yet. Create one with the demo save button.',
  loadedFeedback: 'Loaded slot',
  actionManage: 'Manage slots',
  note: 'Actions remain disabled until the saves API goes live.'
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

  constructor(protected readonly saves: CloudSavesService) {}

  protected sync() {
    void this.saves.syncSlots();
  }

  protected async loadLatest() {
    const slot = await this.saves.loadLatest();
    this.lastLoadedSlot = slot ?? null;
    this.lastLoadedIndex = slot?.index ?? null;
  }

  protected saveDemo() {
    const payload = {
      title: 'Demo save',
      timestamp: new Date().toISOString(),
      stats: {
        mission: 'tutorial',
        progress: Math.floor(Math.random() * 100)
      }
    };
    void this.saves.putSave(0, payload);
  }

  protected async loadSlot(index: number) {
    const slot = await this.saves.loadSlot(index);
    this.lastLoadedSlot = slot ?? null;
    this.lastLoadedIndex = slot?.index ?? null;
  }

  protected async deleteSlot(index: number) {
    await this.saves.deleteSave(index);
    if (this.lastLoadedIndex === index) {
      this.lastLoadedIndex = null;
      this.lastLoadedSlot = null;
    }
  }

  protected trackSlot(_index: number, slot: CloudSaveSlotRef): string {
    return slot.key ?? `${slot.index}-${slot.savedAt}`;
  }

  protected manage() {
    // Placeholder for future UI (slots table, delete, etc.)
  }
}
