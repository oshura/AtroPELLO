import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { Asteroid } from '../../game-objects/Asteroid';
import { SuperAsteroid } from '../../game-objects/SuperAsteroid';
import { AsteroidFactoryService } from './asteroid-factory.service';
import { ClusterObject } from '../../game-objects/Cluster';

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
  // Estado de fade para transiciones suaves entre proxy/full
  fade?: {
    mode: 'in' | 'out'; // in => aumentando opacidad, out => disminuyendo
    target: 'proxy' | 'members'; // qué conjunto está siendo fadeado
    duration: number; // segundos totales de fade
    elapsed: number; // acumulado
  };
  // ID del miembro que se usará como representante visual en modo proxy
  representativeId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AsteroidClusterService {
  private clusters: Map<string, AsteroidClusterInstance> = new Map();

  constructor(private factory: AsteroidFactoryService) {}

  createCluster(cfg: AsteroidClusterConfig): AsteroidClusterInstance {
    // Duplicar la dispersión respecto al valor actual
    // Aumentar la dispersión en +50% adicional (de 2x a 3x)
    const radius = (cfg.radius ?? 10) * 3;
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
      // Usar la MISMA dispersión que los asteroides
      const pos = this.randomAround(cfg.center, radius);
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

  /** Remove all clusters from the service (used during system swaps). */
  clearAll(): void {
    this.clusters.clear();
  }

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
    // Preparar fade-out de miembros si estaban visibles
    for (const obj of cluster.objects) {
      obj.active = true; // mantener activo para poder actualizar matrices si hace falta
      obj.visible = true; // visibles mientras fadean
      obj.renderOpacity = 1.0; // comenzamos desde 1
    }
    // Elegir posición y tamaño del proxy segun contenido del clúster:
    // 1) Si hay super-asteroide: posición del super; tamaño duplicado (8.0)
    // 2) Si no hay super, pero hay asteroides: posición del primer asteroide; tamaño mitad (4.0)
    // 3) Si no hay miembros: posición aleatoria en radio base; tamaño duplicado por defecto
    let proxyPos = { ...cluster.center };
    let proxySize = 8.0;
    const superObj = cluster.objects.find(o => (o as any) instanceof SuperAsteroid) as SuperAsteroid | undefined;
    if (superObj) {
      proxyPos = { ...superObj.position };
      proxySize = 8.0; // duplicado
      cluster.representativeId = superObj.id;
    } else {
      const firstAst = cluster.objects.find(o => (o as any) instanceof Asteroid) as Asteroid | undefined;
      if (firstAst) {
        proxyPos = { ...firstAst.position };
        proxySize = 4.0; // mitad
        cluster.representativeId = firstAst.id;
      } else {
        // Fallback aleatorio como antes
        const baseR = (cluster.config.radius ?? 10) * 1.0;
        const dir = this.normalize({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
        proxyPos = { x: cluster.center.x + dir.x * baseR, y: cluster.center.y + dir.y * baseR, z: cluster.center.z + dir.z * baseR };
        proxySize = 8.0;
        cluster.representativeId = null;
      }
    }
    // Crear representación del clúster con tamaño según criterio
    const proxy = new ClusterObject(
      `${cluster.id}-cluster`,
      proxyPos,
      proxySize,
      { ...cluster.direction },
      cluster.speed * 0.5 // que avance como el centro
    );
    proxy.renderOpacity = 0.0; // aparecerá con fade-in
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
    // Programar fade: miembros out (2s) y proxy in (2s)
    cluster.fade = { mode: 'in', target: 'proxy', duration: 2.5, elapsed: 0 };
  }

  private switchToFull(cluster: AsteroidClusterInstance): void {
    // Preparar fade: proxy out (2s) y miembros in (2s)
    if (cluster.proxy) {
      cluster.proxy.renderOpacity = 1.0;
    }
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
      // IMPORTANTE: mantener al representante sin fade (opacidad completa)
      if (cluster.representativeId && obj.id === cluster.representativeId) {
        obj.renderOpacity = 1.0;
      } else {
        obj.renderOpacity = 0.0; // aparecerán con fade-in
      }
    }
    cluster.lodMode = 'full';
  cluster.fade = { mode: 'in', target: 'members', duration: 2.5, elapsed: 0 };
    // NO limpiar representativeId aún: lo usamos para evitar fade en la transición.
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
      // Gestionar fades si están activos
      if (cluster.fade) {
        cluster.fade.elapsed += deltaTime;
        const t = Math.min(1, cluster.fade.elapsed / Math.max(0.001, cluster.fade.duration));
        if (cluster.fade.target === 'proxy' && cluster.proxy) {
          // Proxy está fade-in mientras miembros fade-out
          const alphaIn = t; // 0->1
          cluster.proxy.renderOpacity = alphaIn;
          // Fade-out de miembros en paralelo
          const alphaOut = 1 - t;
          for (const obj of cluster.objects) {
            // Mantener el representante sin fade
            if (cluster.representativeId && obj.id === cluster.representativeId) {
              obj.renderOpacity = 1.0;
              obj.visible = true;
              obj.active = true;
            } else {
              obj.renderOpacity = alphaOut;
              // Al terminar el fade-out, ocultarlos
              if (t >= 1) {
                obj.visible = false;
                obj.active = false;
              }
            }
          }
          if (t >= 1) {
            cluster.fade = undefined;
          }
        } else if (cluster.fade.target === 'members') {
          // Miembros fade-in; proxy fade-out si existe
          const alphaIn = t;
          for (const obj of cluster.objects) {
            // Mantener el representante sin fade (si existía)
            if (cluster.representativeId && obj.id === cluster.representativeId) {
              obj.renderOpacity = 1.0;
            } else {
              obj.renderOpacity = alphaIn;
            }
            obj.visible = true;
            obj.active = true;
          }
          if (cluster.proxy) {
            const alphaOut = 1 - t;
            cluster.proxy.renderOpacity = alphaOut;
            if (t >= 1) {
              // Al finalizar, eliminar el proxy completamente
              cluster.proxy = undefined;
            }
          }
          if (t >= 1) {
            cluster.fade = undefined;
            // Ahora sí, ya no necesitamos representante especial en modo full
            cluster.representativeId = null;
          }
        }
      }
      // Actualizar transformaciones según modo LOD
      if (cluster.lodMode === 'full') {
        // En modo 'full' todos los miembros siguen al centro + offset y rotan individualmente
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
      } else if (cluster.lodMode === 'proxy') {
        // En modo 'proxy', actualizar al menos el REPRESENTANTE para que siga al centro + su offset y mantenga su rotación
        if (cluster.representativeId) {
          const rep = cluster.objects.find(o => o.id === cluster.representativeId);
          if (rep) {
            const off = cluster.memberOffsets.get(rep.id);
            if (off) {
              rep.position.x = cluster.center.x + off.x;
              rep.position.y = cluster.center.y + off.y;
              rep.position.z = cluster.center.z + off.z;
            }
            // Rotación individual del representante
            const rr = (rep as any).rotationRate as Vector3 | undefined;
            if (rr) {
              rep.rotation.x += rr.x * deltaTime;
              rep.rotation.y += rr.y * deltaTime;
              rep.rotation.z += rr.z * deltaTime;
            }
            // Asegurar visibilidad/actividad y opacidad total del representante
            rep.visible = true;
            rep.active = true;
            (rep as any).renderOpacity = 1.0;
            // Recalcular matrices sin integrar movimiento adicional
            rep.update(0);
          }
        }
      }
    }
  }
}
