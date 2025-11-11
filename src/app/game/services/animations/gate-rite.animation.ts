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
  CameraReframe = 5,
  Transit = 6,
  PlasmaBall = 7,
  FadeSwitch = 8,
  ArrivalDecel = 9,
  Completed = 10,
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
  private reframeElapsed = 0;
  private reframeDuration = 1.6; // seconds to rotate + gentle zoom after portal exists
  private transitElapsed = 0;
  private transitDuration = 1.2; // seconds warp through portal
  private plasmaElapsed = 0;
  private plasmaDuration = 2.5; // seconds after transit
  private plasmaCenter: { x:number;y:number;z:number } | null = null; // portal center (origin side)
  private plasmaDir: { x:number;y:number;z:number } | null = null; // direction away from portal (behind)
  private fadeElapsed = 0;
  private fadeDuration = 0.5; // seconds fade to switch systems & camera
  private arrivalElapsed = 0;
  private arrivalDuration = 2.5; // seconds to decelerate to 0 after spawn
  private portalInstance: Portal | null = null;
  private generator: SystemGeneratorService | null = null; // lazy resolved from engine injector if needed

  // Camera zoom state
  private zoomDuration = 2.5; // seconds (base before scaling)
  private zoomElapsed = 0;
  private initialCamPos: { x: number; y: number; z: number } | null = null;
  private initialCamTarget: { x: number; y: number; z: number } | null = null;
  private targetDistanceMultiplier = 4; // heuristic to frame planet
  // Reframe camera endpoints
  private reframeStart: { x:number;y:number;z:number } | null = null;
  private reframeEnd: { x:number;y:number;z:number } | null = null;
  private reframeTarget: { x:number;y:number;z:number } | null = null;
  // Transit ship path start
  private shipStartPos: { x:number;y:number;z:number } | null = null;

  start(engine: GameEngine, target: ITargetable): void {
    if (target.getTargetType() !== TargetType.PLANET) { this.finished = true; return; }
    this.targetPlanet = target;
    this.phase = GateRitePhase.PreFocus;
    this.t = 0;
    this.finished = false;
    try { (engine as any).showPlaceholderText?.('GATE RITE: INIT', 900); } catch {}
    // Pausar consumo de energía del vacío durante toda la animación
    try {
      const ship: any = (engine as any)['spaceship'];
      if (ship) ship.voidEnergyPaused = true;
    } catch {}
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
      case GateRitePhase.CameraReframe:
        this.updateCameraReframe(engine, dt);
        break;
      case GateRitePhase.Transit:
        this.updateTransit(engine, dt);
        break;
      case GateRitePhase.PlasmaBall:
        this.updatePlasmaBall(engine, dt);
        break;
      case GateRitePhase.FadeSwitch:
        this.updateFadeSwitch(engine, dt);
        break;
      case GateRitePhase.ArrivalDecel:
        this.updateArrivalDecel(engine, dt);
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
    // Suavizar aparición del "envolvente" del planeta: exponer alpha gradual para renderer
    try {
      const p: any = this.targetPlanet as any;
      if (p) {
        const alpha = Math.min(1, this.wrapperElapsed / 0.6); // fade-in sobre 0.6s
        p._gateRiteWrapperEnvelope = { alpha, time: this.wrapperElapsed };
      }
    } catch {}
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
      // Orientar el portal con la normal opuesta al forward de la nave para cruce perpendicular (incluye pitch)
      try {
        const ship: any = (engine as any)['spaceship'];
        if (ship && ship.rotation) {
          const yaw = Number(ship.rotation.y) || 0;
          const pitch = Number(ship.rotation.x) || 0;
          // La geometría del portal mira a +Z; para que mire a la nave, su normal debe ser -forward de la nave
          portal.rotation.x = -pitch; // invertir pitch para apuntar su normal contra el forward de la nave
          portal.rotation.y = yaw + Math.PI; // yaw opuesto
          portal.rotation.z = 0;
          portal.updateModelMatrix();
          // Alinear el ojo inicial con la normal del portal
          const n = {
            x: -Math.cos(pitch) * Math.sin(yaw),
            y: Math.sin(pitch),
            z: Math.cos(pitch) * Math.cos(yaw)
          };
          try { (portal as any).eyeDir = { ...n }; } catch {}
        }
      } catch {}
      // Capturar color base del planeta original para reutilizarlo en la esfera del ojo
      try {
        const p: any = this.targetPlanet as any;
        if (p && p.color) {
          portal.planetColorRef = { r: p.color.r ?? 0.4, g: p.color.g ?? 0.4, b: p.color.b ?? 0.4, a: p.color.a };
        }
      } catch {}
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
      // Apertura de párpados: empezar con abertura mínima para ver iris/pupila
      try { (this.portalInstance as any).eyelidOpen = Math.min(1, 0.15 + k * 0.85); } catch {}
      // Activar seguimiento de mirada pronto
      try {
        if (!this.portalInstance.eyeState) this.portalInstance.eyeState = { gazeTarget: 'ship', eyelidOpen: 1, intensity: 0.9 } as any;
        else this.portalInstance.eyeState.gazeTarget = 'ship' as any;
      } catch {}
      // Mantener la cámara QUIETA durante todo el manifest: sin órbitas ni saltos
      // No mover la nave: solo reorientar una vez al inicio del manifest (usar lookAt hacia el portal si existe)
      try {
        if (this.manifestElapsed < dt + 0.0001) {
          const ship: any = (engine as any)['spaceship'];
          if (ship && ship.position) {
            if (typeof ship.lookAt === 'function') {
              ship.lookAt({ x: this.portalInstance.position.x, y: this.portalInstance.position.y, z: this.portalInstance.position.z });
            } else {
              const dx = this.portalInstance.position.x - ship.position.x;
              const dy = this.portalInstance.position.y - ship.position.y;
              const dz = this.portalInstance.position.z - ship.position.z;
              const yaw = Math.atan2(dx, dz);
              const pitch = Math.atan2(dy, Math.hypot(dx, dz));
              ship.rotation.y = yaw;
              if (typeof ship.rotation.x === 'number') ship.rotation.x = pitch;
              ship.updateModelMatrix();
            }
          }
        }
      } catch {}
    }
    if (this.manifestElapsed >= this.manifestDuration) {
      this.enterCameraReframe(engine);
    }
  }

  private enterCameraReframe(engine: GameEngine) {
    this.phase = GateRitePhase.CameraReframe;
    this.reframeElapsed = 0;
    const cam: any = (engine as any).camera;
    if (!cam || !this.portalInstance) return;
    // Punto inicial: la posición actual (plano general)
    this.reframeStart = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const center = this.portalInstance.position;
    this.reframeTarget = { x: center.x, y: center.y, z: center.z };
    // Calcular un destino orbitando ~35° y acercando a ~3.2× radio
    const v = { x: cam.position.x - center.x, y: cam.position.y - center.y, z: cam.position.z - center.z };
    const dist = Math.hypot(v.x, v.y, v.z) || (this.portalInstance.radius * 4.5);
    const endDist = Math.max(this.portalInstance.radius * 3.2, dist * 0.72); // zoom-in suave
    const yaw = Math.atan2(v.z, v.x) + (Math.PI * 0.2); // +~36°
    const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)) + (Math.PI * 0.05); // +~9°
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    const ex = center.x + cosYaw * endDist * cosPitch;
    const ez = center.z + sinYaw * endDist * cosPitch;
    const ey = center.y + sinPitch * endDist * 0.6; // limitar altura
    this.reframeEnd = { x: ex, y: ey, z: ez };
  }

  private updateCameraReframe(engine: GameEngine, dt: number) {
    this.reframeElapsed += dt;
    const k = Math.min(1, this.reframeElapsed / Math.max(0.0001, this.reframeDuration));
    const ease = (x:number) => 1 - Math.pow(1 - x, 3); // ease-out
    const t = ease(k);
    const cam: any = (engine as any).camera;
    if (cam && this.reframeStart && this.reframeEnd && this.reframeTarget) {
      cam.position.x = this.reframeStart.x + (this.reframeEnd.x - this.reframeStart.x) * t;
      cam.position.y = this.reframeStart.y + (this.reframeEnd.y - this.reframeStart.y) * t;
      cam.position.z = this.reframeStart.z + (this.reframeEnd.z - this.reframeStart.z) * t;
      cam.target.x = this.reframeTarget.x;
      cam.target.y = this.reframeTarget.y;
      cam.target.z = this.reframeTarget.z;
      cam.markDirty?.();
    }
    if (k >= 1) {
      this.enterTransit(engine);
    }
  }

  private enterTransit(engine: GameEngine) {
    this.phase = GateRitePhase.Transit;
    this.transitElapsed = 0;
    try { (engine as any).showPlaceholderText?.('Gate Rite: Transit', 800); } catch {}
    // Lazy resolve generator via Angular injector pattern (fallback new)
    try { this.generator = (engine as any)['systemGeneratorService'] || this.generator || null; } catch {}
    // Preparar trayectoria de la nave: desde su posición actual hasta el centro del portal
    try {
      const ship: any = (engine as any)['spaceship'];
      if (ship && this.portalInstance) {
        this.shipStartPos = { x: ship.position.x, y: ship.position.y, z: ship.position.z };
        // Pausar consumo de energía del vacío durante todo el Gate Rite (si no estaba ya)
        try { ship.voidEnergyPaused = true; } catch {}
      }
    } catch {}
  }

  private updateTransit(engine: GameEngine, dt: number) {
    this.transitElapsed += dt;
    const k = Math.min(1, this.transitElapsed / this.transitDuration);
    // Mantener cámara estable desde el reencuadre y mover la nave a través del centro del portal
    try {
      const ship: any = (engine as any)['spaceship'];
      if (ship && this.portalInstance && this.shipStartPos) {
        const center = this.portalInstance.position;
        const sx = this.shipStartPos.x, sy = this.shipStartPos.y, sz = this.shipStartPos.z;
        ship.position.x = sx + (center.x - sx) * k;
        ship.position.y = sy + (center.y - sy) * k;
        ship.position.z = sz + (center.z - sz) * k;
        // Alinear rumbo hacia el portal
        if (typeof ship.lookAt === 'function') {
          ship.lookAt(center);
        } else {
          const dx = center.x - ship.position.x;
          const dy = center.y - ship.position.y;
          const dz = center.z - ship.position.z;
          ship.rotation.y = Math.atan2(dx, dz);
          if (typeof ship.rotation.x === 'number') ship.rotation.x = Math.atan2(dy, Math.hypot(dx, dz));
          ship.updateModelMatrix();
        }
        // Mantener la mirada de la cámara hacia el centro para ver el cruce
        const cam: any = (engine as any).camera;
        if (cam) {
          cam.target.x = center.x;
          cam.target.y = center.y;
          cam.target.z = center.z;
          cam.markDirty?.();
        }
      }
    } catch {}
    if (this.transitElapsed >= this.transitDuration) {
      // No cambiar de sistema aún: pasar a PlasmaBall aún en el sistema de origen
      this.enterPlasmaBall(engine);
    }
  }

  private enterPlasmaBall(engine: GameEngine) {
    this.phase = GateRitePhase.PlasmaBall;
    this.plasmaElapsed = 0;
    try { (engine as any).showPlaceholderText?.('Gate Rite: Plasma', 900); } catch {}
    // Definir posición de origen del plasma (centro del portal) y dirección de salida por detrás
    try {
      if (this.portalInstance && this.shipStartPos) {
        this.plasmaCenter = { x: this.portalInstance.position.x, y: this.portalInstance.position.y, z: this.portalInstance.position.z };
        const dir = {
          x: this.shipStartPos.x - this.portalInstance.position.x,
          y: this.shipStartPos.y - this.portalInstance.position.y,
          z: this.shipStartPos.z - this.portalInstance.position.z,
        };
        const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        this.plasmaDir = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
      }
    } catch {}
  }

  private updatePlasmaBall(engine: GameEngine, dt: number) {
    this.plasmaElapsed += dt;
    const k = Math.min(1, this.plasmaElapsed / this.plasmaDuration);
    // Al terminar el plasma en el sistema de origen, iniciar fade de conmutación
    if (k >= 1) this.enterFadeSwitch(engine);
  }

  private enterFadeSwitch(engine: GameEngine) {
    this.phase = GateRitePhase.FadeSwitch;
    this.fadeElapsed = 0;
    // Iniciar cambio a cámara trasera durante el fade (no visible al usuario por la cortinilla)
    try { (engine as any).camera?.setCameraMode?.(CameraMode.REAR_VIEW); } catch {}
  }

  private updateFadeSwitch(engine: GameEngine, dt: number) {
    this.fadeElapsed += dt;
    const k = Math.min(1, this.fadeElapsed / Math.max(0.0001, this.fadeDuration));
    if (k >= 1) {
      // Al completar el fade, generar y aplicar el nuevo sistema, colocar nave, reactivar energía
      try {
        const solarSvc: SolarSystemService | undefined = (engine as any)['solarSystemService'];
        const originPortal = this.portalInstance ? {
          id: this.portalInstance.id,
          position: { ...this.portalInstance.position },
          radius: this.portalInstance.radius,
          linkedPortalId: undefined,
          eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
        } : null;
        let snapshot: any = null;
        if (solarSvc && originPortal) snapshot = solarSvc.generateWithLinkedPortal(originPortal);
        else if (this.generator) snapshot = this.generator.generate(Date.now());
        if (snapshot && (engine as any).applySolarSystemSnapshot) {
          // Vincular portal de origen con destino para persistencia
          let dest: any = null;
          try {
            dest = (snapshot.portals && snapshot.portals.length) ? snapshot.portals[snapshot.portals.length - 1] : null;
            if (dest && this.portalInstance) this.portalInstance.linkedPortalId = dest.id;
          } catch {}
          // Persistir snapshot de origen con planeta colapsado excluido y portal enlazado
          try {
            const persistence: any = (engine as any)['portalPersistenceService'];
            if (persistence && this.originalSnapshot && this.portalInstance && dest) {
              const originPortalSnap = {
                id: this.portalInstance.id,
                position: { ...this.portalInstance.position },
                radius: this.portalInstance.radius,
                linkedPortalId: dest.id,
                eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
              };
              const collapsedId: string | undefined = (this.targetPlanet as any)?.id;
              const filteredPlanets = Array.isArray(this.originalSnapshot.planets)
                ? this.originalSnapshot.planets.filter((pl: any) => pl?.id !== collapsedId)
                : [];
              const originWithPortal = { ...this.originalSnapshot, planets: filteredPlanets, portals: [originPortalSnap] };
              persistence.autoLabelAndSave?.('gate-origin-linked', originWithPortal);
            }
          } catch {}
          // Aplicar nuevo sistema
          (engine as any).applySolarSystemSnapshot(snapshot);
          // Colocar nave a 1000u del portal de destino, encarada en dirección contraria al portal y frenando a 0
          try {
            const dest = (snapshot.portals && snapshot.portals.length) ? snapshot.portals[snapshot.portals.length - 1] : null;
            const ship: any = (engine as any)['spaceship'];
            const portalsArr: any[] = (engine as any)['portals'] || [];
            const destPortalObj = dest ? portalsArr.find(p => p.id === dest.id) : null;
            if (ship && dest && destPortalObj) {
              const R = Number(destPortalObj.radius) || 120;
              const pos = destPortalObj.position;
              const spawnDist = 1000;
              // Calcular vector forward del portal a partir de su rotación (normal del plano)
              const yaw = Number(destPortalObj.rotation?.y) || 0;
              const pitch = Number(destPortalObj.rotation?.x) || 0;
              const fwd = {
                x: -Math.cos(pitch) * Math.sin(yaw),
                y: Math.sin(pitch),
                z: Math.cos(pitch) * Math.cos(yaw)
              };
              ship.position.x = pos.x + fwd.x * spawnDist;
              ship.position.y = pos.y + fwd.y * spawnDist;
              ship.position.z = pos.z + fwd.z * spawnDist;
              // Orientación alineada con el forward del portal (alejándose del centro)
              if (typeof ship.lookAt === 'function') {
                ship.lookAt({ x: ship.position.x + fwd.x, y: ship.position.y + fwd.y, z: ship.position.z + fwd.z });
              } else {
                ship.rotation.y = Math.atan2(fwd.x, fwd.z);
                if (typeof ship.rotation.x === 'number') ship.rotation.x = Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z));
                ship.updateModelMatrix();
              }
              // Velocidad y frenado
              const shipAny: any = ship;
              shipAny.currentSpeed = Math.max(shipAny.currentSpeed || 0, 120);
              shipAny.targetSpeed = 0;
              shipAny._gateRiteOriginalDecel = shipAny.deceleration;
              shipAny.deceleration = Math.max(shipAny.deceleration, 30);
              // Mantener pausa de energía hasta completar el frenado
              ship.voidEnergyPaused = true;
              // Alinear ojo del portal de destino con su normal en el primer frame
              try { (destPortalObj as any).eyeDir = { x: fwd.x, y: fwd.y, z: fwd.z }; } catch {}
            }
          } catch {}
          // Logs y persistencia del generado
          try { GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite switched system after fade', { id: snapshot.id }); } catch {}
          try {
            const persistence: any = (engine as any)['portalPersistenceService'];
            if (persistence && snapshot) persistence.autoLabelAndSave?.('gate-generated', snapshot);
          } catch {}
        }
      } catch (e) { try { GameLogger.warn(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite fade switch failed', e); } catch {} }
      // Pasar a fase de frenado en destino
      this.enterArrivalDecel(engine);
    }
  }

  private enterArrivalDecel(_engine: GameEngine) {
    this.phase = GateRitePhase.ArrivalDecel;
    this.arrivalElapsed = 0;
  }

  private updateArrivalDecel(engine: GameEngine, dt: number) {
    this.arrivalElapsed += dt;
    try {
      const ship: any = (engine as any)['spaceship'];
      if (ship) {
        // Asegurar objetivo 0 durante la fase
        ship.targetSpeed = 0;
        // Si ya casi parado o tiempo cumplido → finalizar
        const stopped = (ship.currentSpeed ?? 0) <= 0.5;
        if (stopped || this.arrivalElapsed >= this.arrivalDuration) {
          // Reactivar y rellenar Void Energy al 100%
          ship.voidEnergyPaused = false;
          ship.voidEnergyCurrent = ship.voidEnergyMax;
          if (ship._gateRiteOriginalDecel !== undefined) {
            ship.deceleration = ship._gateRiteOriginalDecel;
            delete ship._gateRiteOriginalDecel;
          }
          this.phase = GateRitePhase.Completed;
          this.finished = true;
          return;
        }
      }
    } catch {}
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

  render(engine: GameEngine): void {
    // Render plasma ball during PlasmaBall phase
    if (this.phase === GateRitePhase.PlasmaBall) {
      try {
        const gl = (engine as any)['gl'];
        const cam: any = (engine as any)['camera'];
        const bill: any = (engine as any)['billboardRenderer'];
        if (gl && cam && bill) {
          // Posición del plasma: se aleja por detrás del portal
          const center = this.plasmaCenter || (this.portalInstance ? this.portalInstance.position : { x:0,y:0,z:0 });
          const dir = this.plasmaDir || { x: 0, y: 0, z: -1 };
          const t = Math.min(1, Math.max(0, this.plasmaElapsed / Math.max(0.001, this.plasmaDuration)));
          const dist = (this.portalInstance ? this.portalInstance.radius * 1.2 : 120) + (t * t) * 1200;
          const pos = { x: center.x + dir.x * dist, y: center.y + dir.y * dist, z: center.z + dir.z * dist };
          const tex = bill.getCircleTexture('#FFB000');
          const view = cam.viewMatrix as Float32Array;
          const proj = cam.projectionMatrix as Float32Array;
          const fwd = { x: cam.target.x - cam.position.x, y: cam.target.y - cam.position.y, z: cam.target.z - cam.position.z };
          const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1; fwd.x/=fl; fwd.y/=fl; fwd.z/=fl;
          const up = { x: cam.up.x, y: cam.up.y, z: cam.up.z };
          let rx = fwd.y * up.z - fwd.z * up.y;
          let ry = fwd.z * up.x - fwd.x * up.z;
          let rz = fwd.x * up.y - fwd.y * up.x;
          const rl = Math.hypot(rx, ry, rz) || 1; rx/=rl; ry/=rl; rz/=rl;
          const sizePx = 220 - t * 140; // decreciente mientras se aleja
          const tint: [number,number,number,number] = [1.0, 0.85, 0.35, 0.95];
          bill.render(pos, sizePx, view, proj, { x: cam.position.x, y: cam.position.y, z: cam.position.z }, up, { x: rx, y: ry, z: rz }, tint, tex);
        }
      } catch {}
    }
    // Render 500ms full-screen fade during FadeSwitch
    if (this.phase === GateRitePhase.FadeSwitch) {
      try {
        const overlay: any = (engine as any)['overlayRenderer'];
        if (overlay) {
          const t = Math.min(1, Math.max(0, this.fadeElapsed / Math.max(0.001, this.fadeDuration)));
          overlay.drawSolid([0,0,0], t);
        }
      } catch {}
    }
  }

  isBlockingInputs(): boolean { return !this.finished; }
}
