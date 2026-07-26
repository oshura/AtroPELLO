import { Injectable } from '@angular/core';
import { PlanetType } from '../../game/game-objects/Planet';
import { LoggingService, LogCategory } from '../logging.service';

/** Sitio de aterrizaje/atraque desde el que el jugador puede "bajar de la nave" al juego 2D. */
export type DisembarkSite =
  | { kind: 'station' }
  | { kind: 'planet'; planetType?: PlanetType };

// URL del juego 2D "The Old and Only One" (motor ReTimeline). Mismo dominio raíz → cookie de sesión
// `atropello-session` compartida ⇒ login transparente (sin CORS ni re-login).
const TILE_GAME_URL = 'https://r-menace.atropello-games.es/oldone.html';

/**
 * "Bajar de la nave": salta al juego 2D de tiles (ReTimeline) en el mundo que corresponde al sitio de
 * aterrizaje. **v1 = nueva pestaña** (sin guardar/restaurar el estado del 3D; el panel queda aparcado en su
 * pestaña con el input ya bloqueado). La VUELTA la gestiona el 2D (reentrar en la nave → cierra su pestaña →
 * caes en la del 3D). Contrato de códigos `entry`: CANÓNICO en `ReTimeline/docs/PLAN-OLDONE.md §4`.
 * Ver `documentation/Plan_Desembarco_2D.md`. (Regla CLAUDE.md: lógica fuera de GameEngine; servicio puro.)
 */
@Injectable({ providedIn: 'root' })
export class DisembarkService {
  constructor(private readonly logger: LoggingService) {}

  /**
   * Mapa PURO sitio → código `entry` del 2D. `null` = ese sitio no tiene mundo 2D (el botón NO se muestra).
   * Códigos NUEVOS = fila en `ENTRY_POINTS` del 2D + fila en el contrato §4 + case aquí (PR en los dos repos).
   */
  landingContextToEntryCode(site: DisembarkSite): string | null {
    if (site.kind === 'station') {
      return 'estacion-humana';
    }
    if (site.kind === 'planet') {
      switch (site.planetType) {
        case PlanetType.Sun:
          return null;                 // el Sol no es aterrizable
        case PlanetType.Tierra:
          return 'planeta-tierra';     // la Tierra partida (mundo propio)
        default:
          return 'planeta-rocoso';     // bioma rocoso genérico (un mundo 2D reutilizable por N planetas)
      }
    }
    return null;
  }

  /** ¿Hay mundo 2D para este sitio? (decide si el panel muestra el botón "Bajar de la nave"). */
  canDisembark(site: DisembarkSite): boolean {
    return this.landingContextToEntryCode(site) !== null;
  }

  /**
   * Abre el 2D (nueva pestaña) en el punto `entry`. Añade `return` (URL del 3D) como fallback por si el 2D
   * no puede autocerrar su pestaña. Devuelve true si había mapeo y se intentó abrir.
   */
  disembark(site: DisembarkSite): boolean {
    const code = this.landingContextToEntryCode(site);
    if (!code) {
      return false;
    }
    this.openTileGame(code);
    return true;
  }

  private openTileGame(entryCode: string): void {
    const ret = typeof window !== 'undefined' && window.location ? window.location.href : '';
    const url = `${TILE_GAME_URL}?entry=${encodeURIComponent(entryCode)}` +
      (ret ? `&return=${encodeURIComponent(ret)}` : '');
    try {
      this.logger.info(LogCategory.LANDING, 'Bajar de la nave → juego 2D', { entryCode, url });
      window.open(url, '_blank');
    } catch (e) {
      this.logger.warn(LogCategory.LANDING, 'No se pudo abrir el juego 2D', { entryCode, error: String(e) });
    }
  }
}
