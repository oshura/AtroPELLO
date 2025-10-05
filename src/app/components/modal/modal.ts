import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';

@Component({
  selector: 'app-modal',
  imports: [],
  templateUrl: './modal.html',
  styleUrl: './modal.scss'
})
export class Modal {
  @Input() isVisible = false;
  @Input() title = '';
  @Input() closeOnBackdrop = true;
  @Output() onClose = new EventEmitter<void>();

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isVisible) {
      this.close();
    }
  }

  close() {
    this.isVisible = false;
    this.onClose.emit();
  }

  onBackdropClick() {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }
}
