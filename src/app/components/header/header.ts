import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgIf } from '@angular/common';
import { AudioSettingsDialogComponent } from '../dialogs/audio-settings-dialog/audio-settings-dialog';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { WikiNavigationService } from '../../services/wiki-navigation.service';
import { AuthService } from '../../services/auth.service';

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
}
