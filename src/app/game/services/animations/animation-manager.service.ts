import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { GameAnimation } from './types';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';
import { SpellType } from '../../types/spell.types';
import { LandingApproachContext } from '../../types/landing.types';
import { ElderGod } from '../../types/cosmic-life.types';

@Injectable({ providedIn: 'root' })
export class AnimationManagerService {
  private current: GameAnimation | null = null;
  private cachedVoidJumpCtor: ({ new(): GameAnimation }) | null = null;
  private cachedGateRiteCtor: ({ new(): GameAnimation }) | null = null;
  private cachedEternalRiteCtor: ({ new(): GameAnimation }) | null = null;
  private cachedDisruptionRiteCtor: ({ new(): GameAnimation }) | null = null;
  private cachedAnchoringPulseCtor: ({ new(): GameAnimation }) | null = null;
  private cachedVoidKinesisCtor: ({ new(): GameAnimation }) | null = null;
  private cachedLandingSequenceCtor: ({ new(): GameAnimation }) | null = null;
  private cachedTakeoffSequenceCtor: ({ new(): GameAnimation }) | null = null;
  private cachedGroundTakeoffCtor: ({ new(): GameAnimation }) | null = null;
  private cachedAtmosphereLandingCtor: ({ new(): GameAnimation }) | null = null;
  private cachedQuimioSigillumCtor: ({ new(): GameAnimation }) | null = null;
  private cachedRespawnSigillumCtor: ({ new(): GameAnimation }) | null = null;
  private elderGodFlashImages: Record<ElderGod, string> = {
    [ElderGod.CTHULHU]: '/assets/GreatCthulhu.webp',
    [ElderGod.AZATHOTH]: '/assets/Azathoth.webp',
    [ElderGod.YOG_SOTHOTH]: '/assets/YogSothoth.jpg',
    [ElderGod.CTHUGHA]: '/assets/Cthugha.webp'
  };
  private fallbackFlashImages: string[] = ['/assets/Nodens.webp'];
  private flashIndex = 0;
  private readonly nonInterruptibleAnimationNames = new Set<string>(['landing-sequence', 'takeoff-sequence', 'ground-takeoff']);

  constructor() {
    // Preload the void-jump module to avoid first-use delay on 'y'
    this.preloadVoidJump();
    // Preload GateRite best-effort
    this.preloadGateRite();
    // Preload other rites best-effort
    this.preloadEternalRite();
    this.preloadDisruptionRite();
    this.preloadAnchoringPulse();
    this.preloadVoidKinesis();
    this.preloadLandingSequence();
    this.preloadTakeoffSequence();
    this.preloadGroundTakeoff();
    this.preloadAtmosphereLanding();
    this.preloadQuimioSigillum();
    this.preloadRespawnSigillum();
  }

  public startVoidJump(engine: GameEngine, target: ITargetable): boolean {
    // Allow replacing blocking-delay to avoid 1-frame flash
    if (this.current && this.current.name !== 'blocking-delay') return false; // busy
    // If cached ctor available, start immediately; else lazy-load with stub
    if (this.cachedVoidJumpCtor) {
      const anim = new this.cachedVoidJumpCtor();
      // Configure one image per jump (cycle)
      const pick = this.pickVoidJumpImage(engine);
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
        const pick = this.pickVoidJumpImage(engine);
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

  /** Provides read-only access to the currently running animation (used for coordination). */
  public getCurrentAnimation(): GameAnimation | null {
    return this.current;
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
    try { engine.clearPendingVoidJumpEncounter?.(); } catch {}
    this.current = null;
  }

  /** Start a simple blocking placeholder animation for a fixed duration. */
  public startBlockingDelay(
    durationMs: number,
    options?: { keepOutlinersVisible?: boolean; spellType?: SpellType }
  ): void {
    if (durationMs <= 0) return;
    // If already running something, keep it (do not override a real animation)
    if (this.current) return;
    let t = 0;
    const total = Math.max(0.001, durationMs) / 1000;
    this.current = {
      name: 'blocking-delay',
      keepOutlinersVisible: options?.keepOutlinersVisible ?? false,
      spellType: options?.spellType,
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

  private pickVoidJumpImage(engine: GameEngine): string {
    const pending = typeof engine.peekPendingVoidJumpEncounter === 'function'
      ? engine.peekPendingVoidJumpEncounter()
      : null;
    const elder = typeof engine.getCurrentSystemElderGod === 'function'
      ? engine.getCurrentSystemElderGod()
      : (pending?.elderGod ?? ElderGod.CTHULHU);
    const mapped = this.elderGodFlashImages[elder];
    if (mapped) {
      return mapped;
    }
    if (!this.fallbackFlashImages.length) {
      return '/assets/GreatCthulhu.webp';
    }
    const pick = this.fallbackFlashImages[(this.flashIndex++) % this.fallbackFlashImages.length];
    return pick;
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

  public startAnchoringPulse(engine: GameEngine, target?: ITargetable): boolean {
    if (this.current && this.current.name !== 'blocking-delay') return false;
    if (this.cachedAnchoringPulseCtor) {
      const anim = new this.cachedAnchoringPulseCtor();
      anim.start(engine, target || undefined);
      this.current = anim;
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./anchoring-pulse.animation');
        const Anim = (mod as any).AnchoringPulseAnimation as { new(): GameAnimation };
        this.cachedAnchoringPulseCtor = Anim;
        const anim = new Anim();
        anim.start(engine, target || undefined);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load AnchoringPulseAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadAnchoringPulse(): void {
    (async () => {
      try {
        const mod = await import('./anchoring-pulse.animation');
        const Anim = (mod as any).AnchoringPulseAnimation as { new(): GameAnimation };
        this.cachedAnchoringPulseCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startVoidKinesis(engine: GameEngine, target?: ITargetable): boolean {
    if (this.current && this.current.name !== 'blocking-delay') return false;
    if (this.cachedVoidKinesisCtor) {
      const anim = new this.cachedVoidKinesisCtor();
      anim.start(engine, target || undefined);
      this.current = anim;
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./void-kinesis.animation');
        const Anim = (mod as any).VoidKinesisAnimation as { new(): GameAnimation };
        this.cachedVoidKinesisCtor = Anim;
        const anim = new Anim();
        anim.start(engine, target || undefined);
        this.current = anim;
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load VoidKinesisAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadVoidKinesis(): void {
    (async () => {
      try {
        const mod = await import('./void-kinesis.animation');
        const Anim = (mod as any).VoidKinesisAnimation as { new(): GameAnimation };
        this.cachedVoidKinesisCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startQuimioSigillum(engine: GameEngine): boolean {
    if (this.current && this.current.name !== 'blocking-delay') {
      return false;
    }
    const launch = (Ctor: { new(): GameAnimation }) => {
      const anim = new Ctor();
      anim.start(engine);
      this.current = anim;
    };
    if (this.cachedQuimioSigillumCtor) {
      launch(this.cachedQuimioSigillumCtor);
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./quimio-sigillum.animation');
        const Anim = (mod as any).QuimioSigillumAnimation as { new(): GameAnimation };
        this.cachedQuimioSigillumCtor = Anim;
        launch(Anim);
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load QuimioSigillumAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadQuimioSigillum(): void {
    (async () => {
      try {
        const mod = await import('./quimio-sigillum.animation');
        const Anim = (mod as any).QuimioSigillumAnimation as { new(): GameAnimation };
        this.cachedQuimioSigillumCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startRespawnSigillum(engine: GameEngine): boolean {
    if (this.current && this.current.name !== 'blocking-delay') {
      return false;
    }
    const launch = (Ctor: { new(): GameAnimation }) => {
      const anim = new Ctor();
      anim.start(engine);
      this.current = anim;
    };
    if (this.cachedRespawnSigillumCtor) {
      launch(this.cachedRespawnSigillumCtor);
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./respawn-sigillum.animation');
        const Anim = (mod as any).RespawnSigillumAnimation as { new(): GameAnimation };
        this.cachedRespawnSigillumCtor = Anim;
        launch(Anim);
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load RespawnSigillumAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadRespawnSigillum(): void {
    (async () => {
      try {
        const mod = await import('./respawn-sigillum.animation');
        const Anim = (mod as any).RespawnSigillumAnimation as { new(): GameAnimation };
        this.cachedRespawnSigillumCtor = Anim;
      } catch {
        // best-effort
      }
    })();
  }

  public startLandingSequence(engine: GameEngine, context: LandingApproachContext): boolean {
    if (this.current && this.current.name !== 'blocking-delay') {
      return false;
    }
    const launch = (Ctor: { new(): GameAnimation }) => {
      const anim = new Ctor();
      try { (anim as any).configure?.(context); } catch {}
      anim.start(engine);
      this.current = anim;
    };
    if (this.cachedLandingSequenceCtor) {
      launch(this.cachedLandingSequenceCtor);
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./landing-sequence.animation');
        const Anim = (mod as any).LandingSequenceAnimation as { new(): GameAnimation };
        this.cachedLandingSequenceCtor = Anim;
        launch(Anim);
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load LandingSequenceAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  public startAtmosphereLandingCinematic(
    engine: GameEngine,
    context: LandingApproachContext,
    options?: { forceReplace?: boolean }
  ): boolean {
    if (this.current && this.current.name !== 'blocking-delay') {
      const canPreempt = options?.forceReplace && this.tryForceReplaceCurrentAnimation(engine, 'atmosphere-landing');
      if (!canPreempt) {
        if (options?.forceReplace) {
          try {
            const active = this.current?.name ?? 'unknown';
            GameLogger.warn(
              LogCategory.ANIMATION,
              `Atmosphere landing cinematic blocked by active animation: ${active}`
            );
          } catch {}
        }
        return false;
      }
    }
    const launch = (Ctor: { new(): GameAnimation }) => {
      const anim = new Ctor();
      try { (anim as any).configure?.(context); } catch {}
      anim.start(engine);
      this.current = anim;
    };
    if (this.cachedAtmosphereLandingCtor) {
      launch(this.cachedAtmosphereLandingCtor);
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        const mod = await import('./atmosphere-landing.animation');
        const Anim = (mod as any).AtmosphereLandingAnimation as { new(): GameAnimation };
        this.cachedAtmosphereLandingCtor = Anim;
        launch(Anim);
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load AtmosphereLandingAnimation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private tryForceReplaceCurrentAnimation(engine: GameEngine, nextName: string): boolean {
    if (!this.current) {
      return true;
    }
    const activeName = this.current.name;
    if (this.nonInterruptibleAnimationNames.has(activeName)) {
      return false;
    }
    try {
      this.current.cleanup?.(engine);
    } catch (error) {
      try { GameLogger.warn(LogCategory.ANIMATION, `Cleanup failed while preempting ${activeName}`, error); } catch {}
    }
    this.current = null;
    try {
      GameLogger.warn(LogCategory.ANIMATION, `Preempted animation ${activeName} → ${nextName}`);
    } catch {}
    return true;
  }

  private preloadLandingSequence(): void {
    (async () => {
      try {
        const mod = await import('./landing-sequence.animation');
        const Anim = (mod as any).LandingSequenceAnimation as { new(): GameAnimation };
        this.cachedLandingSequenceCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  private preloadAtmosphereLanding(): void {
    (async () => {
      try {
        const mod = await import('./atmosphere-landing.animation');
        const Anim = (mod as any).AtmosphereLandingAnimation as { new(): GameAnimation };
        this.cachedAtmosphereLandingCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  public startTakeoffSequence(
    engine: GameEngine,
    context: LandingApproachContext,
    options?: { phase?: 'ground' | 'atmo-exit'; suppressOverlay?: boolean }
  ): boolean {
    if (this.current && this.current.name !== 'blocking-delay') {
      return false;
    }
    const phase = options?.phase ?? 'ground';
    const configureOptions = {
      phase,
      suppressOverlay: options?.suppressOverlay ?? false,
    };
    const launch = (Ctor: { new(): GameAnimation }) => {
      const anim = new Ctor();
      try { (anim as any).configure?.(context, configureOptions); } catch {}
      anim.start(engine);
      this.current = anim;
    };
    const useGroundPhase = phase === 'ground';
    const cachedCtor = useGroundPhase ? this.cachedGroundTakeoffCtor : this.cachedTakeoffSequenceCtor;
    if (cachedCtor) {
      launch(cachedCtor);
      return true;
    }
    this.current = this.createLoadingStub();
    (async () => {
      try {
        if (useGroundPhase) {
          const mod = await import('./ground-takeoff.animation');
          const Anim = (mod as any).GroundTakeoffAnimation as { new(): GameAnimation };
          this.cachedGroundTakeoffCtor = Anim;
          launch(Anim);
        } else {
          const mod = await import('./takeoff-sequence.animation');
          const Anim = (mod as any).TakeoffSequenceAnimation as { new(): GameAnimation };
          this.cachedTakeoffSequenceCtor = Anim;
          launch(Anim);
        }
      } catch (e) {
        try { GameLogger.error(LogCategory.ANIMATION, 'Failed to load Takeoff animation', e); } catch {}
        this.current = null;
      }
    })();
    return true;
  }

  private preloadTakeoffSequence(): void {
    (async () => {
      try {
        const mod = await import('./takeoff-sequence.animation');
        const Anim = (mod as any).TakeoffSequenceAnimation as { new(): GameAnimation };
        this.cachedTakeoffSequenceCtor = Anim;
      } catch { /* ignore */ }
    })();
  }

  private preloadGroundTakeoff(): void {
    (async () => {
      try {
        const mod = await import('./ground-takeoff.animation');
        const Anim = (mod as any).GroundTakeoffAnimation as { new(): GameAnimation };
        this.cachedGroundTakeoffCtor = Anim;
      } catch { /* ignore */ }
    })();
  }
}
