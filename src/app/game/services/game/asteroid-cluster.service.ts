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
  // Offsets relativos al centro (posición local fija por miembro)
  memberOffsets: Map<string, Vector3>;
  // Config base para poder regenerar miembros
  config: AsteroidClusterConfig;
  // LOD state
  lodMode: 'full' | 'proxy';
  proxy?: ClusterObject; // representante lejano (modelo de clúster)
  lodTimer: number; // acumulador para dwell
  // Persistencia de selección a través de LOD
  lastSelectedMemberId?: string | null;
  // Anti-popping: cooldown tras cambiar LOD y opción de congelar por selección
  lodCooldown?: number; // segundos restantes de enfriamiento
  freezeBySelection?: boolean; // si true, no cambiar LOD este frame
}

@Injectable({ providedIn: 'root' })
export class AsteroidClusterService {
  private clusters: Map<string, AsteroidClusterInstance> = new Map();

  constructor(private factory: AsteroidFactoryService) {}

  createCluster(cfg: AsteroidClusterConfig): AsteroidClusterInstance {
    // Duplicar la dispersión respecto al valor actual
    const radius = (cfg.radius ?? 10) * 2;
    const centerSpeedFactor = cfg.centerSpeedFactor ?? 0.5; // centro se mueve a mitad de la velocidad

  const objs: (Asteroid | SuperAsteroid)[] = [];
  // Elegir una composición única para todo el cluster
  const compositions = ['iron', 'silicate', 'carbonaceous', 'nickel', 'mixed'] as const;
  const composition = compositions[Math.floor(Math.random() * compositions.length)];
    for (let i = 0; i < cfg.count; i++) {
      const pos = this.randomAround(cfg.center, radius);
      const a = this.factory.createAsteroid(
        `${cfg.id}-a${i}`,
        pos,
        cfg.direction,
        cfg.speed,
        { rotationScale: 0.2, composition }
      );
      objs.push(a);
    }
    if (cfg.includeSuper) {
      const pos = this.randomAround(cfg.center, radius * 0.6);
      const sa = this.factory.createSuperAsteroid(
        `${cfg.id}-super0`,
        pos,
        cfg.direction,
        cfg.speed,
        { sizeMultiplierRange: [4, 6], rotationScale: 0.1, composition }
      );
      objs.push(sa);
    }

    const inst: AsteroidClusterInstance = {
      id: cfg.id,
      center: { ...cfg.center },
      direction: { ...cfg.direction },
      speed: cfg.speed,
      objects: objs,
      memberOffsets: new Map<string, Vector3>(),
      config: { ...cfg },
      lodMode: 'full',
      proxy: undefined,
      lodTimer: 0,
      lastSelectedMemberId: null
    };
    // Calcular offsets relativos al centro inicial
    for (const obj of inst.objects) {
      inst.memberOffsets.set(obj.id, {
        x: obj.position.x - inst.center.x,
        y: obj.position.y - inst.center.y,
        z: obj.position.z - inst.center.z,
      });
    }
    this.clusters.set(cfg.id, inst);
    return inst;
  }

  /** Actualiza todos los clusters: traslada el centro y sincroniza física de miembros */
  updateClusters(deltaTime: number): void {
    for (const cluster of this.clusters.values()) {
      // mover el centro con la mitad de la velocidad configurada
      const centerFactor = cluster.config.centerSpeedFactor ?? 0.5;
      cluster.center.x += cluster.direction.x * cluster.speed * centerFactor * deltaTime;
      cluster.center.y += cluster.direction.y * cluster.speed * centerFactor * deltaTime;
      cluster.center.z += cluster.direction.z * cluster.speed * centerFactor * deltaTime;

      // sincronizar dirección/driftSpeed por miembro; su propio update() moverá posición/velocidad
      for (const obj of cluster.objects) {
        // Coherent drift: miembros se mueven al mismo factor que el centro
        const effSpeed = cluster.speed * centerFactor;
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
  updateLOD(
    playerPos: Vector3,
    deltaTime: number,
    thresholds?: { toProxy?: number; toFull?: number; dwell?: number; cooldown?: number }
  ): boolean {
    const toProxy = thresholds?.toProxy ?? 600;
    const toFull = thresholds?.toFull ?? 550;
    const dwell = thresholds?.dwell ?? 0.4; // segundos mín. en condición antes de conmutar
    const cooldown = thresholds?.cooldown ?? 1.0; // segundos de protección tras cambiar
    let changed = false;
    for (const cluster of this.clusters.values()) {
      // Congelado por selección o cooldown activo → saltar
      cluster.lodCooldown = Math.max(0, (cluster.lodCooldown ?? 0) - deltaTime);
      if (cluster.freezeBySelection || (cluster.lodCooldown ?? 0) > 0) {
        cluster.lodTimer = 0;
        continue;
      }
      const dx = cluster.center.x - playerPos.x;
      const dy = cluster.center.y - playerPos.y;
      const dz = cluster.center.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      // Extensión del clúster (radio aproximado): calcular a partir de offsets persistentes
      // en lugar de posiciones actuales (que en modo proxy quedan "congeladas" y el centro se mueve).
      // Esto evita que el radio aparente crezca artificialmente y genere flips espurios.
      const maxMemberDist = this.getClusterExtentRadius(cluster);
  // Distancia mínima al clúster (borde más cercano)
  const minDistToCluster = Math.max(0, dist - maxMemberDist);
  // Pequeño epsilon para evitar parpadeos por jitter numérico sobre el umbral
  const eps = 1e-3;
      if (cluster.lodMode === 'full') {
        if (minDistToCluster >= (toProxy + eps)) {
          cluster.lodTimer += deltaTime;
          if (cluster.lodTimer >= dwell) {
            this.switchToProxy(cluster);
            cluster.lodTimer = 0;
            cluster.lodCooldown = cooldown;
            changed = true;
          }
        } else {
          cluster.lodTimer = 0;
        }
      } else { // proxy
        if (minDistToCluster <= (toFull - eps)) {
          cluster.lodTimer += deltaTime;
          if (cluster.lodTimer >= dwell) {
            this.switchToFull(cluster);
            cluster.lodTimer = 0;
            cluster.lodCooldown = cooldown;
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
    // Reposicionar miembros a sus offsets persistentes y reactivar (sin re-randomizar)
    for (const obj of cluster.objects) {
      const off = cluster.memberOffsets.get(obj.id);
      if (off) {
        obj.position = {
          x: cluster.center.x + off.x,
          y: cluster.center.y + off.y,
          z: cluster.center.z + off.z,
        };
      } else {
        // Si no hay offset (caso raro), mantener posición actual y registrar offset
        cluster.memberOffsets.set(obj.id, {
          x: obj.position.x - cluster.center.x,
          y: obj.position.y - cluster.center.y,
          z: obj.position.z - cluster.center.z,
        });
      }
      obj.visible = true;
      obj.active = true;
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

  /**
   * Calcula un radio de extensión estable del clúster a partir de los offsets
   * persistentes de sus miembros. Usa el mayor entre config.radius y el máximo
   * módulo de offset registrado. Esto es estable incluso en modo proxy.
   */
  private getClusterExtentRadius(cluster: AsteroidClusterInstance): number {
    let base = cluster.config.radius ?? 10;
    let max = base;
    for (const off of cluster.memberOffsets.values()) {
      const d = Math.hypot(off.x, off.y, off.z);
      if (d > max) max = d;
    }
    return max;
  }

  /**
   * Optimización: cuando el clúster está en modo 'full', actualiza miembros
   * desde el centro evitando integrar velocidades por miembro.
   * - Mueve el centro (ya lo hace updateClusters) y reposiciona miembros: pos=center+offset
   * - Aplica solo rotación individual
   * - Llama update(0) para recalcular matrices y bounding sin integrar posición
   */
  applyCenterDrivenFullUpdate(deltaTime: number): void {
    for (const cluster of this.clusters.values()) {
      if (cluster.lodMode !== 'full') continue;
      for (const obj of cluster.objects) {
        const off = cluster.memberOffsets.get(obj.id);
        if (off) {
          obj.position.x = cluster.center.x + off.x;
          obj.position.y = cluster.center.y + off.y;
          obj.position.z = cluster.center.z + off.z;
        }
        // Rotación individual: usar rotationRate si existe (Asteroid/SuperAsteroid)
        const rr = (obj as any).rotationRate as Vector3 | undefined;
        if (rr) {
          obj.rotation.x += rr.x * deltaTime;
          obj.rotation.y += rr.y * deltaTime;
          obj.rotation.z += rr.z * deltaTime;
        }
        // Recalcular matrices y bounding sin aplicar movimiento adicional
        obj.update(0);
      }
    }
  }
}
