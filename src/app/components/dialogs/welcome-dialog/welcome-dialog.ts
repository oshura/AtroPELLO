import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Modal } from '../../modal/modal';

@Component({
  selector: 'app-welcome-dialog',
  standalone: true,
  imports: [CommonModule, Modal],
  templateUrl: './welcome-dialog.html',
  styleUrl: './welcome-dialog.scss'
})
export class WelcomeDialogComponent {
  @Input() isVisible: boolean = false;
  @Output() continue = new EventEmitter<void>();

  onContinue(): void {
    this.continue.emit();
  }
}

