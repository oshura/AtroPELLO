/**
 * Detector de Targets - Sistema de Raycast 3D→2D
 * FASE 1: Core Targeting System
 */

import { Injectable } from '@angular/core';
import { mat4, vec4 } from 'gl-matrix';
import { ITargetable } from '../../types/targeting.types';
import { 
  ITargetDetector, 
  RaycastHit, 
  ScreenPosition,
  TargetingSystemConfig 
} from '../types/reticle.types';
import { Camera } from '../../Camera';
import { WebGLService } from '../../../services/webgl.service';
import { LoggingService, LogCategory } from '../../../services/logging.service';

@Injectable({
  providedIn: 'root'
})
export class TargetDetector implements ITargetDetector {
  private camera: Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private availableTargets: ITargetable[] = [];
  // Optional provider that returns the point to measure distances from (defaults to camera.position)
  private distanceOriginProvider: (() => { x: number; y: number; z: number }) | null = null;
  private config: TargetingSystemConfig['detection'];
  // Debug logging flag (disable in production for performance)
  private debugLogs: boolean = false;
  
  // === Constantes de tolerancia adaptativa (configurables) ===
  private readonly TOL_NEAR_MAX_PX = 45;   // tolerancia máxima cerca (aumentada significativamente)
  private readonly TOL_FAR_MIN_PX = 8;     // tolerancia mínima al alejarse (DUPLICADA del 4 anterior)
  private readonly TOL_FAR_REF_U = 300;    // distancia (u) a la que se alcanza FAR_MIN_PX (DUPLICADA para decay más lento)
  private readonly TOL_NEAR_REF_U = 15;    // distancia (u) a la que se espera NEAR_MAX (DUPLICADA)
  private readonly TOL_MIN_ABS_PX = 6;     // mínimo absoluto (TRIPLICADO de 2 a 6 pixels - CRÍTICO)
  private readonly DEFAULT_TARGET_RADIUS = 10; // radio por defecto si el target no expone radius
  // Ganancia por tamaño unificada para todos los tipos (comportamiento igual entre asteroid y super_asteroid)
  private readonly TOL_SIZE_GAIN_UNIFIED = 1.4; // Aumentada de 1.0 a 1.4 para mayor tolerancia
  
  constructor(private webglService: WebGLService, private logger: LoggingService) {
    this.config = {
      maxDistance: Infinity,
      raycastPrecision: 0.1,
  targetTypes: ['asteroid', 'mega_asteroid', 'super_asteroid', 'cluster', 'spaceship', 'planet', 'portal']
    };
  }

  /**
   * Proyecta una posición mundial a coordenadas de pantalla (CSS px)
   */
  public projectWorldToScreen(worldPos: { x: number; y: number; z: number }): ScreenPosition | null {
    return this.worldToScreen(worldPos);
  }

  /**
   * Distancia en unidades del mundo desde la cámara a una posición
   */
  public getDistanceTo(worldPos: { x: number; y: number; z: number }): number {
    return this.getWorldDistance(worldPos);
  }

  /**
   * Inicializa el detector con cámara y canvas
   */
  public initialize(camera: Camera): void {
    this.camera = camera;
    this.canvas = this.webglService.getCanvas() || null;
    
    this.logger.info(LogCategory.TARGETING, 'TargetDetector inicializado', { camera: !!this.camera, canvas: !!this.canvas });
  }

  /**
   * Set a provider function which returns the world-space origin used to compute distances.
   * If not provided, distances use the camera position (existing behavior).
   */
  public setDistanceOriginProvider(fn: (() => { x: number; y: number; z: number }) | null): void {
    this.distanceOriginProvider = fn;
  }

  /**
   * Actualiza la lista de targets disponibles
   */
  public updateAvailableTargets(targets: ITargetable[]): void {
    const filteredTargets = targets.filter(target => 
      this.config.targetTypes.includes(target.getTargetType())
    );
    
    // Debug FORZADO hasta que funcione
    // Quiet — enable debugLogs to true to see detailed filtering info on demand
    
    this.availableTargets = filteredTargets;
  }

  /** Returns all currently known targets after type filtering (may include off-screen) */
  public getAllTargets(): ITargetable[] {
    return [...this.availableTargets];
  }

  /**
   * Detecta targets en una posición de pantalla usando raycast
   */
  public detectTargetAt(screenPos: ScreenPosition, detectionRadiusPx: number = 50): RaycastHit | null {
    if (!this.camera || !this.canvas) {
      this.logger.warn(LogCategory.TARGETING, 'TargetDetector: Camera o Canvas no inicializados');
      return null;
    }

  // Debug controlado (deshabilitado por defecto por rendimiento)
  const shouldDebug = this.debugLogs;
    
    if (shouldDebug) {
      this.logger.trace(LogCategory.TARGETING, 'detectTargetAt() start', { screenPos, available: this.availableTargets.length });
    }
    
    // extra debug trimmed

    // Convertir coordenadas de pantalla a mundo
    const worldRay = this.screenToWorldRay(screenPos);
    if (!worldRay) {
      if (shouldDebug) this.logger.trace(LogCategory.TARGETING, 'No world ray generated');
      return null;
    }

    let closestHit: RaycastHit | null = null;
    let minDistance = Infinity;

    // RAYCAST SIMPLIFICADO - Proyección 3D→2D directa
    // quiet
    
    for (const target of this.availableTargets) {
      // Convertir posición 3D del target a coordenadas de pantalla
      const targetScreenPos = this.worldToScreen(target.position);
      
      // quiet per-target log
      
      if (targetScreenPos) {
        // Calcular distancia en píxeles entre mouse y target proyectado
        const dx = screenPos.x - targetScreenPos.x;
        const dy = screenPos.y - targetScreenPos.y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);

        // Calcular tolerancia adaptativa base según tamaño y distancia
        const baseTolerance = this.getAdaptiveTolerancePx(target, detectionRadiusPx);
        
        // Compensación por distorsión de proyección (efecto "ojo de pez") - solo para objetos lejanos
        const worldDistance = this.getWorldDistance(target.position);
        let edgeDistortion = 1.0;
        
        // Solo aplicar compensación por distorsión a objetos realmente lejanos (>150u)
        if (worldDistance > 150) {
          const dims = this.getCanvasCssDimensions();
          const centerX = dims.width * 0.5;
          const centerY = dims.height * 0.5;
          const distFromCenter = Math.sqrt((targetScreenPos.x - centerX) ** 2 + (targetScreenPos.y - centerY) ** 2);
          const maxDistFromCenter = Math.sqrt(centerX ** 2 + centerY ** 2);
          
          // Compensación más suave: 1.0x en centro, hasta 1.4x en bordes (reducido de 1.8x)
          const distortionFactor = Math.min(0.4, (distFromCenter / maxDistFromCenter) * 0.4);
          edgeDistortion = 1.0 + distortionFactor;
        }
        
        const adaptiveTol = baseTolerance * edgeDistortion;
        
        // quiet distance/tolerance debug
        
  // Debug crítico para objetos muy lejanos
        if (pixelDistance < 50 && adaptiveTol < 10 && Math.random() < 0.05) {
          this.logger.debug(LogCategory.TARGETING, 'Objeto cercano pero tolerancia baja', {
            type: (target as any).getTargetType?.(),
            distance: Math.round(this.getWorldDistance(target.position)),
            pixelDistance: Math.round(pixelDistance),
            tolerance: Math.round(adaptiveTol)
          });
        }
        
        // Si está dentro de la tolerancia adaptativa, considerar hit
  if (pixelDistance < adaptiveTol) {
          const worldDistance = this.getWorldDistance(target.position);
          
          if (worldDistance < minDistance && worldDistance <= this.config.maxDistance) {
            // Use edge distance (center minus radius), clamped at 0
            let radiusWorld = this.DEFAULT_TARGET_RADIUS;
            const anyT: any = target as any;
            if (anyT.radius && isFinite(anyT.radius)) radiusWorld = Number(anyT.radius);
            else if (anyT.boundingSphere && typeof anyT.boundingSphere.radius === 'number') radiusWorld = Number(anyT.boundingSphere.radius);
            const edgeDistance = Math.max(0, worldDistance - Math.max(0, radiusWorld));
            minDistance = edgeDistance;
            closestHit = {
              target,
              distance: edgeDistance,
              screenPosition: targetScreenPos,
              worldPosition: target.position,
              normal: { x: 0, y: 0, z: 1 }
            };
            
            // quiet hit log
          }
        }
      }
      
      // Debug ocasional para ver proyección
      // quiet occasional projection log
    }

    return closestHit;
  }

  /**
   * Detecta targets entre una lista específica de candidatos (preciso) en una posición de pantalla.
   */
  public detectAmong(screenPos: ScreenPosition, detectionRadiusPx: number, candidates: ITargetable[]): RaycastHit | null {
    if (!this.camera || !this.canvas) return null;

    let closestHit: RaycastHit | null = null;
    let minDistance = Infinity;

    for (const target of candidates) {
      const targetScreenPos = this.worldToScreen(target.position);
      if (!targetScreenPos) continue;
      const dx = screenPos.x - targetScreenPos.x;
      const dy = screenPos.y - targetScreenPos.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const adaptiveTol = this.getAdaptiveTolerancePx(target, detectionRadiusPx);
      if (pixelDistance < adaptiveTol) {
        const worldDistance = this.getWorldDistance(target.position);
        if (worldDistance < minDistance && worldDistance <= this.config.maxDistance) {
          minDistance = worldDistance;
          closestHit = {
            target,
            distance: worldDistance,
            screenPosition: targetScreenPos,
            worldPosition: target.position,
            normal: { x: 0, y: 0, z: 1 }
          };
        }
      }
    }
    return closestHit;
  }

  /**
   * Tolerancia adaptativa por target en píxeles, basada en su radio proyectado y distancia.
   * - Máximo decreciente con distancia: 30px cerca → 3px a 150u
   * - Mínimo absoluto: 1px
   * - Respeta un límite superior opcional vía detectionRadiusPx
   */
  private getAdaptiveTolerancePx(target: ITargetable, maxTolParamPx: number): number {
    const dims = this.getCanvasCssDimensions();
    const anyT: any = target as any;
    // 1) Determinar radio en mundo: preferir boundingSphere si existe, luego propiedad radius, si no default
    let radiusWorld = Number(anyT.radius);
    if (!(isFinite(radiusWorld) && radiusWorld > 0)) {
      if (anyT.boundingSphere && typeof anyT.boundingSphere.radius === 'number') {
        radiusWorld = Number(anyT.boundingSphere.radius);
      } else {
        radiusWorld = this.DEFAULT_TARGET_RADIUS;
      }
    }

    const distance = this.getWorldDistance(target.position);
    let pixelRadius = this.estimateOnScreenPixelRadius(target, radiusWorld, dims);

    // 2) Factores por tamaño relativo
    const sizeRatio = Math.max(0.1, radiusWorld / this.DEFAULT_TARGET_RADIUS);
    const sizeBoost = 1 + this.TOL_SIZE_GAIN_UNIFIED * Math.max(0, sizeRatio - 1);
    pixelRadius *= sizeBoost;

  // 3) Factores específicos por tipo (mega_asteroid, super_asteroid, cluster, planet, giant planet):
    const tType = typeof anyT.getTargetType === 'function' ? String(anyT.getTargetType()) : '';
  const isMega = tType === 'mega_asteroid';
    const isSuper = tType === 'super_asteroid';
    const isCluster = tType === 'cluster';
    const isAsteroid = tType === 'asteroid';
    const isPlanet = tType === 'planet';
    const isGiantPlanet = isPlanet && anyT.planetType === 'Giant';

    // Per-type parameters
    let nearMaxPx = this.TOL_NEAR_MAX_PX; // default 45px
    let farMinPx = this.TOL_FAR_MIN_PX;   // default 8px
    let nearRefU = this.TOL_NEAR_REF_U * sizeRatio; // default scaled by size
    let farRefU = this.TOL_FAR_REF_U;     // default 300u
    let typeTolBoost = 1.0;               // multiplicative boost
    let dynCapBoost = 1.0;                // dynamic cap boost
    let maxParamBoost = 1.0;              // cap relative to caller param
    let additivePxCushion = 0;            // additive pixels

    if (isMega || isSuper) {
      // Mega y super asteroids: MUY generosos para objetos lejanos
      nearMaxPx = 60;       // Aumentado de default
      farMinPx = 15;        // MUCHO más generoso que los 8px default
      typeTolBoost = 3.0;   // Aumentado de 2.0 a 3.0
      dynCapBoost = 2.5;    // Aumentado de 1.8 a 2.5
      maxParamBoost = 3.0;  // Aumentado de 2.0 a 3.0
      additivePxCushion = 20; // Aumentado de 12 a 20
      farRefU = this.TOL_FAR_REF_U * 4.0; // Decay MUY lento (4x en lugar de 2.2x)
    } else if (isCluster) {
      // Clusters: también muy generosos
      nearMaxPx = 55;
      farMinPx = 12;
      typeTolBoost = 2.5;
      dynCapBoost = 2.2;
      maxParamBoost = 2.5;
      additivePxCushion = 15;
      farRefU = this.TOL_FAR_REF_U * 3.0; // Decay lento
    } else if (isAsteroid) {
      // Asteroids normales: ajuste más fino para distancias medias
      // Tolerancia que decae más rápido en distancias medias pero se mantiene en lejanas
      const distanceCategory = distance < 100 ? 'near' : distance < 300 ? 'medium' : 'far';
      
      if (distanceCategory === 'near') {
        nearMaxPx = 40;       // Reducido de 50 para objetos cercanos
        farMinPx = 8;         // Reducido de 10
        typeTolBoost = 1.5;   // Reducido de 2.0
        dynCapBoost = 1.6;    // Reducido de 2.0
        maxParamBoost = 1.8;  // Reducido de 2.0  
        additivePxCushion = 5; // Reducido de 10
        farRefU = this.TOL_FAR_REF_U * 1.8;
      } else if (distanceCategory === 'medium') {
        nearMaxPx = 35;       // Aún más reducido para media distancia
        farMinPx = 6;
        typeTolBoost = 1.3;   // Menos boost
        dynCapBoost = 1.4;
        maxParamBoost = 1.6;
        additivePxCushion = 3; // Muy poco cushion
        farRefU = this.TOL_FAR_REF_U * 2.0;
      } else {
        // Far: mantener generoso para objetos lejanos
        nearMaxPx = 45;
        farMinPx = 10;
        typeTolBoost = 2.0;
        dynCapBoost = 2.0;
        maxParamBoost = 2.0;
        additivePxCushion = 8;
        farRefU = this.TOL_FAR_REF_U * 2.5;
      }
    } else if (isGiantPlanet) {
      // Giant planets: very slow decay. Keep 30px near; at 74.4ku still ~10px.
      nearMaxPx = 30;
      farMinPx = 10;
      nearRefU = 1000;     // start decaying after 1,000u
      farRefU = 74400;     // reach farMin at 74.4ku
      typeTolBoost = 1.2;  // mild boost
      dynCapBoost = 1.6;   // allow a higher dynamic ceiling than default
      maxParamBoost = 2.0; // allow larger than caller-specified radius if needed
      additivePxCushion = 2;
    } else if (isPlanet) {
      // Normal planets: gentle decay. At 70ku still ~4px.
      nearMaxPx = 30;
      farMinPx = 4;
      nearRefU = 800;      // start decaying after ~800u
      farRefU = 70000;     // reach farMin at 70ku
      typeTolBoost = 1.1;  // very small boost
      dynCapBoost = 1.3;
      maxParamBoost = 1.6;
      additivePxCushion = 1;
    }

    // 4) Baseline por distancia con referencias ajustadas por tipo
    const denom = Math.max(1e-3, farRefU - nearRefU);
    const t = Math.max(0, Math.min(1, (distance - nearRefU) / denom));
    const baseline = nearMaxPx - (nearMaxPx - farMinPx) * t;

    // 5) Combinar: usar el más permisivo (radio proyectado vs baseline) y aplicar boosts
    const desired = (Math.max(pixelRadius, baseline) * typeTolBoost) + additivePxCushion;

    // 6) Techo dinámico y cap final
    const baseDynamicMax = nearMaxPx - (nearMaxPx - farMinPx) * t;
    const typeDynamicMax = baseDynamicMax * dynCapBoost;

    // 7) Capear por techo dinámico y por el radio pasado por el caller (aumentado por tipo)
    const capped = Math.min(desired, typeDynamicMax, maxTolParamPx * maxParamBoost);
    const finalTolerance = Math.max(this.TOL_MIN_ABS_PX, capped);
    
    // Debug ocasional para objetos lejanos problemáticos
    if (distance > 100 && (isMega || isSuper || isCluster || isAsteroid) && Math.random() < 0.01) {
      this.logger.trace(LogCategory.TARGETING, 'Tolerancia lejana', {
        type: tType,
        distance: Math.round(distance),
        radiusWorld: Math.round(radiusWorld),
        pixelRadius: Math.round(pixelRadius),
        baseline: Math.round(baseline),
        finalTolerance: Math.round(finalTolerance),
        farMinPx,
        minAbs: this.TOL_MIN_ABS_PX
      });
    }
    
    return finalTolerance;
  }

  /**
   * Estima el radio en píxeles en pantalla de un target con cierto radio en mundo.
   * Intenta proyectar un punto desplazado en la dirección "right" de la cámara.
   * Si falla la proyección, usa una aproximación por FOV vertical.
   */
  private estimateOnScreenPixelRadius(target: ITargetable, radiusWorld: number, dims: { width: number; height: number }): number {
    if (!this.camera) return 1;
    const center2D = this.worldToScreen(target.position);
    if (center2D) {
      // Calcular vector right de la cámara: right = forward × up
      const fwd = this.getCameraForward();
      const up = this.camera.up;
      // cross(fwd, up)
      let rx = fwd.y * up.z - fwd.z * up.y;
      let ry = fwd.z * up.x - fwd.x * up.z;
      let rz = fwd.x * up.y - fwd.y * up.x;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;

      const edgeWorld = {
        x: target.position.x + rx * radiusWorld,
        y: target.position.y + ry * radiusWorld,
        z: target.position.z + rz * radiusWorld
      };
      const edge2D = this.worldToScreen(edgeWorld);
      if (edge2D) {
        const dx = edge2D.x - center2D.x;
        const dy = edge2D.y - center2D.y;
        const pr = Math.sqrt(dx * dx + dy * dy);
        if (isFinite(pr) && pr > 0) return pr;
      }
    }
    // Aproximación por FOV vertical: angular ≈ r / d; píxeles ≈ angular / fov * altura
  // Derivar FOV vertical a partir de la matriz de proyección: m[5] = 1/tan(fov/2)
  const proj = this.camera.projectionMatrix as unknown as Float32Array;
  const f = proj && proj.length >= 6 && proj[5] !== 0 ? proj[5] : 1.0;
  const fovV = 2 * Math.atan(1 / f);
    const distance = this.getWorldDistance(target.position) || 1;
    const angular = radiusWorld / distance;
    const approxPx = (angular / fovV) * dims.height;
    return isFinite(approxPx) && approxPx > 0 ? approxPx : 1;
  }

  /**
   * Obtiene todos los targets visibles en pantalla
   */
  public getVisibleTargets(): ITargetable[] {
    return this.availableTargets.filter(target => this.isInViewFrustum(target));
  }

  /** Returns camera basis vectors for bearing calculations */
  public getCameraBasis(): { position: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number }; right: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } } | null {
    if (!this.camera) return null;
    const position = this.camera.position;
    const forward = this.getCameraForward();
    const up = this.camera.up;
    // right = forward x up
    const right = {
      x: forward.y * up.z - forward.z * up.y,
      y: forward.z * up.x - forward.x * up.z,
      z: forward.x * up.y - forward.y * up.x,
    };
    const rl = Math.hypot(right.x, right.y, right.z) || 1;
    right.x /= rl; right.y /= rl; right.z /= rl;
    return { position, forward, right, up };
  }

  /**
   * Verifica si un target está en el frustum de la cámara
   */
  public isInViewFrustum(target: ITargetable): boolean {
    if (!this.camera || !this.canvas) return false;

    const screenPos = this.worldToScreen(target.position);
    if (!screenPos) return false;

    // Verificar que está dentro de los límites de pantalla
    const dims = this.getCanvasCssDimensions();
    return (
      screenPos.x >= 0 && 
      screenPos.x <= dims.width &&
      screenPos.y >= 0 && 
      screenPos.y <= dims.height
    );
  }

  // Dimensiones CSS del canvas (coinciden con InputHandler)
  private getCanvasCssDimensions(): { width: number; height: number } {
    const state = this.webglService.getState();
    const width = state.width || this.canvas?.clientWidth || this.canvas?.width || 0;
    const height = state.height || this.canvas?.clientHeight || this.canvas?.height || 0;
    return { width: Number(width), height: Number(height) };
  }

  // Vector forward normalizado de la cámara
  private getCameraForward(): { x: number; y: number; z: number } {
    if (!this.camera) return { x: 0, y: 0, z: -1 };
    const pos = this.camera.position;
    const tgt = this.camera.target;
    const fx = tgt.x - pos.x;
    const fy = tgt.y - pos.y;
    const fz = tgt.z - pos.z;
    const l = Math.hypot(fx, fy, fz) || 1;
    return { x: fx / l, y: fy / l, z: fz / l };
  }

  /**
   * Convierte coordenadas de pantalla a rayo en espacio mundial
   */
  private screenToWorldRay(screenPos: ScreenPosition): { origin: any; direction: any } | null {
    if (!this.camera || !this.canvas) return null;
    // Normalizar coordenadas de pantalla a NDC (-1 a 1) usando dimensiones CSS
    const dims = this.getCanvasCssDimensions();
    const x = (2.0 * screenPos.x) / dims.width - 1.0;
    const y = 1.0 - (2.0 * screenPos.y) / dims.height;

    // ViewProjection e inversa con gl-matrix
    const proj = this.camera.projectionMatrix as unknown as mat4;
    const view = this.camera.viewMatrix as unknown as mat4;
    const vp = mat4.create();
    mat4.multiply(vp, proj, view);
    const invVp = mat4.create();
    if (!mat4.invert(invVp, vp)) return null;

    // Puntos en near y far plane en clip -> mundo
    const nearV = vec4.fromValues(x, y, -1.0, 1.0);
    const farV = vec4.fromValues(x, y, 1.0, 1.0);
    vec4.transformMat4(nearV, nearV, invVp);
    vec4.transformMat4(farV, farV, invVp);
    for (const v of [nearV, farV]) { v[0] /= v[3]; v[1] /= v[3]; v[2] /= v[3]; v[3] = 1.0; }

    // Dirección del rayo (cámara → escena)
    const dir = { x: farV[0] - nearV[0], y: farV[1] - nearV[1], z: farV[2] - nearV[2] };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;

    // Alinear sentido con forward de la cámara
    const fwd = this.getCameraForward();
    const dot = dir.x * fwd.x + dir.y * fwd.y + dir.z * fwd.z;
    if (dot < 0) { dir.x = -dir.x; dir.y = -dir.y; dir.z = -dir.z; }

    return {
      origin: { x: nearV[0], y: nearV[1], z: nearV[2] },
      direction: dir
    };
  }

  /**
   * Convierte posición mundial a coordenadas de pantalla
   */
  private worldToScreen(worldPos: { x: number; y: number; z: number }): ScreenPosition | null {
    if (!this.camera || !this.canvas) return null;
    const proj = this.camera.projectionMatrix as unknown as mat4;
    const view = this.camera.viewMatrix as unknown as mat4;
    const vp = mat4.create();
    mat4.multiply(vp, proj, view);

    // Transformar posición mundial a clip space
    const v = vec4.fromValues(worldPos.x, worldPos.y, worldPos.z, 1.0);
    vec4.transformMat4(v, v, vp);
    
    // Verificar que está delante de la cámara con mayor precisión
    if (v[3] <= 1e-6) return null; // Evitar división por números muy pequeños
    
    // Dividir por w para obtener NDC
    const ndcX = v[0] / v[3];
    const ndcY = v[1] / v[3];
    const ndcZ = v[2] / v[3];
    
    // Verificar que está dentro del rango de clip en Z con tolerancia
    if (ndcZ < -1.1 || ndcZ > 1.1) return null; // Tolerancia aumentada para objetos lejanos
    
    // Mapear a coordenadas de pantalla con mayor precisión
    const dims = this.getCanvasCssDimensions();
    const screenX = (ndcX + 1.0) * dims.width * 0.5;
    const screenY = (1.0 - ndcY) * dims.height * 0.5;

    // CRÍTICO: Clampar coordenadas dentro del canvas para evitar desplazamientos
    const clampedX = Math.max(0, Math.min(dims.width, screenX));
    const clampedY = Math.max(0, Math.min(dims.height, screenY));
    
    // Debug para objetos lejanos con proyección problemática
    const distance = this.getWorldDistance(worldPos);
    if (distance > 200 && (Math.abs(screenX - clampedX) > 1 || Math.abs(screenY - clampedY) > 1) && Math.random() < 0.05) {
      this.logger.trace(LogCategory.TARGETING, 'Proyección lejana clampada', {
        distance: Math.round(distance),
        original: { x: Math.round(screenX), y: Math.round(screenY) },
        clamped: { x: Math.round(clampedX), y: Math.round(clampedY) },
        ndc: { x: ndcX.toFixed(3), y: ndcY.toFixed(3), z: ndcZ.toFixed(3) }
      });
    }

    return { x: clampedX, y: clampedY };
  }

  /**
   * Calcula intersección rayo-esfera para un target
   */
  private raycastToTarget(ray: any, target: ITargetable): RaycastHit | null {
    // Asumir que todos los targets son esferas por simplicidad
    const radius = (target as any).radius || 10; // Default radius

    // Vector del origen del rayo al centro de la esfera
    const oc = {
      x: ray.origin.x - target.position.x,
      y: ray.origin.y - target.position.y,
      z: ray.origin.z - target.position.z
    };

    // Coeficientes de la ecuación cuadrática
    const a = ray.direction.x ** 2 + ray.direction.y ** 2 + ray.direction.z ** 2;
    const b = 2.0 * (oc.x * ray.direction.x + oc.y * ray.direction.y + oc.z * ray.direction.z);
    const c = oc.x ** 2 + oc.y ** 2 + oc.z ** 2 - radius ** 2;

    // Discriminante
    const discriminant = b ** 2 - 4 * a * c;
    
    if (discriminant < 0) return null; // No hay intersección

    // Distancia al punto de intersección más cercano
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    
    if (t < 0) return null; // Intersección detrás del origen

    // Punto de intersección
    const hitPoint = {
      x: ray.origin.x + t * ray.direction.x,
      y: ray.origin.y + t * ray.direction.y,
      z: ray.origin.z + t * ray.direction.z
    };

    // Normal en el punto de intersección
    const normal = {
      x: (hitPoint.x - target.position.x) / radius,
      y: (hitPoint.y - target.position.y) / radius,
      z: (hitPoint.z - target.position.z) / radius
    };

    // Convertir punto de hit a coordenadas de pantalla
    const screenPosition = this.worldToScreen(hitPoint);
    if (!screenPosition) return null;

    return {
      target,
      distance: t,
      screenPosition,
      worldPosition: hitPoint,
      normal
    };
  }

  // ===============================
  // UTILIDADES MATEMÁTICAS
  // ===============================

  private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(16);
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    
    return result;
  }

  private invertMatrix(mat: Float32Array): Float32Array | null {
    const inv = new Float32Array(16);
    const m = mat;

    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + 
             m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    
    // ... (implementación completa de inversión de matriz 4x4)
    // Por simplicidad, usar aproximación o biblioteca matemática
    
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    
    if (det === 0) return null;
    
    det = 1.0 / det;
    
    for (let i = 0; i < 16; i++) {
      inv[i] = inv[i] * det;
    }
    
    return inv;
  }

  private transformVector(matrix: Float32Array, vector: number[]): number[] {
    return [
      matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2] + matrix[12] * vector[3],
      matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2] + matrix[13] * vector[3],
      matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2] + matrix[14] * vector[3],
      matrix[3] * vector[0] + matrix[7] * vector[1] + matrix[11] * vector[2] + matrix[15] * vector[3]
    ];
  }

  /**
   * Actualiza configuración del detector
   */
  public updateConfig(newConfig: Partial<TargetingSystemConfig['detection']>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Calcula distancia euclidiana desde la cámara al target
   */
  private getWorldDistance(worldPos: { x: number; y: number; z: number }): number {
    // Prefer explicit distance origin if provided
    const origin = this.distanceOriginProvider ? this.distanceOriginProvider() : (this.camera ? this.camera.position : null);
    if (!origin) return Infinity;

    const dx = worldPos.x - origin.x;
    const dy = worldPos.y - origin.y;
    const dz = worldPos.z - origin.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}