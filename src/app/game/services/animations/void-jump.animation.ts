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

  // Phase timings (seconds) - tuned for slower lookAt, longer accel to 200, and short hold at top speed
  private orientTime = 2.0;
  private speedRampTime = 1.8;
  private speedHoldTime = 3.5; // keep 200 for a bit
  private fadeInTime = 0.6;
  private fadeHoldTime = 0.25;
  private fadeOutTime = 1.8;

  private totalTime = 0;
  private teleportMoment = 0; // time at which teleport happens

  private target!: ITargetable;
  private prevCameraMode!: CameraMode;
  private originalMaxSpeed = 0;
  private originalAcceleration = 0;
  private originalDeceleration = 0;

  private overlayAlpha = 0;
  // Particle streaks during jump (static seeds in camera-local space)
  private streakSeeds: Array<{x:number;y:number;z:number}> = [];
  private streakNearZ = 2;
  private streakFarZ = 100;
  private streakBaseSpeed = 20; // units per second along -Z (camera forward)
  private streakMaxBoost = 220; // additional speed when at max visual speed
  private lastUpdateTime = 0;
  private savedVoidEnergy = 0;

  start(engine: GameEngine, target: ITargetable): void {
    this.target = target;
    // Camera: store mode and switch to mode 0 during animation
    this.prevCameraMode = engine['camera']?.getCurrentMode?.() ?? CameraMode.INMOVILE_EXTERNAL;
    engine['camera']?.setCameraMode?.(CameraMode.INMOVILE_EXTERNAL);

    // Ship: store and temporarily extend dynamics for visual ramp; pause void energy consumption
    this.originalMaxSpeed = engine['spaceship']?.maxSpeed ?? 5;
    this.originalAcceleration = engine['spaceship']?.acceleration ?? 2;
    this.originalDeceleration = engine['spaceship']?.deceleration ?? 2.5;
    if (engine['spaceship']) {
      engine['spaceship'].maxSpeed = 200; // higher top speed during jump
      engine['spaceship'].acceleration = 150; // reach 200 quickly
      engine['spaceship'].deceleration = 200; // snap to 0 after teleport
      engine['spaceship'].voidEnergyPaused = true;
      this.savedVoidEnergy = engine['spaceship'].voidEnergyCurrent ?? 0;
    }

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

    // Timeline: orient → ramp → HOLD@200 → fade-in → hold → fade-out
    this.teleportMoment = this.orientTime + this.speedRampTime + this.speedHoldTime + this.fadeInTime * 0.9; // near end of fade-in
    this.totalTime = this.orientTime + this.speedRampTime + this.speedHoldTime + this.fadeInTime + this.fadeHoldTime + this.fadeOutTime;
    this.lastUpdateTime = 0;
  }

  update(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    const ship = (engine as any).spaceship as any;
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

    // Phase 2: speed ramp (visual) up to 200
    if (this.t > this.orientTime && this.t <= this.orientTime + this.speedRampTime) {
      const k = clamp01((this.t - this.orientTime) / this.speedRampTime);
      ship.thrusterState = ship.ThrusterState?.ACCELERATING ?? ship.thrusterState;
      ship.targetSpeed = Math.min(ship.maxSpeed, lerp(30, 200, k));
    }

    // Phase 2.5: hold at 200
    const holdTopStart = this.orientTime + this.speedRampTime;
    if (this.t > holdTopStart && this.t <= holdTopStart + this.speedHoldTime) {
      ship.thrusterState = ship.ThrusterState?.CRUISING ?? ship.thrusterState;
      ship.targetSpeed = Math.min(ship.maxSpeed, 200);
    }

    // Phase 3: fade in
    const fadeStart = this.orientTime + this.speedRampTime + this.speedHoldTime;
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
      // Reset ship speed limits and camera; restore void energy and resume drain
      if (engine['spaceship']) {
        engine['spaceship'].maxSpeed = this.originalMaxSpeed;
        engine['spaceship'].acceleration = this.originalAcceleration;
        engine['spaceship'].deceleration = this.originalDeceleration;
        engine['spaceship'].targetSpeed = 0;
        engine['spaceship'].currentSpeed = 0;
        engine['spaceship'].voidEnergyCurrent = this.savedVoidEnergy;
        engine['spaceship'].voidEnergyPaused = false;
      }
      engine['camera']?.setCameraMode?.(this.prevCameraMode);
      this.blocking = false;
      return true;
    }
    return false;
  }

  render(engine: GameEngine): void {
    const gl = (engine as any).gl as WebGL2RenderingContext;
    const shaderManager = (engine as any).shaderManager as any;
    const cam = (engine as any).camera;
    if (!gl || !shaderManager || !cam) return;

  // First: draw speed streaks (lines) only after the look-at phase has completed
    // Streak length grows with current visual speed factor (0..1)
    const ship = (engine as any).spaceship as any;
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

    // Then: white overlay fade
    if (this.overlayAlpha <= 0) return;

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

    // Ensure a stable normal for the overlay quad: set constant normal (0,0,1)
    const aNormal = shaderManager.litAttributes['normal'];
    if (typeof aNormal === 'number' && aNormal >= 0) {
      try {
        gl.disableVertexAttribArray(aNormal);
        gl.vertexAttrib3f(aNormal, 0, 0, 1);
      } catch {}
    }

    // Model matrix is identity; we provide coordinates directly in world space
    const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    // No normals used; use existing lighting but color is white and opacity does the fade
    const normalM = identity;
    (engine as any).calculateNormalMatrix(identity);
    shaderManager.setLitMatrices(identity, cam.viewMatrix, cam.projectionMatrix, normalM);

  // Blending setup (preserve previous state)
  const wasBlend = gl.isEnabled(gl.BLEND);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (shaderManager.setLitOpacity) shaderManager.setLitOpacity(this.overlayAlpha);

  // Depth-off to ensure overlay draws on top
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    if (wasDepth) gl.disable(gl.DEPTH_TEST);

  // Ensure culling is off so both overlay triangles render regardless of winding
  const wasCull = gl.isEnabled(gl.CULL_FACE);
  if (wasCull) gl.disable(gl.CULL_FACE);

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Cleanup
    if (wasDepth) gl.enable(gl.DEPTH_TEST);
  if (!wasBlend) gl.disable(gl.BLEND);
  if (wasCull) gl.enable(gl.CULL_FACE);
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
