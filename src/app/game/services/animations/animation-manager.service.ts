import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { GameAnimation } from './types';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';

@Injectable({ providedIn: 'root' })
export class AnimationManagerService {
  private current: GameAnimation | null = null;
  private cachedVoidJumpCtor: ({ new(): GameAnimation }) | null = null;
  private cachedGateRiteCtor: ({ new(): GameAnimation }) | null = null;
  private flashImages: string[] = [
    '/assets/Athathoth.jpg',
    '/assets/GreatCthulhu.jpg',
    '/assets/Nodens.webp'
  ];
  private flashIndex = 0;

  constructor() {
    // Preload the void-jump module to avoid first-use delay on 'y'
    this.preloadVoidJump();
    // Preload GateRite best-effort
    this.preloadGateRite();
  }

  public startVoidJump(engine: GameEngine, target: ITargetable): boolean {
    if (this.current) return false; // busy
    // If cached ctor available, start immediately; else lazy-load with stub
    if (this.cachedVoidJumpCtor) {
      const anim = new this.cachedVoidJumpCtor();
      // Configure one image per jump (cycle)
      const pick = this.flashImages[(this.flashIndex++) % this.flashImages.length];
      try { (anim as any).setFlashConfig?.({ images: [pick] }); } catch {}
      anim.start(engine, target);
      this.current = anim;
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod2 = await import('./void-jump.animation');
        const AnimClass = (mod2 as any).VoidJumpAnimation as { new(): GameAnimation };
        this.cachedVoidJumpCtor = AnimClass;
        const anim = new AnimClass();
        const pick = this.flashImages[(this.flashIndex++) % this.flashImages.length];
        try { (anim as any).setFlashConfig?.({ images: [pick] }); } catch {}
        anim.start(engine, target);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load VoidJumpAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  public update(engine: GameEngine, dt: number): void {
    if (!this.current) return;
    const done = this.current.update(engine, dt);
    if (done) {
      this.current = null;
    }
  }

  public render(engine: GameEngine): void {
    if (!this.current) return;
    this.current.render(engine);
  }

  public isBlockingInputs(): boolean {
    return !!this.current && this.current.isBlockingInputs();
  }

  /** Force-terminate current animation and restore game state (called on player death) */
  public forceTerminateCurrentAnimation(engine: GameEngine): void {
    if (!this.current) return;
    try {
      if (this.current.cleanup) {
        this.current.cleanup(engine);
      }
    } catch (e) {
      try { GameLogger.error(LogCategory.ANIMATION, 'Animation cleanup failed', e); } catch {}
    }
    this.current = null;
  }

  /** Start a simple blocking placeholder animation for a fixed duration. */
  public startBlockingDelay(durationMs: number, keepOutlinersVisible: boolean = false): void {
    if (durationMs <= 0) return;
    // If already running something, keep it (do not override a real animation)
    if (this.current) return;
    let t = 0;
    const total = Math.max(0.001, durationMs) / 1000;
    this.current = {
      name: 'blocking-delay',
      keepOutlinersVisible, // Pass through to control outliner visibility
      start: () => {},
      update: (_engine: GameEngine, dt: number) => {
        t += dt;
        return t >= total;
      },
      render: () => {},
      isBlockingInputs: () => true,
    };
  }

  private createLoadingStub(): GameAnimation {
    let t = 0;
    return {
      name: 'loading-void-jump',
      start: () => {},
      update: (_engine: GameEngine, dt: number) => { t += dt; return t > 2.0; }, // auto-timeout fallback
      render: () => {},
      isBlockingInputs: () => true,
    };
  }

  private preloadVoidJump(): void {
    (async () => {
      try {
        const mod2 = await import('./void-jump.animation');
        const AnimClass = (mod2 as any).VoidJumpAnimation as { new(): GameAnimation };
        this.cachedVoidJumpCtor = AnimClass;
      } catch {
        // Best-effort; ignore
      }
    })();
  }

  public startGateRite(engine: GameEngine, target: ITargetable): boolean {
    if (this.current) return false;
    if (this.cachedGateRiteCtor) {
      const anim = new this.cachedGateRiteCtor();
      anim.start(engine, target);
      this.current = anim; return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./gate-rite.animation');
        const Anim = (mod as any).GateRiteAnimation as { new(): GameAnimation };
        this.cachedGateRiteCtor = Anim;
        const anim = new Anim();
        anim.start(engine, target);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load GateRiteAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadGateRite(): void {
    (async () => {
      try {
        const mod = await import('./gate-rite.animation');
        const Anim = (mod as any).GateRiteAnimation as { new(): GameAnimation };
        this.cachedGateRiteCtor = Anim;
      } catch { /* ignore */ }
    })();
  }
}
