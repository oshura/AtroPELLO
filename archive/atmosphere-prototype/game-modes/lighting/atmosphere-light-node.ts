import { AtmosphereLightSnapshot, AtmosphereColorVector } from '../shared-game-context';

export interface AtmosphereLightUniformPayload {
  readonly direction: Float32Array;
  readonly color: Float32Array;
  readonly intensity: number;
}

const DEFAULT_DIRECTION: AtmosphereColorVector = [-0.18, 0.86, 0.38];
const DEFAULT_COLOR: AtmosphereColorVector = [1.0, 0.94, 0.82];
const DEFAULT_INTENSITY = 0.95;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function normalizeVector(vec: AtmosphereColorVector): AtmosphereColorVector {
  const length = Math.hypot(vec[0], vec[1], vec[2]);
  if (!length || length <= 0.00001) {
    return [...DEFAULT_DIRECTION];
  }
  return [vec[0] / length, vec[1] / length, vec[2] / length];
}

export class AtmosphereLightNode {
  private readonly directionVec = new Float32Array(DEFAULT_DIRECTION);
  private readonly colorVec = new Float32Array(DEFAULT_COLOR);
  private intensity = DEFAULT_INTENSITY;

  constructor(initial?: AtmosphereLightSnapshot | null) {
    if (initial) {
      this.update(initial);
    }
  }

  update(snapshot?: AtmosphereLightSnapshot | null): void {
    if (!snapshot) {
      return;
    }
    const direction = normalizeVector(snapshot.direction);
    this.directionVec.set(direction);
    this.colorVec.set([
      clamp01(snapshot.color[0]),
      clamp01(snapshot.color[1]),
      clamp01(snapshot.color[2]),
    ]);
    this.intensity = Number.isFinite(snapshot.intensity)
      ? Math.max(0.2, Math.min(2, snapshot.intensity))
      : DEFAULT_INTENSITY;
  }

  getUniformPayload(): AtmosphereLightUniformPayload {
    return {
      direction: this.directionVec,
      color: this.colorVec,
      intensity: this.intensity,
    };
  }
}
