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
    this.showAudio = true;
    this.logger.debug(LogCategory.INPUT, 'Options dialog opened');
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
    this.logger.info(LogCategory.SAVE_SYSTEM, 'Header save CTA clicked');
    this.saveError = null;
    this.saveFeedback = 'Guardando slot 0…';
    try {
      const payload = await this.saves.saveCurrentGame(0, {
        reason: 'header-save-slot-0',
        label: 'Header CTA'
      });
      this.saveFeedback = `Guardado ${payload.metadata.systemName ?? payload.metadata.anchorLabel ?? '#0'} (${new Date(payload.metadata.savedAt).toLocaleTimeString()})`;
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
}
