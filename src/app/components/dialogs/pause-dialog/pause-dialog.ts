import { Component, EventEmitter, Output, Input } from '@angular/core';
import { Modal } from '../../modal/modal';

@Component({
  selector: 'app-pause-dialog',
  standalone: true,
  imports: [Modal],
  templateUrl: './pause-dialog.html',
  styleUrls: ['./pause-dialog.scss']
})
export class PauseDialogComponent {
  @Input() isVisible = false;
  @Output() resume = new EventEmitter<void>();

  onResume() { this.resume.emit(); }
}
