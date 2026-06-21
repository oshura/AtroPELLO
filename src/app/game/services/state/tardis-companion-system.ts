import { Vector3 } from '../../../types/game.types';
import { TardisObject, isWithinVanishRange, TARDIS_VANISH_RADIUS } from '../../game-objects/TardisObject';
import { CargoItemType, RarityTier, CargoManifestEntry } from '../../types/inventory.types';
import { GameObjectType } from '../../types/game-object.types';

/** Puente del sistema con los subsistemas del motor (todo via host para no acoplar a GameEngine). */
export interface TardisCompanionHost {
  getShipPosition(): Vector3 | null;
  spawnVanishFlash(pos: Vector3): void;
  playVanishCue(): void;
  destroyCompanion(obj: TardisObject): void;
  addCargoEntry(entry: CargoManifestEntry): void;
  emitMarquee(text: string): void;
  log(message: string, data?: unknown): void;
}

/**
 * Lógica de la TARDIS compañera, FUERA del GameEngine (regla dura #1). El motor solo: la registra al
 * crearla, llama `update` una vez por frame, y avisa a `onObjectDestroyed` desde su destrucción. El sistema
 * decide la desaparición por proximidad (sin premio) y el premio por destruirla/lotearla ("Materia oscura
 * de Gallifrey"). docs/ARQUITECTURA.md Fase 6.4 (companions).
 */
export class TardisCompanionSystem {
  private companion: TardisObject | null = null;
  private vanishing = false;

  get isVanishing(): boolean {
    return this.vanishing;
  }

  register(obj: TardisObject): void {
    this.companion = obj;
    this.vanishing = false;
  }

  clear(): void {
    this.companion = null;
    this.vanishing = false;
  }

  /** O(1)/frame: si la nave entra en el radio de la TARDIS, ésta huye (destello, SIN premio). */
  update(host: TardisCompanionHost): void {
    const tardis = this.companion;
    if (!tardis) {
      return;
    }
    const ship = host.getShipPosition();
    if (!ship) {
      return;
    }
    if (isWithinVanishRange(ship, tardis.position, TARDIS_VANISH_RADIUS)) {
      this.vanish(host);
    }
  }

  /** El motor lo invoca desde su destrucción de objetos: si es la TARDIS y NO está huyendo → premio. */
  onObjectDestroyed(obj: { isTardis?: boolean } | null | undefined, host: TardisCompanionHost): void {
    if (obj?.isTardis && !this.vanishing) {
      this.awardReward(host);
    }
  }

  private vanish(host: TardisCompanionHost): void {
    const tardis = this.companion;
    if (!tardis) {
      return;
    }
    this.companion = null;
    host.spawnVanishFlash({ ...tardis.position });
    host.playVanishCue();
    host.log('TARDIS vanished on ship proximity (escaped, no reward)');
    // Huida: limpieza por el camino probado de destrucción, pero marcada para NO otorgar premio.
    this.vanishing = true;
    try {
      host.destroyCompanion(tardis);
    } finally {
      this.vanishing = false;
    }
  }

  private awardReward(host: TardisCompanionHost): void {
    const entry: CargoManifestEntry = {
      id: 'gallifrey-dark-matter',
      type: CargoItemType.ARTIFACT,
      label: 'Materia oscura de Gallifrey',
      massTons: 0.002,
      units: 1,
      source: GameObjectType.MEGA_ASTEROID,
      rarity: RarityTier.UNIQUE,
      notes: 'Sustraída de la cabina de un viajero del tiempo antes de su huida por el vacío.',
    };
    host.addCargoEntry(entry);
    host.emitMarquee('¡Materia oscura de Gallifrey capturada!');
    host.log('TARDIS looted: Gallifrey dark matter awarded');
  }
}
