import { Injectable } from '@angular/core';
import { ITargetable } from '../game/types/targeting.types';
import { TargetType } from '../game/types/targeting.types';

export type Relation = 'ally' | 'neutral' | 'enemy';

@Injectable({ providedIn: 'root' })
export class RelationService {
  /** Derive relation from target type (future: factions or reputation) */
  public getRelation(target: ITargetable | null | undefined): Relation {
    if (!target || !target.getTargetType) return 'enemy';
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
