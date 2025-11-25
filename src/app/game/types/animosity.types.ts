export enum GameObjectAnimosity {
  FRIENDLY = 'friendly',
  NEUTRAL = 'neutral',
  ENEMY = 'enemy'
}

export const GAME_OBJECT_ANIMOSITY_LABELS: Record<GameObjectAnimosity, string> = {
  [GameObjectAnimosity.FRIENDLY]: 'Aliada',
  [GameObjectAnimosity.NEUTRAL]: 'Neutral',
  [GameObjectAnimosity.ENEMY]: 'Hostil'
};

export type RelationAffinity = 'ally' | 'neutral' | 'enemy';

export const GAME_OBJECT_ANIMOSITY_RELATION: Record<GameObjectAnimosity, RelationAffinity> = {
  [GameObjectAnimosity.FRIENDLY]: 'ally',
  [GameObjectAnimosity.NEUTRAL]: 'neutral',
  [GameObjectAnimosity.ENEMY]: 'enemy'
};
