import { LesserBeingBase, LesserBeingGlowConfig, LesserBeingTentacleConfig, LesserBeingVisualDescriptor } from '../game-objects/lesser-beings/lesser-being-base';
import { ShaderManager } from '../ShaderManager';
import { WebGLService } from '../../services/webgl.service';
import { Vector3, Color } from '../../types/game.types';
import { LesserBeingProjectileView } from '../services/lesser-beings/lesser-being-combat.service';

interface CameraBasis {
  right: Vector3;
  up: Vector3;
  forward: Vector3;
}

interface TentacleAnchorState {
  local: Vector3;
  phase: number;
}

interface TentacleRuntimeState {
  anchors: TentacleAnchorState[];
}

interface PustuleState {
  local: Vector3;
  radius: number;
  phase: number;
}

interface ShoggothRuntimeState {
  eyes: TentacleAnchorState[];
  pustules: PustuleState[];
}

interface GlowInstanceBatch {
  data: Float32Array;
  capacity: number;
  count: number;
  buffer: WebGLBuffer | null;
  sizeBytes: number;
  needsResize: boolean;
}

interface DeferredGlowSegment {
  center: Vector3;
  right: Vector3;
  up: Vector3;
  width: number;
  height: number;
  color: [number, number, number, number];
  additive: boolean;
  depthWrite: boolean;
}

/**
 * LesserBeingRenderer: encapsula efectos visuales complementarios (tentáculos, halos, auras)
 * para las entidades Lesser Being sin modificar el pipeline principal lit.
 */
export class LesserBeingRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly identityMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  private tentacleCache = new WeakMap<LesserBeingBase, TentacleRuntimeState>();
  private shoggothCache = new WeakMap<LesserBeingBase, ShoggothRuntimeState>();
  private static readonly GLOW_INSTANCE_FLOATS = 13;
  private glowCornerBuffer: WebGLBuffer | null = null;
  private glowUvBuffer: WebGLBuffer | null = null;
  private glowIndexBuffer: WebGLBuffer | null = null;
  private projectileGlowBatch: GlowInstanceBatch = this.createGlowBatch();
  private additiveGlowBatch: GlowInstanceBatch = this.createGlowBatch();
  private alphaGlowBatch: GlowInstanceBatch = this.createGlowBatch();
  private deferredTentacleSegments: DeferredGlowSegment[] = [];

  constructor(private readonly webgl: WebGLService, private readonly shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext;
  }

  private createGlowBatch(): GlowInstanceBatch {
    return {
      data: new Float32Array(0),
      capacity: 0,
      count: 0,
      buffer: null,
      sizeBytes: 0,
      needsResize: false
    };
  }

  public render(
    beings: LesserBeingBase[],
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    if (!beings?.length || !this.gl || !this.shaders) {
      return;
    }

    const cameraBasis = this.computeCameraBasis(viewMatrix);
    this.resetGlowBatch(this.alphaGlowBatch);
    this.resetGlowBatch(this.additiveGlowBatch);
    this.deferredTentacleSegments.length = 0;

    for (const being of beings) {
      if (!being || !being.visible || !being.isActive()) {
        continue;
      }
      const descriptor = being.getVisualDescriptor();
      if (!descriptor) {
        continue;
      }

      switch (descriptor.style) {
        case 'stellar-seed':
          this.renderStellarSeedVisuals(being, descriptor, cameraBasis, viewMatrix, projectionMatrix, timeSec);
          break;
        case 'shoggoth':
          this.renderShoggothVisuals(being, descriptor, cameraBasis, viewMatrix, projectionMatrix, timeSec);
          break;
        case 'rift-vampire':
          this.renderRiftVampireVisuals(being, descriptor, cameraBasis, viewMatrix, projectionMatrix, timeSec);
          break;
      }
    }

    this.flushGlowBatch(this.alphaGlowBatch, viewMatrix, projectionMatrix, false);
    this.flushGlowBatch(this.additiveGlowBatch, viewMatrix, projectionMatrix, true);
  }

  public renderProjectiles(
    projectiles: LesserBeingProjectileView[] | null | undefined,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    if (!projectiles?.length || !this.gl) {
      return;
    }
    const cameraBasis = this.computeCameraBasis(viewMatrix);
    this.resetGlowBatch(this.projectileGlowBatch);
    for (const projectile of projectiles) {
      if (!projectile) {
        continue;
      }
      switch (projectile.kind) {
        case 'acid_spit':
          this.renderAcidProjectile(projectile, cameraBasis, viewMatrix, projectionMatrix, timeSec);
          break;
        case 'orb':
          this.renderOrbProjectile(projectile, cameraBasis, viewMatrix, timeSec);
          break;
      }
    }
    this.flushGlowBatch(this.projectileGlowBatch, viewMatrix, projectionMatrix, true);
  }

  public hasDeferredTentacles(): boolean {
    return this.deferredTentacleSegments.length > 0;
  }

  public renderDeferredTentacles(viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.deferredTentacleSegments.length) {
      return;
    }
    for (const segment of this.deferredTentacleSegments) {
      this.drawGlowBillboard(
        segment.center,
        segment.right,
        segment.up,
        segment.width,
        segment.height,
        segment.color,
        viewMatrix,
        projectionMatrix,
        segment.additive,
        segment.depthWrite
      );
    }
    this.deferredTentacleSegments.length = 0;
  }

  private renderAcidProjectile(
    projectile: LesserBeingProjectileView,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
    const direction = this.normalize(projectile.velocity);
    const trailLength = Math.min(20, Math.max(6, speed * 0.08));
    const baseRadius = Math.max(1.25, projectile.radius * 0.85);
    const lifeRatio = Math.max(0, Math.min(1, projectile.remainingLife / Math.max(0.001, projectile.maxLife)));
    const swirlPhase = timeSec * 8 + projectile.remainingLife * 3;
    let swirlAxis = this.cross(direction, camera.forward);
    const swirlAxisMagnitude = Math.abs(swirlAxis.x) + Math.abs(swirlAxis.y) + Math.abs(swirlAxis.z);
    if (swirlAxisMagnitude < 0.001) {
      swirlAxis = { ...camera.up };
    }
    swirlAxis = this.normalize(swirlAxis);
    const wobble = Math.sin(swirlPhase) * baseRadius * 0.4;
    const wobbleOffset = this.scaleVector(swirlAxis, wobble);
    const headCenter = this.applyProjectileDepthBias(
      this.addVectors(projectile.position, wobbleOffset),
      camera.forward,
      viewMatrix
    );

    const headColor: [number, number, number, number] = [0.58, 1.0, 0.46, 0.82 + 0.15 * lifeRatio];
    const shellColor: [number, number, number, number] = [0.36, 0.95, 0.35, 0.55 * lifeRatio + 0.25];

    this.drawGlowBillboard(
      headCenter,
      camera.right,
      camera.up,
      baseRadius * 1.9,
      baseRadius * 1.45,
      headColor,
      viewMatrix,
      projectionMatrix,
      true,
      false
    );

    const bulgeCenter = this.applyProjectileDepthBias(
      this.subtractVectors(headCenter, this.scaleVector(direction, baseRadius * 0.9)),
      camera.forward,
      viewMatrix
    );
    this.drawGlowBillboard(
      bulgeCenter,
      camera.right,
      camera.up,
      baseRadius * 2.4,
      baseRadius * 1.8,
      shellColor,
      viewMatrix,
      projectionMatrix,
      true,
      false
    );

    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const decay = (1 - t * 0.35) * lifeRatio;
      const center = this.applyProjectileDepthBias(
        this.subtractVectors(headCenter, this.scaleVector(direction, trailLength * t)),
        camera.forward,
        viewMatrix
      );
      const width = baseRadius * (2.6 + t * 1.1);
      const height = width * 0.9;
      const color: [number, number, number, number] = [0.2 + 0.1 * t, 0.9 + 0.07 * (1 - t), 0.3 + 0.05 * (1 - t), 0.35 * decay + 0.12];
      this.drawGlowBillboard(
        center,
        camera.right,
        camera.up,
        width,
        height,
        color,
        viewMatrix,
        projectionMatrix,
        true,
        false
      );
    }
  }

  private renderOrbProjectile(
    projectile: LesserBeingProjectileView,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    timeSec: number
  ): void {
    const baseRadius = Math.max(0.55, projectile.radius * 0.42);
    const pulse = 0.8 + 0.2 * Math.sin(timeSec * 6 + projectile.remainingLife * 10);
    const center = this.applyProjectileDepthBias(projectile.position, camera.forward, viewMatrix);
    const coreColor: [number, number, number, number] = [0.95, 0.86, 0.32, 0.5 * pulse];
    const shellColor: [number, number, number, number] = [0.92, 0.68, 0.15, 0.35 * pulse];
    this.pushGlowInstance(
      this.projectileGlowBatch,
      center,
      this.scaleVector(camera.right, baseRadius * 1.9),
      this.scaleVector(camera.up, baseRadius * 1.9),
      shellColor
    );
    this.pushGlowInstance(
      this.projectileGlowBatch,
      center,
      this.scaleVector(camera.right, baseRadius * 1.2),
      this.scaleVector(camera.up, baseRadius * 1.2),
      coreColor
    );
  }

  private renderStellarSeedVisuals(
    being: LesserBeingBase,
    descriptor: LesserBeingVisualDescriptor,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    const tentacleConfig = descriptor.tentacles;
    if (tentacleConfig) {
      this.renderStellarTentacles(being, tentacleConfig, descriptor, camera, timeSec);
    }

    if (descriptor.halo) {
      this.renderGlowLayer(being, descriptor.halo, camera, viewMatrix, projectionMatrix, timeSec, () => ({
        x: being.position.x - being.forwardDirection.x * being.getBaseRadius() * 0.35,
        y: being.position.y - being.forwardDirection.y * being.getBaseRadius() * 0.35,
        z: being.position.z - being.forwardDirection.z * being.getBaseRadius() * 0.35
      }));
    }
  }

  private renderStellarTentacles(
    being: LesserBeingBase,
    config: LesserBeingTentacleConfig,
    descriptor: LesserBeingVisualDescriptor,
    camera: CameraBasis,
    timeSec: number
  ): void {
    const tentacles = this.getTentacleState(being, config);
    const baseRadius = being.getBaseRadius();
    const tailDir = this.normalize({
      x: -being.forwardDirection.x,
      y: -being.forwardDirection.y,
      z: -being.forwardDirection.z
    });
    const fallbackUp = Math.abs(tailDir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const lateral = this.normalize(this.cross(tailDir, fallbackUp));
    const binormal = this.normalize(this.cross(tailDir, lateral));
    const length = baseRadius * config.length;
    const noiseScale = (config.noiseScale ?? 0.65) * baseRadius;
    const noiseSpeed = config.noiseSpeed ?? 1.2;
    const segments = 6;

    for (const anchor of tentacles.anchors) {
      const anchorWorld = being.transformLocalPoint(anchor.local);
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const phase = timeSec * noiseSpeed + anchor.phase + t * 4.5;
        const wobblePrimary = Math.sin(phase) * noiseScale * (1 - t);
        const wobbleSecondary = Math.cos(phase * 0.8 + anchor.phase * 0.5) * noiseScale * 0.6 * (1 - t);
        const center = {
          x: anchorWorld.x + tailDir.x * length * t + lateral.x * wobblePrimary + binormal.x * wobbleSecondary,
          y: anchorWorld.y + tailDir.y * length * t + lateral.y * wobblePrimary + binormal.y * wobbleSecondary,
          z: anchorWorld.z + tailDir.z * length * t + lateral.z * wobblePrimary + binormal.z * wobbleSecondary
        };
        const width = Math.max(0.05, baseRadius * config.width * (1 - t * 0.85));
        const color = this.mixColor(config.color, config.tipColor ?? config.color, t);
        const alpha = (color.a ?? 0.85) * (1 - t * 0.6);
        this.queueTentacleSegment(center, camera.right, camera.up, width, width * 1.35, this.toRgba(color, alpha));
      }
    }
  }

  private queueTentacleSegment(
    center: Vector3,
    right: Vector3,
    up: Vector3,
    width: number,
    height: number,
    color: [number, number, number, number]
  ): void {
    this.deferredTentacleSegments.push({
      center: { ...center },
      right: { ...right },
      up: { ...up },
      width,
      height,
      color: [...color] as [number, number, number, number],
      additive: true,
      depthWrite: false
    });
  }

  private renderShoggothVisuals(
    being: LesserBeingBase,
    descriptor: LesserBeingVisualDescriptor,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    if (!descriptor.eyes && !descriptor.pustules) {
      return;
    }
    const cache = this.getShoggothState(being, descriptor);
    const baseRadius = being.getBaseRadius();

    if (descriptor.eyes) {
      const eyeRadius = Math.max(0.05, descriptor.eyes.radius) * baseRadius;
      for (const eye of cache.eyes) {
        const wobble = Math.sin(timeSec * (descriptor.eyes.wobbleSpeed ?? 0.45) + eye.phase) * eyeRadius * 0.15;
        const center = being.transformLocalPoint(eye.local);
        const normalDir = being.transformLocalDirection(eye.local);
        const outwardOffset = this.scaleVector(normalDir, baseRadius * 0.02);
        const surfaceAxes = this.buildSurfaceAxes(normalDir);
        const wobbleShift = this.scaleVector(surfaceAxes.up, wobble);
        const adjustedCenter = {
          x: center.x + outwardOffset.x + wobbleShift.x,
          y: center.y + outwardOffset.y + wobbleShift.y,
          z: center.z + outwardOffset.z + wobbleShift.z
        };
        const scleraColor = this.toRgba(descriptor.eyes.color ?? { r: 1, g: 1, b: 1, a: 0.9 }, 0.85);
        this.pushGlowInstance(
          this.alphaGlowBatch,
          adjustedCenter,
          this.scaleVector(surfaceAxes.right, eyeRadius * 0.9),
          this.scaleVector(surfaceAxes.up, eyeRadius * 0.9),
          scleraColor
        );
        const pupilColor = this.toRgba(descriptor.eyes.pupilColor ?? { r: 0.2, g: 0.6, b: 0.9, a: 0.9 }, 0.85);
        this.pushGlowInstance(
          this.additiveGlowBatch,
          adjustedCenter,
          this.scaleVector(surfaceAxes.right, eyeRadius * 0.45),
          this.scaleVector(surfaceAxes.up, eyeRadius * 0.45),
          pupilColor
        );
      }
    }

    if (descriptor.pustules) {
      for (const pustule of cache.pustules) {
        const pulse = 0.75 + 0.25 * Math.sin(timeSec * (descriptor.pustules.pulseSpeed ?? 1.1) + pustule.phase);
        const center = being.transformLocalPoint(pustule.local);
        const normalDir = being.transformLocalDirection(pustule.local);
        const outwardOffset = this.scaleVector(normalDir, baseRadius * 0.015);
        const surfaceAxes = this.buildSurfaceAxes(normalDir);
        const adjustedCenter = this.addVectors(center, outwardOffset);
        const radius = baseRadius * pustule.radius * pulse;
        const color = this.toRgba(descriptor.pustules.color ?? { r: 1, g: 0.8, b: 0.25, a: 0.7 }, (descriptor.pustules.color?.a ?? 0.7) * pulse);
        this.pushGlowInstance(
          this.additiveGlowBatch,
          adjustedCenter,
          this.scaleVector(surfaceAxes.right, radius),
          this.scaleVector(surfaceAxes.up, radius),
          color
        );
      }
    }
  }

  private renderRiftVampireVisuals(
    being: LesserBeingBase,
    descriptor: LesserBeingVisualDescriptor,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number
  ): void {
    if (descriptor.aura) {
      this.renderGlowLayer(being, descriptor.aura, camera, viewMatrix, projectionMatrix, timeSec);
    }
    if (descriptor.core) {
      this.renderGlowLayer(being, descriptor.core, camera, viewMatrix, projectionMatrix, timeSec);
    }
  }

  private renderGlowLayer(
    being: LesserBeingBase,
    glow: LesserBeingGlowConfig,
    camera: CameraBasis,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    timeSec: number,
    centerOverride?: () => Vector3
  ): void {
    const baseRadius = being.getBaseRadius();
    const pulse = glow.pulseSpeed ? 0.9 + 0.1 * Math.sin(timeSec * glow.pulseSpeed + being.getVisualSeed()) : 1;
    const width = baseRadius * glow.radiusMultiplier * pulse;
    const height = width;
    const center = centerOverride
      ? centerOverride()
      : {
          x: being.position.x + (glow.offset?.x ?? 0) * baseRadius,
          y: being.position.y + (glow.offset?.y ?? 0) * baseRadius,
          z: being.position.z + (glow.offset?.z ?? 0) * baseRadius
        };
    const colorPrimary = this.toRgba(glow.color, glow.alpha ?? glow.color?.a ?? 0.5 * pulse);
    this.drawGlowBillboard(
      center,
      camera.right,
      camera.up,
      width,
      height,
      colorPrimary,
      viewMatrix,
      projectionMatrix,
      glow.additive ?? true,
      glow.depthWrite ?? false
    );

    if (glow.secondaryColor) {
      const secondary = this.toRgba(glow.secondaryColor, glow.secondaryAlpha ?? glow.secondaryColor.a ?? 0.2 * pulse);
      const secondaryScale = width * 1.2;
      this.drawGlowBillboard(
        center,
        camera.right,
        camera.up,
        secondaryScale,
        secondaryScale,
        secondary,
        viewMatrix,
        projectionMatrix,
        glow.additive ?? true,
        glow.depthWrite ?? false
      );
    }
  }

  private resetGlowBatch(batch: GlowInstanceBatch): void {
    batch.count = 0;
  }

  private pushGlowInstance(
    batch: GlowInstanceBatch,
    center: Vector3,
    rightVec: Vector3,
    upVec: Vector3,
    color: [number, number, number, number]
  ): void {
    this.ensureGlowBatchCapacity(batch, batch.count + 1);
    const offset = batch.count * LesserBeingRenderer.GLOW_INSTANCE_FLOATS;
    const data = batch.data;
    data[offset] = center.x;
    data[offset + 1] = center.y;
    data[offset + 2] = center.z;
    data[offset + 3] = rightVec.x;
    data[offset + 4] = rightVec.y;
    data[offset + 5] = rightVec.z;
    data[offset + 6] = upVec.x;
    data[offset + 7] = upVec.y;
    data[offset + 8] = upVec.z;
    data[offset + 9] = color[0];
    data[offset + 10] = color[1];
    data[offset + 11] = color[2];
    data[offset + 12] = color[3];
    batch.count++;
  }

  private ensureGlowBatchCapacity(batch: GlowInstanceBatch, target: number): void {
    if (target <= batch.capacity) {
      return;
    }
    let newCapacity = batch.capacity || 32;
    while (newCapacity < target) {
      newCapacity *= 2;
    }
    batch.capacity = newCapacity;
    batch.data = new Float32Array(newCapacity * LesserBeingRenderer.GLOW_INSTANCE_FLOATS);
    batch.sizeBytes = batch.data.byteLength;
    batch.needsResize = true;
  }

  private ensureGlowBaseGeometry(): boolean {
    if (!this.gl) {
      return false;
    }
    const gl = this.gl;
    if (!this.glowCornerBuffer) {
      const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
      this.glowCornerBuffer = gl.createBuffer();
      if (!this.glowCornerBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowCornerBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    }
    if (!this.glowUvBuffer) {
      const uvs = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
      this.glowUvBuffer = gl.createBuffer();
      if (!this.glowUvBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowUvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    }
    if (!this.glowIndexBuffer) {
      const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      this.glowIndexBuffer = gl.createBuffer();
      if (!this.glowIndexBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glowIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return true;
  }

  private ensureGlowBatchBuffer(batch: GlowInstanceBatch): boolean {
    if (!this.gl) {
      return false;
    }
    if (!batch.buffer) {
      batch.buffer = this.gl.createBuffer();
      if (!batch.buffer) {
        return false;
      }
      batch.needsResize = true;
    }
    if (batch.needsResize && batch.sizeBytes > 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, batch.buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.sizeBytes, this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      batch.needsResize = false;
    }
    return true;
  }

  private flushGlowBatch(
    batch: GlowInstanceBatch,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    additive: boolean
  ): void {
    if (!batch.count || !this.gl || !this.shaders?.glowInstancedProgram) {
      batch.count = 0;
      return;
    }
    if (!this.ensureGlowBaseGeometry() || !this.ensureGlowBatchBuffer(batch) || !batch.buffer) {
      batch.count = 0;
      return;
    }
    const gl = this.gl;
    const stride = LesserBeingRenderer.GLOW_INSTANCE_FLOATS * 4;
    const used = batch.count * LesserBeingRenderer.GLOW_INSTANCE_FLOATS;
    const instanceSlice = batch.data.subarray(0, used);

    this.shaders.useGlowInstancedProgram();
    this.shaders.setGlowInstancedParams(viewMatrix, projectionMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceSlice);

    const cornerLoc = this.shaders.glowInstancedAttributes['corner'];
    const uvLoc = this.shaders.glowInstancedAttributes['uv'];
    const centerLoc = this.shaders.glowInstancedAttributes['center'];
    const rightLoc = this.shaders.glowInstancedAttributes['rightVec'];
    const upLoc = this.shaders.glowInstancedAttributes['upVec'];
    const colorLoc = this.shaders.glowInstancedAttributes['color'];

    if (cornerLoc >= 0 && this.glowCornerBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowCornerBuffer);
      gl.enableVertexAttribArray(cornerLoc);
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(cornerLoc, 0);
    }
    if (uvLoc >= 0 && this.glowUvBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowUvBuffer);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(uvLoc, 0);
    }
    if (centerLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.enableVertexAttribArray(centerLoc);
      gl.vertexAttribPointer(centerLoc, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(centerLoc, 1);
    }
    if (rightLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.enableVertexAttribArray(rightLoc);
      gl.vertexAttribPointer(rightLoc, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.vertexAttribDivisor(rightLoc, 1);
    }
    if (upLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.enableVertexAttribArray(upLoc);
      gl.vertexAttribPointer(upLoc, 3, gl.FLOAT, false, stride, 6 * 4);
      gl.vertexAttribDivisor(upLoc, 1);
    }
    if (colorLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, stride, 9 * 4);
      gl.vertexAttribDivisor(colorLoc, 1);
    }

    if (this.glowIndexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glowIndexBuffer);
    }

    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (!prevDepthTest) {
      gl.enable(gl.DEPTH_TEST);
    }

    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, batch.count);

    if (!prevDepthTest) {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.depthMask(prevDepthMask);
    if (!prevBlend) {
      gl.disable(gl.BLEND);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (cornerLoc >= 0) {
      gl.disableVertexAttribArray(cornerLoc);
    }
    if (uvLoc >= 0) {
      gl.disableVertexAttribArray(uvLoc);
    }
    if (centerLoc >= 0) {
      gl.disableVertexAttribArray(centerLoc);
      gl.vertexAttribDivisor(centerLoc, 0);
    }
    if (rightLoc >= 0) {
      gl.disableVertexAttribArray(rightLoc);
      gl.vertexAttribDivisor(rightLoc, 0);
    }
    if (upLoc >= 0) {
      gl.disableVertexAttribArray(upLoc);
      gl.vertexAttribDivisor(upLoc, 0);
    }
    if (colorLoc >= 0) {
      gl.disableVertexAttribArray(colorLoc);
      gl.vertexAttribDivisor(colorLoc, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    batch.count = 0;
  }

  private drawGlowBillboard(
    center: Vector3,
    right: Vector3,
    up: Vector3,
    width: number,
    height: number,
    color: [number, number, number, number],
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    additive: boolean,
    depthWrite: boolean
  ): void {
    if (!this.shaders.glowProgram) {
      return;
    }
    const gl = this.gl;
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const rightVec = this.scaleVector(this.normalize(right), halfW);
    const upVec = this.scaleVector(this.normalize(up), halfH);

    const tl = this.addVectors(this.subtractVectors(center, rightVec), upVec);
    const tr = this.addVectors(this.addVectors(center, rightVec), upVec);
    const br = this.addVectors(this.addVectors(center, rightVec), this.scaleVector(upVec, -1));
    const bl = this.addVectors(this.subtractVectors(center, rightVec), this.scaleVector(upVec, -1));

    const positions = new Float32Array([
      tl.x, tl.y, tl.z,
      tr.x, tr.y, tr.z,
      br.x, br.y, br.z,
      bl.x, bl.y, bl.z
    ]);
    const uvs = new Float32Array([
      -1, 1,
       1, 1,
       1, -1,
      -1, -1
    ]);
    const colors = new Float32Array([
      color[0], color[1], color[2], color[3],
      color[0], color[1], color[2], color[3],
      color[0], color[1], color[2], color[3],
      color[0], color[1], color[2], color[3]
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    this.shaders.useGlowProgram();
    this.shaders.setGlowMatrices(this.identityMatrix, viewMatrix, projectionMatrix);

    const vbo = gl.createBuffer();
    const uvbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !uvbo || !cbo || !ibo) {
      return;
    }

    const posLoc = this.shaders.glowAttributes['position'];
    const uvLoc = this.shaders.glowAttributes['uv'];
    const colorLoc = this.shaders.glowAttributes['color'];

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    if (colorLoc >= 0) {
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);

    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    if (!depthWrite) {
      gl.depthMask(false);
    }
    if (!prevDepthTest) {
      gl.enable(gl.DEPTH_TEST);
    }

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    if (!prevDepthTest) {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.depthMask(prevDepthMask);
    if (!prevBlend) {
      gl.disable(gl.BLEND);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
    if (uvLoc >= 0) gl.disableVertexAttribArray(uvLoc);
    if (colorLoc >= 0) gl.disableVertexAttribArray(colorLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(uvbo);
    gl.deleteBuffer(cbo);
    gl.deleteBuffer(ibo);
  }

  private getTentacleState(being: LesserBeingBase, config: LesserBeingTentacleConfig): TentacleRuntimeState {
    const cached = this.tentacleCache.get(being);
    if (cached) {
      return cached;
    }
    const count = Math.max(1, Math.round(config.count));
    const rng = this.createSeededRandom(being.getVisualSeed());
    const spread = config.spread ?? 0.45;
    const anchors: TentacleAnchorState[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * Math.PI * 0.35;
      const radial = 0.3 + spread * rng();
      const local = { x: Math.cos(angle) * radial, y: -0.8 - rng() * 0.25, z: Math.sin(angle) * radial };
      anchors.push({ local, phase: rng() * Math.PI * 2 });
    }
    const state: TentacleRuntimeState = { anchors };
    this.tentacleCache.set(being, state);
    return state;
  }

  private getShoggothState(being: LesserBeingBase, descriptor: LesserBeingVisualDescriptor): ShoggothRuntimeState {
    const cached = this.shoggothCache.get(being);
    if (cached) {
      return cached;
    }
    const rng = this.createSeededRandom(being.getVisualSeed());
    const eyeConfig = descriptor.eyes;
    const eyeCount = Math.max(3, Math.round(eyeConfig?.count ?? 6));
    const eyeMinLat = Math.max(0, Math.min(0.95, eyeConfig?.minLatitude ?? 0.2));
    const eyes: TentacleAnchorState[] = [];
    for (let i = 0; i < eyeCount; i++) {
      const lat = this.lerp(-Math.PI / 2 + eyeMinLat, Math.PI / 2 - eyeMinLat, rng());
      const lon = rng() * Math.PI * 2;
      const local = {
        x: Math.cos(lat) * Math.cos(lon),
        y: Math.sin(lat),
        z: Math.cos(lat) * Math.sin(lon)
      };
      eyes.push({ local, phase: rng() * Math.PI * 2 });
    }

    const pustuleCfg = descriptor.pustules;
    const pustules: PustuleState[] = [];
    const pustuleCount = Math.max(3, Math.round(pustuleCfg?.count ?? 10));
    const radiusRange = pustuleCfg?.radiusRange ?? [0.08, 0.15];
    for (let i = 0; i < pustuleCount; i++) {
      const theta = Math.acos(2 * rng() - 1);
      const phi = rng() * Math.PI * 2;
      const local = {
        x: Math.sin(theta) * Math.cos(phi),
        y: Math.cos(theta),
        z: Math.sin(theta) * Math.sin(phi)
      };
      pustules.push({
        local,
        radius: this.lerp(radiusRange[0], radiusRange[1], rng()),
        phase: rng() * Math.PI * 2
      });
    }

    const state: ShoggothRuntimeState = { eyes, pustules };
    this.shoggothCache.set(being, state);
    return state;
  }

  private computeCameraBasis(viewMatrix: Float32Array): CameraBasis {
    const right = this.normalize({ x: viewMatrix[0], y: viewMatrix[4], z: viewMatrix[8] });
    const up = this.normalize({ x: viewMatrix[1], y: viewMatrix[5], z: viewMatrix[9] });
    const forward = this.normalize({ x: -viewMatrix[2], y: -viewMatrix[6], z: -viewMatrix[10] });
    return { right, up, forward };
  }

  private buildSurfaceAxes(normal: Vector3): { right: Vector3; up: Vector3 } {
    const n = this.normalize(normal);
    let reference: Vector3 = { x: 0, y: 1, z: 0 };
    if (Math.abs(n.y) > 0.9) {
      reference = { x: 1, y: 0, z: 0 };
    }
    let right = this.cross(reference, n);
    if (Math.abs(right.x) + Math.abs(right.y) + Math.abs(right.z) < 1e-4) {
      reference = { x: 0, y: 0, z: 1 };
      right = this.cross(reference, n);
    }
    right = this.normalize(right);
    const up = this.normalize(this.cross(n, right));
    return { right, up };
  }

  private applyProjectileDepthBias(position: Vector3, cameraForward: Vector3, viewMatrix: Float32Array): Vector3 {
    const bias = this.computeProjectileDepthBias(viewMatrix, position);
    if (bias <= 0) {
      return { ...position };
    }
    return {
      x: position.x - cameraForward.x * bias,
      y: position.y - cameraForward.y * bias,
      z: position.z - cameraForward.z * bias
    };
  }

  private computeProjectileDepthBias(viewMatrix: Float32Array, position: Vector3): number {
    const viewPos = this.transformPoint(viewMatrix, position);
    const distance = Math.abs(viewPos.z);
    const biasStart = 120;
    if (distance <= biasStart) {
      return 0;
    }
    const biasScale = 0.45;
    const maxBias = 900;
    return Math.min(maxBias, (distance - biasStart) * biasScale);
  }

  private transformPoint(matrix: Float32Array, point: Vector3): Vector3 {
    return {
      x: matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12],
      y: matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13],
      z: matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14]
    };
  }

  private toRgba(color: Color | undefined, alphaFallback: number): [number, number, number, number] {
    if (!color) {
      return [1, 1, 1, alphaFallback];
    }
    return [color.r ?? 1, color.g ?? 1, color.b ?? 1, color.a ?? alphaFallback];
  }

  private mixColor(a: Color, b: Color, t: number): Color {
    return {
      r: this.lerp(a.r ?? 1, b.r ?? 1, t),
      g: this.lerp(a.g ?? 1, b.g ?? 1, t),
      b: this.lerp(a.b ?? 1, b.b ?? 1, t),
      a: this.lerp(a.a ?? 1, b.a ?? 1, t)
    };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private normalize(vec: Vector3): Vector3 {
    const len = Math.hypot(vec.x, vec.y, vec.z) || 1;
    return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
  }

  private cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  private addVectors(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  private subtractVectors(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  private scaleVector(vec: Vector3, scalar: number): Vector3 {
    return { x: vec.x * scalar, y: vec.y * scalar, z: vec.z * scalar };
  }

  private createSeededRandom(seed: number): () => number {
    let state = Math.abs(Math.floor(seed * 1_000)) % 2_147_483_647;
    if (state <= 0) state = 1;
    return () => {
      state = (state * 48271) % 2_147_483_647;
      return state / 2_147_483_647;
    };
  }
}
