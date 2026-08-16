import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StationLandingService, StationActionResult } from '../../services/game/station-landing.service';
import { DisembarkService } from '../../services/game/disembark.service';
import { PresentationService } from '../../services/game/presentation.service';
import { PresentationPlayerComponent } from '../presentation-player/presentation-player';

/**
 * Menú de aterrizaje de la ESTACIÓN espacial (propio, no el de planetas). Acciones: buscar (con
 * presentación de cómic previa) / descansar (100%) / recuperar vacío (100%) / despegar. El GameEngine
 * lo abre vía `GameComponentInstance.openStationPanel(...)` tras el acople. docs/ESTACIONES.md §4.
 */
@Component({
  selector: 'app-station-landing-panel',
  standalone: true,
  imports: [CommonModule, PresentationPlayerComponent],
  template: `
    <div class="station-overlay" *ngIf="visible">
      <div class="station-panel">
        <header class="station-panel__header">
          <h2>{{ stationName }}</h2>
          <span class="station-panel__port">Acoplado · {{ portName }}</span>
        </header>

        <div class="station-panel__actions">
          <button type="button" (click)="onSearch()">Buscar por la estación</button>
          <button type="button" (click)="onRest()">Descansar <small>(100%)</small></button>
          <button type="button" (click)="onRefuel()">Recuperar vacío <small>(100%)</small></button>
          <button type="button" class="station-panel__disembark" (click)="onDisembark()">Bajar de la nave</button>
          <button type="button" class="station-panel__takeoff" (click)="onTakeoff()">Despegar</button>
        </div>

        <div class="station-panel__log" *ngIf="log.length">
          <article *ngFor="let entry of log" class="station-panel__event">
            <h3>{{ entry.title }}</h3>
            <p *ngFor="let line of entry.lines" [class]="'tone-' + line.tone">{{ line.text }}</p>
          </article>
        </div>
      </div>
    </div>
    <app-presentation-player></app-presentation-player>
  `,
  styles: [`
    /* Sin fondo: se ve la nave acoplada (cámara cinemática) detrás del menú, a un lado. */
    .station-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: flex-end;
      padding-right: 4vw; pointer-events: none; background: transparent; z-index: 1200; }
    .station-panel { pointer-events: auto; width: min(480px, 92vw); max-height: 86vh; overflow-y: auto; padding: 22px 24px;
      background: linear-gradient(160deg, #0c1622, #060b12); border: 1px solid #2a4a6a;
      border-radius: 12px; color: #cfe3f5; box-shadow: 0 0 36px rgba(40, 110, 180, 0.35); }
    .station-panel__header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px;
      border-bottom: 1px solid #1d3146; padding-bottom: 12px; }
    .station-panel__header h2 { margin: 0; font-size: 1.3rem; color: #6fb4ff; }
    .station-panel__port { font-size: 0.8rem; color: #7f9bb5; letter-spacing: 0.04em; }
    .station-panel__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .station-panel__actions button { padding: 12px; background: #122436; color: #cfe3f5; cursor: pointer;
      border: 1px solid #2a4a6a; border-radius: 8px; font-size: 0.95rem; transition: background 0.15s; }
    .station-panel__actions button:hover { background: #1b3450; }
    .station-panel__actions button small { color: #7f9bb5; }
    .station-panel__takeoff { grid-column: 1 / -1; background: #3a1b22 !important; border-color: #6a2a3a !important; }
    .station-panel__disembark { grid-column: 1 / -1; background: #16302a !important; border-color: #2f6a52 !important; color: #bdeccf !important; }
    .station-panel__log { margin-top: 18px; display: flex; flex-direction: column; gap: 12px; }
    .station-panel__event { background: rgba(10, 20, 32, 0.6); border: 1px solid #1d3146; border-radius: 8px;
      padding: 10px 12px; }
    .station-panel__event h3 { margin: 0 0 6px; font-size: 0.95rem; color: #9ec9ff; }
    .station-panel__event p { margin: 2px 0; font-size: 0.88rem; line-height: 1.35; }
    .tone-info { color: #b8cfe6; }
    .tone-success { color: #7ee0a0; }
    .tone-warning { color: #e6c87e; }
    .tone-danger { color: #e88a8a; }
  `],
})
export class StationLandingPanelComponent implements OnChanges {
  @Input() visible = false;
  @Input() stationName = 'Estación';
  @Input() portName = 'Puerto espacial';
  @Output() takeoff = new EventEmitter<void>();

  protected log: StationActionResult[] = [];

  constructor(
    private readonly station: StationLandingService,
    private readonly disembark: DisembarkService,
    private readonly presentation: PresentationService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  /** "Bajar de la nave" (placeholder: la experiencia propia está por implementar; sin salto externo). */
  protected onDisembark(): void {
    this.disembark.disembark({ kind: 'station' });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !this.visible) {
      this.log = [];
    }
  }

  /** Buscar: primero la PRESENTACIÓN de cómic (viñetas 'Base'); al terminar, el desenlace en el log. */
  protected onSearch(): void {
    if (this.presentation.isActive()) {
      return;
    }
    void this.presentation.play('Base').then(() => {
      this.log.unshift(this.station.search());
      this.cdr.detectChanges(); // zoneless: la continuación async no dispara change detection sola
    });
  }
  protected onRest(): void { this.log.unshift(this.station.rest()); }
  protected onRefuel(): void { this.log.unshift(this.station.refuelVoid()); }
  protected onTakeoff(): void { this.takeoff.emit(); }

  @HostListener('wheel', ['$event'])
  handleWheel(event: WheelEvent): void {
    event.stopPropagation();
  }
}
