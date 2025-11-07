import { GameAnimation } from './types';
import { ITargetable, TargetType } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';

// Phases enumerated according to design doc (future phases stubbed)
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

  // Camera zoom state
  private zoomDuration = 2.5; // seconds
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
    // Force camera to external immobile mode so our transform isn't overridden
    try {
      const cam: any = (engine as any).camera;
      if (cam?.getCurrentMode && cam?.setCameraMode) {
        this.prevCameraMode = cam.getCurrentMode();
        cam.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
      }
    } catch {}
    this.enterCameraZoomOut(engine);
  }

  private enterCameraZoomOut(engine: GameEngine) {
    this.phase = GateRitePhase.CameraZoomOut;
    this.zoomElapsed = 0;
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
    // easeOutCubic
    const eased = 1 - Math.pow(1 - tNorm, 3);

    const planetPos: any = (this.targetPlanet as any).position;
    const planetRadius: number = (this.targetPlanet as any).radius || 10;
    const dirX = cam.position.x - planetPos.x;
    const dirY = cam.position.y - planetPos.y;
    const dirZ = cam.position.z - planetPos.z;
    const len = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ) || 1;
    const normX = dirX / len;
    const normY = dirY / len;
    const normZ = dirZ / len;
  // Compute desired distance: ensure projected planet occupies <=45% of viewport height (simple heuristic)
  const desiredDistance = Math.max(len, planetRadius * this.targetDistanceMultiplier + 40);
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
      try { (engine as any).showPlaceholderText?.('GATE RITE: PHASE 1 COMPLETE', 1000); } catch {}
      // Until next phases are implemented, end animation and restore camera mode
      this.phase = GateRitePhase.Completed;
      this.finished = true;
      try {
        const cam: any = (engine as any).camera;
        if (cam?.setCameraMode && this.prevCameraMode !== null) {
          cam.setCameraMode(this.prevCameraMode);
        }
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
