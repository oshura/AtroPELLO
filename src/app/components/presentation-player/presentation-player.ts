import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresentationService } from '../../services/game/presentation.service';

/**
 * Overlay a pantalla completa de las PRESENTACIONES de cómic (viñeta + subtítulo opcional).
 * Todo el estado vive en PresentationService (signals): este componente solo pinta. La transición
 * de opacidad (0.5s) está casada con FADE_MS del servicio.
 */
@Component({
  selector: 'app-presentation-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="presentation" *ngIf="svc.active()">
      <img class="presentation__frame" [class.shown]="svc.shown()" [src]="svc.imageUrl()" alt="" />
      <p class="presentation__caption" [class.shown]="svc.shown()" *ngIf="svc.caption()">{{ svc.caption() }}</p>
      <span class="presentation__hint">ESC para saltar</span>
    </div>
  `,
  styles: [`
    .presentation { position: fixed; inset: 0; z-index: 1400; background: #04070c;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 18px; pointer-events: auto; }
    .presentation__frame { max-width: 92vw; max-height: 80vh; opacity: 0;
      transition: opacity 0.5s ease; border-radius: 6px;
      box-shadow: 0 0 48px rgba(20, 60, 110, 0.45); }
    .presentation__frame.shown { opacity: 1; }
    .presentation__caption { margin: 0; max-width: 72ch; padding: 0 4vw; text-align: center;
      color: #d8e6f5; font-size: 1.05rem; line-height: 1.5; opacity: 0; transition: opacity 0.5s ease; }
    .presentation__caption.shown { opacity: 1; }
    .presentation__hint { position: absolute; bottom: 14px; right: 18px; color: #56708a;
      font-size: 0.75rem; letter-spacing: 0.05em; }
  `],
})
export class PresentationPlayerComponent {
  constructor(public readonly svc: PresentationService) {}
}
