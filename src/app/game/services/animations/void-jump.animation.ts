import { GameAnimation } from './types';
import { ITargetable, TargetType } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export class VoidJumpAnimation implements GameAnimation {
  public readonly name = 'void-jump';

  private t = 0; // seconds elapsed
  private blocking = true;

  // Phase timings (seconds)
  private orientTime = 1.2;
  private speedRampTime = 0.8;
  private fadeInTime = 0.6;
  private fadeHoldTime = 0.2;
  private fadeOutTime = 0.8;

  private totalTime = 0;
  private teleportMoment = 0; // time at which teleport happens

  private target!: ITargetable;
  private prevCameraMode!: CameraMode;
  private originalMaxSpeed = 0;

  private overlayAlpha = 0;

  start(engine: GameEngine, target: ITargetable): void {
    this.target = target;
    // Camera: store mode and switch to mode 0 during animation
    this.prevCameraMode = engine['camera']?.getCurrentMode?.() ?? CameraMode.INMOVILE_EXTERNAL;
    engine['camera']?.setCameraMode?.(CameraMode.INMOVILE_EXTERNAL);

    // Ship: store and temporarily extend max speed for visual ramp
    this.originalMaxSpeed = engine['spaceship']?.maxSpeed ?? 5;
    if (engine['spaceship']) {
      engine['spaceship'].maxSpeed = 100; // visual effect
    }

    // Timeline
    this.teleportMoment = this.orientTime + this.speedRampTime + this.fadeInTime * 0.9; // near end of fade-in
    this.totalTime = this.orientTime + this.speedRampTime + this.fadeInTime + this.fadeHoldTime + this.fadeOutTime;
  }

  update(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    const ship = (engine as any).spaceship as any;
    if (!ship) return true;

    // Phase 1: orient
    if (this.t <= this.orientTime) {
      const k = clamp01(this.t / this.orientTime);
      // Smoothly steer nose to target center
      const center = this.getTargetCenter(engine, this.target);
      // Interpolate look direction by slerp-like lerp on direction vectors
      // Build intermediate aim point between current forward and desired
      const curDir = ship.forwardDirection as { x: number; y: number; z: number };
      const desired = this.normalize({ x: center.x - ship.position.x, y: center.y - ship.position.y, z: center.z - ship.position.z });
      const aim = this.normalize({ x: lerp(curDir.x, desired.x, k), y: lerp(curDir.y, desired.y, k), z: lerp(curDir.z, desired.z, k) });
      // Move a small temporary point along aim to lookAt
      const aimPoint = { x: ship.position.x + aim.x, y: ship.position.y + aim.y, z: ship.position.z + aim.z };
      ship.lookAt(aimPoint);
      // Gentle engine visual
      ship.thrusterState = ship.ThrusterState?.ACCELERATING ?? ship.thrusterState;
      ship.targetSpeed = Math.min(ship.maxSpeed, lerp(0, 30, k));
    }

    // Phase 2: speed ramp (visual)
    if (this.t > this.orientTime && this.t <= this.orientTime + this.speedRampTime) {
      const k = clamp01((this.t - this.orientTime) / this.speedRampTime);
      ship.thrusterState = ship.ThrusterState?.ACCELERATING ?? ship.thrusterState;
      ship.targetSpeed = Math.min(ship.maxSpeed, lerp(30, 100, k));
    }

    // Phase 3: fade in
    const fadeStart = this.orientTime + this.speedRampTime;
    if (this.t > fadeStart) {
      const k = clamp01((this.t - fadeStart) / this.fadeInTime);
      this.overlayAlpha = lerp(0, 0.85, k);
    }

    // Teleport once at teleportMoment
    if (this.t >= this.teleportMoment && (this.t - dt) < this.teleportMoment) {
      this.doTeleport(engine, this.target);
      // After teleport, stop movement to prevent drift
      ship.currentSpeed = 0;
      ship.targetSpeed = 0;
      ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    }

    // Phase 4: hold white briefly
    const holdStart = fadeStart + this.fadeInTime;
    if (this.t >= holdStart && this.t <= holdStart + this.fadeHoldTime) {
      this.overlayAlpha = 0.85;
    }

    // Phase 5: fade out
    const fadeOutStart = holdStart + this.fadeHoldTime;
    if (this.t > fadeOutStart) {
      const k = clamp01((this.t - fadeOutStart) / this.fadeOutTime);
      this.overlayAlpha = lerp(0.85, 0.0, k);
    }

    // Finish
    if (this.t >= this.totalTime) {
      // Reset ship speed limits and camera
      if (engine['spaceship']) {
        engine['spaceship'].maxSpeed = this.originalMaxSpeed;
        engine['spaceship'].targetSpeed = 0;
        engine['spaceship'].currentSpeed = 0;
      }
      engine['camera']?.setCameraMode?.(this.prevCameraMode);
      this.blocking = false;
      return true;
    }
    return false;
  }

  render(engine: GameEngine): void {
    if (this.overlayAlpha <= 0) return;
    const gl = (engine as any).gl as WebGL2RenderingContext;
    const shaderManager = (engine as any).shaderManager as any;
    const cam = (engine as any).camera;
    if (!gl || !shaderManager || !cam) return;

    // Build a camera-facing full-screen quad at distance d
    const d = 1.0;
    const proj = cam.projectionMatrix as Float32Array;
    const f = proj[5] || 1; // = 1/tan(fov/2)
    const tanHalfFovy = 1 / f;
    const aspect = (proj[0] !== 0) ? (f / proj[0]) : 1.7777778;
    const halfH = d * tanHalfFovy;
    const halfW = halfH * aspect;

    // Camera basis
    const camPos = cam.position;
    const fwd = this.normalize({ x: cam.target.x - camPos.x, y: cam.target.y - camPos.y, z: cam.target.z - camPos.z });
    const worldUp = cam.up;
    const right = this.normalize({
      x: fwd.y * worldUp.z - fwd.z * worldUp.y,
      y: fwd.z * worldUp.x - fwd.x * worldUp.z,
      z: fwd.x * worldUp.y - fwd.y * worldUp.x,
    });
    const up = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    };

    const center = { x: camPos.x + fwd.x * d, y: camPos.y + fwd.y * d, z: camPos.z + fwd.z * d };

    const tl = { x: center.x - right.x * halfW + up.x * halfH, y: center.y - right.y * halfW + up.y * halfH, z: center.z - right.z * halfW + up.z * halfH };
    const tr = { x: center.x + right.x * halfW + up.x * halfH, y: center.y + right.y * halfW + up.y * halfH, z: center.z + right.z * halfW + up.z * halfH };
    const br = { x: center.x + right.x * halfW - up.x * halfH, y: center.y + right.y * halfW - up.y * halfH, z: center.z + right.z * halfW - up.z * halfH };
    const bl = { x: center.x - right.x * halfW - up.x * halfH, y: center.y - right.y * halfW - up.y * halfH, z: center.z - right.z * halfW - up.z * halfH };

    const verts = new Float32Array([
      tl.x, tl.y, tl.z,
      tr.x, tr.y, tr.z,
      br.x, br.y, br.z,
      bl.x, bl.y, bl.z,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);

    // Draw using lit program with pure white color and opacity
    shaderManager.useLitProgram();
    shaderManager.setLitColor(new Float32Array([1, 1, 1]));
    shaderManager.setSpecular(new Float32Array([cam.position.x, cam.position.y, cam.position.z]), 0.0, 1.0);

    // Build a model matrix via manual buffer (non-indexed attributes not needed, we just draw a small mesh)
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);

    // Bind position attribute for lit program
    const aPos = shaderManager.litAttributes['position'];
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    // Model matrix is identity; we provide coordinates directly in world space
    const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    // No normals used; use existing lighting but color is white and opacity does the fade
    const normalM = identity;
    (engine as any).calculateNormalMatrix(identity);
    shaderManager.setLitMatrices(identity, cam.viewMatrix, cam.projectionMatrix, normalM);

    // Blending setup
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (shaderManager.setLitOpacity) shaderManager.setLitOpacity(this.overlayAlpha);

    // Depth-off to ensure overlay draws on top
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    if (wasDepth) gl.disable(gl.DEPTH_TEST);

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Cleanup
    if (wasDepth) gl.enable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ibo);
  }

  isBlockingInputs(): boolean { return this.blocking; }

  // Helpers
  private getTargetCenter(engine: GameEngine, t: ITargetable): { x: number; y: number; z: number } {
    const anyT: any = t as any;
    if (anyT.boundingSphere && anyT.boundingSphere.center) return { ...anyT.boundingSphere.center };
    if (anyT.position) return { x: anyT.position.x, y: anyT.position.y, z: anyT.position.z };
    return { x: 0, y: 0, z: 0 };
  }
  private getTargetRadius(t: ITargetable): number {
    const anyT: any = t as any;
    if (anyT.boundingSphere && typeof anyT.boundingSphere.radius === 'number') return Number(anyT.boundingSphere.radius) || 0;
    if (anyT.scale && typeof anyT.scale.x === 'number') return Number(anyT.scale.x) || 0;
    if (typeof anyT.radius === 'number') return Number(anyT.radius) || 0;
    return 0;
  }
  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  private doTeleport(engine: GameEngine, target: ITargetable): void {
    const ship = (engine as any).spaceship as any;
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
}
