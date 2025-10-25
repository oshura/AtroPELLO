import { Component, EventEmitter, Output, Input } from '@angular/core';
import { Modal } from '../../modal/modal';

@Component({
  selector: 'app-welcome-dialog',
  standalone: true,
  imports: [Modal],
  templateUrl: './welcome-dialog.html',
  styleUrls: ['./welcome-dialog.scss']
})
export class WelcomeDialogComponent {
  @Input() isVisible = false;
  @Output() start = new EventEmitter<void>();

  onStart() {
    this.start.emit();
  }
}
