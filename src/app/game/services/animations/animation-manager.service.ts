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
  private cachedSpeedRiteCtor: ({ new(): GameAnimation }) | null = null;
  private cachedEternalRiteCtor: ({ new(): GameAnimation }) | null = null;
  private cachedDisruptionRiteCtor: ({ new(): GameAnimation }) | null = null;
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
    // Preload other rites best-effort
    this.preloadSpeedRite();
    this.preloadEternalRite();
    this.preloadDisruptionRite();
  }

  public startVoidJump(engine: GameEngine, target: ITargetable): boolean {
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false; // busy
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
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false;
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

  public startSpeedRite(engine: GameEngine): boolean {
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false;
    if (this.cachedSpeedRiteCtor) {
      const anim = new this.cachedSpeedRiteCtor();
      anim.start(engine);
      this.current = anim; 
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./speed-rite.animation');
        const Anim = (mod as any).SpeedRiteAnimation as { new(): GameAnimation };
        this.cachedSpeedRiteCtor = Anim;
        const anim = new Anim();
        anim.start(engine);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load SpeedRiteAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadSpeedRite(): void {
    (async () => {
      try {
        const mod = await import('./speed-rite.animation');
        const Anim = (mod as any).SpeedRiteAnimation as { new(): GameAnimation };
        this.cachedSpeedRiteCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startEternalRite(engine: GameEngine): boolean {
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false;
    if (this.cachedEternalRiteCtor) {
      const anim = new this.cachedEternalRiteCtor();
      anim.start(engine);
      this.current = anim; 
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./eternal-rite.animation');
        const Anim = (mod as any).EternalRiteAnimation as { new(): GameAnimation };
        this.cachedEternalRiteCtor = Anim;
        const anim = new Anim();
        anim.start(engine);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load EternalRiteAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadEternalRite(): void {
    (async () => {
      try {
        const mod = await import('./eternal-rite.animation');
        const Anim = (mod as any).EternalRiteAnimation as { new(): GameAnimation };
        this.cachedEternalRiteCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startDisruptionRite(engine: GameEngine, target?: ITargetable): boolean {
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false;
    if (this.cachedDisruptionRiteCtor) {
      const anim = new this.cachedDisruptionRiteCtor();
      anim.start(engine, target || undefined);
      this.current = anim; 
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./disruption-rite.animation');
        const Anim = (mod as any).DisruptionRiteAnimation as { new(): GameAnimation };
        this.cachedDisruptionRiteCtor = Anim;
        const anim = new Anim();
        anim.start(engine, target || undefined);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load DisruptionRiteAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadDisruptionRite(): void {
    (async () => {
      try {
        const mod = await import('./disruption-rite.animation');
        const Anim = (mod as any).DisruptionRiteAnimation as { new(): GameAnimation };
        this.cachedDisruptionRiteCtor = Anim;
      } catch { /* ignore */ }
    })();
  }
}
