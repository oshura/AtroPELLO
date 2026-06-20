import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { SpellType } from '../../types/spell.types';
import { clamp01 } from './animation-math';
import { BaseAnimation } from './base-animation';
import { CameraTakeover } from './animation-tools';
import { OverlayImage } from './animation-overlay';

export class QuimioSigillumAnimation extends BaseAnimation {
  public readonly name = 'quimio-sigillum';
  public readonly spellType = SpellType.QUIMIO_SIGILLUM;

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

  private readonly cameraTakeover = new CameraTakeover();
  private readonly overlayImage = new OverlayImage();
  private totalTime = this.fadeInTime + this.imageTime + this.fadeOutTime;

  protected override onStart(engine: GameEngine): void {
    this.cameraTakeover.take(engine.camera, CameraMode.INMOVILE_EXTERNAL);
    this.overlayImage.load(engine, this.textureKey, this.textureUrls);
    this.onTeardown((eng) => this.cameraTakeover.restore(eng.camera));
  }

  protected override onUpdate(_engine: GameEngine, dt: number): boolean {
    this.elapsed += dt;
    if (this.elapsed < this.fadeInTime) {
      this.overlayAlpha = clamp01(this.elapsed / this.fadeInTime);
    } else if (this.elapsed < this.fadeInTime + this.imageTime) {
      this.overlayAlpha = 1;
    } else {
      const t = clamp01((this.elapsed - this.fadeInTime - this.imageTime) / this.fadeOutTime);
      this.overlayAlpha = clamp01(1 - t);
    }

    return this.elapsed >= this.totalTime;
  }

  public override render(engine: GameEngine): void {
    const overlay = engine.overlayRenderer;
    if (!overlay) return;

    if (this.overlayAlpha > 0) {
      try { overlay.drawSolid(this.overlayColor, this.overlayAlpha); } catch {}
    }

    if (!this.overlayImage.ready) return;
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

    this.overlayImage.drawCover(engine, zoom, imageAlpha);
  }
}
