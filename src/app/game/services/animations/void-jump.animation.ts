import { ITargetable, TargetType } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { SpellType } from '../../types/spell.types';
import { clamp01, lerp } from './animation-math';
import { InputLockGuard, CameraTakeover, ShipDynamicsScope } from './animation-tools';
import { BaseAnimation } from './base-animation';
import { OverlayImage } from './animation-overlay';

export class VoidJumpAnimation extends BaseAnimation {
  public readonly name = 'void-jump';
  public readonly spellType = SpellType.LONGJUMP;

  private t = 0; // seconds elapsed

  // Phase timings (seconds) - tuned for slower lookAt, longer accel to 200, and short hold at top speed
  private orientTime = 6.0; // much slower reorientation for dramatic buildup
  private speedRampTime = 1.8;
  private speedHoldTime = 3.5; // keep 200 for a bit
  private fadeInTime = 0.6;
  private fadeHoldTime = 0.0; // no simple hold; we'll show an image instead
  private fadeOutTime = 1.8;
  private imageDisplayTime = 3.0; // show image for 3 seconds

  private totalTime = 0;
  private teleportMoment = 0; // time at which teleport happens

  private target!: ITargetable;
  private readonly cameraTakeover = new CameraTakeover();
  private readonly shipDynamics = new ShipDynamicsScope();
  private readonly inputLock = new InputLockGuard();
  private cockpitLatched = false;

  private overlayAlpha = 0;
  private overlayColor: [number, number, number] = [1, 1, 1];
  private flashImageUrls: string[] = [];
  private readonly overlayImage = new OverlayImage();
  // Particle streaks during jump (static seeds in camera-local space)
  private streakSeeds: Array<{x:number;y:number;z:number}> = [];
  private streakNearZ = 2;
  private streakFarZ = 100;
  private streakBaseSpeed = 20; // units per second along -Z (camera forward)
  private streakMaxBoost = 220; // additional speed when at max visual speed
  private lastUpdateTime = 0;

  protected override onStart(engine: GameEngine, target?: ITargetable): void {
    this.target = target as ITargetable;
    // Cámara: guardar el modo y tomar INMOVILE_EXTERNAL durante la animación.
    this.cameraTakeover.take(engine.camera, CameraMode.INMOVILE_EXTERNAL);

    // Nave: guardar dinámica (NO se sube maxSpeed) — solo se potencian accel/decel; pausa energía del vacío.
    const ship = engine.spaceship;
    if (ship) {
      this.shipDynamics.capture(ship, true);
      ship.acceleration = 150; // ramp rápido por encima de maxSpeed
      ship.deceleration = 200; // frenada rápida tras el teleport
    }
    // Mark engine void-jump active for HUD/audio clamping
    engine.voidJumpActive = true;
    // Global key blockers: prevent ALL gameplay keys (panels, speed, camera, etc.)
    this.inputLock.lock();

    // Build streak seeds (camera-local positions ahead of camera)
    this.streakSeeds = [];
    const count = 160;
    for (let i = 0; i < count; i++) {
      // random in a frustum-like volume in front of camera
      const z = this.streakNearZ + Math.random() * (this.streakFarZ - this.streakNearZ); // distance ahead
      const y = (Math.random() * 2 - 1) * 20;
      const x = (Math.random() * 2 - 1) * 35;
      this.streakSeeds.push({x, y, z});
    }

  // Timeline: orient → ramp → HOLD@200 → fade to black → [IMAGE 3s with zoom] → fade-in to scene
  this.teleportMoment = this.orientTime + this.speedRampTime + this.speedHoldTime + this.fadeInTime * 0.9; // near end of fade-to-black
  this.totalTime = this.orientTime + this.speedRampTime + this.speedHoldTime + this.fadeInTime + this.imageDisplayTime + this.fadeOutTime;
    this.lastUpdateTime = 0;
    this.cockpitLatched = false;

    // Imagen de flash opcional (si está configurada). Carga vía OverlayImage (URLs candidatas resilientes).
    if (this.flashImageUrls.length && engine.textureManager) {
      this.overlayColor = [0, 0, 0]; // better contrast for images
      const url = this.flashImageUrls[0];
      const basename = url.split('/').pop() || url;
      // Clave ÚNICA por imagen: cada Dios Primigenio usa su propia textura (antes 'void-flash-0' fija
      // reutilizaba la textura cacheada del salto anterior y no cargaba la nueva).
      this.overlayImage.load(engine, `void-flash-${basename}`, [
        url, // as provided
        `/assets/${basename}`,
        `/app/assets/${basename}`,
        `/src/app/assets/${basename}`,
      ]);
    } else {
      this.overlayColor = [1, 1, 1];
    }

    this.onTeardown((eng) => this.teardownVoidJump(eng));
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    const ship = engine.spaceship as any;
    if (!ship) return true;

    // Update streaks movement in camera-local Z: faster as visual speed increases
    const speedFactor = Math.min(1, (ship?.currentSpeed ?? 0) / Math.max(1, ship?.maxSpeed ?? 1));
    const streakSpeed = this.streakBaseSpeed + this.streakMaxBoost * speedFactor;
    if (this.streakSeeds.length) {
      for (let i = 0; i < this.streakSeeds.length; i++) {
        const s = this.streakSeeds[i];
        s.z -= streakSpeed * dt; // move towards camera (backwards along camera-forward)
        if (s.z < this.streakNearZ) {
          // Respawn far ahead with new lateral jitter
          s.z = this.streakFarZ + Math.random() * 20;
          s.x = (Math.random() * 2 - 1) * 35;
          s.y = (Math.random() * 2 - 1) * 20;
        }
      }
    }

    // Phase 1: orient
    if (this.t <= this.orientTime) {
      const kLin = clamp01(this.t / this.orientTime);
      // Smoothstep easing for slower start/end of the look-at motion
      const k = kLin * kLin * (3 - 2 * kLin);
      // Smoothly steer nose to target center
      const center = this.getTargetCenter(engine, this.target);
      // Interpolate look direction by slerp-like lerp on direction vectors
      // Build intermediate aim point between current forward and desired
      const curDir = ship.forwardDirection as { x: number; y: number; z: number };
      const desired = this.normalize({ x: center.x - ship.position.x, y: center.y - ship.position.y, z: center.z - ship.position.z });
      const aim = this.normalize({ x: lerp(curDir.x, desired.x, k), y: lerp(curDir.y, desired.y, k), z: lerp(curDir.z, desired.z, k) });
      // Move a small temporary point along aim to lookAt
      const aimPoint = { x: ship.position.x + aim.x, y: ship.position.y + aim.y, z: ship.position.z + aim.z };
      
      // Extraer el vector "up" actual de la nave para preservar el roll
      // El eje Y local (up) está en la segunda fila de orientationMatrix (índices 4,5,6)
      const currentUp = {
        x: ship.orientationMatrix[4],
        y: ship.orientationMatrix[5],
        z: ship.orientationMatrix[6]
      };
      
      // Usar el up actual como upHint para que lookAt preserve el roll
      ship.lookAt(aimPoint, currentUp);
      
      // Gentle engine visual
      ship.thrusterState = ship.ThrusterState?.ACCELERATING ?? ship.thrusterState;
      ship.targetSpeed = Math.min(ship.maxSpeed, lerp(0, 30, k));
    }

  // Phase 2: speed ramp (visual) up to 200 (targetSpeed may exceed maxSpeed intentionally)
    if (this.t > this.orientTime && this.t <= this.orientTime + this.speedRampTime) {
      const k = clamp01((this.t - this.orientTime) / this.speedRampTime);
      ship.thrusterState = ship.ThrusterState?.ACCELERATING ?? ship.thrusterState;
  ship.targetSpeed = lerp(30, 200, k); // exceed maxSpeed without altering maxSpeed
    }

    // Phase 2.5: hold at 200
    const holdTopStart = this.orientTime + this.speedRampTime;
    if (this.t > holdTopStart && this.t <= holdTopStart + this.speedHoldTime) {
      ship.thrusterState = ship.ThrusterState?.CRUISING ?? ship.thrusterState;
  ship.targetSpeed = 200; // hold even if > maxSpeed
    }

    // Phase 3: fade to overlay (black if images, white otherwise)
    const fadeStart = this.orientTime + this.speedRampTime + this.speedHoldTime;
    if (this.t > fadeStart) {
      const k = clamp01((this.t - fadeStart) / this.fadeInTime);
      this.overlayAlpha = lerp(0, 1.0, k);
    }

    // Teleport once at teleportMoment
    if (this.t >= this.teleportMoment && (this.t - dt) < this.teleportMoment) {
      this.doTeleport(engine, this.target);
      // After teleport, stop movement to prevent drift
      ship.currentSpeed = 0;
      ship.targetSpeed = 0;
      ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    }

    // Phase 4: show image during 3s window (overlay stays opaque)
    const holdStart = fadeStart + this.fadeInTime;
    const holdEnd = holdStart + this.imageDisplayTime;
    if (this.t >= holdStart && this.t <= holdEnd) {
      this.overlayAlpha = 1.0;
    }

    // Phase 5: fade-in scene (remove overlay)
    const fadeOutStart = holdEnd;
    if (this.t > fadeOutStart) {
      if (!this.cockpitLatched) {
        this.cameraTakeover.setMode(engine.camera, CameraMode.COCKPIT, true);
        this.cockpitLatched = true;
      }
      const k = clamp01((this.t - fadeOutStart) / this.fadeOutTime);
      this.overlayAlpha = lerp(1.0, 0.0, k);
    }

    // Fin: el cierre (restaurar nave/cámara/input) lo unifica BaseAnimation vía teardown + onFinish.
    if (this.t >= this.totalTime) {
      return true;
    }
    return false;
  }

  /** Teardown común (fin natural o cleanup de emergencia): restaura nave/cámara e input UNA vez. */
  private teardownVoidJump(engine: GameEngine): void {
    const ship = engine.spaceship;
    if (ship) {
      this.shipDynamics.restore(ship); // accel/decel/maxSpeed + energía del vacío + reanudar drenaje
      ship.targetSpeed = 0;
    }
    this.inputLock.release();
    engine.voidJumpActive = false;
    this.cameraTakeover.restore(engine.camera);
  }

  protected override onFinish(engine: GameEngine, aborted: boolean): void {
    if (!aborted) {
      // Fin natural: detener la nave del todo y notificar el salto completado.
      const ship = engine.spaceship;
      if (ship) {
        ship.currentSpeed = 0;
      }
      try { engine.handleVoidJumpCompleted(); } catch {}
    } else {
      // Cleanup de emergencia (muerte): reactivar colisiones.
      engine.collisionsDisabled = false;
    }
  }

  override render(engine: GameEngine): void {
    const gl = engine.gl as WebGL2RenderingContext;
    const shaderManager = engine.shaderManager as any;
    const cam = engine.camera;
    if (!gl || !shaderManager || !cam) return;
    const overlay = engine.overlayRenderer;

  // First: draw speed streaks (lines) only after the look-at phase has completed
    // Streak length grows with current visual speed factor (0..1)
    const ship = engine.spaceship as any;
    const speedFactor = Math.min(1, (ship?.currentSpeed ?? 0) / Math.max(1, ship?.maxSpeed ?? 1));
    const streakAlpha = Math.min(1, 0.12 + speedFactor * 0.7);
  if (this.t > this.orientTime && this.streakSeeds.length && streakAlpha > 0.01) {
      // Camera basis
      const camPos = cam.position;
      const fwd = this.normalize({ x: cam.target.x - camPos.x, y: cam.target.y - camPos.y, z: cam.target.z - camPos.z });
      const worldUp = cam.up;
      const right = this.normalize({ x: fwd.y * worldUp.z - fwd.z * worldUp.y, y: fwd.z * worldUp.x - fwd.x * worldUp.z, z: fwd.x * worldUp.y - fwd.y * worldUp.x });
      const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };

      const lineLen = 2 + speedFactor * 16;
      const verts: number[] = [];
      const cols: number[] = [];
      for (const s of this.streakSeeds) {
        // Build world-space position from camera-local seed
        const base = {
          x: camPos.x + right.x * (s.x) + up.x * (s.y) + fwd.x * (s.z),
          y: camPos.y + right.y * (s.x) + up.y * (s.y) + fwd.y * (s.z),
          z: camPos.z + right.z * (s.x) + up.z * (s.y) + fwd.z * (s.z),
        };
        const tip = { x: base.x - fwd.x * lineLen, y: base.y - fwd.y * lineLen, z: base.z - fwd.z * lineLen };
        verts.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
        // Slight tail fade
        cols.push(1,1,1, 0.65,0.7,0.85);
      }
      // Use basic program (position + color)
      shaderManager.useBasicProgram();
      const prog: WebGLProgram = shaderManager.basicProgram!;
      gl.useProgram(prog);
      // Set matrices
      if (shaderManager.setBasicMatrices) shaderManager.setBasicMatrices(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]), cam.viewMatrix, cam.projectionMatrix);
      // Buffers (dynamic, per-frame)
      const vbo = gl.createBuffer()!; const cbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      const aPos = shaderManager.basicAttributes['position'] ?? gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
      const aCol = shaderManager.basicAttributes['color'] ?? gl.getAttribLocation(prog, 'a_color');
      gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
  // Blending; depth test on so they depth-sort roughly with scene
      const wasBlend = gl.isEnabled(gl.BLEND); const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      // Global alpha via per-vertex color already attenuated; draw lines
      gl.drawArrays(gl.LINES, 0, this.streakSeeds.length * 2);
      // Cleanup
      gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aCol);
      if (!wasBlend) gl.disable(gl.BLEND);
      if (!wasDepth) gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.deleteBuffer(vbo); gl.deleteBuffer(cbo);
    }

    // Then: robust full-screen overlay via unlit full-screen triangle (background)
    if (this.overlayAlpha > 0 && overlay && overlay.drawSolid) {
      try { overlay.drawSolid(this.overlayColor, this.overlayAlpha); } catch {}
    }

    // Image window rendering with cover scaling and zoom (vía OverlayImage)
    if (this.overlayImage.ready) {
      const imageStart = this.orientTime + this.speedRampTime + this.speedHoldTime + this.fadeInTime;
      const imageEnd = imageStart + this.imageDisplayTime;
      if (this.t >= imageStart && this.t <= imageEnd) {
        // Linear zoom from 1.0 -> 1.3 across 3s
        const k = clamp01((this.t - imageStart) / Math.max(0.0001, this.imageDisplayTime));
        const zoom = 1.0 + 0.3 * k;
        this.overlayImage.drawCover(engine, zoom, 1.0);
      }
    }
  }

  // Helpers
  private getTargetCenter(engine: GameEngine, t: ITargetable): { x: number; y: number; z: number } {
    const at = t as { boundingSphere?: { center?: { x: number; y: number; z: number } }; position?: { x: number; y: number; z: number } };
    if (at.boundingSphere?.center) return { ...at.boundingSphere.center };
    if (at.position) return { x: at.position.x, y: at.position.y, z: at.position.z };
    return { x: 0, y: 0, z: 0 };
  }
  private getTargetRadius(t: ITargetable): number {
    const at = t as { boundingSphere?: { radius?: number }; scale?: { x?: number }; radius?: number };
    if (typeof at.boundingSphere?.radius === 'number') return Number(at.boundingSphere.radius) || 0;
    if (typeof at.scale?.x === 'number') return Number(at.scale.x) || 0;
    if (typeof at.radius === 'number') return Number(at.radius) || 0;
    return 0;
  }
  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  private doTeleport(engine: GameEngine, target: ITargetable): void {
    const ship = engine.spaceship as any;
    if (!ship) return;
    const c = this.getTargetCenter(engine, target);
    const r = this.getTargetRadius(target);
    // Direction from center to current ship position (fallback to +Z if degenerate)
    let dir = { x: ship.position.x - c.x, y: ship.position.y - c.y, z: ship.position.z - c.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-3) dir = { x: 0, y: 0, z: 1 };
    else dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

    const dst = r + 300; // 300u from edge
    const newPos = { x: c.x + dir.x * dst, y: c.y + dir.y * dst, z: c.z + dir.z * dst };

    ship.position.x = newPos.x;
    ship.position.y = newPos.y;
    ship.position.z = newPos.z;
    ship.updateModelMatrix();
    // Orient to look at center
    ship.lookAt(c);
  }

  /** Configura la imagen de flash (la usa el manager vía applyFlashConfig). */
  setFlashConfig(cfg: { images: string[] }): void {
    if (!cfg || !Array.isArray(cfg.images)) return;
    this.flashImageUrls = cfg.images.slice(0, 4);
  }
}
