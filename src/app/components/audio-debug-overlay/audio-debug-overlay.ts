import { Component, HostListener } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { AudioDebugService } from '../../services/audio/audio-debug.service';

@Component({
  selector: 'audio-debug-overlay',
  standalone: true,
  imports: [NgIf, NgFor, AsyncPipe],
  templateUrl: './audio-debug-overlay.html',
  styleUrl: './audio-debug-overlay.scss'
})
export class AudioDebugOverlayComponent {
  constructor(private debug: AudioDebugService) {}
  get state$() { return this.debug.state$; }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'F9') { this.debug.toggleVisible(); }
  }

  hide() { this.debug.setVisible(false); }
}
