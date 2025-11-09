import { Component } from '@angular/core';
import { AudioSettingsDialogComponent } from '../dialogs/audio-settings-dialog/audio-settings-dialog';
import { LoggingService, LogCategory } from '../../services/logging.service';

@Component({
  selector: 'app-header',
  imports: [AudioSettingsDialogComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header {
  showAudio = false;
  constructor(private logger: LoggingService) {}
  onOptionsClick() {
    this.showAudio = true;
    this.logger.debug(LogCategory.INPUT, 'Options dialog opened');
  }

  onLoginClick() {
    this.logger.info(LogCategory.INPUT, 'Login clicked');
  }
}
