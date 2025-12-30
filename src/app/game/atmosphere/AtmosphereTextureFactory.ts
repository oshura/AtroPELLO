export type AtmosphereTexturePattern = 'crater' | 'rock' | 'sand';

interface GeneratedTexture {
  size: number;
  data: Float32Array;
}

interface SurfacePattern {
  sampler: (u: number, v: number) => number;
  texture: GeneratedTexture;
}

/**
 * Genera texturas tileables en runtime usando Canvas 2D para añadir detalle a la superficie atmosférica.
 * Las texturas se guardan como mapas en escala de grises (0..1) para poder recolorearlas vía shader o CPU.
 */
export class AtmosphereTextureFactory {
  private readonly size: number;
  private readonly cache = new Map<AtmosphereTexturePattern, SurfacePattern>();

  constructor(options?: { size?: number }) {
    this.size = options?.size ?? 128;
  }

  public sample(pattern: AtmosphereTexturePattern, u: number, v: number): number {
    const surface = this.ensurePattern(pattern);
    if (!surface) {
      return 0.5;
    }
    const wrappedU = this.wrap01(u);
    const wrappedV = this.wrap01(v);
    const x = Math.min(surface.texture.size - 1, Math.floor(wrappedU * surface.texture.size));
    const y = Math.min(surface.texture.size - 1, Math.floor(wrappedV * surface.texture.size));
    return surface.texture.data[y * surface.texture.size + x];
  }

  private ensurePattern(pattern: AtmosphereTexturePattern): SurfacePattern | null {
    if (this.cache.has(pattern)) {
      return this.cache.get(pattern)!;
    }
    const surface = this.generatePattern(pattern);
    if (!surface) {
      return null;
    }
    this.cache.set(pattern, surface);
    return surface;
  }

  private generatePattern(pattern: AtmosphereTexturePattern): SurfacePattern | null {
    switch (pattern) {
      case 'crater':
        return this.bakePattern(this.createCraterSampler());
      case 'sand':
        return this.bakePattern(this.createSandSampler());
      case 'rock':
      default:
        return this.bakePattern(this.createRockSampler());
    }
  }

  private bakePattern(sampler: (x: number, y: number) => number): SurfacePattern | null {
    const canvas = this.createCanvas();
    if (!canvas) {
      const data = this.generateFallbackTexture();
      return {
        sampler,
        texture: {
          size: this.size,
          data,
        },
      };
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      const data = this.generateFallbackTexture();
      return {
        sampler,
        texture: {
          size: this.size,
          data,
        },
      };
    }
    const image = ctx.createImageData(this.size, this.size);
    const buffer = image.data;
    const floats = new Float32Array(this.size * this.size);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const nx = x / this.size;
        const ny = y / this.size;
        const value = this.clamp01(sampler(nx, ny));
        const byte = Math.round(value * 255);
        const idx = (y * this.size + x) * 4;
        buffer[idx] = byte;
        buffer[idx + 1] = byte;
        buffer[idx + 2] = byte;
        buffer[idx + 3] = 255;
        floats[y * this.size + x] = value;
      }
    }
    ctx.putImageData(image, 0, 0);
    return {
      sampler,
      texture: {
        size: this.size,
        data: floats,
      },
    };
  }

  private createCanvas(): OffscreenCanvas | HTMLCanvasElement | null {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(this.size, this.size);
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = this.size;
      canvas.height = this.size;
      return canvas;
    }
    return null;
  }

  private createRockSampler(): (x: number, y: number) => number {
    return (x, y) => {
      const n1 = this.ridgedNoise(x * 4.2, y * 4.2);
      const n2 = this.ridgedNoise(x * 9.1 + 7.3, y * 9.1 - 3.1) * 0.6;
      const n3 = this.simplexLikeNoise(x * 18.3 - 1.7, y * 18.3 + 2.5) * 0.35;
      const striation = Math.sin((x + y) * Math.PI * 4.5) * 0.08;
      const value = 0.38 + n1 * 0.45 + n2 * 0.35 + n3 * 0.25 + striation;
      return this.clamp01(value);
    };
  }

  private createCraterSampler(): (x: number, y: number) => number {
    const craters = Array.from({ length: 28 }).map((_, idx) => ({
      x: this.pseudoRandom(idx * 11.37),
      y: this.pseudoRandom(idx * 17.91),
      radius: 0.03 + this.pseudoRandom(idx * 23.17) * 0.12,
      depth: 0.12 + this.pseudoRandom(idx * 41.73) * 0.45,
    }));
    return (x, y) => {
      let base = this.ridgedNoise(x * 2.6, y * 2.6) * 0.6;
      base += this.simplexLikeNoise(x * 6.3 + 1.4, y * 6.3 - 2.1) * 0.25;
      let craterCarve = 0;
      for (const crater of craters) {
        const dx = this.wrapDistance(x - crater.x);
        const dy = this.wrapDistance(y - crater.y);
        const dist = Math.hypot(dx, dy);
        if (dist <= crater.radius) {
          const falloff = 1 - (dist / crater.radius) ** 2;
          craterCarve += falloff * crater.depth;
        }
      }
      const rim = Math.sin((x + y) * Math.PI * 2.5) * 0.05;
      return this.clamp01(0.25 + base - craterCarve + rim);
    };
  }

  private createSandSampler(): (x: number, y: number) => number {
    return (x, y) => {
      const ripples = Math.sin((y + x * 0.35) * Math.PI * 10.5);
      const secondary = Math.sin((y * 2.1 + x * 1.3) * Math.PI * 4.0);
      const breeze = this.simplexLikeNoise(x * 5.2, y * 5.2) * 0.25;
      const dunes = 0.5 + ripples * 0.2 + secondary * 0.08 + breeze * 0.2;
      return this.clamp01(dunes);
    };
  }

  private ridgedNoise(x: number, y: number): number {
    const n = this.simplexLikeNoise(x, y);
    const ridge = 1 - Math.abs(2 * n - 1);
    return this.clamp01(ridge);
  }

  private simplexLikeNoise(x: number, y: number): number {
    const s = Math.sin(x * 37.0 + y * 17.0) + Math.sin(x * 13.0 - y * 19.0) * 0.5 + Math.sin(x * 91.0 + y * 25.0) * 0.25;
    return this.clamp01(0.5 + 0.5 * s);
  }

  private pseudoRandom(seed: number): number {
    return this.fract(Math.sin(seed * 43758.5453123) * 43758.5453123);
  }

  private wrapDistance(value: number): number {
    if (value > 0.5) {
      return value - 1;
    }
    if (value < -0.5) {
      return value + 1;
    }
    return value;
  }

  private wrap01(value: number): number {
    const wrapped = value % 1;
    return wrapped < 0 ? wrapped + 1 : wrapped;
  }

  private fract(value: number): number {
    return value - Math.floor(value);
  }

  private generateFallbackTexture(): Float32Array {
    const floats = new Float32Array(this.size * this.size);
    for (let i = 0; i < floats.length; i++) {
      floats[i] = 0.5;
    }
    return floats;
  }

  private clamp01(value: number): number {
    if (value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }
}
