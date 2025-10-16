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

@Injectable({
  providedIn: 'root'
})
export class TargetDetector implements ITargetDetector {
  private camera: Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private availableTargets: ITargetable[] = [];
  private config: TargetingSystemConfig['detection'];
  
  constructor(private webglService: WebGLService) {
    this.config = {
      maxDistance: Infinity,
      raycastPrecision: 0.1,
  targetTypes: ['asteroid', 'super_asteroid', 'cluster', 'spaceship', 'planet', 'portal']
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
    
    console.log('🎯 TargetDetector inicializado', {
      camera: !!this.camera,
      canvas: !!this.canvas
    });
  }

  /**
   * Actualiza la lista de targets disponibles
   */
  public updateAvailableTargets(targets: ITargetable[]): void {
    const filteredTargets = targets.filter(target => 
      this.config.targetTypes.includes(target.getTargetType())
    );
    
    // Debug FORZADO hasta que funcione
    console.log('🎯 TargetDetector.updateAvailableTargets():', {
      received: targets.length,
      filtered: filteredTargets.length,
      types: targets.map(t => t.getTargetType()),
      acceptedTypes: this.config.targetTypes
    });
    
    this.availableTargets = filteredTargets;
  }

  /**
   * Detecta targets en una posición de pantalla usando raycast
   */
  public detectTargetAt(screenPos: ScreenPosition, detectionRadiusPx: number = 50): RaycastHit | null {
    if (!this.camera || !this.canvas) {
      console.warn('❌ TargetDetector: Camera o Canvas no inicializados');
      return null;
    }

    // Debug FORZADO para verificar funcionamiento  
    const shouldDebug = true; // SIEMPRE debug hasta que funcione
    
    if (shouldDebug) {
      console.log('🔍 TargetDetector.detectTargetAt() INICIO:', {
        screenPos,
        availableTargets: this.availableTargets.length,
        camera: !!this.camera,
        canvas: !!this.canvas,
        canvasSize: { w: this.canvas.width, h: this.canvas.height }
      });
    }
    
    if (shouldDebug) {
      console.log('🔍 TargetDetector debug:', {
        screenPos,
        availableTargets: this.availableTargets.length,
        camera: !!this.camera,
        canvas: !!this.canvas
      });
    }

    // Convertir coordenadas de pantalla a mundo
    const worldRay = this.screenToWorldRay(screenPos);
    if (!worldRay) {
      if (shouldDebug) console.log('❌ No world ray generated');
      return null;
    }

    let closestHit: RaycastHit | null = null;
    let minDistance = Infinity;

    // RAYCAST SIMPLIFICADO - Proyección 3D→2D directa
    if (shouldDebug) {
      console.log(`🔍 Iterando ${this.availableTargets.length} targets disponibles`);
    }
    
    for (const target of this.availableTargets) {
      // Convertir posición 3D del target a coordenadas de pantalla
      const targetScreenPos = this.worldToScreen(target.position);
      
      if (shouldDebug) {
        console.log(`🔍 Target ${target.getTargetType()}-${target.id}:`, {
          position3D: target.position,
          screenPos2D: targetScreenPos,
          mousePos: screenPos
        });
      }
      
      if (targetScreenPos) {
        // Calcular distancia en píxeles entre mouse y target proyectado
        const dx = screenPos.x - targetScreenPos.x;
        const dy = screenPos.y - targetScreenPos.y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);
        
        if (shouldDebug) {
          console.log(`🔍 Target ${target.getTargetType()}-${target.id} DISTANCE:`, {
            mouse: screenPos,
            target2D: targetScreenPos,
            pixelDistance: Math.round(pixelDistance),
            withinRadius: pixelDistance < 50
          });
        }
        
  // Si está cerca del mouse (radio configurable en píxeles), considerar hit
  if (pixelDistance < detectionRadiusPx) {
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
            
            if (shouldDebug) {
              console.log('🎯 TARGET HIT FOUND:', target.getDisplayName(), 
                         'pixelDist:', Math.round(pixelDistance), 'worldDist:', Math.round(worldDistance));
            }
          }
        }
      }
      
      // Debug ocasional para ver proyección
      if (shouldDebug && this.availableTargets.indexOf(target) === 0) {
        console.log('🔍 Target projection:', target.getDisplayName(), 
                   '3D:', target.position, '2D:', targetScreenPos);
      }
    }

    return closestHit;
  }

  /**
   * Obtiene todos los targets visibles en pantalla
   */
  public getVisibleTargets(): ITargetable[] {
    return this.availableTargets.filter(target => this.isInViewFrustum(target));
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
    
    // Verificar que está delante de la cámara
    if (v[3] <= 0) return null;

    // Dividir por w y mapear a coordenadas de pantalla (CSS px)
    const ndcX = v[0] / v[3];
    const ndcY = v[1] / v[3];
    const dims = this.getCanvasCssDimensions();
    const screenX = (ndcX + 1.0) * dims.width * 0.5;
    const screenY = (1.0 - ndcY) * dims.height * 0.5;

    return { x: screenX, y: screenY };
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
    if (!this.camera) return Infinity;
    
    const camPos = this.camera.position;
    const dx = worldPos.x - camPos.x;
    const dy = worldPos.y - camPos.y; 
    const dz = worldPos.z - camPos.z;
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}