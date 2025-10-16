import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { Asteroid } from '../../Asteroid';
import { SuperAsteroid } from '../../SuperAsteroid';
import { AsteroidFactoryService } from './asteroid-factory.service';
import { ClusterObject } from '../../Cluster';

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
  // Config base para poder regenerar miembros
  config: AsteroidClusterConfig;
  // LOD state
  lodMode: 'full' | 'proxy';
  proxy?: ClusterObject; // representante lejano (modelo de clúster)
  lodTimer: number; // acumulador para dwell
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
        { sizeMultiplierRange: [4, 6], massMultiplierRange: [4, 6], rotationScale: 0.1 }
      );
      (sa as any)._clusterSpeedFactor = 1 + ((Math.random() * 0.1) - 0.05);
      objs.push(sa);
    }

    const inst: AsteroidClusterInstance = {
      id: cfg.id,
      center: { ...cfg.center },
      direction: { ...cfg.direction },
      speed: cfg.speed,
      objects: objs,
      config: { ...cfg },
      lodMode: 'full',
      proxy: undefined,
      lodTimer: 0
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

  /** Actualiza LOD por distancia con histéresis y dwell; devuelve true si hubo cambios */
  updateLOD(playerPos: Vector3, deltaTime: number, thresholds?: { toProxy?: number; toFull?: number; dwell?: number }): boolean {
    const toProxy = thresholds?.toProxy ?? 600;
    const toFull = thresholds?.toFull ?? 550;
    const dwell = thresholds?.dwell ?? 0.4; // segundos mín. en condición antes de conmutar
    let changed = false;
    for (const cluster of this.clusters.values()) {
      const dx = cluster.center.x - playerPos.x;
      const dy = cluster.center.y - playerPos.y;
      const dz = cluster.center.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (cluster.lodMode === 'full') {
        if (dist >= toProxy) {
          cluster.lodTimer += deltaTime;
          if (cluster.lodTimer >= dwell) {
            this.switchToProxy(cluster);
            cluster.lodTimer = 0;
            changed = true;
          }
        } else {
          cluster.lodTimer = 0;
        }
      } else { // proxy
        if (dist <= toFull) {
          cluster.lodTimer += deltaTime;
          if (cluster.lodTimer >= dwell) {
            this.switchToFull(cluster);
            cluster.lodTimer = 0;
            changed = true;
          }
        } else {
          cluster.lodTimer = 0;
        }
      }
    }
    return changed;
  }

  private switchToProxy(cluster: AsteroidClusterInstance): void {
    // Deshabilitar miembros (persisten, pero no se renderizan ni cuentan como targets)
    for (const obj of cluster.objects) {
      obj.visible = false;
      obj.active = false;
    }
    // Crear representación del clúster en el centro
    const proxy = new ClusterObject(
      `${cluster.id}-cluster`,
      { ...cluster.center },
      4.0,
      { ...cluster.direction },
      cluster.speed * 0.5 // que avance como el centro
    );
    // Guardar referencia a miembros para agregados de detalles
    (proxy as any)._clusterMembers = cluster.objects.slice();
    // Agregar void mass: suma de hijos
    let voidSum = 0;
    for (const obj of cluster.objects) {
      voidSum += (obj as any).voidMassUnits ?? 0;
    }
    proxy.voidMassUnits = voidSum;
    cluster.proxy = proxy;
    cluster.lodMode = 'proxy';
  }

  private switchToFull(cluster: AsteroidClusterInstance): void {
    // Borrar proxy (modelo de clúster)
  cluster.proxy = undefined;
    // Reposicionar miembros alrededor del centro y reactivar
    const radius = cluster.config.radius ?? 10;
    for (const obj of cluster.objects) {
      const pos = this.randomAround(cluster.center, radius);
      obj.position = pos;
      obj.visible = true;
      obj.active = true;
      // La sincronización de dirección/velocidad se hace en updateClusters
    }
    cluster.lodMode = 'full';
  }

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
