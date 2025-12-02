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

/**
 * LesserBeingRenderer: encapsula efectos visuales complementarios (tentáculos, halos, auras)
 * para las entidades Lesser Being sin modificar el pipeline principal lit.
 */
export class LesserBeingRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly identityMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  private tentacleCache = new WeakMap<LesserBeingBase, TentacleRuntimeState>();
  private shoggothCache = new WeakMap<LesserBeingBase, ShoggothRuntimeState>();
  private static readonly ORB_INSTANCE_FLOATS = 9;
  private orbInstanceData: Float32Array = new Float32Array(0);
  private orbInstanceCapacity = 0;
  private orbInstanceCount = 0;
  private orbInstanceBufferSize = 0;
  private orbInstanceBufferNeedsResize = false;
  private orbCornerBuffer: WebGLBuffer | null = null;
  private orbUvBuffer: WebGLBuffer | null = null;
  private orbIndexBuffer: WebGLBuffer | null = null;
  private orbInstanceBuffer: WebGLBuffer | null = null;

  constructor(private readonly webgl: WebGLService, private readonly shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext;
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
    this.resetOrbInstances();
    for (const projectile of projectiles) {
      if (!projectile) {
        continue;
      }
      switch (projectile.kind) {
        case 'acid_spit':
          this.renderAcidProjectile(projectile, cameraBasis, viewMatrix, projectionMatrix, timeSec);
          break;
        case 'orb':
          this.renderOrbProjectile(projectile, timeSec);
          break;
      }
    }
    this.flushOrbInstances(cameraBasis, viewMatrix, projectionMatrix);
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
    const headCenter = this.addVectors(projectile.position, wobbleOffset);

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

    const bulgeCenter = this.subtractVectors(headCenter, this.scaleVector(direction, baseRadius * 0.9));
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
      const center = this.subtractVectors(headCenter, this.scaleVector(direction, trailLength * t));
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

  private renderOrbProjectile(projectile: LesserBeingProjectileView, timeSec: number): void {
    const baseRadius = Math.max(0.55, projectile.radius * 0.42);
    const pulse = 0.8 + 0.2 * Math.sin(timeSec * 6 + projectile.remainingLife * 10);
    const center = { ...projectile.position };
    const coreColor: [number, number, number, number] = [0.95, 0.86, 0.32, 0.5 * pulse];
    const shellColor: [number, number, number, number] = [0.92, 0.68, 0.15, 0.35 * pulse];
    this.pushOrbInstance(center, baseRadius * 1.9, baseRadius * 1.9, shellColor);
    this.pushOrbInstance(center, baseRadius * 1.2, baseRadius * 1.2, coreColor);
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
      this.renderStellarTentacles(being, tentacleConfig, descriptor, camera, viewMatrix, projectionMatrix, timeSec);
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
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
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
        this.drawGlowBillboard(
          center,
          camera.right,
          camera.up,
          width,
          width * 1.35,
          this.toRgba(color, alpha),
          viewMatrix,
          projectionMatrix,
          true,
          false
        );
      }
    }
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
        this.drawGlowBillboard(
          adjustedCenter,
          surfaceAxes.right,
          surfaceAxes.up,
          eyeRadius * 0.9,
          eyeRadius * 0.9,
          scleraColor,
          viewMatrix,
          projectionMatrix,
          false,
          false
        );
        const pupilColor = this.toRgba(descriptor.eyes.pupilColor ?? { r: 0.2, g: 0.6, b: 0.9, a: 0.9 }, 0.85);
        this.drawGlowBillboard(
          adjustedCenter,
          surfaceAxes.right,
          surfaceAxes.up,
          eyeRadius * 0.45,
          eyeRadius * 0.45,
          pupilColor,
          viewMatrix,
          projectionMatrix,
          true,
          false
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
        this.drawGlowBillboard(
          adjustedCenter,
          surfaceAxes.right,
          surfaceAxes.up,
          radius,
          radius,
          color,
          viewMatrix,
          projectionMatrix,
          true,
          false
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

  private resetOrbInstances(): void {
    this.orbInstanceCount = 0;
  }

  private pushOrbInstance(center: Vector3, width: number, height: number, color: [number, number, number, number]): void {
    this.ensureOrbInstanceCapacity(this.orbInstanceCount + 1);
    const offset = this.orbInstanceCount * LesserBeingRenderer.ORB_INSTANCE_FLOATS;
    const data = this.orbInstanceData;
    data[offset] = center.x;
    data[offset + 1] = center.y;
    data[offset + 2] = center.z;
    data[offset + 3] = width * 0.5;
    data[offset + 4] = height * 0.5;
    data[offset + 5] = color[0];
    data[offset + 6] = color[1];
    data[offset + 7] = color[2];
    data[offset + 8] = color[3];
    this.orbInstanceCount++;
  }

  private ensureOrbInstanceCapacity(target: number): void {
    if (target <= this.orbInstanceCapacity) {
      return;
    }
    let newCapacity = this.orbInstanceCapacity || 32;
    while (newCapacity < target) {
      newCapacity *= 2;
    }
    this.orbInstanceCapacity = newCapacity;
    this.orbInstanceData = new Float32Array(newCapacity * LesserBeingRenderer.ORB_INSTANCE_FLOATS);
    this.orbInstanceBufferSize = this.orbInstanceData.byteLength;
    this.orbInstanceBufferNeedsResize = true;
    this.uploadOrbInstanceBufferCapacity();
  }

  private uploadOrbInstanceBufferCapacity(): void {
    if (!this.orbInstanceBufferNeedsResize || !this.gl || !this.orbInstanceBuffer || !this.orbInstanceBufferSize) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.orbInstanceBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.orbInstanceBufferSize, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.orbInstanceBufferNeedsResize = false;
  }

  private ensureOrbInstancingResources(): boolean {
    if (!this.gl || !this.shaders?.glowInstancedProgram) {
      return false;
    }
    const gl = this.gl;
    if (!this.orbCornerBuffer) {
      const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
      this.orbCornerBuffer = gl.createBuffer();
      if (!this.orbCornerBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbCornerBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    }
    if (!this.orbUvBuffer) {
      const uvs = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
      this.orbUvBuffer = gl.createBuffer();
      if (!this.orbUvBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbUvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    }
    if (!this.orbIndexBuffer) {
      const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      this.orbIndexBuffer = gl.createBuffer();
      if (!this.orbIndexBuffer) {
        return false;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.orbIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    }
    if (!this.orbInstanceBuffer) {
      this.orbInstanceBuffer = gl.createBuffer();
      if (!this.orbInstanceBuffer) {
        return false;
      }
    }
    this.uploadOrbInstanceBufferCapacity();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return true;
  }

  private flushOrbInstances(camera: CameraBasis, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.orbInstanceCount) {
      return;
    }
    if (!this.ensureOrbInstancingResources() || !this.gl || !this.shaders.glowInstancedProgram || !this.orbInstanceBuffer) {
      this.orbInstanceCount = 0;
      return;
    }
    const gl = this.gl;
    const stride = LesserBeingRenderer.ORB_INSTANCE_FLOATS * 4;
    const used = this.orbInstanceCount * LesserBeingRenderer.ORB_INSTANCE_FLOATS;
    const instanceSlice = this.orbInstanceData.subarray(0, used);
    this.shaders.useGlowInstancedProgram();
    this.shaders.setGlowInstancedParams(viewMatrix, projectionMatrix, camera.right, camera.up);
    this.uploadOrbInstanceBufferCapacity();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.orbInstanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceSlice);

    const cornerLoc = this.shaders.glowInstancedAttributes['corner'];
    const uvLoc = this.shaders.glowInstancedAttributes['uv'];
    const centerLoc = this.shaders.glowInstancedAttributes['center'];
    const halfSizeLoc = this.shaders.glowInstancedAttributes['halfSize'];
    const colorLoc = this.shaders.glowInstancedAttributes['color'];

    if (cornerLoc >= 0 && this.orbCornerBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbCornerBuffer);
      gl.enableVertexAttribArray(cornerLoc);
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(cornerLoc, 0);
    }
    if (uvLoc >= 0 && this.orbUvBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbUvBuffer);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(uvLoc, 0);
    }
    if (centerLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbInstanceBuffer);
      gl.enableVertexAttribArray(centerLoc);
      gl.vertexAttribPointer(centerLoc, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(centerLoc, 1);
    }
    if (halfSizeLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbInstanceBuffer);
      gl.enableVertexAttribArray(halfSizeLoc);
      gl.vertexAttribPointer(halfSizeLoc, 2, gl.FLOAT, false, stride, 3 * 4);
      gl.vertexAttribDivisor(halfSizeLoc, 1);
    }
    if (colorLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbInstanceBuffer);
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, stride, 5 * 4);
      gl.vertexAttribDivisor(colorLoc, 1);
    }

    if (this.orbIndexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.orbIndexBuffer);
    }

    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    if (!prevDepthTest) {
      gl.enable(gl.DEPTH_TEST);
    }

    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.orbInstanceCount);

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
    if (halfSizeLoc >= 0) {
      gl.disableVertexAttribArray(halfSizeLoc);
      gl.vertexAttribDivisor(halfSizeLoc, 0);
    }
    if (colorLoc >= 0) {
      gl.disableVertexAttribArray(colorLoc);
      gl.vertexAttribDivisor(colorLoc, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.orbInstanceCount = 0;
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
