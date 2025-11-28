import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Modal } from '../modal/modal';
import { LandingApproachContext, LandingPlanetIntel } from '../../game/types/landing.types';
import { LandingMenuComponent } from '../landing-menu/landing-menu';

@Component({
  selector: 'app-landing-panel',
  standalone: true,
  imports: [CommonModule, Modal, LandingMenuComponent],
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

  protected get showIntelSection(): boolean {
    return Boolean(this.inhabitantsIntel || this.lifeProbabilityIntel || this.lesserBeingIntel);
  }

  protected get inhabitantsIntel(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel || !intel.planetLifeIntelKnown || !intel.planetHasKnownSpecies) {
      return null;
    }
    const label = (intel.planetInhabitantsDisplay || '').trim();
    return label.length ? label : null;
  }

  protected get inhabitantsHint(): string | null {
    return this.inhabitantsIntel ? 'Escáner completado' : null;
  }

  protected get lifeProbabilityIntel(): string | null {
    if (this.planetIntelSnapshot?.planetLifeIntelKnown) {
      return null;
    }
    const pctRaw = this.context?.probabilityOfLifePct;
    if (typeof pctRaw !== 'number' || !Number.isFinite(pctRaw)) {
      return null;
    }
    const pct = Math.max(0, Math.min(100, Math.round(pctRaw)));
    return `${pct}%`;
  }

  protected get lifeProbabilityHint(): string | null {
    return this.lifeProbabilityIntel ? 'Escáner pendiente' : null;
  }

  protected get lesserBeingIntel(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel) {
      return null;
    }
    const label = (intel.planetLesserBeingDisplay || '').trim();
    return label.length ? label : null;
  }

  protected get lesserBeingHint(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel) {
      return null;
    }
    return intel.planetCreatureIntelKnown ? 'Lectura confirmada' : 'Escáner pendiente';
  }

  private get planetIntelSnapshot(): LandingPlanetIntel | null {
    return this.context?.planetIntel ?? null;
  }

  onTakeoff(): void {
    this.takeoff.emit();
  }

  onStay(): void {
    this.stay.emit();
  }
}
