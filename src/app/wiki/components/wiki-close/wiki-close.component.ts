import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-wiki-close',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wiki-float-stack">
      @if (showBackButton) {
        <button
          type="button"
          class="wiki-back-btn"
          [attr.aria-label]="backAriaLabel"
          (click)="onBack($event)"
        >
          <span class="icon">↩</span>
          <span class="label">{{ backLabel }}</span>
        </button>
      }

      <button
        type="button"
        class="wiki-close-btn"
        [attr.aria-label]="ariaLabel"
        (click)="onClose($event)"
      >
        ✕
      </button>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 80px;
      right: 24px;
      z-index: 9998;
      display: flex;
      pointer-events: none;
    }

    .wiki-float-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-end;
      pointer-events: auto;
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

    .wiki-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.6rem 1.6rem;
      border-radius: 999px;
      border: 2px solid rgba(125, 211, 252, 0.85);
      background: rgba(2, 6, 23, 0.9);
      color: #7dd3fc;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow:
        0 0 18px rgba(125, 211, 252, 0.35),
        inset 0 0 12px rgba(15, 118, 237, 0.25);
      text-transform: uppercase;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      backdrop-filter: blur(6px);
    }

    .wiki-back-btn .icon {
      font-size: 1.1rem;
      filter: drop-shadow(0 0 6px rgba(125, 211, 252, 0.65));
    }

    .wiki-back-btn .label {
      text-shadow: 0 0 8px rgba(56, 189, 248, 0.65);
    }

    .wiki-back-btn:hover {
      transform: translateY(-1px);
      box-shadow:
        0 0 26px rgba(125, 211, 252, 0.55),
        inset 0 0 14px rgba(56, 189, 248, 0.35);
      border-color: #bae6fd;
    }

    .wiki-back-btn:active {
      transform: scale(0.97);
    }

    .wiki-back-btn:focus-visible {
      outline: 2px solid #bae6fd;
      outline-offset: 4px;
    }

    @media (max-width: 960px) {
      :host {
        top: 64px;
        right: 16px;
      }

      .wiki-back-btn {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
      }

      .wiki-close-btn {
        width: 46px;
        height: 46px;
      }
    }
  `]
})
export class WikiCloseComponent {
  private router = inject(Router);

  @Input() ariaLabel = 'Close wiki and return to game';
  @Input() target: string | string[] | null = '/';
  @Input() autoNavigate = true;
  @Output() clicked = new EventEmitter<void>();
  @Input() showBackButton = true;
  @Input() backTarget: string | string[] | null = '/wiki';
  @Input() backLabel = 'Back to Wiki';
  @Input() backAriaLabel = 'Go back to the wiki index';
  @Output() backClicked = new EventEmitter<void>();

  async onClose(event: MouseEvent): Promise<void> {
    event.preventDefault();
    this.clicked.emit();

    if (!this.autoNavigate) {
      return;
    }

    await this.navigateTo(this.target);
  }

  async onBack(event: MouseEvent): Promise<void> {
    event.preventDefault();
    this.backClicked.emit();

    if (!this.showBackButton) {
      return;
    }

    await this.navigateTo(this.backTarget);
  }

  private async navigateTo(target: string | string[] | null): Promise<void> {
    if (target === null) {
      return;
    }

    try {
      if (Array.isArray(target)) {
        await this.router.navigate(target);
      } else {
        await this.router.navigateByUrl(target);
      }
    } catch (error) {
      console.error('Failed to navigate from wiki controls', error);
    }
  }
}
