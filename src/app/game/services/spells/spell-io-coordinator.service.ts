import { Injectable } from '@angular/core';
import { AnimationManagerService } from '../animations/animation-manager.service';
import { SpellType } from '../../types/spell.types';
import { SpellBehavior, getSpellBehavior } from '../../spells/spell-behavior.config';
import { GameAnimation } from '../animations/types';

interface SpellContextSnapshot {
  blocking: boolean;
  spellType: SpellType | null;
  animation: GameAnimation | null;
  behavior: SpellBehavior | null;
}

@Injectable({ providedIn: 'root' })
export class SpellIOCoordinator {
  private lastBlockingSpell: SpellType | null = null;

  constructor(private animationManager: AnimationManagerService) {}

  /** Returns the spell context derived from the currently running animation (if any). */
  private getContext(): SpellContextSnapshot {
    const blocking = !!this.animationManager?.isBlockingInputs?.();
    const animation = this.animationManager?.getCurrentAnimation?.() ?? null;
    const liveSpell = (animation as GameAnimation | null)?.spellType ?? null;

    let spellType: SpellType | null = liveSpell;
    if (blocking) {
      if (spellType) {
        this.lastBlockingSpell = spellType;
      } else if (this.lastBlockingSpell) {
        spellType = this.lastBlockingSpell;
      }
    } else {
      this.lastBlockingSpell = null;
      spellType = null;
    }

    const behavior = spellType ? getSpellBehavior(spellType) : null;
    return { blocking, spellType, animation, behavior };
  }

  /** Whether most gameplay inputs (ship controls, targeting, etc.) should be locked. */
  public areGameplayInputsLocked(): boolean {
    const ctx = this.getContext();
    if (!ctx.blocking) {
      return false;
    }
    if (!ctx.behavior) {
      return true; // Non-spell animation; stay conservative
    }
    return ctx.behavior.lockShipControls;
  }

  /** Whether UI panels (map/grimoire) should stay locked while the spell flow runs. */
  public arePanelsLocked(): boolean {
    const ctx = this.getContext();
    if (!ctx.blocking) {
      return false;
    }
    if (!ctx.behavior) {
      return true;
    }
    return ctx.behavior.lockPanels;
  }

  /** Whether hover outlines and map hover audio should be suppressed. */
  public shouldHideOutliners(): boolean {
    const ctx = this.getContext();
    if (!ctx.blocking) {
      return false;
    }
    // Animation can opt-in to keep outliners visible regardless of behavior
    if (ctx.animation?.keepOutlinersVisible) {
      return false;
    }
    if (!ctx.behavior) {
      return true;
    }
    return ctx.behavior.hideOutliners;
  }

  /** Whether hover sfx (adaptive targeting + panels) should be muted. */
  public shouldMuteHoverAudio(): boolean {
    const ctx = this.getContext();
    if (!ctx.blocking) {
      return false;
    }
    if (!ctx.behavior) {
      return true;
    }
    return ctx.behavior.muteHoverAudio;
  }

  /** Returns the spell currently driving IO locks, if any. */
  public getActiveSpell(): SpellType | null {
    const ctx = this.getContext();
    return ctx.spellType;
  }
}
