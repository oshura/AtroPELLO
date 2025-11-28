import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-wiki-close',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="wiki-close-btn"
      [attr.aria-label]="ariaLabel"
      (click)="onClose($event)"
    >
      ✕
    </button>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 80px;
      right: 24px;
      z-index: 9998;
    }

    .wiki-close-btn {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 2px solid #00ff41;
      background: radial-gradient(circle at 30% 30%, rgba(0, 255, 65, 0.25), rgba(0, 0, 0, 0.9));
      color: #00ff41;
      font-size: 1.8rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow:
        0 0 25px rgba(0, 255, 65, 0.5),
        inset 0 0 15px rgba(0, 255, 65, 0.15);
      text-shadow: 0 0 10px rgba(0, 255, 65, 0.8);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      backdrop-filter: blur(4px);
    }

    .wiki-close-btn:hover {
      transform: scale(1.06) translateY(-1px);
      box-shadow:
        0 0 35px rgba(0, 255, 65, 0.7),
        inset 0 0 20px rgba(0, 255, 65, 0.25);
      border-color: #7bff9a;
    }

    .wiki-close-btn:active {
      transform: scale(0.96);
      box-shadow:
        0 0 18px rgba(0, 255, 65, 0.5),
        inset 0 0 10px rgba(0, 255, 65, 0.4);
    }

    .wiki-close-btn:focus-visible {
      outline: 2px solid #7bff9a;
      outline-offset: 4px;
    }
  `]
})
export class WikiCloseComponent {
  private router = inject(Router);

  @Input() ariaLabel = 'Close wiki and return to game';
  @Input() target: string | string[] | null = '/';
  @Input() autoNavigate = true;
  @Output() clicked = new EventEmitter<void>();

  async onClose(event: MouseEvent): Promise<void> {
    event.preventDefault();
    this.clicked.emit();

    if (!this.autoNavigate || this.target === null) {
      return;
    }

    try {
      if (Array.isArray(this.target)) {
        await this.router.navigate(this.target);
      } else {
        await this.router.navigateByUrl(this.target);
      }
    } catch (error) {
      console.error('Failed to navigate from wiki close button', error);
    }
  }
}
