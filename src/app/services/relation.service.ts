import { Injectable } from '@angular/core';
import { ITargetable, TargetType } from '../game/types/targeting.types';
import { GAME_OBJECT_ANIMOSITY_RELATION, GameObjectAnimosity } from '../game/types/animosity.types';

export type Relation = 'ally' | 'neutral' | 'enemy';

@Injectable({ providedIn: 'root' })
export class RelationService {
  /** Derive relation from target type (future: factions or reputation) */
  public getRelation(target: ITargetable | null | undefined): Relation {
    if (!target || !target.getTargetType) return 'enemy';
    const animosity = (target as any)?.animosity as GameObjectAnimosity | undefined;
    if (animosity && GAME_OBJECT_ANIMOSITY_RELATION[animosity]) {
      return GAME_OBJECT_ANIMOSITY_RELATION[animosity];
    }
    const t = target.getTargetType();
    switch (t) {
      case TargetType.ASTEROID:
      case TargetType.MEGA_ASTEROID:
      case TargetType.SUPER_ASTEROID:
      case TargetType.CLUSTER:
      case TargetType.SUN:
      case TargetType.PLANET:
        return 'neutral';
      // TODO: extend with PORTAL, WAYPOINT, NPC factions, etc.
      default:
        return 'enemy';
    }
  }
}
