import { FlightVectorReticle, FlightVectorReticleState } from '../elements/FlightVectorReticle';

/**
 * Overlay que dibuja la retícula de vector de vuelo directamente sobre el canvas WebGL.
 * Reutiliza el pintor Canvas2D existente para mantener el mismo estilo visual del HUD.
 */
export class FlightVectorReticleOverlay {
  private readonly host: HTMLCanvasElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly painter = new FlightVectorReticle();
  private readonly resizeObserver?: ResizeObserver;
  private readonly onHostResize: () => void;
  private readonly followLagSeconds = 0.7; // Retardo evidente para que la retícula tarde en estabilizarse
  private rafHandle: number | null = null;
  private targetState: FlightVectorReticleState | null = null;
  private renderState: FlightVectorReticleState | null = null;
  private currentX: number = 0;
  private currentY: number = 0;
  private lastFrameTime: number | null = null;

  constructor(hostCanvas: HTMLCanvasElement) {
    this.host = hostCanvas;
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('flight-vector-overlay');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '4';
    this.canvas.style.opacity = '0';
    this.ctx = this.canvas.getContext('2d');
    this.host.parentElement?.appendChild(this.canvas);

    this.onHostResize = () => this.syncSize();
    this.host.addEventListener('webgl-resize', this.onHostResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(this.host);
    }

    this.syncSize();
  }

  public dispose(): void {
    this.targetState = null;
    this.renderState = null;
    this.clear();
    this.stopAnimationLoop();
    this.host.removeEventListener('webgl-resize', this.onHostResize);
    this.resizeObserver?.disconnect();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }

  public setState(state: FlightVectorReticleState | null): void {
    this.targetState = state && state.visible ? { ...state } : null;
    if (!this.targetState) {
      this.hideOverlay();
      return;
    }
    this.canvas.style.opacity = '1';
    if (!this.renderState) {
      this.renderState = { ...this.targetState };
      this.currentX = this.targetState.normalizedX;
      this.currentY = this.targetState.normalizedY;
    }
    this.ensureAnimationLoop();
  }

  private ensureAnimationLoop(): void {
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame((ts) => this.render(ts));
    }
  }

  private stopAnimationLoop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.lastFrameTime = null;
  }

  private render(timestamp: number): void {
    this.rafHandle = null;
    if (!this.targetState || !this.ctx) {
      this.hideOverlay();
      return;
    }

    const deltaTime = this.lastFrameTime === null ? 0 : (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    const alpha = this.computeSmoothingAlpha(deltaTime);
    this.currentX = this.lerp(this.currentX, this.targetState.normalizedX, alpha);
    this.currentY = this.lerp(this.currentY, this.targetState.normalizedY, alpha);

    if (!this.renderState) {
      this.renderState = { ...this.targetState };
    }
    this.renderState = {
      ...this.targetState,
      normalizedX: this.currentX,
      normalizedY: this.currentY,
    };

    this.clear();
    this.painter.setState(this.renderState);
    this.painter.render(this.ctx);

    this.ensureAnimationLoop();
  }

  private clear(): void {
    if (!this.ctx) {
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private syncSize(): void {
    if (!this.canvas) {
      return;
    }
    const width = this.host.width;
    const height = this.host.height;
    if (!width || !height) {
      return;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      // Cuando el tamaño cambia necesitamos forzar un re-render para evitar ghosting
      if (this.targetState && this.targetState.visible) {
        this.ensureAnimationLoop();
      }
    }
  }

  private hideOverlay(): void {
    this.canvas.style.opacity = '0';
    this.stopAnimationLoop();
    this.clear();
    this.renderState = null;
  }

  private computeSmoothingAlpha(deltaTime: number): number {
    if (deltaTime <= 0) {
      return 0;
    }
    return 1 - Math.exp(-deltaTime / Math.max(0.001, this.followLagSeconds));
  }

  private lerp(start: number, end: number, alpha: number): number {
    return start + (end - start) * Math.max(0, Math.min(1, alpha));
  }
}
