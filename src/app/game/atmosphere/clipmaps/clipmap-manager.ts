import { Vector3 } from '../../../types/game.types';
import { ClipmapRing, ClipmapRingConfig, ClipmapRingGeometry, ClipmapRingStats } from './clipmap-ring';
export type { ClipmapRingConfig } from './clipmap-ring';

export interface ClipmapManagerConfig {
  gl?: WebGL2RenderingContext | null;
  planetCenter: Vector3;
  planetRadius: number;
  rings: ClipmapRingConfig[];
  initialCameraPosition?: Vector3;
}

export interface ClipmapRingBuffers {
  vbo: WebGLBuffer | null;
  cbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  vertexCount: number;
  indexCount: number;
}

export interface ClipmapRingHandle extends ClipmapRingBuffers {
  config: ClipmapRingConfig;
  basePositions: Float32Array | null;
  innerEdgePositions: Float32Array | null;
  outerEdgePositions: Float32Array | null;
  normals: Float32Array | null;
  latitudes: Float32Array | null;
  detailScratch: Float32Array | null;
  colorScratch: Float32Array | null;
  stats: ClipmapRingStats;
  dirty: boolean;
  pendingUpload: boolean;
}

export interface ClipmapDebugRingSnapshot {
  index: number;
  vertexCount: number;
  indexCount: number;
  innerRadius: number;
  outerRadius: number;
  dirty: boolean;
  pendingUpload: boolean;
  lastArcLength: number;
  lastBuildMs: number;
  lastUpdateTimestamp: number;
  updateThreshold: number;
}

export interface ClipmapDebugSnapshot {
  groundRadius: number;
  rings: ClipmapDebugRingSnapshot[];
  lastFlushTimestamp: number;
}

interface ClipmapManagerRingState {
  ring: ClipmapRing;
  buffers: ClipmapRingBuffers;
  geometry: ClipmapRingGeometry | null;
  basePositions: Float32Array | null;
  innerEdgePositions: Float32Array | null;
  outerEdgePositions: Float32Array | null;
  normals: Float32Array | null;
  latitudes: Float32Array | null;
  detailScratch: Float32Array | null;
  colorScratch: Float32Array | null;
  pendingUpload: boolean;
  lastFlushTimestamp: number;
}

export interface ClipmapFlushResult {
  updated: ClipmapRingStats[];
  uploaded: number;
  pending: number;
  timestamp: number;
}

export class ClipmapManager {
  private gl: WebGL2RenderingContext | null;
  private planetCenter: Vector3;
  private planetRadius: number;
  private readonly rings: ClipmapManagerRingState[];
  private lastFlushTimestamp = 0;

  constructor(config: ClipmapManagerConfig) {
    this.gl = config.gl ?? null;
    this.planetCenter = { ...config.planetCenter };
    this.planetRadius = config.planetRadius;
    const sortedRings = [...config.rings].sort((a, b) => a.index - b.index);
    const initialCamera = config.initialCameraPosition ?? this.buildDefaultCamera();
    this.rings = sortedRings.map(ringConfig => {
      const ring = new ClipmapRing(ringConfig);
      ring.updateAnchor(initialCamera, this.planetCenter, this.planetRadius);
      return {
        ring,
        buffers: { vbo: null, cbo: null, ibo: null, vertexCount: 0, indexCount: 0 },
        geometry: null,
        basePositions: null,
        innerEdgePositions: null,
        outerEdgePositions: null,
        normals: null,
        latitudes: null,
        detailScratch: null,
        colorScratch: null,
        pendingUpload: true,
        lastFlushTimestamp: 0,
      } satisfies ClipmapManagerRingState;
    });
  }

  public dispose(): void {
    if (!this.gl) {
      return;
    }
    for (const state of this.rings) {
      if (state.buffers.vbo) {
        this.gl.deleteBuffer(state.buffers.vbo);
        state.buffers.vbo = null;
      }
      if (state.buffers.cbo) {
        this.gl.deleteBuffer(state.buffers.cbo);
        state.buffers.cbo = null;
      }
      if (state.buffers.ibo) {
        this.gl.deleteBuffer(state.buffers.ibo);
        state.buffers.ibo = null;
      }
    }
  }

  public setContext(gl: WebGL2RenderingContext | null): void {
    this.gl = gl ?? null;
    if (gl) {
      for (const state of this.rings) {
        state.pendingUpload = true;
      }
    }
  }

  public updatePlanet(center: Vector3, radius: number): void {
    this.planetCenter = { ...center };
    this.planetRadius = radius;
    for (const state of this.rings) {
      state.ring.markDirty();
      state.pendingUpload = true;
    }
  }

  public updateOrigin(cameraPosition: Vector3): boolean {
    let changed = false;
    for (const state of this.rings) {
      const dirty = state.ring.updateAnchor(cameraPosition, this.planetCenter, this.planetRadius);
      if (dirty) {
        state.pendingUpload = true;
        changed = true;
      }
    }
    return changed;
  }

  public flush(glOverride?: WebGL2RenderingContext | null): ClipmapFlushResult {
    if (glOverride !== undefined) {
      this.gl = glOverride ?? null;
    }
    const gl = this.gl;
    const updated: ClipmapRingStats[] = [];
    let uploaded = 0;
    let pending = 0;
    const timestamp = this.getTimestamp();

    for (const state of this.rings) {
      const ringDirty = state.ring.isDirty();
      if (!ringDirty && !state.pendingUpload) {
        continue;
      }
      const geometry = state.ring.rebuildGeometry(this.planetCenter, this.planetRadius);
      state.geometry = geometry;
      state.basePositions = geometry.positions;
      state.innerEdgePositions = geometry.innerEdgePositions;
      state.outerEdgePositions = geometry.outerEdgePositions;
      state.normals = geometry.normals;
      state.latitudes = geometry.latitudes;
      if (!state.detailScratch || state.detailScratch.length !== geometry.positions.length) {
        state.detailScratch = new Float32Array(geometry.positions.length);
      }
      if (!state.colorScratch || state.colorScratch.length !== geometry.positions.length) {
        state.colorScratch = new Float32Array(geometry.positions.length);
      }
      state.buffers.vertexCount = geometry.positions.length / 3;
      state.buffers.indexCount = geometry.indices.length;
      state.lastFlushTimestamp = timestamp;

      if (gl) {
        this.ensureBuffers(gl, state);
        this.uploadGeometry(gl, state, geometry);
        state.pendingUpload = false;
        uploaded++;
      } else {
        state.pendingUpload = true;
        pending++;
      }
      updated.push(state.ring.getStats());
    }

    this.lastFlushTimestamp = timestamp;
    return { updated, uploaded, pending, timestamp };
  }

  public markRingDirty(index?: number): void {
    if (index === undefined || index === null) {
      for (const state of this.rings) {
        state.ring.markDirty();
        state.pendingUpload = true;
      }
      return;
    }
    const target = this.rings.find(state => state.ring.config.index === index);
    if (target) {
      target.ring.markDirty();
      target.pendingUpload = true;
    }
  }

  public getRingCount(): number {
    return this.rings.length;
  }

  public getRingHandle(index: number): ClipmapRingHandle | null {
    const state = this.rings.find(r => r.ring.config.index === index);
    if (!state) {
      return null;
    }
    return {
      config: state.ring.config,
      ...state.buffers,
      basePositions: state.basePositions,
      innerEdgePositions: state.innerEdgePositions,
      outerEdgePositions: state.outerEdgePositions,
      detailScratch: state.detailScratch,
      colorScratch: state.colorScratch,
      latitudes: state.latitudes,
      normals: state.normals,
      stats: state.ring.getStats(),
      dirty: state.ring.isDirty(),
      pendingUpload: state.pendingUpload,
    };
  }

  public getDebugSnapshot(): ClipmapDebugSnapshot {
    return {
      groundRadius: this.planetRadius,
      lastFlushTimestamp: this.lastFlushTimestamp,
      rings: this.rings.map(state => {
        const stats = state.ring.getStats();
        return {
          index: stats.index,
          vertexCount: state.buffers.vertexCount,
          indexCount: state.buffers.indexCount,
          innerRadius: stats.innerRadius,
          outerRadius: stats.outerRadius,
          dirty: stats.dirty,
          pendingUpload: state.pendingUpload,
          lastArcLength: stats.lastArcLength,
          lastBuildMs: stats.lastBuildMs,
          lastUpdateTimestamp: stats.lastUpdateTimestamp,
          updateThreshold: stats.updateThreshold,
        } as ClipmapDebugRingSnapshot;
      }),
    };
  }

  private ensureBuffers(gl: WebGL2RenderingContext, state: ClipmapManagerRingState): void {
    if (!state.buffers.vbo) {
      state.buffers.vbo = gl.createBuffer();
    }
    if (!state.buffers.cbo) {
      state.buffers.cbo = gl.createBuffer();
    }
    if (!state.buffers.ibo) {
      state.buffers.ibo = gl.createBuffer();
      if (!state.buffers.ibo) {
        return;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffers.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, state.geometry?.indices ?? new Uint32Array(), gl.STATIC_DRAW);
    }
  }

  private uploadGeometry(gl: WebGL2RenderingContext, state: ClipmapManagerRingState, geometry: ClipmapRingGeometry): void {
    if (state.buffers.vbo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
    }
    if (state.buffers.cbo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.cbo);
      const colorBytes = state.colorScratch ?? new Float32Array(geometry.positions.length);
      gl.bufferData(gl.ARRAY_BUFFER, colorBytes, gl.DYNAMIC_DRAW);
    }
    if (state.buffers.ibo && state.geometry) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffers.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, state.geometry.indices, gl.STATIC_DRAW);
    }
  }

  private buildDefaultCamera(): Vector3 {
    return {
      x: this.planetCenter?.x ?? 0,
      y: (this.planetCenter?.y ?? 0) + this.planetRadius + 5,
      z: this.planetCenter?.z ?? 0,
    };
  }

  private getTimestamp(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }
}
