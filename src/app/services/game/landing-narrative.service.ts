import { Injectable } from '@angular/core';
import landingBaseData from '../../assets/narrative/landing/landing_base.json';
import landingExplorationData from '../../assets/narrative/landing/landing_exploration.json';
import landingDiplomacyData from '../../assets/narrative/landing/landing_diplomacy.json';
import {
  LandingBaseNarrative,
  LandingRestScript,
  LandingLogAnomalyScript,
  LandingGenericScript,
  LandingExplorationNarrative,
  LandingExploreNarrativeEntry,
  LandingDiplomacyNarrative
} from '../../game/types/landing-narrative.types';
import { LandingExploreObjective } from '../../game/types/landing-action.types';

@Injectable({ providedIn: 'root' })
export class LandingNarrativeService {
  private readonly baseScripts: LandingBaseNarrative = landingBaseData;
  private readonly explorationScripts: LandingExplorationNarrative = landingExplorationData;
  private readonly diplomacyScripts: LandingDiplomacyNarrative = landingDiplomacyData;

  private readonly exploreKeyMap: Record<LandingExploreObjective, keyof LandingExplorationNarrative> = {
    [LandingExploreObjective.ARTIFACT]: 'artifact',
    [LandingExploreObjective.VOID_MASS]: 'voidMass',
    [LandingExploreObjective.CIVILIZATION]: 'contactCivilization',
    [LandingExploreObjective.LESSER_BEING]: 'huntLesser'
  } as const;

  getRestScript(): LandingRestScript {
    return this.baseScripts.rest;
  }

  getLogAnomalyScript(): LandingLogAnomalyScript {
    return this.baseScripts.logAnomaly;
  }

  getGenericScript(): LandingGenericScript {
    return this.baseScripts.generic;
  }

  getExplorationScript<T extends LandingExploreObjective>(objective: T): LandingExploreNarrativeEntry | null {
    const key = this.exploreKeyMap[objective];
    return key ? (this.explorationScripts[key] ?? null) : null;
  }

  getDiplomacyScripts(): LandingDiplomacyNarrative {
    return this.diplomacyScripts;
  }

  getDiplomacyTierScript(tier: keyof LandingDiplomacyNarrative) {
    return this.diplomacyScripts[tier];
  }
}
