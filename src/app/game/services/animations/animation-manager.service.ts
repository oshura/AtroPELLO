import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { GameAnimation } from './types';

@Injectable({ providedIn: 'root' })
export class AnimationManagerService {
  private current: GameAnimation | null = null;
  private cachedVoidJumpCtor: ({ new(): GameAnimation }) | null = null;
  private flashImages: string[] = [
    '/assets/Athathoth.jpg',
    '/assets/GreatCthulhu.jpg',
    '/assets/Nodens.webp'
  ];
  private flashIndex = 0;

  constructor() {
    // Preload the void-jump module to avoid first-use delay on 'y'
    this.preloadVoidJump();
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
        console.error('Failed to load VoidJumpAnimation', e);
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
}
