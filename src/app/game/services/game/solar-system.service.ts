import { Injectable } from '@angular/core';
import { SystemGeneratorService } from './system-generator.service';
import { GenerationOptions, RNGSeed, SolarSystemSnapshot, PortalSnapshot } from '../../types/solar-system.types';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';
import { Vector3 } from '../../../types/game.types';

/**
 * SolarSystemService: generación procedural de sistemas y emparejado de portales.
 *
 * NOTA (Fase 6, docs/ARQUITECTURA.md): la aplicación de un snapshot al mundo vive
 * ÚNICAMENTE en `GameEngine.applySolarSystemSnapshot` (que delega los campos en los
 * códecs). La antigua copia paralela `apply()`/`snapshot()` de este servicio se eliminó
 * por estar muerta y duplicar la instanciación de planetas/portales.
 */
@Injectable({ providedIn: 'root' })
export class SolarSystemService {
  constructor(private generator: SystemGeneratorService) {}

  /** Generate a new procedural system snapshot using the generator with optional seed/options. */
  generate(seed?: RNGSeed, options?: GenerationOptions): SolarSystemSnapshot {
    const resolvedSeed = seed ?? Date.now();
    const snap = this.generator.generate(resolvedSeed, options);
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Procedural system generated', { seed: snap.seed, planets: snap.planets.length });
    return snap;
  }

  /** Proxy unique planet name generator for engine run-time usage. */
  public generateUniquePlanetName(): string {
    try { return this.generator.generateUniquePlanetName(); } catch { return 'Unnamed'; }
  }

  /** Utility to create a paired destination portal snapshot given an origin portal. */
  createPairedPortal(origin: PortalSnapshot, offset: Vector3): PortalSnapshot {
    const dest: PortalSnapshot = {
      id: `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      position: { x: origin.position.x + offset.x, y: origin.position.y + offset.y, z: origin.position.z + offset.z },
      radius: origin.radius,
      linkedPortalId: origin.id,
      eyeState: { gazeTarget: 'ship', eyelidOpen: 1, intensity: 1 }
    };
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Created paired portal snapshot', { origin: origin.id, dest: dest.id });
    return dest;
  }

  /** Convenience: generate a system and append a destination portal snapshot linked to origin. */
  generateWithLinkedPortal(originPortal: PortalSnapshot, seed?: RNGSeed, options?: GenerationOptions): SolarSystemSnapshot {
    const snap = this.generate(seed, options);
    const portalOffset: Vector3 = { x: 0, y: 0, z: 1000 }; // spawn ~1000u away along +Z (placeholder)
    const destPortal = this.createPairedPortal(originPortal, portalOffset);
    snap.portals = (snap.portals || []).concat(destPortal);
    GameLogger.debug(LogCategory.SOLAR_SYSTEM_GENERATION, 'Appended destination portal to snapshot', { portalId: destPortal.id });
    return snap;
  }
}
