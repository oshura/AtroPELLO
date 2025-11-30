import landingBaseData from '../../assets/narrative/landing/landing_base.json';
import landingExplorationData from '../../assets/narrative/landing/landing_exploration.json';
import landingDiplomacyData from '../../assets/narrative/landing/landing_diplomacy.json';

export type LandingBaseNarrative = typeof landingBaseData;
export type LandingExplorationNarrative = typeof landingExplorationData;
export type LandingDiplomacyNarrative = typeof landingDiplomacyData;

export type LandingRestScript = LandingBaseNarrative['rest'];
export type LandingLogAnomalyScript = LandingBaseNarrative['logAnomaly'];
export type LandingGenericScript = LandingBaseNarrative['generic'];
export type LandingExploreNarrativeEntry<K extends keyof LandingExplorationNarrative = keyof LandingExplorationNarrative> =
  LandingExplorationNarrative[K];
export type LandingDiplomacyTierScript = LandingDiplomacyNarrative[keyof LandingDiplomacyNarrative];
