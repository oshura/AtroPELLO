import { Vector3 } from '../../../types/game.types';
import { Planet } from '../../game-objects/Planet';
import { Spaceship } from '../../game-objects/Spaceship';

/**
 * Void Kinesis sobre PLANETAS (Fase 15 — "la cirugía" de los Mi-Go).
 *
 * El mismo rito que condensa asteroides puede, bien canalizado, beberse la void mass de un mundo
 * entero: el planeta encoge durante el canal mientras su masa pasa al depósito de la nave, y al
 * consumarse desaparece — sin portal y sin residuo (a diferencia del Gate Rite, que abre puerta).
 *
 * Clase plana con host (patrón VoidKinesisBeam / ARQUITECTURA §5.3): posee el estado del canal y el
 * encogido; el motor pone la retirada del planeta (`consumePlanet`), la energía y el render del haz.
 */
export interface PlanetDrainBeamHost {
  getSpaceship(): Spaceship | null;
  /** ¿El planeta sigue vivo y en el sistema? (otro rito pudo llevárselo antes). */
  isPlanetAlive(planet: Planet): boolean;
  /** Ingresa energía del vacío (el host clampa a la capacidad). Devuelve lo realmente ingresado. */
  addVoidEnergy(amount: number): number;
  /** Consuma el drenaje: retira el planeta del mundo y dispara las consecuencias. */
  consumePlanet(planet: Planet): void;
  logInfo(message: string, data?: unknown): void;
}

/** Duración del canal completo (s): un mundo no se bebe en un trago. */
export const PLANET_DRAIN_DURATION_SEC = 20;
/** Escala mínima antes de consumar (el planeta "se hace pixel"). */
const MIN_SCALE = 0.02;

interface DrainState {
  planet: Planet;
  elapsedSec: number;
  baseScale: Vector3;
  /** Void mass total a transferir (fijada al empezar; lo que había en el mundo). */
  totalUnits: number;
  transferredUnits: number;
  startedAtMs: number;
}

export interface PlanetDrainRenderState {
  startPos: Vector3;
  endPos: Vector3;
  startedAtMs: number;
  /** 0..1 del canal (para modular el haz). */
  progress: number;
}

export class PlanetDrainBeam {
  private state: DrainState | null = null;

  get isActive(): boolean {
    return !!this.state;
  }

  /** Planeta en drenaje (para bloquear aterrizajes u otros ritos sobre él). */
  get drainingPlanetId(): string | null {
    return this.state?.planet.id ?? null;
  }

  get renderState(): PlanetDrainRenderState | null {
    const state = this.state;
    if (!state) {
      return null;
    }
    return {
      startPos: { x: 0, y: 0, z: 0 }, // el motor la sobreescribe con la nave al pintar
      endPos: { ...state.planet.position },
      startedAtMs: state.startedAtMs,
      progress: Math.min(1, state.elapsedSec / PLANET_DRAIN_DURATION_SEC),
    };
  }

  start(host: PlanetDrainBeamHost, planet: Planet): boolean {
    if (this.state || !host.getSpaceship()) {
      return false;
    }
    this.state = {
      planet,
      elapsedSec: 0,
      baseScale: { x: planet.scale.x, y: planet.scale.y, z: planet.scale.z },
      totalUnits: Math.max(0, Math.round(planet.voidMassUnits ?? 0)),
      transferredUnits: 0,
      startedAtMs: performance.now(),
    };
    host.logInfo('Planet drain started', {
      planetId: planet.id,
      voidMassUnits: this.state.totalUnits,
      durationSec: PLANET_DRAIN_DURATION_SEC,
    });
    return true;
  }

  cancel(): void {
    // El mundo queda a medio beber (encogido): las cicatrices se quedan.
    this.state = null;
  }

  update(host: PlanetDrainBeamHost, deltaTime: number): void {
    const state = this.state;
    if (!state) {
      return;
    }
    const planet = state.planet;
    if (!host.isPlanetAlive(planet)) {
      this.state = null;
      return;
    }
    state.elapsedSec += deltaTime;
    const progress = Math.min(1, state.elapsedSec / PLANET_DRAIN_DURATION_SEC);

    // Transferencia proporcional al avance del canal (independiente del framerate).
    const dueUnits = Math.floor(state.totalUnits * progress);
    const pending = dueUnits - state.transferredUnits;
    if (pending > 0) {
      host.addVoidEnergy(pending);
      state.transferredUnits = dueUnits;
    }

    // Encogido: de 1 → MIN_SCALE, cuadrático (al principio apenas se nota; al final se desploma).
    const scalar = Math.max(MIN_SCALE, 1 - (1 - MIN_SCALE) * progress * progress);
    planet.scale = {
      x: state.baseScale.x * scalar,
      y: state.baseScale.y * scalar,
      z: state.baseScale.z * scalar,
    };
    planet.updateModelMatrix();
    if (planet.boundingSphere) {
      planet.boundingSphere.radius = Math.max(0.5, planet.scale.x);
    }

    if (progress >= 1) {
      const drained = state.transferredUnits;
      this.state = null;
      host.consumePlanet(planet);
      host.logInfo('Planet drain completed', { planetId: planet.id, drained });
    }
  }
}
