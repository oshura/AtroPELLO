import { Injectable } from '@angular/core';
import { ITargetable, TargetType } from '../types/targeting.types';

export interface AsteroidInfo {
  composition: 'iron' | 'silicate' | 'carbonaceous' | 'nickel' | 'mixed';
  massTons?: number;
  // albedo eliminado
}

export interface ShipInfo {
  faction?: string;
  className?: string;
  hullIntegrity?: number;
}

export interface PlanetInfo {
  biome?: string;
  atmosphere?: 'none' | 'thin' | 'standard' | 'dense';
  populationMillions?: number;
}

export type TargetDetails =
  | { type: TargetType.ASTEROID; data: AsteroidInfo }
  | { type: TargetType.CLUSTER; data: Record<string, unknown> }
  | { type: TargetType.SPACESHIP; data: ShipInfo }
  | { type: TargetType.PLANET; data: PlanetInfo }
  | { type: TargetType.UNKNOWN; data: Record<string, unknown> };

@Injectable({ providedIn: 'root' })
export class TargetDetailService {
  async getDetails(target: ITargetable): Promise<TargetDetails> {
    switch (target.getTargetType()) {
      case TargetType.ASTEROID:
        return {
          type: TargetType.ASTEROID,
          data: {
            composition: (target as any).composition ?? 'mixed',
            massTons: (target as any).massTons ?? (50 + Math.floor(Math.random() * 101)),
          }
        };
      case TargetType.MEGA_ASTEROID: {
        return {
          type: TargetType.ASTEROID,
          data: {
            composition: (target as any).composition ?? 'mixed',
            massTons: (target as any).massTons ?? (1500 + Math.floor(Math.random() * 2501)),
          }
        } as any;
      }
      case TargetType.SUPER_ASTEROID: {
        return {
          type: TargetType.ASTEROID,
          data: {
            composition: (target as any).composition ?? 'mixed',
            massTons: (target as any).massTons ?? (500 + Math.floor(Math.random() * 501)),
          }
        };
      }
      case TargetType.CLUSTER: {
        // Agregar valores de miembros: masa y voidMassUnits
        // Nota: no tenemos servicio aquí, así que intentamos usar referencias guardadas opcionalmente
        const anyT = target as any;
        const composed = anyT._clusterMembers as ITargetable[] | undefined;
        let massSum = 0;
        let voidMassSum = 0;
        if (Array.isArray(composed)) {
          for (const m of composed) {
            const details = await this.getDetails(m);
            const md = (details as any).data;
            if (md?.massTons) massSum += Number(md.massTons) || 0;
            const vm = (m as any).voidMassUnits ?? 0;
            voidMassSum += vm;
          }
        }
        return {
          type: TargetType.CLUSTER,
          data: {
            massTons: massSum,
            voidMassUnits: voidMassSum
          }
        } as any;
      }
      case TargetType.SPACESHIP:
        return {
          type: TargetType.SPACESHIP,
          data: {}
        };
      case TargetType.PLANET:
        return {
          type: TargetType.PLANET,
          data: {}
        };
      default:
        return { type: TargetType.UNKNOWN, data: {} };
    }
  }
}
