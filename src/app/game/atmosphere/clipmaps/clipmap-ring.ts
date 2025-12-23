import { Vector3 } from '../../../types/game.types';

export interface ClipmapRingConfig {
  /** Index ordered from inner (0) to outer. */
  index: number;
  /** Minimum distance from the anchor point measured over the surface. */
  innerRadius: number;
  /** Maximum distance (thickness) covered by this ring. */
  outerRadius: number;
  /** Radial subdivisions (>= 1). */
  radialSegments: number;
  /** Angular subdivisions (>= 3). */
  angularSegments: number;
  /** Tangential displacement (in world units) that forces a regeneration. */
  updateThreshold: number;
  /** Multiplier for extrusions relative to the base sphere (defaults to 1). */
  extrusionScale?: number;
}

export interface ClipmapRingGeometry {
  positions: Float32Array;
  normals: Float32Array;
  latitudes: Float32Array;
  indices: Uint32Array;
  innerEdgePositions: Float32Array;
  outerEdgePositions: Float32Array;
}

export interface ClipmapRingStats {
  index: number;
  vertexCount: number;
  indexCount: number;
  innerRadius: number;
  outerRadius: number;
  updateThreshold: number;
  extrusionScale: number;
  dirty: boolean;
  lastAnchorDot: number;
  lastArcLength: number;
  quantizationStep: number;
  lastQuantizedArc: number;
  pendingArcLength: number;
  lastBuildMs: number;
  lastUpdateTimestamp: number;
}

const UNIT_Y: Vector3 = { x: 0, y: 1, z: 0 };
const UNIT_X: Vector3 = { x: 1, y: 0, z: 0 };

export class ClipmapRing {
  public readonly config: ClipmapRingConfig;

  private anchorDir: Vector3 | null = null;
  private tangentRight: Vector3 | null = null;
  private tangentForward: Vector3 | null = null;
  private dirty = true;
  private lastAnchorDot = 1;
  private lastArcLength = 0;
  private lastBuildMs = 0;
  private lastUpdateTimestamp = 0;
  private readonly tangentialCellLength: number;
  private quantizationStep = 0;
  private lastQuantizedArc = 0;
  private pendingArcLength = 0;

  private positions: Float32Array | null = null;
  private normals: Float32Array | null = null;
  private latitudes: Float32Array | null = null;
  private indices: Uint32Array | null = null;
  private innerEdgePositions: Float32Array | null = null;
  private outerEdgePositions: Float32Array | null = null;

  constructor(config: ClipmapRingConfig) {
    this.validateConfig(config);
    this.config = {
      ...config,
      extrusionScale: config.extrusionScale ?? 1,
    };
    this.tangentialCellLength = this.computeTangentialCellLength();
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public updateAnchor(cameraPosition: Vector3, planetCenter: Vector3, groundRadius: number): boolean {
    const anchorDir = this.normalize(this.subtract(cameraPosition, planetCenter));
    if (!this.anchorDir) {
      this.setAnchor(anchorDir);
      this.dirty = true;
      this.quantizationStep = this.computeQuantizationStep();
      this.lastQuantizedArc = 0;
      this.pendingArcLength = 0;
      return true;
    }
    const dot = this.clampDot(this.dot(this.anchorDir, anchorDir));
    const angle = Math.acos(dot);
    const arcLength = angle * groundRadius;
    this.lastAnchorDot = dot;
    this.lastArcLength = arcLength;
    const step = this.computeQuantizationStep();
    this.quantizationStep = step;
    if (arcLength < this.config.updateThreshold) {
      this.lastQuantizedArc = 0;
      this.pendingArcLength = arcLength;
      return false;
    }
    const quantizedArc = this.quantizeArcLength(arcLength, step);
    if (quantizedArc <= 0) {
      this.lastQuantizedArc = 0;
      this.pendingArcLength = arcLength;
      return false;
    }
    const axis = this.normalize(this.cross(this.anchorDir, anchorDir));
    const axisLen = this.length(axis);
    const moveAngle = quantizedArc / groundRadius;
    const rotatedAnchor = axisLen > 1e-5 && moveAngle > 0 ? this.rotateAroundAxis(this.anchorDir, axis, moveAngle) : anchorDir;
    this.setAnchor(rotatedAnchor);
    this.dirty = true;
    this.lastQuantizedArc = quantizedArc;
    this.pendingArcLength = Math.max(0, arcLength - quantizedArc);
    return true;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public rebuildGeometry(planetCenter: Vector3, groundRadius: number): ClipmapRingGeometry {
    if (!this.anchorDir || !this.tangentRight || !this.tangentForward) {
      throw new Error('ClipmapRing requires a valid anchor before rebuilding geometry. Call updateAnchor first.');
    }
    const radialSteps = Math.max(1, this.config.radialSegments);
    const angularSteps = Math.max(3, this.config.angularSegments);
    const vertexCount = (radialSteps + 1) * (angularSteps + 1);

    const buildStart = this.getTimestamp();

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const latitudes = new Float32Array(vertexCount);
    const indices = new Uint32Array(radialSteps * angularSteps * 6);
    const edgeStride = angularSteps + 1;
    const innerEdge = new Float32Array(edgeStride * 3);
    const outerEdge = new Float32Array(edgeStride * 3);

    const basePoint = this.add(planetCenter, this.scale(this.anchorDir, groundRadius));
    let vertexIndex = 0;

    for (let r = 0; r <= radialSteps; r++) {
      const radialLerp = r / radialSteps;
      const radius = this.lerp(this.config.innerRadius, this.config.outerRadius, radialLerp);
      for (let a = 0; a <= angularSteps; a++) {
        const angle = (a / angularSteps) * Math.PI * 2;
        const offset = this.add(
          this.scale(this.tangentRight, Math.cos(angle) * radius),
          this.scale(this.tangentForward, Math.sin(angle) * radius),
        );
        const world = this.add(basePoint, offset);
        const normal = this.normalize(this.subtract(world, planetCenter));
        const finalPosition = this.add(planetCenter, this.scale(normal, groundRadius));

        positions[vertexIndex * 3] = finalPosition.x;
        positions[vertexIndex * 3 + 1] = finalPosition.y;
        positions[vertexIndex * 3 + 2] = finalPosition.z;

        normals[vertexIndex * 3] = normal.x;
        normals[vertexIndex * 3 + 1] = normal.y;
        normals[vertexIndex * 3 + 2] = normal.z;

        latitudes[vertexIndex] = normal.y;
        if (r === 0) {
          const edgeIndex = a * 3;
          innerEdge[edgeIndex] = finalPosition.x;
          innerEdge[edgeIndex + 1] = finalPosition.y;
          innerEdge[edgeIndex + 2] = finalPosition.z;
        }
        if (r === radialSteps) {
          const edgeIndex = a * 3;
          outerEdge[edgeIndex] = finalPosition.x;
          outerEdge[edgeIndex + 1] = finalPosition.y;
          outerEdge[edgeIndex + 2] = finalPosition.z;
        }
        vertexIndex++;
      }
    }

    let indexCursor = 0;
    const stride = angularSteps + 1;
    for (let r = 0; r < radialSteps; r++) {
      for (let a = 0; a < angularSteps; a++) {
        const first = r * stride + a;
        const second = first + stride;
        indices[indexCursor++] = first;
        indices[indexCursor++] = second;
        indices[indexCursor++] = first + 1;
        indices[indexCursor++] = second;
        indices[indexCursor++] = second + 1;
        indices[indexCursor++] = first + 1;
      }
    }

    this.positions = positions;
    this.normals = normals;
    this.latitudes = latitudes;
    this.indices = indices;
    this.innerEdgePositions = innerEdge;
    this.outerEdgePositions = outerEdge;
    this.dirty = false;
    this.lastBuildMs = this.getTimestamp() - buildStart;
    this.lastUpdateTimestamp = Date.now();

    return { positions, normals, latitudes, indices, innerEdgePositions: innerEdge, outerEdgePositions: outerEdge };
  }

  private getTimestamp(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  public getGeometry(): ClipmapRingGeometry | null {
    if (!this.positions || !this.normals || !this.latitudes || !this.indices || !this.innerEdgePositions || !this.outerEdgePositions) {
      return null;
    }
    return {
      positions: this.positions,
      normals: this.normals,
      latitudes: this.latitudes,
      indices: this.indices,
      innerEdgePositions: this.innerEdgePositions,
      outerEdgePositions: this.outerEdgePositions,
    };
  }

  public getStats(): ClipmapRingStats {
    return {
      index: this.config.index,
      vertexCount: this.positions ? this.positions.length / 3 : 0,
      indexCount: this.indices ? this.indices.length : 0,
      innerRadius: this.config.innerRadius,
      outerRadius: this.config.outerRadius,
      updateThreshold: this.config.updateThreshold,
      extrusionScale: this.config.extrusionScale ?? 1,
      dirty: this.dirty,
      lastAnchorDot: this.lastAnchorDot,
      lastArcLength: this.lastArcLength,
      quantizationStep: this.quantizationStep,
      lastQuantizedArc: this.lastQuantizedArc,
      pendingArcLength: this.pendingArcLength,
      lastBuildMs: this.lastBuildMs,
      lastUpdateTimestamp: this.lastUpdateTimestamp,
    };
  }

  private computeQuantizationStep(): number {
    return Math.max(1e-3, Math.min(this.config.updateThreshold, this.tangentialCellLength));
  }

  private computeTangentialCellLength(): number {
    const radialSpan = Math.max(1e-3, this.config.outerRadius - this.config.innerRadius);
    const radialCell = radialSpan / Math.max(1, this.config.radialSegments);
    const averageRadius = Math.max(1e-3, (this.config.innerRadius + this.config.outerRadius) * 0.5);
    const angularCell = (2 * Math.PI * averageRadius) / Math.max(3, this.config.angularSegments);
    return Math.max(1e-3, Math.min(radialCell, angularCell));
  }

  private quantizeArcLength(arcLength: number, step: number): number {
    if (step <= 0) {
      return arcLength;
    }
    const steps = Math.floor(arcLength / step);
    return steps * step;
  }

  private rotateAroundAxis(vec: Vector3, axis: Vector3, angle: number): Vector3 {
    const normalizedAxis = this.normalize(axis);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = this.dot(normalizedAxis, vec);
    const cross = this.cross(normalizedAxis, vec);
    return {
      x: vec.x * cos + cross.x * sin + normalizedAxis.x * dot * (1 - cos),
      y: vec.y * cos + cross.y * sin + normalizedAxis.y * dot * (1 - cos),
      z: vec.z * cos + cross.z * sin + normalizedAxis.z * dot * (1 - cos),
    };
  }

  private setAnchor(anchor: Vector3): void {
    this.anchorDir = anchor;
    this.tangentRight = this.buildTangent(anchor);
    this.tangentForward = this.normalize(this.cross(anchor, this.tangentRight));
  }

  private buildTangent(anchor: Vector3): Vector3 {
    const ref = Math.abs(anchor.y) > 0.85 ? UNIT_X : UNIT_Y;
    const candidate = this.cross(ref, anchor);
    const length = this.length(candidate);
    if (length < 1e-5) {
      return { x: 1, y: 0, z: 0 };
    }
    return this.scale(candidate, 1 / length);
  }

  private validateConfig(config: ClipmapRingConfig): void {
    if (config.innerRadius < 0 || config.outerRadius <= config.innerRadius) {
      throw new Error(`ClipmapRing[${config.index}] has invalid radii: ${config.innerRadius} -> ${config.outerRadius}`);
    }
    if (config.radialSegments < 1 || config.angularSegments < 3) {
      throw new Error(`ClipmapRing[${config.index}] requires >=1 radial and >=3 angular segments.`);
    }
  }

  private normalize(vec: Vector3): Vector3 {
    const len = this.length(vec) || 1;
    return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
  }

  private length(vec: Vector3): number {
    return Math.hypot(vec.x, vec.y, vec.z);
  }

  private subtract(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  private add(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  private scale(vec: Vector3, s: number): Vector3 {
    return { x: vec.x * s, y: vec.y * s, z: vec.z * s };
  }

  private dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  private cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  private clampDot(value: number): number {
    if (value < -1) {
      return -1;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
