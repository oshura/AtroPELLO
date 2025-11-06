import { Component } from '@angular/core';
import { AudioSettingsDialogComponent } from '../dialogs/audio-settings-dialog/audio-settings-dialog';

@Component({
  selector: 'app-header',
  imports: [AudioSettingsDialogComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header {
  showAudio = false;
  onOptionsClick() {
    this.showAudio = true;
  }

  onLoginClick() {
    console.log('Login clicked');
  }
}
