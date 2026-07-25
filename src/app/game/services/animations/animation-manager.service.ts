import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { GameAnimation } from './types';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';
import { SpellType } from '../../types/spell.types';
import { LandingApproachContext } from '../../types/landing.types';
import { ElderGod } from '../../types/cosmic-life.types';
import { DockingSequenceContext } from './docking-sequence.animation';

type AnimationCtor = { new (): GameAnimation };
type PrepareFn = (anim: GameAnimation) => void;

/** Aplica `configure(...)` si la animación lo soporta (sustituye al `(anim as any).configure?`). */
export function applyConfigure(anim: GameAnimation, ...args: unknown[]): void {
  const fn = (anim as { configure?: (...a: unknown[]) => void }).configure;
  if (typeof fn === 'function') {
    try { fn.apply(anim, args); } catch { /* best-effort */ }
  }
}

/** Aplica `setFlashConfig({images})` si la animación lo soporta (void-jump). */
export function applyFlashConfig(anim: GameAnimation, images: string[]): void {
  const fn = (anim as { setFlashConfig?: (cfg: { images: string[] }) => void }).setFlashConfig;
  if (typeof fn === 'function') {
    // OJO: enlazar `this` al objeto. Llamar `fn({images})` desacoplado dejaba `this` undefined (módulo ES,
    // strict) → setFlashConfig lanzaba y el catch lo tragaba → flashImageUrls vacío → void-jump en BLANCO.
    try { fn.call(anim, { images }); } catch { /* best-effort */ }
  }
}

/**
 * Orquesta una única animación a la vez. La carga (lazy import + caché + stub) está unificada en un
 * registro de loaders + `launch()`; antes había ~480 líneas de `startX`/`preloadX`/`cachedXCtor` casi
 * idénticas. Cada API pública es un envoltorio fino que define su `prepare` (configure/flash + start).
 * docs/ARQUITECTURA.md Fase 8.3.
 */
@Injectable({ providedIn: 'root' })
export class AnimationManagerService {
  private current: GameAnimation | null = null;
  private readonly ctorCache = new Map<string, AnimationCtor>();

  /** Registro data-driven: nombre → cargador lazy del módulo de la animación. */
  private readonly loaders: Record<string, () => Promise<AnimationCtor>> = {
    'void-jump': () => import('./void-jump.animation').then(m => m.VoidJumpAnimation),
    'gate-rite': () => import('./gate-rite.animation').then(m => m.GateRiteAnimation),
    'eternal-rite': () => import('./eternal-rite.animation').then(m => m.EternalRiteAnimation),
    'disruption-rite': () => import('./disruption-rite.animation').then(m => m.DisruptionRiteAnimation),
    'anchoring-pulse': () => import('./anchoring-pulse.animation').then(m => m.AnchoringPulseAnimation),
    'void-kinesis': () => import('./void-kinesis.animation').then(m => m.VoidKinesisAnimation),
    'quimio-sigillum': () => import('./quimio-sigillum.animation').then(m => m.QuimioSigillumAnimation),
    'respawn-sigillum': () => import('./respawn-sigillum.animation').then(m => m.RespawnSigillumAnimation),
    'landing-sequence': () => import('./landing-sequence.animation').then(m => m.LandingSequenceAnimation),
    'atmosphere-landing': () => import('./atmosphere-landing.animation').then(m => m.AtmosphereLandingAnimation),
    'ground-takeoff': () => import('./ground-takeoff.animation').then(m => m.GroundTakeoffAnimation),
    'takeoff-sequence': () => import('./takeoff-sequence.animation').then(m => m.TakeoffSequenceAnimation),
    'docking-sequence': () => import('./docking-sequence.animation').then(m => m.DockingSequenceAnimation),
  };

  private elderGodFlashImages: Record<ElderGod, string> = {
    [ElderGod.CTHULHU]: '/assets/GreatCthulhu.webp',
    [ElderGod.AZATHOTH]: '/assets/Azathoth.webp',
    [ElderGod.YOG_SOTHOTH]: '/assets/YogSothoth.jpg',
    [ElderGod.CTHUGHA]: '/assets/Cthugha.webp'
  };
  private fallbackFlashImages: string[] = ['/assets/Nodens.webp'];
  private flashIndex = 0;
  private readonly nonInterruptibleAnimationNames = new Set<string>(['landing-sequence', 'takeoff-sequence', 'ground-takeoff', 'docking-sequence']);

  constructor() {
    // Best-effort: precargar todos los módulos para evitar el retardo del primer uso.
    for (const name of Object.keys(this.loaders)) {
      this.loaders[name]().then(ctor => this.ctorCache.set(name, ctor)).catch(() => { /* ignore */ });
    }
  }

  // ---- API pública: envoltorios finos (cada uno define su prepare) ----

  public startVoidJump(engine: GameEngine, target: ITargetable): boolean {
    return this.launch(engine, 'void-jump', (anim) => {
      applyFlashConfig(anim, [this.pickVoidJumpImage(engine)]);
      anim.start(engine, target);
    });
  }

  public startGateRite(engine: GameEngine, target: ITargetable): boolean {
    return this.launch(engine, 'gate-rite', (anim) => anim.start(engine, target));
  }

  public startEternalRite(engine: GameEngine): boolean {
    return this.launch(engine, 'eternal-rite', (anim) => anim.start(engine));
  }

  public startDisruptionRite(engine: GameEngine, target?: ITargetable): boolean {
    return this.launch(engine, 'disruption-rite', (anim) => anim.start(engine, target || undefined));
  }

  public startAnchoringPulse(engine: GameEngine, target?: ITargetable): boolean {
    return this.launch(engine, 'anchoring-pulse', (anim) => anim.start(engine, target || undefined));
  }

  public startVoidKinesis(engine: GameEngine, target?: ITargetable): boolean {
    return this.launch(engine, 'void-kinesis', (anim) => anim.start(engine, target || undefined));
  }

  public startQuimioSigillum(engine: GameEngine): boolean {
    return this.launch(engine, 'quimio-sigillum', (anim) => anim.start(engine));
  }

  public startRespawnSigillum(engine: GameEngine): boolean {
    return this.launch(engine, 'respawn-sigillum', (anim) => anim.start(engine));
  }

  public startLandingSequence(engine: GameEngine, context: LandingApproachContext): boolean {
    return this.launch(engine, 'landing-sequence', (anim) => {
      applyConfigure(anim, context);
      anim.start(engine);
    });
  }

  public startAtmosphereLandingCinematic(
    engine: GameEngine,
    context: LandingApproachContext,
    options?: { forceReplace?: boolean }
  ): boolean {
    return this.launch(engine, 'atmosphere-landing', (anim) => {
      applyConfigure(anim, context);
      anim.start(engine);
    }, { forceReplace: options?.forceReplace });
  }

  public startTakeoffSequence(
    engine: GameEngine,
    context: LandingApproachContext,
    options?: { phase?: 'ground' | 'atmo-exit'; suppressOverlay?: boolean }
  ): boolean {
    const phase = options?.phase ?? 'ground';
    const name = phase === 'ground' ? 'ground-takeoff' : 'takeoff-sequence';
    return this.launch(engine, name, (anim) => {
      applyConfigure(anim, context, { phase, suppressOverlay: options?.suppressOverlay ?? false });
      anim.start(engine);
    });
  }

  public startDockingSequence(engine: GameEngine, context: DockingSequenceContext): boolean {
    return this.launch(engine, 'docking-sequence', (anim) => {
      applyConfigure(anim, context);
      anim.start(engine);
    });
  }

  // ---- Núcleo de carga/arranque (unifica busy-check + caché + lazy import + stub) ----

  private launch(engine: GameEngine, name: string, prepare: PrepareFn, options?: { forceReplace?: boolean }): boolean {
    // Permitir reemplazar el 'blocking-delay' para evitar un flash de 1 frame.
    if (this.current && this.current.name !== 'blocking-delay') {
      if (!(options?.forceReplace && this.tryForceReplaceCurrentAnimation(engine, name))) {
        if (options?.forceReplace) {
          try {
            const active = this.current?.name ?? 'unknown';
            GameLogger.warn(LogCategory.ANIMATION, `Animation ${name} blocked by active animation: ${active}`);
          } catch {}
        }
        return false;
      }
    }
    const cached = this.ctorCache.get(name);
    if (cached) {
      this.spawn(cached, prepare);
      return true;
    }
    this.current = this.createLoadingStub();
    const loader = this.loaders[name];
    loader()
      .then(ctor => {
        this.ctorCache.set(name, ctor);
        this.spawn(ctor, prepare);
      })
      .catch(e => {
        try { GameLogger.error(LogCategory.ANIMATION, `Failed to load animation ${name}`, e); } catch {}
        this.current = null;
      });
    return true;
  }

  private spawn(Ctor: AnimationCtor, prepare: PrepareFn): void {
    const anim = new Ctor();
    prepare(anim);
    this.current = anim;
  }

  // ---- Coordinación por frame y utilidades (sin cambios) ----

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
}
