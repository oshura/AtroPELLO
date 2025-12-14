import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgIf } from '@angular/common';
import { AudioSettingsDialogComponent } from '../dialogs/audio-settings-dialog/audio-settings-dialog';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { WikiNavigationService } from '../../services/wiki-navigation.service';
import { AuthService } from '../../services/auth.service';
import { CloudSavesService } from '../../libs/cloud-saves/cloud-saves.service';

@Component({
  selector: 'app-header',
  imports: [AudioSettingsDialogComponent, RouterModule, NgIf],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header {
  showAudio = false;
  protected optionsInitialTab: 'audio' | 'controls' | 'saves' = 'audio';
  protected wikiNav = inject(WikiNavigationService);
  protected auth = inject(AuthService);
  protected saves = inject(CloudSavesService);
  protected saveFeedback: string | null = null;
  protected saveError: string | null = null;
  
  constructor(private logger: LoggingService) {}
  
  getWikiRoute(): string {
    return this.wikiNav.getLastRoute();
  }
  onOptionsClick() {
    this.logger.debug(LogCategory.INPUT, 'Options dialog opened');
    this.openOptions('audio');
  }

  onLoginClick() {
    this.logger.info(LogCategory.INPUT, 'Login clicked');
    this.auth.loginWithRedirect();
  }

  onLogoutClick() {
    this.logger.info(LogCategory.INPUT, 'Logout clicked');
    this.auth.logoutWithRedirect();
  }

  protected isSaveDisabled(): boolean {
    return !this.auth.authenticated() || this.saves.loading() || this.saves.saving();
  }

  async onSaveGameClick(): Promise<void> {
    if (this.isSaveDisabled()) {
      return;
    }
    const slotIndex = this.saves.getDefaultSaveSlotIndex();
    this.logger.info(LogCategory.SAVE_SYSTEM, 'Header save CTA clicked', { slotIndex });
    if (this.saves.hasMultipleSlots()) {
      this.saveFeedback = null;
      this.saveError = null;
      this.logger.info(LogCategory.SAVE_SYSTEM, 'Multiple slots detected, redirecting CTA to cloud saves tab');
      this.openOptions('saves');
      return;
    }
    this.saveError = null;
    this.saveFeedback = `Guardando slot ${slotIndex}...`;
    try {
      const payload = await this.saves.saveCurrentGame(slotIndex, {
        reason: `header-save-slot-${slotIndex}`,
        label: 'Header CTA'
      });
      const label = payload.metadata.systemName ?? payload.metadata.anchorLabel ?? `#${slotIndex}`;
      const savedAt = payload.metadata.savedAt ?? Date.now();
      this.saveFeedback = `Guardado ${label} (${new Date(savedAt).toLocaleTimeString()})`;
      this.logger.info(LogCategory.SAVE_SYSTEM, 'Header save CTA completed', {
        systemId: payload.metadata.systemId,
        anchorLabel: payload.metadata.anchorLabel ?? null
      });
    } catch (error) {
      this.saveError = this.saves.describeError(error, 'save');
      this.saveFeedback = null;
      this.logger.error(LogCategory.SAVE_SYSTEM, 'Header save CTA failed', { error });
    }
  }

  protected onOptionsClosed(): void {
    this.showAudio = false;
    this.optionsInitialTab = 'audio';
  }

  private openOptions(tab: 'audio' | 'controls' | 'saves'): void {
    this.optionsInitialTab = tab;
    this.showAudio = true;
  }
}
