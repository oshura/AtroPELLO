import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { SpellType } from '../../types/spell.types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class QuimioSigillumAnimation implements GameAnimation {
  public readonly name = 'quimio-sigillum';
  public readonly spellType = SpellType.QUIMIO_SIGILLUM;

  private blocking = true;
  private elapsed = 0;
  private overlayAlpha = 0;

  private readonly fadeInTime = 0.8;
  private readonly imageTime = 3.0;
  private readonly fadeOutTime = 0.9;
  private readonly zoomRange: [number, number] = [1.0, 1.28];
  private readonly overlayColor: [number, number, number] = [0, 0, 0];
  private readonly textureKey = 'quimio-sigil-nodens';
  private readonly textureUrls = [
    '/assets/Nodens.webp',
    'assets/Nodens.webp',
    '/app/assets/Nodens.webp',
    '/src/app/assets/Nodens.webp'
  ];

  private prevCameraMode: CameraMode = CameraMode.INMOVILE_EXTERNAL;
  private totalTime = this.fadeInTime + this.imageTime + this.fadeOutTime;
  private texture: WebGLTexture | null = null;
  private textureSize = { width: 1024, height: 1024 };

  start(engine: GameEngine): void {
    this.prevCameraMode = engine['camera']?.getCurrentMode?.() ?? CameraMode.INMOVILE_EXTERNAL;
    engine['camera']?.setCameraMode?.(CameraMode.INMOVILE_EXTERNAL);
    this.ensureTexture(engine);
  }

  update(engine: GameEngine, dt: number): boolean {
    this.elapsed += dt;
    if (this.elapsed < this.fadeInTime) {
      this.overlayAlpha = clamp01(this.elapsed / this.fadeInTime);
    } else if (this.elapsed < this.fadeInTime + this.imageTime) {
      this.overlayAlpha = 1;
    } else {
      const t = clamp01((this.elapsed - this.fadeInTime - this.imageTime) / this.fadeOutTime);
      this.overlayAlpha = clamp01(1 - t);
    }

    if (this.elapsed >= this.totalTime) {
      this.finish(engine);
      return true;
    }
    return false;
  }

  render(engine: GameEngine): void {
    const overlay = engine.overlayRenderer;
    if (!overlay) return;

    if (this.overlayAlpha > 0) {
      try { overlay.drawSolid(this.overlayColor, this.overlayAlpha); } catch {}
    }

    if (!this.texture) return;
    const imageStart = this.fadeInTime;
    const imageEnd = this.fadeInTime + this.imageTime;
    if (this.elapsed < imageStart || this.elapsed > imageEnd) return;

    const zoomK = clamp01((this.elapsed - imageStart) / Math.max(0.0001, this.imageTime));
    const zoom = this.zoomRange[0] + (this.zoomRange[1] - this.zoomRange[0]) * zoomK;

    // Ease in/out alpha slightly so the image rides the fade
    const fadeInK = clamp01((this.elapsed - imageStart) / 0.4);
    const fadeOutK = clamp01((imageEnd - this.elapsed) / 0.6);
    const imageAlpha = clamp01(Math.min(fadeInK, fadeOutK));
    if (imageAlpha <= 0) return;

    try {
      overlay.drawTextureCover(this.texture, this.textureSize.width, this.textureSize.height, zoom, imageAlpha);
    } catch {}
  }

  cleanup(engine: GameEngine): void {
    this.finish(engine);
  }

  isBlockingInputs(): boolean {
    return this.blocking;
  }

  private finish(engine: GameEngine): void {
    engine['camera']?.setCameraMode?.(this.prevCameraMode);
    this.blocking = false;
  }

  private ensureTexture(engine: GameEngine): void {
    const tm = engine.textureManager as any;
    if (!tm) return;
    const attach = (tex: WebGLTexture) => {
      this.texture = tex;
      const size = tm.getTextureSize?.(this.textureKey);
      if (size && size.width && size.height) {
        this.textureSize = { width: size.width, height: size.height };
      }
    };

    const existing = tm.getTexture?.(this.textureKey) as WebGLTexture | null;
    if (existing) {
      attach(existing);
      return;
    }

    (async () => {
      for (const url of this.textureUrls) {
        try {
          await tm.loadTextureFromUrl?.(this.textureKey, url);
          const tex = tm.getTexture?.(this.textureKey) as WebGLTexture | null;
          if (tex) {
            attach(tex);
            return;
          }
        } catch {
          const tex = tm.getTexture?.(this.textureKey) as WebGLTexture | null;
          if (tex) {
            attach(tex);
            return;
          }
        }
      }
    })();
  }
}
