import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Modal } from '../modal/modal';
import { LandingApproachContext } from '../../game/types/landing.types';

@Component({
  selector: 'app-landing-panel',
  standalone: true,
  imports: [CommonModule, Modal],
  templateUrl: './landing-panel.html',
  styleUrl: './landing-panel.scss'
})
export class LandingPanelComponent {
  @Input() visible: boolean = false;
  @Input() context: LandingApproachContext | null = null;
  @Output() takeoff = new EventEmitter<void>();
  @Output() stay = new EventEmitter<void>();

  get title(): string {
    return this.context?.planetName
      ? `Aterrizado en ${this.context.planetName}`
      : 'Aterrizaje completado';
  }

  protected get planetType(): string {
    return this.context?.planetType ? String(this.context.planetType) : 'Desconocido';
  }

  protected get radiusKm(): number | null {
    return this.context ? Math.round(this.context.radius) : null;
  }

  protected get altitude(): number | null {
    return this.context ? Math.round(this.context.distanceToSurface) : null;
  }

  protected get alignment(): number | null {
    if (!this.context) {
      return null;
    }
    return Math.abs(this.context.alignmentDot);
  }

  onTakeoff(): void {
    this.takeoff.emit();
  }

  onStay(): void {
    this.stay.emit();
  }
}
