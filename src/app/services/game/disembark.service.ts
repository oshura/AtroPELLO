import { Injectable } from '@angular/core';
import { PlanetType } from '../../game/game-objects/Planet';
import { LoggingService, LogCategory } from '../logging.service';

/** Sitio de aterrizaje/atraque desde el que el jugador puede "bajar de la nave". */
export type DisembarkSite =
  | { kind: 'station' }
  | { kind: 'planet'; planetType?: PlanetType };

/**
 * "Bajar de la nave" — PLACEHOLDER. El salto al juego 2D externo (ReTimeline, `oldone.html?entry=…`)
 * se RETIRÓ a petición del usuario (2026-08-16): ya no se abre ningún otro juego ni se pasa parámetro
 * `entry`/`return`. El botón de los paneles SE CONSERVA porque aquí se implementará otra experiencia
 * de desembarco propia. Ver `documentation/Plan_Desembarco_2D.md`.
 */
@Injectable({ providedIn: 'root' })
export class DisembarkService {
  constructor(private readonly logger: LoggingService) {}

  /** ¿Tiene sentido "bajar de la nave" en este sitio? (decide si el panel muestra el botón). */
  canDisembark(site: DisembarkSite): boolean {
    if (site.kind === 'station') {
      return true;
    }
    if (site.kind === 'planet') {
      return site.planetType !== PlanetType.Sun; // el Sol no es aterrizable
    }
    return false;
  }

  /** Acción del botón: de momento solo deja constancia (la experiencia nueva está por implementar). */
  disembark(site: DisembarkSite): boolean {
    if (!this.canDisembark(site)) {
      return false;
    }
    this.logger.info(LogCategory.LANDING, 'Bajar de la nave: experiencia propia pendiente de implementar', { site });
    return true;
  }
}
