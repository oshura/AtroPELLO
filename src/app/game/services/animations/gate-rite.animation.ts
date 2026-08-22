import { ITargetable, TargetType } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { SystemGeneratorService } from '../game/system-generator.service';
import { SolarSystemService } from '../game/solar-system.service';
import { resolveSystemId } from '../game/system-identity';
import { Portal } from '../../game-objects/Portal';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameLogger } from '../../utils/GameLogger';
import { SpellType } from '../../types/spell.types';
import { ThrusterState } from '../../game-objects/Spaceship';
import { PlanetInhabitants } from '../../types/cosmic-life.types';
import { BaseAnimation } from './base-animation';

/** Hito: el primer Gate Rite ya sembró el sistema de los Grises (una sola vez por partida). */
export const GREYS_SYSTEM_STORY_FLAG = 'greys-system-seeded';

enum GateRitePhase {
  PreFocus = 0,
  CameraZoomOut = 1,
  PlanetWrapper = 2,
  PlanetCollapse = 3,
  PortalManifest = 4,
  CameraReframe = 5,
  Transit = 6,
  FadeSwitch = 7,
  ArrivalDecel = 8,
  Completed = 9,
}

export class GateRiteAnimation extends BaseAnimation {
  public readonly name = 'gate-rite';
  public readonly spellType = SpellType.GATE_RITE;
  private phase: GateRitePhase = GateRitePhase.PreFocus;
  private t = 0; // seconds within current phase
  private targetPlanet: ITargetable | null = null;
  // 'complete' es el flag de estado propio del rito (la base usa su propio 'finished').
  private complete = false;
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
  private transitDuration = 3.5; // travelling to camera-0 pose while accelerating
  private camTravelStart: { pos:{x:number;y:number;z:number}; target:{x:number;y:number;z:number}; up:{x:number;y:number;z:number} } | null = null;
  private fadeElapsed = 0;
  private fadeDuration = 0.5; // seconds fade to switch systems & camera
  private arrivalElapsed = 0;
  private arrivalDuration = 7.5; // (tripled) seconds to decelerate to 0 after spawn for a more cinematic slow glide
  private arrivalStartSpeed = 0; // capture speed at start of arrival to interpolate down to 1u/s
  private portalInstance: Portal | null = null;
  private generator: SystemGeneratorService | null = null; // lazy resolved from engine injector if needed
  // Speed streaks (void-jump style) during pre-cross travelling
  private streakSeeds: Array<{x:number;y:number;z:number}> = [];
  private streakNearZ = 2;
  private streakFarZ = 100;
  private streakBaseSpeed = 20;
  private streakMaxBoost = 220;
  
  private speedCapPreCross = 180; // u/s cap before crossing
  private accelActive = false; // start acceleration only after travelling completes
  private lockedHeading = false; // fijar orientación durante el tránsito para evitar micro-oscilaciones
  private camTransitSmoothing = true; // activar suavizado de cámara durante Transit
  private gateFocusPosition: { x: number; y: number; z: number } | null = null;
  private preTransitBrakingActive = true;

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
  // (removed) shipStartPos no longer required

  protected override onStart(engine: GameEngine, target?: ITargetable): void {
    if (!target || target.getTargetType() !== TargetType.PLANET) { this.complete = true; return; }
    this.targetPlanet = target;
    this.gateFocusPosition = (target as any)?.position ? { ...(target as any).position } : null;
    this.phase = GateRitePhase.PreFocus;
    this.t = 0;
    this.complete = false;
    this.preTransitBrakingActive = true;
    try { engine.showPlaceholderText?.('GATE RITE: INIT', 900); } catch {}
    // Pausar consumo de energía del vacío durante toda la animación
    try {
      const ship = engine.spaceship;
      if (ship) ship.voidEnergyPaused = true;
    } catch {}
    // Seed manual camera with current active transform, then switch to MANUAL to prevent ship overrides
    try {
      const cam = engine.camera;
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
      const serializer = engine.runtimeSerializer;
      if (!serializer) {
        GameLogger.warn(LogCategory.ANIMATION, 'GateRite runtime serializer missing; snapshot capture skipped');
        this.originalSnapshot = null;
      } else {
        this.originalSnapshot = serializer.captureCurrentSnapshot(engine);
      }
      // Persist original snapshot if portal persistence is available (only once per rite start)
      try {
        const engineAny: any = engine as any;
        const currentSnapshotRef: any = engineAny?.currentSnapshot || null;
        const isProcedural = currentSnapshotRef ? currentSnapshotRef.meta?.handcrafted !== true : false;
        if (isProcedural && this.originalSnapshot && typeof engine.gameState?.archiveProceduralSystemSnapshot === 'function') {
          const archiveSnapshot = {
            ...this.originalSnapshot,
            meta: {
              ...(this.originalSnapshot.meta || {}),
              handcrafted: false,
              proceduralSystemId: currentSnapshotRef?.id || this.originalSnapshot.id,
              archivedFrom: currentSnapshotRef?.id || null
            }
          };
          engine.gameState.archiveProceduralSystemSnapshot(archiveSnapshot);
        }
      } catch {}
      try {
        const persistence: any = engine.portalPersistenceService;
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
    const cam = engine.camera;
    if (cam) {
      this.initialCamPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      this.initialCamTarget = cam.target ? { x: cam.target.x, y: cam.target.y, z: cam.target.z } : null;
    }
  try { engine.showPlaceholderText?.('GATE RITE: CAMERA ZOOM', 800); } catch {}
  }

  private getGateFocusPosition(): { x: number; y: number; z: number } | null {
    if (this.portalInstance?.position) {
      return { x: this.portalInstance.position.x, y: this.portalInstance.position.y, z: this.portalInstance.position.z };
    }
    if (this.gateFocusPosition) {
      return { ...this.gateFocusPosition };
    }
    const planetPos = (this.targetPlanet as any)?.position;
    return planetPos ? { ...planetPos } : null;
  }

  private applyPreTransitBraking(engine: GameEngine, dt: number): void {
    if (!this.preTransitBrakingActive) {
      return;
    }
    const ship: any = engine.spaceship;
    if (!ship) {
      return;
    }
    const focus = this.getGateFocusPosition();
    if (focus && ship.position) {
      try {
        if (typeof ship.lookAt === 'function') {
          ship.lookAt(focus);
        } else if (ship.rotation) {
          const dx = focus.x - ship.position.x;
          const dy = focus.y - ship.position.y;
          const dz = focus.z - ship.position.z;
          const yaw = Math.atan2(dx, dz);
          const flat = Math.hypot(dx, dz) || 1;
          const pitch = Math.atan2(dy, flat);
          ship.rotation.y = yaw;
          if (typeof ship.rotation.x === 'number') {
            ship.rotation.x = pitch;
          }
          ship.updateModelMatrix?.();
        }
      } catch {}
    }
    const decel = Math.max(0, Number(ship.deceleration) || 0);
    if (decel <= 0) {
      ship.currentSpeed = 0;
      ship.targetSpeed = 0;
      return;
    }
    const before = Number(ship.currentSpeed) || 0;
    if (before <= 0) {
      ship.currentSpeed = 0;
      ship.targetSpeed = 0;
      ship.isThrusting = false;
      return;
    }
    const newSpeed = Math.max(0, before - decel * dt);
    if (newSpeed === before) {
      return;
    }
    ship.currentSpeed = newSpeed;
    if (typeof ship.targetSpeed === 'number' && Number.isFinite(ship.targetSpeed)) {
      ship.targetSpeed = Math.min(ship.targetSpeed, newSpeed);
    } else {
      ship.targetSpeed = newSpeed;
    }
    ship.isThrusting = newSpeed > 0.05;
    try { ship.thrusterState = ThrusterState.BRAKING; } catch {}
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    if (this.complete) return true;
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
      case GateRitePhase.FadeSwitch:
        this.updateFadeSwitch(engine, dt);
        break;
      case GateRitePhase.ArrivalDecel:
        this.updateArrivalDecel(engine, dt);
        break;
      default:
        break; // future phases
    }
    return this.complete;
  }

  private updateCameraZoomOut(engine: GameEngine, dt: number) {
    if (!this.targetPlanet) { this.finishEarly(engine, 'NO TARGET'); return; }
    const cam = engine.camera;
    if (!cam || !this.initialCamPos) { this.finishEarly(engine, 'NO CAM'); return; }
    this.applyPreTransitBraking(engine, dt);

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
    const cam = engine.camera;
    if (cam) this.baseCamPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    // With the planet fully framed, stop collision responses before debris effects begin
    try { engine.collisionsDisabled = true; } catch {}
  }

  private updatePlanetWrapper(engine: GameEngine, dt: number) {
    this.applyPreTransitBraking(engine, dt);
    this.wrapperElapsed += dt;
    const k = Math.min(1, this.wrapperElapsed / this.wrapperDuration);
    // Show a temporary overlay text only once at start (not every frame)
    if (this.wrapperElapsed < dt + 0.0001) {
      try { engine.showPlaceholderText?.('Gate Rite: Wrapping', 900); } catch {}
    }
    // Suavizar aparición del "envolvente" del planeta: exponer parámetros graduales para el renderer
    try {
      const p: any = this.targetPlanet as any;
      if (p) {
        // Introducir un leve retardo inicial para evitar popping del patrón
        const startDelay = 0.18; // segundos
        const tRaw = Math.max(0, this.wrapperElapsed - startDelay) / Math.max(0.001, (this.wrapperDuration - startDelay));
        // Easing suaves para distintos canales
        const easeOutCubic = (x:number)=>1 - Math.pow(1 - x, 3);
        const easeInOutQuad = (x:number)=> (x < 0.5) ? (2*x*x) : (1 - Math.pow(-2*x + 2, 2) / 2);
        const tReveal = Math.min(1, easeOutCubic(Math.max(0, Math.min(1, tRaw))));
        const tAlpha = Math.min(1, easeInOutQuad(Math.max(0, Math.min(1, tRaw))));
        // Canales expuestos para el shader/algoritmo del wrapper
        const alpha = Math.min(0.85, 0.1 + tAlpha * 0.75); // alpha objetivo con rampa progresiva
        const reveal = tReveal; // 0..1: cuánto del patrón se debe revelar (p.ej. threshold/umbral)
        const thickness = 0.15 + 0.85 * tReveal; // grosor/línea del "net": empieza fino
        const distortion = 0.2 * Math.sin(this.wrapperElapsed * 2.2) * (0.25 + 0.75 * tReveal); // pulso ligero
        const microScale = 1.0 + 0.003 * Math.sin(this.wrapperElapsed * 6.0) * (0.3 + 0.7 * tReveal);
        p._gateRiteWrapperEnvelope = {
          alpha,
          reveal,
          thickness,
          distortion,
          scale: microScale,
          time: this.wrapperElapsed
        };
      }
    } catch {}
    // Camera jitter: small per-axis sin noise scaled by (0→peak at mid→0)
    const cam = engine.camera;
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
    try { engine.showPlaceholderText?.('Gate Rite: Collapse', 900); } catch {}
  }

  private updatePlanetCollapse(engine: GameEngine, dt: number) {
    this.applyPreTransitBraking(engine, dt);
    this.collapseElapsed += dt;
    this.collapseStormTime += dt;
    const p = this.targetPlanet as any;
    if (p) {
      const k = Math.min(1, this.collapseElapsed / this.collapseDuration);
      // Ease-in-out (cubic) for tectonic feel
      const easeInOutCubic = (x: number) => (x < 0.5) ? (4 * x * x * x) : (1 - Math.pow(-2 * x + 2, 3) / 2);
      const ke = easeInOutCubic(k);
      // Colapsar prácticamente a cero al final, con facilidad suave
      const shrink = Math.max(0.00001, Math.pow(1 - ke, 2.2));
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
        const planets: any[] = engine.gameState.planets;
        const idx = planets.findIndex(pl => pl.id === p.id);
        if (idx >= 0) planets.splice(idx, 1);
        // Remove from target catalog (re-register PLANET bucket)
        const tc = engine.targetCatalog;
        if (tc) {
          tc.register(TargetType.PLANET, planets as unknown as ITargetable[]);
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
      const logger: LoggingService | undefined = engine.logger as LoggingService | undefined;
      const portal = new Portal('portal-gaterite', pos, Math.max(60, Number(baseR)), logger);
      // Orientar el portal con la normal opuesta al forward de la nave para cruce perpendicular (incluye pitch)
      try {
        const ship: any = engine.spaceship;
        if (ship && ship.rotation) {
          const yaw = Number(ship.rotation.y) || 0;
          const pitch = Number(ship.rotation.x) || 0;
          // La geometría del portal mira a +Z; para que mire a la nave, su normal debe ser -forward de la nave
          portal.rotation.x = -pitch; // invertir pitch para apuntar su normal contra el forward de la nave
          portal.rotation.y = yaw + Math.PI; // yaw opuesto
          portal.rotation.z = 0;
          portal.updateModelMatrix();
          // Alinear el ojo inicial con la normal del portal (si el ojo está habilitado)
          const n = {
            x: -Math.cos(pitch) * Math.sin(yaw),
            y: Math.sin(pitch),
            z: Math.cos(pitch) * Math.cos(yaw)
          };
          try { if ((portal as any)._eyeEnabled) (portal as any).eyeDir = { ...n }; } catch {}
        }
      } catch {}
      // Capturar color base del planeta original para reutilizarlo en la esfera del ojo
      try {
        const p: any = this.targetPlanet as any;
        if (p && p.color) {
          portal.planetColorRef = { r: p.color.r ?? 0.4, g: p.color.g ?? 0.4, b: p.color.b ?? 0.4, a: p.color.a };
        }
      } catch {}
      // Desactivar ojo central por ahora y prevenir flash de primer frame
      try { (portal as any)._eyeEnabled = false; } catch {}
      // Prevent one-frame flash: ensure tiny initial scale and zero opacity before first render
      try {
        const s0 = Math.max(1, portal.radius * 0.1);
        portal.scale.x = portal.scale.y = portal.scale.z = s0;
        (portal as any).renderOpacity = 0.0;
        (portal as any).eyelidOpen = 0.05;
      } catch {}
      this.portalInstance = portal;
      const gl = engine.gl;
      if (gl && !portal.vertexBuffer) portal.initBuffers(gl);
      // Register portal
      const portalsArr = engine.gameState.portals;
      if (Array.isArray(portalsArr)) portalsArr.push(portal);
      engine.targetCatalog?.add?.(TargetType.PORTAL, portal);
      this.gateFocusPosition = { ...portal.position };
      try { logger?.log(LogLevel.INFO, LogCategory.PORTAL, 'Portal manifest created', { id: portal.id, radius: portal.radius, pos }); } catch {}
    } catch (e) {
      try { (engine.logger as LoggingService | undefined)?.log(LogLevel.ERROR, LogCategory.PORTAL, 'Portal manifest failed', e); } catch {}
    }
    try { engine.showPlaceholderText?.('Gate Rite: Portal', 1000); } catch {}
  }

  private updatePortalManifest(engine: GameEngine, dt: number) {
    this.applyPreTransitBraking(engine, dt);
    this.manifestElapsed += dt;
    const k = Math.min(1, this.manifestElapsed / this.manifestDuration);
    if (this.portalInstance) {
      const s = 0.1 + k * 0.9; // scale up from tiny to full
      this.portalInstance.scale.x = this.portalInstance.scale.y = this.portalInstance.scale.z = this.portalInstance.radius * s;
      (this.portalInstance as any).renderOpacity = Math.min(1, k * 1.2);
      // Apertura de párpados: empezar con abertura mínima para ver iris/pupila
      if ((this.portalInstance as any)._eyeEnabled) {
        try { (this.portalInstance as any).eyelidOpen = Math.min(1, 0.15 + k * 0.85); } catch {}
      }
      // Activar seguimiento de mirada pronto
      if ((this.portalInstance as any)._eyeEnabled) {
        try {
          if (!this.portalInstance.eyeState) this.portalInstance.eyeState = { gazeTarget: 'ship', eyelidOpen: 1, intensity: 0.9 } as any;
          else this.portalInstance.eyeState.gazeTarget = 'ship' as any;
        } catch {}
      }
      // Mantener la cámara QUIETA durante todo el manifest: sin órbitas ni saltos
      // No mover la nave: solo reorientar una vez al inicio del manifest (usar lookAt hacia el portal si existe)
      try {
        if (this.manifestElapsed < dt + 0.0001) {
          const ship: any = engine.spaceship;
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
    const cam = engine.camera;
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
    this.applyPreTransitBraking(engine, dt);
    this.reframeElapsed += dt;
    const k = Math.min(1, this.reframeElapsed / Math.max(0.0001, this.reframeDuration));
    const ease = (x:number) => 1 - Math.pow(1 - x, 3); // ease-out
    const t = ease(k);
    const cam = engine.camera;
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
    this.preTransitBrakingActive = false;
    try { engine.showPlaceholderText?.('Gate Rite: Transit', 800); } catch {}
    // Use non-smoothed transit camera to avoid flicker and lag
    this.camTransitSmoothing = false;
    // Lazy resolve generator via Angular injector pattern (fallback new)
    // TODO: systemGeneratorService should be added to GameEngine if needed
    // try { this.generator = engine.systemGeneratorService || this.generator || null; } catch {}
    // Preparar: situar nave a 1000u del portal, orientar al centro; preparar travelling y streaks
    try {
      const ship: any = engine.spaceship;
      if (ship && this.portalInstance) {
        const center = this.portalInstance.position;
        // Colocar a 1000u del centro hacia atrás
        const vx = center.x - ship.position.x;
        const vy = center.y - ship.position.y;
        const vz = center.z - ship.position.z;
        const vlen = Math.hypot(vx, vy, vz) || 1;
        const nx = vx / vlen, ny = vy / vlen, nz = vz / vlen;
        ship.position.x = center.x - nx * 1000;
        ship.position.y = center.y - ny * 1000;
        ship.position.z = center.z - nz * 1000;
  if (typeof ship.lookAt === 'function') ship.lookAt(center); else { ship.rotation.y = Math.atan2(vx, vz); ship.updateModelMatrix(); }
  // Bloquear rumbo inicial durante todo el tránsito para reducir jitter visual a alta velocidad
  try { if (typeof ship.setHighSpeedSmoothing === 'function') ship.setHighSpeedSmoothing(true); } catch {}
  this.lockedHeading = true;
  // Travelling inicial: aún sin aceleración de +10u/s (se activará al finalizar travelling)
  this.accelActive = false;
        // Pausar energía y marcar HUD para overspeed clamping
        try { ship.voidEnergyPaused = true; engine.voidJumpActive = true; } catch {}
        // Capturar estado inicial de cámara manual para travelling
        const cam = engine.camera;
        if (cam) {
          this.camTravelStart = {
            pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            target: { x: cam.target.x, y: cam.target.y, z: cam.target.z },
            up: { x: cam.up.x, y: cam.up.y, z: cam.up.z },
          };
        }
        // Inicializar streaks
        this.streakSeeds = [];
        const count = 140;
        for (let i = 0; i < count; i++) {
          const z = this.streakNearZ + Math.random() * (this.streakFarZ - this.streakNearZ);
          const y = (Math.random() * 2 - 1) * 20;
          const x = (Math.random() * 2 - 1) * 35;
          this.streakSeeds.push({ x, y, z });
        }
        // Reiniciar velocidades para rampa +10u/s
        ship.targetSpeed = ship.currentSpeed = Math.max(0, ship.currentSpeed || 0);
      }
    } catch {}
  }

  private updateTransit(engine: GameEngine, dt: number) {
    this.transitElapsed += dt;
    const k = Math.min(1, this.transitElapsed / this.transitDuration);
    try {
      const ship: any = engine.spaceship;
      if (ship && this.portalInstance) {
        const center = this.portalInstance.position;
  // Mantener rumbo al centro una sola vez (enterTransit); evitar micro-ajustes por frame
  if (!this.lockedHeading && typeof ship.lookAt === 'function') ship.lookAt(center);
        // Eliminado bloque de suavizado duplicado para evitar flicker por desincronización
        // Activar aceleración solo tras finalizar travelling (k >= 1)
        if (k >= 1 && !this.accelActive) {
          this.accelActive = true;
        }
        if (this.accelActive) {
          // Duplicar aceleración durante tránsito (antes: +10u/s^2, ahora +20u/s^2)
          ship.currentSpeed = Math.min(this.speedCapPreCross, (ship.currentSpeed || 0) + 20 * dt);
          ship.targetSpeed = ship.currentSpeed;
        }
        // Travelling de cámara manual hacia pose tipo cámara 0 detrás de la nave con ligera inclinación
        const cam = engine.camera;
        if (cam && this.camTravelStart && !this.camTransitSmoothing) {
          // Durante travelling (antes de accelActive) aún interpolamos; tras accelActive anclamos rígido
          const shipQ = ship.getOrientationQuaternion?.();
          const rotVec = (v:{x:number;y:number;z:number}) => {
            if (!shipQ) return v;
            const qx = shipQ[0], qy = shipQ[1], qz = shipQ[2], qw = shipQ[3];
            const qx2=qx*qx,qy2=qy*qy,qz2=qz*qz,qw2=qw*qw;
            return {
              x: v.x * (qx2 - qy2 - qz2 + qw2) + v.y * (2*qx*qy - 2*qz*qw) + v.z * (2*qx*qz + 2*qy*qw),
              y: v.x * (2*qx*qy + 2*qz*qw) + v.y * (-qx2 + qy2 - qz2 + qw2) + v.z * (2*qy*qz - 2*qx*qw),
              z: v.x * (2*qx*qz - 2*qy*qw) + v.y * (2*qy*qz + 2*qx*qw) + v.z * (-qx2 - qy2 + qz2 + qw2)
            };
          };
          const baseOffset = { x: 0, y: 2.3, z: -(cam.getZoomDistance?.() ? cam.getZoomDistance() * 2.0 : 9.0) };
          const fwdRef = { x: 0, y: 0, z: 3.0 };
          const upRef = { x: 0, y: 1, z: 0 };
          const offW = rotVec(baseOffset);
          const fwdW = rotVec(fwdRef);
          const upW = rotVec(upRef);
          if (!this.accelActive) {
            const ease = (x:number)=>1 - Math.pow(1-x,3);
            const endPos = { x: ship.position.x + offW.x, y: ship.position.y + offW.y, z: ship.position.z + offW.z };
            const endTarget = { x: endPos.x + fwdW.x, y: endPos.y + fwdW.y, z: endPos.z + fwdW.z };
            cam.position.x = this.camTravelStart.pos.x + (endPos.x - this.camTravelStart.pos.x) * ease(k);
            cam.position.y = this.camTravelStart.pos.y + (endPos.y - this.camTravelStart.pos.y) * ease(k);
            cam.position.z = this.camTravelStart.pos.z + (endPos.z - this.camTravelStart.pos.z) * ease(k);
            cam.target.x = this.camTravelStart.target.x + (endTarget.x - this.camTravelStart.target.x) * ease(k);
            cam.target.y = this.camTravelStart.target.y + (endTarget.y - this.camTravelStart.target.y) * ease(k);
            cam.target.z = this.camTravelStart.target.z + (endTarget.z - this.camTravelStart.target.z) * ease(k);
            cam.up.x = this.camTravelStart.up.x + (upW.x - this.camTravelStart.up.x) * ease(k);
            cam.up.y = this.camTravelStart.up.y + (upW.y - this.camTravelStart.up.y) * ease(k);
            cam.up.z = this.camTravelStart.up.z + (upW.z - this.camTravelStart.up.z) * ease(k);
          } else {
            // Anclaje rígido: cámara directamente detrás de la nave, sin interpolación para evitar flicker
            cam.position.x = ship.position.x + offW.x;
            cam.position.y = ship.position.y + offW.y;
            cam.position.z = ship.position.z + offW.z;
            cam.target.x = cam.position.x + fwdW.x;
            cam.target.y = cam.position.y + fwdW.y;
            cam.target.z = cam.position.z + fwdW.z;
            cam.up.x = upW.x; cam.up.y = upW.y; cam.up.z = upW.z;
          }
          cam.markDirty?.();
        }
        // Actualizar streaks
        if (this.streakSeeds.length) {
          const factor = Math.min(1, (ship.currentSpeed || 0) / Math.max(1, this.speedCapPreCross));
          const streakSpeed = this.streakBaseSpeed + this.streakMaxBoost * factor;
          for (let i = 0; i < this.streakSeeds.length; i++) {
            const s = this.streakSeeds[i];
            s.z -= streakSpeed * dt;
            if (s.z < this.streakNearZ) {
              s.z = this.streakFarZ + Math.random() * 20;
              s.x = (Math.random() * 2 - 1) * 35;
              s.y = (Math.random() * 2 - 1) * 20;
            }
          }
        }
        // Condición de cruce (solo considerar después de iniciar aceleración)
        const dx = center.x - ship.position.x;
        const dy = center.y - ship.position.y;
        const dz = center.z - ship.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (this.accelActive && dist <= Math.max(50, this.portalInstance.radius * 0.25)) {
          // Inmediatamente iniciar fade a negro para swap de sistema
          this.enterFadeSwitch(engine);
          return;
        }
      }
    } catch {}
  }

  private enterFadeSwitch(engine: GameEngine) {
    this.phase = GateRitePhase.FadeSwitch;
    this.fadeElapsed = 0;
    // Iniciar cambio a cámara trasera durante el fade (no visible al usuario por la cortinilla)
    try { engine.camera?.setCameraMode?.(CameraMode.REAR_VIEW); } catch {}
  }

  private updateFadeSwitch(engine: GameEngine, dt: number) {
    this.fadeElapsed += dt;
    const k = Math.min(1, this.fadeElapsed / Math.max(0.0001, this.fadeDuration));
    if (k >= 1) {
      // Al completar el fade, generar y aplicar el nuevo sistema, colocar nave, reactivar energía
      try {
        const solarSvc: SolarSystemService | undefined = engine.solarSystemService;
        const originPortal = this.portalInstance ? {
          id: this.portalInstance.id,
          position: { ...this.portalInstance.position },
          radius: this.portalInstance.radius,
          linkedPortalId: undefined,
          eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
        } : null;
        let snapshot: any = null;
        let reusedArchivedSystem = false;
        if (solarSvc && originPortal) {
          const archiveApi: any = engine.gameState;
          const archivedCount = typeof archiveApi?.getArchivedProceduralSystemCount === 'function'
            ? archiveApi.getArchivedProceduralSystemCount()
            : 0;
          const capturedPlanets = this.originalSnapshot?.planets;
          const prevPalette = Array.isArray(capturedPlanets)
            ? Array.from(new Set(capturedPlanets.map((p: any) => p?.baseColorName).filter((c: any) => !!c)))
            : [];
          const genOptions: any = {
            disableTrail: true,
            staticClouds: true,
            allowCanonicalNames: false,
            maxGiantRadius: 3400,
            colorPaletteOverride: prevPalette && prevPalette.length ? prevPalette : undefined,
          };

          // El PRIMER Gate Rite siempre lleva a los Grises: es el arranque de la trama, así que ni
          // se rifa el sistema archivado ni se deja al azar quién lo habita (Fase 13).
          const seedsGreys = engine.gameState?.markStoryFlag?.(GREYS_SYSTEM_STORY_FLAG) === true;
          if (seedsGreys) {
            genOptions.guaranteedInhabitants = PlanetInhabitants.GRISES;
          }
          // Rito sintonizado por una raza hacia el dominio de un primigenio: de un solo uso.
          const tuning = !seedsGreys ? engine.gameState?.consumeGateTuning?.() ?? null : null;
          if (tuning) {
            genOptions.forcedElderGod = tuning;
          }
          const directed = seedsGreys || !!tuning;

          let archivedSnapshot: any = null;
          let archiveRoll: number | null = null;
          if (!directed && archivedCount > 0 && typeof archiveApi?.pickRandomArchivedProceduralSystem === 'function') {
            archiveRoll = Math.random();
            if (archiveRoll <= 0.10) {
              archivedSnapshot = archiveApi.pickRandomArchivedProceduralSystem();
            }
          }

          if (archivedSnapshot) {
            reusedArchivedSystem = true;
            snapshot = archivedSnapshot;
            snapshot.meta = { ...(snapshot.meta || {}), reusedFromArchive: true, reusedAt: Date.now(), archiveRoll };
            if (!snapshot.meta.proceduralSystemId && snapshot.id) {
              snapshot.meta.proceduralSystemId = snapshot.id;
            }
            try {
              const destPortal = solarSvc.createPairedPortal(originPortal, { x: 0, y: 0, z: 1000 });
              snapshot.portals = (snapshot.portals || []).concat(destPortal);
            } catch {}
            try {
              GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite reused archived system', {
                archiveRoll,
                archivedCount,
                systemId: resolveSystemId(snapshot)
              });
            } catch {}
          } else {
            snapshot = solarSvc.generateWithLinkedPortal(originPortal, Date.now(), genOptions);
            snapshot.meta = { ...(snapshot.meta || {}), handcrafted: false };
            // Si el rito iba dirigido, el jugador SABE a dónde llega: el mapa lo muestra.
            if (tuning) {
              snapshot.meta.elderGodRevealed = true;
            }
            if (!snapshot.meta.proceduralSystemId && snapshot.id) {
              snapshot.meta.proceduralSystemId = snapshot.id;
            }
          }
        }
        else if (this.generator) snapshot = this.generator.generate(Date.now());
        if (snapshot && engine.applySolarSystemSnapshot) {
          // Registrar portales en el PortalRegistryService
          const registry = engine.portalRegistry;
          const originSystemId = this.originalSnapshot?.id || 'unknown-origin';
          const destSystemId = resolveSystemId(snapshot) || 'unknown-dest';
          
          // Vincular portal de origen con destino
          let dest: any = null;
          try {
            dest = (snapshot.portals && snapshot.portals.length) ? snapshot.portals[snapshot.portals.length - 1] : null;
            if (dest && this.portalInstance) {
              this.portalInstance.linkedPortalId = dest.id;
              
              // Registrar par de portales en el registry
              if (registry) {
                const originPortalSnap = {
                  id: this.portalInstance.id,
                  position: { ...this.portalInstance.position },
                  radius: this.portalInstance.radius,
                  linkedPortalId: dest.id,
                  eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
                };
                const destPortalSnap = {
                  id: dest.id,
                  position: { ...dest.position },
                  radius: dest.radius || 100,
                  linkedPortalId: this.portalInstance.id,
                  eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
                };
                
                // Registrar ambos portales
                registry.registerPortal(originPortalSnap, originSystemId);
                registry.registerPortal(destPortalSnap, destSystemId);
                
                GameLogger.info(LogCategory.PORTAL, 'Gate Rite portal pair registered', {
                  origin: { systemId: originSystemId, portalId: originPortalSnap.id },
                  dest: { systemId: destSystemId, portalId: destPortalSnap.id }
                });
              }
            }
          } catch {}
          
          // Persistir snapshot de origen con planeta colapsado excluido y portal enlazado
          try {
            const persistence: any = engine.portalPersistenceService;
            if (persistence && this.originalSnapshot && this.portalInstance && dest) {
              const originPortalSnap = {
                id: this.portalInstance.id,
                position: { ...this.portalInstance.position },
                radius: this.portalInstance.radius,
                linkedPortalId: dest.id,
                eyeState: { gazeTarget: 'ship' as const, eyelidOpen: 1, intensity: 1 }
              };
              const collapsedId: string | undefined = (this.targetPlanet as any)?.id;
              const filteredPlanets = Array.isArray(this.originalSnapshot?.planets)
                ? this.originalSnapshot!.planets.filter((pl: any) => pl?.id !== collapsedId)
                : [];
              // Mantener TODOS los portales existentes (capturados en originalSnapshot) más el nuevo
              const existingPortals = Array.isArray(this.originalSnapshot?.portals) ? this.originalSnapshot!.portals : [];
              const allPortals = [...existingPortals, originPortalSnap];
              const originWithPortal = { ...this.originalSnapshot, planets: filteredPlanets, portals: allPortals };
              persistence.autoLabelAndSave?.('gate-origin-linked', originWithPortal);
            }
          } catch {}
          try {
            engine.persistActiveSystemState?.({
              reason: 'gate-rite-transition',
              portalId: this.portalInstance?.id,
              destinationPortalId: dest?.id
            });
          } catch (persistError) {
            try {
              GameLogger.warn(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite failed to persist origin before transition', {
                portalId: this.portalInstance?.id,
                destinationPortalId: dest?.id,
                persistError
              });
            } catch {}
          }
          // Aplicar nuevo sistema
          engine.applySolarSystemSnapshot(snapshot);
          // Colocar nave a 1000u del portal de destino, encarada en dirección contraria al portal y frenando a 0
          try {
            const dest = (snapshot.portals && snapshot.portals.length) ? snapshot.portals[snapshot.portals.length - 1] : null;
            const ship: any = engine.spaceship;
            const portalsArr: any[] = engine.gameState.portals || [];
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
              shipAny.targetSpeed = 1; // objetivo final
              shipAny._gateRiteOriginalDecel = shipAny.deceleration;
              // Calcular una deceleración que permita frenar aproximadamente en arrivalDuration
              const desiredStopTime = this.arrivalDuration; // 7.5s
              const initialSpeed = shipAny.currentSpeed;
              const computedDecel = (initialSpeed - 1) / Math.max(0.001, desiredStopTime); // (v0 - v1)/t hacia 1u/s
              // Clamp mínima para no hacer la frenada interminable si speed es baja
              shipAny.deceleration = Math.max(4, Math.min(computedDecel, 25)); // limitar arriba para mantener suavidad
              // Mantener pausa de energía hasta completar el frenado
              ship.voidEnergyPaused = true;
              // Alinear ojo del portal de destino con su normal en el primer frame
              try { (destPortalObj as any).eyeDir = { x: fwd.x, y: fwd.y, z: fwd.z }; } catch {}
            }
          } catch {}
          // Reactivar colisiones solo al aparecer en el nuevo sistema
          try { engine.collisionsDisabled = false; } catch {}
          // Logs y persistencia del generado
          try { GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'GateRite switched system after fade', { id: snapshot.id, reusedArchivedSystem }); } catch {}
          try {
            const persistence: any = engine.portalPersistenceService;
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
    try {
      const ship: any = (_engine as any)['spaceship'];
      if (ship) this.arrivalStartSpeed = Number(ship.currentSpeed) || 0;
    } catch { this.arrivalStartSpeed = 0; }
  }

  private updateArrivalDecel(engine: GameEngine, dt: number) {
    this.arrivalElapsed += dt;
    try {
      const ship: any = engine.spaceship;
      if (ship) {
        // Interpolar velocidad lineal (o con easing suave) desde arrivalStartSpeed hasta 1u/s a lo largo de arrivalDuration
        const targetStable = 1;
        const k = Math.min(1, this.arrivalElapsed / Math.max(0.0001, this.arrivalDuration));
        // Usar ease-out suave para que la pérdida de velocidad sea perceptible desde el inicio
        const easeOut = (x:number)=>1 - Math.pow(1 - x, 2.5);
        const ke = easeOut(k);
        const start = this.arrivalStartSpeed > targetStable ? this.arrivalStartSpeed : targetStable;
        const desiredSpeed = start + (targetStable - start) * ke; // va descendiendo hacia 1
        ship.currentSpeed = desiredSpeed;
        ship.targetSpeed = targetStable; // mantener objetivo final en 1
        // Comprobar estabilidad cerca de la meta
        const speedError = Math.abs(desiredSpeed - targetStable);
        const vel = ship.velocity || { x: 0, y: 0, z: 0 };
        const velMag = Math.hypot(vel.x || 0, vel.y || 0, vel.z || 0);
        const motionOk = Math.abs(velMag - targetStable) <= 0.06 && speedError <= 0.08;
        // Finalizar sólo al completar easing y estar dentro del umbral
        if (k >= 1 && motionOk) {
          // Anclar a 1u/s para estabilidad
          ship.currentSpeed = targetStable;
          // Reactivar y rellenar Void Energy al 100%
          ship.voidEnergyPaused = false;
          ship.voidEnergyCurrent = ship.voidEnergyMax;
          try { engine.voidJumpActive = false; } catch {}
          // Desactivar suavizado de alta velocidad al finalizar el rito
          try { const ship: any = engine.spaceship; if (ship?.setHighSpeedSmoothing) ship.setHighSpeedSmoothing(false); } catch {}
          // Cambiar a cámara de HUD/cabina (modo 8) como último paso
          try {
            engine.camera?.setCameraMode?.(CameraMode.COCKPIT);
            // Iniciar fade-in del HUD cuando entramos en modo cabina
            if (engine.hudManager?.startFadeIn) {
              engine.hudManager.startFadeIn(0.32); // 320ms dentro del rango solicitado
            }
          } catch {}
          if (ship._gateRiteOriginalDecel !== undefined) { ship.deceleration = ship._gateRiteOriginalDecel; delete ship._gateRiteOriginalDecel; }
          // Clear any lingering speed input flags (avoid phantom brake after rite)
          try {
            if (ship.controls) {
              ship.controls.speedDown = false;
              ship.controls.speedUp = false; // release accelerate to let player re-engage cleanly
            }
          } catch {}
          // If targetSpeed was anchored low (e.g., 1), sync to currentSpeed to prevent immediate forced decel
          try { if (ship.targetSpeed < ship.currentSpeed) ship.targetSpeed = ship.currentSpeed; } catch {}
          this.phase = GateRitePhase.Completed;
          this.complete = true;
          return;
        }
      }
    } catch {}
  }

  private finishEarly(engine: GameEngine, reason: string) {
    try { engine.showPlaceholderText?.('GATE RITE ABORT: ' + reason, 1800); } catch {}
    this.phase = GateRitePhase.Completed;
    this.complete = true;
    // Restore camera if we changed it
    try {
      const cam = engine.camera;
      if (cam?.setCameraMode && this.prevCameraMode !== null) {
        cam.setCameraMode(this.prevCameraMode);
      }
    } catch {}
  }

  override cleanup(engine: GameEngine): void {
    // Emergency cleanup - restore all modified game state
    try {
      // Reset flags
      engine.voidJumpActive = false;
      engine.collisionsDisabled = false;
      // Restore void energy
      const ship = engine.spaceship;
      if (ship) {
        ship.voidEnergyPaused = false;
      }
      // Restore camera
      const cam = engine.camera;
      if (cam?.setCameraMode && this.prevCameraMode !== null) {
        cam.setCameraMode(this.prevCameraMode);
      }
      // Clear streaks
      this.streakSeeds = [];
    } catch (err) {
      try { GameLogger.error(LogCategory.ANIMATION, 'GateRiteAnimation cleanup() error', err); } catch {}
    }
  }

  override render(engine: GameEngine): void {
    // Render speed streaks only once acceleration is active (after travelling completes)
    if (this.phase === GateRitePhase.Transit && this.streakSeeds.length && this.accelActive) {
      try {
        const gl = engine.gl as WebGL2RenderingContext;
        const shaderManager: any = engine.shaderManager;
        const cam: any = engine.camera;
        const ship: any = engine.spaceship;
        if (gl && shaderManager && cam && ship) {
          const speedFactor = Math.min(1, (ship.currentSpeed || 0) / Math.max(1, this.speedCapPreCross));
          const streakAlpha = Math.min(1, 0.12 + speedFactor * 0.7);
          if (streakAlpha > 0.01) {
            const camPos = cam.position;
            const fwd = (() => { const v = { x: cam.target.x - camPos.x, y: cam.target.y - camPos.y, z: cam.target.z - camPos.z }; const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x/l, y: v.y/l, z: v.z/l }; })();
            const upW = cam.up;
            const right = { x: fwd.y * upW.z - fwd.z * upW.y, y: fwd.z * upW.x - fwd.x * upW.z, z: fwd.x * upW.y - fwd.y * upW.x };
            const rl = Math.hypot(right.x, right.y, right.z) || 1; right.x/=rl; right.y/=rl; right.z/=rl;
            const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
            const lineLen = 2 + speedFactor * 16;
            const verts: number[] = [];
            const cols: number[] = [];
            for (const s of this.streakSeeds) {
              const base = { x: camPos.x + right.x * s.x + up.x * s.y + fwd.x * s.z,
                             y: camPos.y + right.y * s.x + up.y * s.y + fwd.y * s.z,
                             z: camPos.z + right.z * s.x + up.z * s.y + fwd.z * s.z };
              const tip = { x: base.x - fwd.x * lineLen, y: base.y - fwd.y * lineLen, z: base.z - fwd.z * lineLen };
              verts.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
              cols.push(1,1,1, 0.65,0.7,0.85);
            }
            shaderManager.useBasicProgram?.();
            const prog: WebGLProgram = shaderManager.basicProgram!;
            gl.useProgram(prog);
            if (shaderManager.setBasicMatrices) shaderManager.setBasicMatrices(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]), cam.viewMatrix, cam.projectionMatrix);
            const vbo = gl.createBuffer()!; const cbo = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
            const aPos = shaderManager.basicAttributes?.['position'] ?? gl.getAttribLocation(prog, 'a_position');
            gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
            const aCol = shaderManager.basicAttributes?.['color'] ?? gl.getAttribLocation(prog, 'a_color');
            gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
            const wasBlend = gl.isEnabled(gl.BLEND); const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.DEPTH_TEST);
            gl.drawArrays(gl.LINES, 0, this.streakSeeds.length * 2);
            gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aCol);
            if (!wasBlend) gl.disable(gl.BLEND);
            if (!wasDepth) gl.disable(gl.DEPTH_TEST);
            gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.deleteBuffer(vbo); gl.deleteBuffer(cbo);
          }
        }
      } catch {}
    }
    // Render 500ms full-screen fade during FadeSwitch
    if (this.phase === GateRitePhase.FadeSwitch) {
      try {
        const overlay: any = engine.overlayRenderer;
        if (overlay) {
          const t = Math.min(1, Math.max(0, this.fadeElapsed / Math.max(0.001, this.fadeDuration)));
          overlay.drawSolid([0,0,0], t);
        }
      } catch {}
    }
  }

  override isBlockingInputs(): boolean { return !this.complete; }
}
