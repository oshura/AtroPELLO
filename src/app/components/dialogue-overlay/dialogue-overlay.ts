import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogueChoice, DialogueSessionState } from '../../game/types/dialogue.types';
import { DialogueService } from '../../services/game/dialogue.service';
import { GameStateStore } from '../../services/game/game-state.store';

/**
 * Overlay de conversación (Fase 13 — docs/RAZAS.md).
 *
 * Transparente y superpuesto, como el mapa: la superficie del planeta sigue viéndose detrás
 * mientras hablas. Muestra la narración acumulada y las opciones; "Terminar conversación" está
 * siempre disponible.
 */
@Component({
  selector: 'app-dialogue-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialogue-overlay.html',
  styleUrl: './dialogue-overlay.scss'
})
export class DialogueOverlayComponent {
  private readonly dialogue = inject(DialogueService);
  private readonly gameState = inject(GameStateStore);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();

  protected get state(): DialogueSessionState | null {
    return this.dialogue.getState();
  }

  protected choose(choice: DialogueChoice): void {
    const next = this.dialogue.choose(choice.id);
    if (!next || next.phase === 'closed' && choice.kind === 'leave') {
      this.close();
      return;
    }
    // Zoneless: el estado cambia fuera del ciclo de Angular, hay que forzar el repintado.
    this.cdr.detectChanges();
  }

  protected close(): void {
    this.dialogue.end();
    this.visible = false;
    this.closed.emit();
    this.cdr.detectChanges();
  }

  /** Memoria recuperada, que es el pago narrativo de estas conversaciones. */
  protected get memoryPercent(): number {
    return Math.round(this.gameState.memoryPercent ?? 0);
  }

  protected trackByIndex(index: number): number {
    return index;
  }
}
