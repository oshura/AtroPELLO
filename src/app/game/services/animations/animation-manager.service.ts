import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { GameAnimation } from './types';

@Injectable({ providedIn: 'root' })
export class AnimationManagerService {
  private current: GameAnimation | null = null;

  public startVoidJump(engine: GameEngine, target: ITargetable): boolean {
    if (this.current) return false; // busy
    // Set a temporary blocking stub while we lazy-load the real animation
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod2 = await import('./void-jump.animation');
        const AnimClass = (mod2 as any).VoidJumpAnimation as { new(): GameAnimation };
        const anim = new AnimClass();
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
}
