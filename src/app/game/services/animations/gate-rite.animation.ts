import { GameAnimation } from './types';
import { ITargetable, TargetType } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { SolarSystemSerializer } from '../game/solar-system-serializer';
import { SystemGeneratorService } from '../game/system-generator.service';
import { SolarSystemService } from '../game/solar-system.service';
import { Portal } from '../../Portal';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameLogger } from '../../utils/GameLogger';

enum GateRitePhase {
  PreFocus = 0,
  CameraZoomOut = 1,
  PlanetWrapper = 2,
  PlanetCollapse = 3,
  PortalManifest = 4,
  Transit = 5,
  PlasmaBall = 6,
  Completed = 7,
}

export class GateRiteAnimation implements GameAnimation {
  public readonly name = 'gate-rite';
  private phase: GateRitePhase = GateRitePhase.PreFocus;
  private t = 0; // seconds within current phase
  private targetPlanet: ITargetable | null = null;
  private finished = false;
  private prevCameraMode: CameraMode | null = null;
  private originalSnapshot: any | null = null; // SolarSystemSnapshot
  private collapseElapsed = 0;
  private collapseDuration = 3.0; // seconds planet collapse effect (base before scaling)
  private collapseStartScale: number | null = null; // capture once to avoid exponential shrink
  private collapseStormTime = 0; // accumulates for storm shell animation
  private manifestElapsed = 0;
  private manifestDuration = 10.0; // seconds portal materialize (spec: 10s emergence)
  private transitElapsed = 0;
  private transitDuration = 1.2; // seconds warp through portal
  private plasmaElapsed = 0;
  private plasmaDuration = 2.5; // seconds after transit
  private portalInstance: Portal | null = null;
  private generator: SystemGeneratorService | null = null; // lazy resolved from engine injector if needed

  // Camera zoom state
  private zoomDuration = 2.5; // seconds (base before scaling)
  private zoomElapsed = 0;
  private initialCamPos: { x: number; y: number; z: number } | null = null;
  private initialCamTarget: { x: number; y: number; z: number } | null = null;
  private targetDistanceMultiplier = 4; // heuristic to frame planet

  start(engine: GameEngine, target: ITargetable): void {
    if (target.getTargetType() !== TargetType.PLANET) { this.finished = true; return; }
    this.targetPlanet = target;
    this.phase = GateRitePhase.PreFocus;
    this.t = 0;
    this.finished = false;
    try { (engine as any).showPlaceholderText?.('GATE RITE: INIT', 900); } catch {}
    // Seed manual camera with current active transform, then switch to MANUAL to prevent ship overrides
    try {
      const cam: any = (engine as any).camera;
      if (cam?.getCurrentMode && cam?.setCameraMode) {
        this.prevCameraMode = cam.getCurrentMode();
        const seedPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
        const seedTarget = { x: cam.target.x, y: cam.target.y, z: cam.target.z };
        const seedUp = { x: cam.up.x, y: cam.up.y, z: cam.up.z };
        cam.setCameraMode(CameraMode.MANUAL);
        // After switching, reapply previous transform to manual camera to avoid jump
        cam.seedManualTransform?.(seedPos, seedTarget, seedUp);
      }
    } catch {}
    this.enterCameraZoomOut(engine);
    // Capture snapshot NOW (including debris + portals) for later persistence/reference
    try {
      this.originalSnapshot = SolarSystemSerializer.fromState({
        sun: engine['primarySun'] ? { id: engine['primarySun'].id, name: engine['primarySun'].customName, position: { ...engine['primarySun'].position }, scale: { ...engine['primarySun'].scale } } : null,
        planets: engine['planets']?.map((p: any) => ({
          id: p.id,
          customName: p.customName,
          position: { ...p.position },
          scale: { ...p.scale },
          planetType: p.planetType,
          baseColorName: p.baseColorName,
          probabilityOfLifePct: p.probabilityOfLifePct,
          orbitCenter: p.orbitCenter,
          semiMajor: p.semiMajor,
          semiMinor: p.semiMinor,
          orbitOrientation: p.orbitOrientation,
          orbitAngle: p.orbitAngle,
          orbitAngularSpeed: p.orbitAngularSpeed,
          orbitNormal: p.orbitNormal,
          orbitU: p.orbitU,
        })) || [],
        clusters: engine['asteroidClusterService']?.getClusters?.()?.map((c: any) => ({
          id: c.id,
          center: { ...c.center },
          direction: { ...c.direction },
          speed: c.speed,
          count: c.objects?.length || 0,
          includeSuper: true,
          radius: c.radius || 12,
          centerSpeedFactor: c.centerSpeedFactor || 0.5,
        })) || [],
        planetDebris: (() => {
          const out: any[] = [];
          try {
            const debrisMap: Map<string, Array<{ obj: any; local: { x:number;y:number;z:number } }>> = engine['planetDebris'];
            if (debrisMap) {
              for (const [planetId, items] of debrisMap.entries()) {
                for (const d of items) {
                  out.push({ id: d.obj.id, planetId, localOffset: { ...d.local }, size: d.obj.scale?.x, type: 'mega' });
                }
              }
            }
          } catch {}
          return out;
        })()
      });
      // Persist original snapshot if portal persistence is available (only once per rite start)
      try {
        const persistence: any = (engine as any)['portalPersistenceService'];
        if (persistence && this.originalSnapshot) {
          persistence.autoLabelAndSave?.('gate-origin', this.originalSnapshot);
        }
      } catch {}
  } catch (e) { try { GameLogger.warn(LogCategory.ANIMATION, 'GateRite snapshot failed', e); } catch {} }
  }

  private enterCameraZoomOut(engine: GameEngine) {
  this.phase = GateRitePhase.CameraZoomOut;
  this.zoomElapsed = 0;
  // Apply new design timings: zoom lasts 3× original base duration
  this.zoomDuration = 2.5 * 3.0;
    const cam: any = (engine as any).camera;
    if (cam) {
      this.initialCamPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      this.initialCamTarget = cam.target ? { x: cam.target.x, y: cam.target.y, z: cam.target.z } : null;
    }
  try { (engine as any).showPlaceholderText?.('GATE RITE: CAMERA ZOOM', 800); } catch {}
  }

  update(engine: GameEngine, dt: number): boolean {
    if (this.finished) return true;
    switch (this.phase) {
      case GateRitePhase.CameraZoomOut:
        this.updateCameraZoomOut(engine, dt);
        break;
      case GateRitePhase.PlanetWrapper:
        this.updatePlanetWrapper(engine, dt);
        break;
      case GateRitePhase.PlanetCollapse:
        this.updatePlanetCollapse(engine, dt);
        break;
      case GateRitePhase.PortalManifest:
        this.updatePortalManifest(engine, dt);
        break;
      case GateRitePhase.Transit:
        this.updateTransit(engine, dt);
        break;
      case GateRitePhase.PlasmaBall:
        this.updatePlasmaBall(engine, dt);
        break;
      default:
        break; // future phases
    }
    return this.finished;
  }

  private updateCameraZoomOut(engine: GameEngine, dt: number) {
    if (!this.targetPlanet) { this.finishEarly(engine, 'NO TARGET'); return; }
    const cam: any = (engine as any).camera;
    if (!cam || !this.initialCamPos) { this.finishEarly(engine, 'NO CAM'); return; }

  this.zoomElapsed += dt;
  const tNorm = Math.min(1, this.zoomElapsed / this.zoomDuration);
  // Logarithmic progression (slower early, accelerates): log(1 + a*x)/log(1+a)
  const a = 9.0; // shape factor
  const eased = Math.log(1 + a * tNorm) / Math.log(1 + a);

  const planetPos: any = (this.targetPlanet as any).position;
  const planetRadius: number = (this.targetPlanet as any).scale?.x || (this.targetPlanet as any).radius || 10;
    const dirX = cam.position.x - planetPos.x;
    const dirY = cam.position.y - planetPos.y;
    const dirZ = cam.position.z - planetPos.z;
    const len = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ) || 1;
    const normX = dirX / len;
    const normY = dirY / len;
    const normZ = dirZ / len;
  // Compute desired distance: ensure projected planet occupies <=45% of viewport height (simple heuristic)
  // Frame planet such that it occupies ~45% of vertical FOV. distance ≈ radius / tan(FOV*0.45)
  const fov = cam.getFovRadians?.() || (45 * Math.PI/180);
  const framingDist = planetRadius / Math.max(0.05, Math.tan(fov * 0.45));
  const desiredDistance = Math.max(len, framingDist);
    const endX = planetPos.x + normX * desiredDistance;
    const endY = planetPos.y + normY * desiredDistance;
    const endZ = planetPos.z + normZ * desiredDistance;

  // Interpolate camera position
    cam.position.x = this.initialCamPos.x + (endX - this.initialCamPos.x) * eased;
    cam.position.y = this.initialCamPos.y + (endY - this.initialCamPos.y) * eased;
    cam.position.z = this.initialCamPos.z + (endZ - this.initialCamPos.z) * eased;
    if (cam.target) {
      cam.target.x = planetPos.x;
      cam.target.y = planetPos.y;
      cam.target.z = planetPos.z;
    }
  cam.markDirty?.();

    if (tNorm >= 1) {
      // Transition to wrapper phase instead of completing
      this.enterPlanetWrapper(engine);
    }
  }

  private wrapperDuration = 2.0; // seconds
  private wrapperElapsed = 0;
  private cameraJitterAmp = 0.4; // amplitude of subtle jitter
  private baseCamPos: {x:number;y:number;z:number} | null = null;

  private enterPlanetWrapper(engine: GameEngine) {
    this.phase = GateRitePhase.PlanetWrapper;
    this.wrapperElapsed = 0;
    const cam: any = (engine as any).camera;
    if (cam) this.baseCamPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  }

  private updatePlanetWrapper(engine: GameEngine, dt: number) {
    this.wrapperElapsed += dt;
    const k = Math.min(1, this.wrapperElapsed / this.wrapperDuration);
    // Show a temporary overlay text only once at start (not every frame)
    if (this.wrapperElapsed < dt + 0.0001) {
      try { (engine as any).showPlaceholderText?.('Gate Rite: Wrapping', 900); } catch {}
    }
    // Camera jitter: small per-axis sin noise scaled by (0→peak at mid→0)
    const cam: any = (engine as any).camera;
    if (cam && this.baseCamPos) {
      const midPulse = Math.sin(k * Math.PI); // 0→1→0
      const jA = this.cameraJitterAmp * midPulse;
      cam.position.x = this.baseCamPos.x + Math.sin(this.wrapperElapsed * 6.2) * jA;
      cam.position.y = this.baseCamPos.y + Math.sin(this.wrapperElapsed * 4.7 + 1.3) * jA * 0.6;
      cam.position.z = this.baseCamPos.z + Math.sin(this.wrapperElapsed * 5.4 + 2.1) * jA * 0.4;
      cam.markDirty?.();
    }
    // When finished wrapper phase, TEMP: end animation (later will proceed to collapse)
    if (k >= 1) {
      this.enterPlanetCollapse(engine);
    }
  }

  private enterPlanetCollapse(engine: GameEngine) {
    this.phase = GateRitePhase.PlanetCollapse;
    this.collapseElapsed = 0;
    // Extend collapse to 5× original duration
    this.collapseDuration = 3.0 * 5.0;
    // Capture initial planet scale ONCE to drive a linear shrink over the whole duration
    try {
      const p: any = this.targetPlanet as any;
      if (p && p.scale) {
        this.collapseStartScale = Number(p.scale.x);
        // Expose for any renderers that may read it (defensive)
        p.originalScaleX = this.collapseStartScale;
      }
    } catch {}
    try { (engine as any).showPlaceholderText?.('Gate Rite: Collapse', 900); } catch {}
  }

  private updatePlanetCollapse(engine: GameEngine, dt: number) {
    this.collapseElapsed += dt;
    this.collapseStormTime += dt;
    const p = this.targetPlanet as any;
    if (p) {
      const k = Math.min(1, this.collapseElapsed / this.collapseDuration);
      // Ease-in-out (cubic) for tectonic feel
      const easeInOutCubic = (x: number) => (x < 0.5) ? (4 * x * x * x) : (1 - Math.pow(-2 * x + 2, 3) / 2);
      const ke = easeInOutCubic(k);
      const shrink = Math.max(0.05, 1 - ke * 0.92); // shrink towards ~8% before disappearing
      if (p.scale) {
        const base = (this.collapseStartScale !== null && isFinite(this.collapseStartScale))
          ? this.collapseStartScale
          : Number(p.scale.x);
        p.scale.x = p.scale.y = p.scale.z = base * shrink;
      }
      // Simple fade via renderOpacity if available
      if (typeof p.renderOpacity === 'number') {
        // Sync fade with eased progression
        p.renderOpacity = Math.max(0, 1 - ke);
      } else {
        p.renderOpacity = Math.max(0, 1 - ke);
      }
      // Flag to request a storm shell overlay during collapse (consumed by GameEngine render)
      p._gateRiteStormShell = {
        time: this.collapseStormTime,
        intensity: 1.0 - Math.abs(0.5 - k) * 1.6, // peak mid-collapse (keep center-peaked on linear k)
        flash: (k < 0.15 || (k > 0.85)) ? 0.8 : Math.max(0, 1.0 - k * 1.2),
      };
    }
    if (this.collapseElapsed >= this.collapseDuration) {
      // Remove planet from engine arrays/catalog
      try {
        const planets: any[] = engine['planets'];
        engine['planets'] = planets.filter(pl => pl.id !== p.id);
        // Remove from target catalog (re-register PLANET bucket)
        const tc = engine['targetCatalog'];
        if (tc) {
          const remaining = planets.filter(pl => pl.id !== p.id) as any[];
          tc.register(TargetType.PLANET, remaining as any);
        }
      } catch {}
      this.enterPortalManifest(engine);
    }
  }

  private enterPortalManifest(engine: GameEngine) {
    this.phase = GateRitePhase.PortalManifest;
    this.manifestElapsed = 0;
    // Create portal instance at former planet position
    try {
      const pos = (this.targetPlanet as any)?.position ? { ...(this.targetPlanet as any).position } : { x:0,y:0,z:0 };
      const baseR = (this as any).collapseStartScale && isFinite((this as any).collapseStartScale)
        ? (this as any).collapseStartScale
        : (((this.targetPlanet as any)?.scale?.x) || 120);
      const logger: LoggingService | undefined = (engine as any)?.logger as LoggingService | undefined;
      const portal = new Portal('portal-gaterite', pos, Math.max(60, Number(baseR)), logger);
      this.portalInstance = portal;
      const gl = (engine as any).gl;
      if (gl && !portal.vertexBuffer) portal.initBuffers(gl);
      // Register portal
      const portalsArr = (engine as any)['portals'];
      if (Array.isArray(portalsArr)) portalsArr.push(portal);
      (engine as any)['targetCatalog']?.add?.(TargetType.PORTAL, portal);
      try { logger?.log(LogLevel.INFO, LogCategory.PORTAL, 'Portal manifest created', { id: portal.id, radius: portal.radius, pos }); } catch {}
    } catch (e) {
      try { ((engine as any)?.logger as LoggingService | undefined)?.log(LogLevel.ERROR, LogCategory.PORTAL, 'Portal manifest failed', e); } catch {}
    }
    try { (engine as any).showPlaceholderText?.('Gate Rite: Portal', 1000); } catch {}
  }

  private updatePortalManifest(engine: GameEngine, dt: number) {
    this.manifestElapsed += dt;
    const k = Math.min(1, this.manifestElapsed / this.manifestDuration);
    if (this.portalInstance) {
      const s = 0.1 + k * 0.9; // scale up from tiny to full
      this.portalInstance.scale.x = this.portalInstance.scale.y = this.portalInstance.scale.z = this.portalInstance.radius * s;
      (this.portalInstance as any).renderOpacity = Math.min(1, k * 1.2);
      // Camera orbit: move camera around portal at 45° lateral and +15° pitch over full manifest duration
      try {
        const cam: any = (engine as any).camera;
        if (cam) {
          const center = this.portalInstance.position;
          const orbitAngle = k * (Math.PI * 1.5); // ~270°
          const radius = this.portalInstance.radius * 4.5; // heuristic orbit distance
          const pitch = 15 * Math.PI/180;
          const ox = center.x + Math.cos(orbitAngle) * radius;
          const oz = center.z + Math.sin(orbitAngle) * radius;
          const oy = center.y + Math.sin(pitch) * radius * 0.35;
          cam.position.x = ox;
          cam.position.y = oy;
          cam.position.z = oz;
          cam.target.x = center.x;
          cam.target.y = center.y;
          cam.target.z = center.z;
          cam.markDirty?.();
        }
      } catch {}
      // Ship orientation gradually towards portal
      try {
        const ship: any = (engine as any)['spaceship'];
        if (ship && ship.position) {
          const dx = this.portalInstance.position.x - ship.position.x;
          const dy = this.portalInstance.position.y - ship.position.y;
          const dz = this.portalInstance.position.z - ship.position.z;
          const yaw = Math.atan2(dx, dz); // assuming Z forward original
          // Interpolate yaw (simple)
          ship.rotation.y = ship.rotation.y + (yaw - ship.rotation.y) * 0.05;
          ship.updateModelMatrix();
        }
      } catch {}
    }
    if (this.manifestElapsed >= this.manifestDuration) {
      this.enterTransit(engine);
    }
  }

  private enterTransit(engine: GameEngine) {
    this.phase = GateRitePhase.Transit;
    this.transitElapsed = 0;
    try { (engine as any).showPlaceholderText?.('Gate Rite: Transit', 800); } catch {}
    // Lazy resolve generator via Angular injector pattern (fallback new)
    try { this.generator = (engine as any)['systemGeneratorService'] || this.generator || null; } catch {}
  }

  private updateTransit(engine: GameEngine, dt: number) {
    this.transitElapsed += dt;
    const k = Math.min(1, this.transitElapsed / this.transitDuration);
    // Simple camera push-in effect toward portal center
    if (this.portalInstance) {
      const cam: any = (engine as any).camera;
      if (cam) {
        const cpos = cam.position;
        const target = this.portalInstance.position;
        cpos.x += (target.x - cpos.x) * 0.05 * dt * (1 + k * 4);
        cpos.y += (target.y - cpos.y) * 0.05 * dt * (1 + k * 4);
        cpos.z += (target.z - cpos.z) * 0.05 * dt * (1 + k * 4);
        cam.target.x = target.x;
        cam.target.y = target.y;
        cam.target.z = target.z;
        cam.markDirty?.();
      }
    }
    if (this.transitElapsed >= this.transitDuration) {
      // Generate and apply a new system snapshot, adding a paired destination portal
      try {
        const solarSvc: SolarSystemService | undefined = (engine as any)['solarSystemService'];
        const originPortal = this.portalInstance ? {
          id: this.portalInstance.id,
          position: { ...this.portalInstance.position },
          radius: this.portalInstance.radius,
          linkedPortalId: undefined,
          eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
        } : null;
        let snapshot: any = null; // SolarSystemSnapshot
        if (solarSvc && originPortal) {
          snapshot = solarSvc.generateWithLinkedPortal(originPortal);
        } else if (this.generator) {
          snapshot = this.generator.generate(Date.now());
        }
        if (snapshot && (engine as any).applySolarSystemSnapshot) {
          // If we generated with linked portal, update origin portal's link to the new portal id
          try {
            const dest = (snapshot.portals && snapshot.portals.length) ? snapshot.portals[snapshot.portals.length - 1] : null;
            if (dest && this.portalInstance) {
              this.portalInstance.linkedPortalId = dest.id;
            }
          } catch {}
          (engine as any).applySolarSystemSnapshot(snapshot);
          try { GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite transit applied new system', { id: snapshot.id }); } catch {}
          // Persist generated snapshot
          try {
            const persistence: any = (engine as any)['portalPersistenceService'];
            if (persistence && snapshot) {
              persistence.autoLabelAndSave?.('gate-generated', snapshot);
            }
          } catch {}
        }
      } catch (e) { try { GameLogger.warn(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite transit apply failed', e); } catch {} }
      this.enterPlasmaBall(engine);
    }
  }

  private enterPlasmaBall(engine: GameEngine) {
    this.phase = GateRitePhase.PlasmaBall;
    this.plasmaElapsed = 0;
    try { (engine as any).showPlaceholderText?.('Gate Rite: Plasma', 900); } catch {}
  }

  private updatePlasmaBall(engine: GameEngine, dt: number) {
    this.plasmaElapsed += dt;
    const k = Math.min(1, this.plasmaElapsed / this.plasmaDuration);
    // Minimal effect: fade overlay (future particle system)
    if (k >= 1) {
      this.phase = GateRitePhase.Completed;
      this.finished = true;
      // Restore camera mode
      try {
        const cam2: any = (engine as any).camera;
        if (cam2?.setCameraMode && this.prevCameraMode !== null) cam2.setCameraMode(this.prevCameraMode);
      } catch {}
    }
  }

  private finishEarly(engine: GameEngine, reason: string) {
    try { (engine as any).showPlaceholderText?.('GATE RITE ABORT: ' + reason, 1800); } catch {}
    this.phase = GateRitePhase.Completed;
    this.finished = true;
    // Restore camera if we changed it
    try {
      const cam: any = (engine as any).camera;
      if (cam?.setCameraMode && this.prevCameraMode !== null) {
        cam.setCameraMode(this.prevCameraMode);
      }
    } catch {}
  }

  render(_engine: GameEngine): void { /* future visuals */ }

  isBlockingInputs(): boolean { return !this.finished; }
}
