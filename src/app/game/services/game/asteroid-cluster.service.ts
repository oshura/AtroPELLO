import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { Asteroid } from '../../Asteroid';
import { SuperAsteroid } from '../../SuperAsteroid';
import { AsteroidFactoryService } from './asteroid-factory.service';

export interface AsteroidClusterConfig {
  id: string;
  center: Vector3; // centro del cluster
  direction: Vector3; // dirección común normalizada
  speed: number; // velocidad común (magnitud) del cluster
  count: number; // número de asteroides pequeños
  includeSuper?: boolean; // si incluye un superasteroide
  radius?: number; // radio de dispersión alrededor del centro
  centerSpeedFactor?: number; // factor para mover el centro (p.ej. 0.5 del speed)
}

export interface AsteroidClusterInstance {
  id: string;
  center: Vector3;
  direction: Vector3;
  speed: number;
  objects: (Asteroid | SuperAsteroid)[];
}

@Injectable({ providedIn: 'root' })
export class AsteroidClusterService {
  private clusters: Map<string, AsteroidClusterInstance> = new Map();

  constructor(private factory: AsteroidFactoryService) {}

  createCluster(cfg: AsteroidClusterConfig): AsteroidClusterInstance {
    const radius = cfg.radius ?? 10;
    const centerSpeedFactor = cfg.centerSpeedFactor ?? 0.5; // centro se mueve a mitad de la velocidad

    const objs: (Asteroid | SuperAsteroid)[] = [];
    for (let i = 0; i < cfg.count; i++) {
      const pos = this.randomAround(cfg.center, radius);
      const a = this.factory.createAsteroid(
        `${cfg.id}-a${i}`,
        pos,
        cfg.direction,
        cfg.speed,
        { rotationScale: 0.2, massTons: 10 + Math.floor(Math.random() * 21) }
      );
      // Factor de velocidad estable por miembro: ±5%
      (a as any)._clusterSpeedFactor = 1 + ((Math.random() * 0.1) - 0.05);
      objs.push(a);
    }
    if (cfg.includeSuper) {
      const pos = this.randomAround(cfg.center, radius * 0.6);
      const sa = this.factory.createSuperAsteroid(
        `${cfg.id}-super0`,
        pos,
        cfg.direction,
        cfg.speed,
        { sizeMultiplierRange: [3, 5], rotationScale: 0.1 }
      );
      (sa as any)._clusterSpeedFactor = 1 + ((Math.random() * 0.1) - 0.05);
      objs.push(sa);
    }

    const inst: AsteroidClusterInstance = {
      id: cfg.id,
      center: { ...cfg.center },
      direction: { ...cfg.direction },
      speed: cfg.speed,
      objects: objs
    };
    this.clusters.set(cfg.id, inst);
    return inst;
  }

  /** Actualiza todos los clusters: traslada el centro y sincroniza física de miembros */
  updateClusters(deltaTime: number): void {
    for (const cluster of this.clusters.values()) {
      // mover el centro con la mitad de la velocidad configurada
      cluster.center.x += cluster.direction.x * cluster.speed * 0.5 * deltaTime;
      cluster.center.y += cluster.direction.y * cluster.speed * 0.5 * deltaTime;
      cluster.center.z += cluster.direction.z * cluster.speed * 0.5 * deltaTime;

      // sincronizar dirección/driftSpeed por miembro; su propio update() moverá posición/velocidad
      for (const obj of cluster.objects) {
        const factor = (obj as any)._clusterSpeedFactor ?? 1.0;
        const effSpeed = cluster.speed * factor;
        obj.direction = { ...cluster.direction };
        (obj as any).driftSpeed = effSpeed;
        // rotación lenta ya configurada en factory
      }
    }
  }

  /**
   * Persistencia: por defecto no re-centramos (queremos que "vivan" alrededor del centro).
   * Si se quisiera, se puede invocar manualmente con un threshold alto.
   */
  enforceBoundsRelativeToCenter(threshold: number = 1000): void {
    for (const cluster of this.clusters.values()) {
      for (const obj of cluster.objects) {
        const dx = obj.position.x - cluster.center.x;
        const dy = obj.position.y - cluster.center.y;
        const dz = obj.position.z - cluster.center.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > threshold) {
          // Reubicar alrededor del centro manteniendo dispersión
          const dir = this.normalize({ x: -dx, y: -dy, z: -dz });
          obj.position.x = cluster.center.x + dir.x * (threshold * 0.8);
          obj.position.y = cluster.center.y + dir.y * (threshold * 0.8);
          obj.position.z = cluster.center.z + dir.z * (threshold * 0.8);
        }
      }
    }
  }

  getClusters(): AsteroidClusterInstance[] { return Array.from(this.clusters.values()); }

  private randomAround(center: Vector3, radius: number): Vector3 {
    return {
      x: center.x + (Math.random() - 0.5) * 2 * radius,
      y: center.y + (Math.random() - 0.5) * 2 * radius,
      z: center.z + (Math.random() - 0.5) * 2 * radius,
    };
  }

  private normalize(v: Vector3): Vector3 {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}
