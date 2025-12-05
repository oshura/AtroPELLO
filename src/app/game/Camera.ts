import { Vector3 } from '../types/game.types';
import { Spaceship } from './game-objects/Spaceship';
import { GameLogger } from './utils/GameLogger';
import { LogCategory } from '../services/logging.service';

export enum CameraMode {
  INMOVILE_EXTERNAL = 0, // Cámara externa inmóvil que rota con la nave (modo por defecto)
  MANUAL = 1,            // Cámara controlada manualmente por animaciones/cinemáticas
  REAR_VIEW = 7,         // Cámara delante de la nave mirando hacia atrás
  COCKPIT = 8,           // Cámara interna en la cabina del piloto
  REAR_TRACKING = 9      // Cámara trasera que sigue a la nave
}

/**
 * Clase base abstracta para todos los modos de cámara
 * Contiene funcionalidades comunes como matrices, proyección y zoom
 */
export abstract class BaseCamera {
  // Matrices de la cámara
  public viewMatrix: Float32Array = new Float32Array(16);
  public projectionMatrix: Float32Array = new Float32Array(16);
  
  // Configuración de proyección - FOV vertical
  // Reducido a 45° para minimizar deformación en bordes (edge stretch) manteniendo buena percepción de velocidad
  public fov: number = 45 * (Math.PI / 180); // 45° vertical → ~73° horizontal en 16:9
  public aspect: number = 1.0;
  public near: number = 1.0;
  public far: number = 500000.0; // Ampliado para soportar >100ku sin recorte y reducir clipping lejano
  
  // Configuración de zoom dinámico - ajustado para FOV 55°
  protected zoomDistance: number = 4.5; // Aumentado para compensar FOV más estrecho
  protected minZoom: number = 1.5; // Zoom mínimo también aumentado
  protected maxZoom: number = 12.0; // Zoom máximo también aumentado
  protected zoomSensitivity: number = 0.2;
  
  // Posición y orientación actuales
  public position: Vector3 = { x: 0, y: 0, z: 0 };
  public target: Vector3 = { x: 0, y: 0, z: 0 };
  public up: Vector3 = { x: 0, y: 1, z: 0 };
  
  constructor(aspect: number = 1.0) {
    this.aspect = aspect;
    this.updateProjectionMatrix();
    this.initializeViewMatrix();
  }

  /**
   * Método abstracto que cada modo de cámara debe implementar
   */
  protected abstract updateCameraMode(spaceship: Spaceship): void;

  /**
   * Actualiza la cámara
   */
  public update(spaceship: Spaceship, deltaTime: number): void {
    this.updateCameraMode(spaceship);
    this.updateViewMatrix();
  }

  /**
   * Maneja el zoom con la rueda del mouse
   */
  public handleZoom(delta: number): void {
    this.zoomDistance -= delta * this.zoomSensitivity;
    this.zoomDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomDistance));
  }

  /**
   * Obtiene la distancia de zoom actual
   */
  public getZoomDistance(): number {
    return this.zoomDistance;
  }

  /**
   * Actualiza la matriz de proyección
   */
  public updateProjectionMatrix(): void {
    this.perspective(this.projectionMatrix, this.fov, this.aspect, this.near, this.far);
  }

  /** Ajusta el FOV en grados y actualiza proyección */
  public setFovDegrees(deg: number): void {
    const clamped = Math.max(30, Math.min(90, deg)); // límites razonables
    this.fov = clamped * (Math.PI / 180);
    this.updateProjectionMatrix();
  }

  /** Ajusta el FOV en radianes y actualiza proyección */
  public setFovRadians(rad: number): void {
    const min = 30 * (Math.PI / 180);
    const max = 90 * (Math.PI / 180);
    this.fov = Math.max(min, Math.min(max, rad));
    this.updateProjectionMatrix();
  }

  /**
   * Actualiza el aspect ratio
   */
  public setAspectRatio(aspect: number): void {
    this.aspect = aspect;
    this.updateProjectionMatrix();
  }

  // ===== FUNCIONES AUXILIARES PARA MATRICES =====
  
  protected initializeViewMatrix(): void {
    this.identityMatrix(this.viewMatrix);
  }

  protected updateViewMatrix(): void {
    this.lookAt(this.viewMatrix, this.position, this.target, this.up);
  }

  protected identityMatrix(matrix: Float32Array): void {
    matrix.fill(0);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  }

  protected perspective(matrix: Float32Array, fov: number, aspect: number, near: number, far: number): void {
    const f = 1.0 / Math.tan(fov * 0.5);
    const nf = 1.0 / (near - far);

    matrix.fill(0);
    matrix[0] = f / aspect;
    matrix[5] = f;
    matrix[10] = (far + near) * nf;
    matrix[11] = -1;
    matrix[14] = 2 * far * near * nf;
  }

  protected lookAt(matrix: Float32Array, eye: Vector3, target: Vector3, up: Vector3): void {
    let forward = {
      x: target.x - eye.x,
      y: target.y - eye.y,
      z: target.z - eye.z
    };

    // Normalizar forward
    let length = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
    if (length > 0) {
      forward.x /= length;
      forward.y /= length;
      forward.z /= length;
    }

    // Asegurar que forward y up no sean casi colineales para evitar singularidades
    // Si |dot(forward, up)| ~ 1, escoger un up alternativo seguro
    const dotFU = forward.x * up.x + forward.y * up.y + forward.z * up.z;
    let safeUp = { x: up.x, y: up.y, z: up.z };
    if (Math.abs(dotFU) > 0.999) {
      // Elegir un up aproximado perpendicular a forward
      // Tomar un vector auxiliar y hacer cross(forward, aux)
      const aux = Math.abs(forward.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      // safeUp = normalize(cross(aux, forward))
      const cx = aux.y * forward.z - aux.z * forward.y;
      const cy = aux.z * forward.x - aux.x * forward.z;
      const cz = aux.x * forward.y - aux.y * forward.x;
      const clen = Math.hypot(cx, cy, cz) || 1;
      safeUp = { x: cx / clen, y: cy / clen, z: cz / clen };
    }

    // Right = forward × safeUp
    const right = {
      x: forward.y * safeUp.z - forward.z * safeUp.y,
      y: forward.z * safeUp.x - forward.x * safeUp.z,
      z: forward.x * safeUp.y - forward.y * safeUp.x
    };

    // Normalizar right
    length = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.y /= length;
      right.z /= length;
    }

    // Up = right × forward (re-orthonormalizado)
    const newUp = {
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x
    };

    // Construir matriz
    matrix[0] = right.x;
    matrix[1] = newUp.x;
    matrix[2] = -forward.x;
    matrix[3] = 0;

    matrix[4] = right.y;
    matrix[5] = newUp.y;
    matrix[6] = -forward.y;
    matrix[7] = 0;

    matrix[8] = right.z;
    matrix[9] = newUp.z;
    matrix[10] = -forward.z;
    matrix[11] = 0;

    matrix[12] = -(right.x * eye.x + right.y * eye.y + right.z * eye.z);
    matrix[13] = -(newUp.x * eye.x + newUp.y * eye.y + newUp.z * eye.z);
    matrix[14] = (forward.x * eye.x + forward.y * eye.y + forward.z * eye.z);
    matrix[15] = 1;
  }
}

/**
 * Cámara trasera que sigue a la nave (modo 9)
 */
export class RearExternalCamera extends BaseCamera {
  protected updateCameraMode(spaceship: Spaceship): void {
    // Compensar FOV 55° - alejar cámara trasera para mantener perspectiva original
    const REAR_EXTERNAL_OFFSET = { x: 0, y: 2.5, z: -this.zoomDistance * 2.2 };
    
    this.position = {
      x: spaceship.position.x + REAR_EXTERNAL_OFFSET.x,
      y: spaceship.position.y + REAR_EXTERNAL_OFFSET.y,
      z: spaceship.position.z + REAR_EXTERNAL_OFFSET.z
    };
    
    this.target = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z + 3.0
    };
    
    this.up = { x: 0, y: 1, z: 0 };
  }

  public getDebugInfo() {
    return {
      mode: 'REAR_TRACKING (9)',
      position: { ...this.position },
      target: { ...this.target },
      zoomDistance: this.zoomDistance,
      fov: this.fov * (180 / Math.PI)
    };
  }
}

/**
 * Cámara externa inmóvil que rota con la nave (modo 0)
 */
export class CockpitCamera extends BaseCamera {
  protected updateCameraMode(spaceship: Spaceship): void {
    // Compensar FOV 55° - alejar cámara externa para mantener perspectiva original
    const COCKPIT_OFFSET = { x: 0, y: 2.0, z: -this.zoomDistance * 2.0 };
    
    // Obtener el cuaternión de orientación de la nave
    const spaceshipQuaternion = spaceship.getOrientationQuaternion();
    
    // Rotar el offset usando el cuaternión de la nave
    const rotatedOffset = this.rotateVectorByQuaternion(COCKPIT_OFFSET, spaceshipQuaternion);
    const rotatedForward = this.rotateVectorByQuaternion({ x: 0, y: 0, z: 3.0 }, spaceshipQuaternion);
    const rotatedUp = this.rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, spaceshipQuaternion);
    
    // Posición de la cámara rotada con la nave
    this.position = {
      x: spaceship.position.x + rotatedOffset.x,
      y: spaceship.position.y + rotatedOffset.y,
      z: spaceship.position.z + rotatedOffset.z
    };
    
    // Target rotado con la nave (mira en la misma dirección)
    this.target = {
      x: this.position.x + rotatedForward.x,
      y: this.position.y + rotatedForward.y,
      z: this.position.z + rotatedForward.z
    };
    
    // Vector up rotado con la nave
    this.up = {
      x: rotatedUp.x,
      y: rotatedUp.y,
      z: rotatedUp.z
    };
  }

  /**
   * Rota un vector usando un cuaternión (usando gl-matrix)
   */
  private rotateVectorByQuaternion(vector: Vector3, quaternion: any): Vector3 {
    const { x, y, z } = vector;
    const [qx, qy, qz, qw] = quaternion;
    
    // Aplicar rotación de cuaternión
    const qx2 = qx * qx;
    const qy2 = qy * qy;
    const qz2 = qz * qz;
    const qw2 = qw * qw;
    
    return {
      x: x * (qx2 - qy2 - qz2 + qw2) + y * (2 * qx * qy - 2 * qz * qw) + z * (2 * qx * qz + 2 * qy * qw),
      y: x * (2 * qx * qy + 2 * qz * qw) + y * (-qx2 + qy2 - qz2 + qw2) + z * (2 * qy * qz - 2 * qx * qw),
      z: x * (2 * qx * qz - 2 * qy * qw) + y * (2 * qy * qz + 2 * qx * qw) + z * (-qx2 - qy2 + qz2 + qw2)
    };
  }

  public getDebugInfo() {
    return {
      mode: 'INMOVILE_EXTERNAL (0)',
      position: { ...this.position },
      target: { ...this.target },
      up: { ...this.up },
      zoomDistance: this.zoomDistance,
      fov: this.fov * (180 / Math.PI)
    };
  }
}

/**
 * Cámara delantera mirando hacia atrás (modo 7)
 * Igual que INMOVILE_EXTERNAL pero colocada delante de la nave y mirando hacia atrás
 */
export class RearViewCamera extends BaseCamera {
  protected updateCameraMode(spaceship: Spaceship): void {
    // Usar distancia equivalente a la cámara externa pero delante de la nave
    const FRONT_OFFSET = { x: 0, y: 2.0, z: this.zoomDistance * 2.0 };

    // Obtener orientación de la nave
    const spaceshipQuaternion = spaceship.getOrientationQuaternion();

    // Rotar vectores base por la orientación de la nave
    const rotatedOffset = this.rotateVectorByQuaternion(FRONT_OFFSET, spaceshipQuaternion);
    // Mirar hacia atrás respecto a la dirección de la nave → -Z local
    const rotatedBackward = this.rotateVectorByQuaternion({ x: 0, y: 0, z: -3.0 }, spaceshipQuaternion);
    const rotatedUp = this.rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, spaceshipQuaternion);

    // Posición de la cámara delante de la nave
    this.position = {
      x: spaceship.position.x + rotatedOffset.x,
      y: spaceship.position.y + rotatedOffset.y,
      z: spaceship.position.z + rotatedOffset.z
    };

    // La cámara mira hacia atrás (opuesta al forward de la nave)
    this.target = {
      x: this.position.x + rotatedBackward.x,
      y: this.position.y + rotatedBackward.y,
      z: this.position.z + rotatedBackward.z
    };

    this.up = {
      x: rotatedUp.x,
      y: rotatedUp.y,
      z: rotatedUp.z
    };
  }

  /**
   * Rota un vector usando un cuaternión (array [x,y,z,w])
   */
  private rotateVectorByQuaternion(vector: Vector3, quaternion: any): Vector3 {
    const { x, y, z } = vector;
    const [qx, qy, qz, qw] = quaternion;

    const qx2 = qx * qx;
    const qy2 = qy * qy;
    const qz2 = qz * qz;
    const qw2 = qw * qw;

    return {
      x: x * (qx2 - qy2 - qz2 + qw2) + y * (2 * qx * qy - 2 * qz * qw) + z * (2 * qx * qz + 2 * qy * qw),
      y: x * (2 * qx * qy + 2 * qz * qw) + y * (-qx2 + qy2 - qz2 + qw2) + z * (2 * qy * qz - 2 * qx * qw),
      z: x * (2 * qx * qz - 2 * qy * qw) + y * (2 * qy * qz + 2 * qx * qw) + z * (-qx2 - qy2 + qz2 + qw2)
    };
  }

  public getDebugInfo() {
    return {
      mode: 'REAR_VIEW (7)',
      position: { ...this.position },
      target: { ...this.target },
      up: { ...this.up },
      zoomDistance: this.zoomDistance,
      fov: this.fov * (180 / Math.PI)
    };
  }
}

/**
 * Cámara interna en la cabina del piloto (modo 8)
 */
export class CockpitInternalCamera extends BaseCamera {
  protected updateCameraMode(spaceship: Spaceship): void {
    // Posición ajustada para FOV 55° y para ver HUD en parte inferior
    // Y más bajo para que el HUD aparezca en la parte horizontal inferior de la visión
    const COCKPIT_INTERNAL_OFFSET = { x: 0, y: -0.2, z: 1.2 }; // Más atrás y bajo para FOV 55°
    
    // Obtener el cuaternión de orientación de la nave
    const spaceshipQuaternion = spaceship.getOrientationQuaternion();
    
    // Convertir el cuaternión del array a objeto
    const quaternion = {
      x: spaceshipQuaternion[0],
      y: spaceshipQuaternion[1], 
      z: spaceshipQuaternion[2],
      w: spaceshipQuaternion[3]
    };
    
    // Rotar el offset usando el cuaternión de la nave
    const rotatedOffset = this.rotateVectorByQuaternion(COCKPIT_INTERNAL_OFFSET, quaternion);
    const rotatedForward = this.rotateVectorByQuaternion({ x: 0, y: 0, z: 1.0 }, quaternion);
    const rotatedUp = this.rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, quaternion);
    
    // Posición de la cámara dentro de la cabina
    this.position = {
      x: spaceship.position.x + rotatedOffset.x,
      y: spaceship.position.y + rotatedOffset.y,
      z: spaceship.position.z + rotatedOffset.z
    };
    
    // La cámara mira hacia adelante en la dirección de la nave
    this.target = {
      x: this.position.x + rotatedForward.x,
      y: this.position.y + rotatedForward.y,
      z: this.position.z + rotatedForward.z
    };
    
    // El "arriba" de la cámara se orienta con la nave
    this.up = rotatedUp;
  }

  private rotateVectorByQuaternion(vector: Vector3, quaternion: { x: number, y: number, z: number, w: number }): Vector3 {
    const { x, y, z } = vector;
    const { x: qx, y: qy, z: qz, w: qw } = quaternion;
    
    // Precalcular productos comunes para optimizar
    const qx2 = qx * qx;
    const qy2 = qy * qy;
    const qz2 = qz * qz;
    const qw2 = qw * qw;
    
    return {
      x: x * (qx2 - qy2 - qz2 + qw2) + y * (2 * qx * qy - 2 * qz * qw) + z * (2 * qx * qz + 2 * qy * qw),
      y: x * (2 * qx * qy + 2 * qz * qw) + y * (-qx2 + qy2 - qz2 + qw2) + z * (2 * qy * qz - 2 * qx * qw),
      z: x * (2 * qx * qz - 2 * qy * qw) + y * (2 * qy * qz + 2 * qx * qw) + z * (-qx2 - qy2 + qz2 + qw2)
    };
  }

  public getDebugInfo() {
    return {
      mode: 'COCKPIT (8)',
      position: { ...this.position },
      target: { ...this.target },
      up: { ...this.up },
      zoomDistance: this.zoomDistance,
      fov: this.fov * (180 / Math.PI)
    };
  }
}

/**
 * Manager de cámaras que maneja múltiples modos
 */
export class Camera {
  private currentMode: CameraMode = CameraMode.COCKPIT;
  private rearViewCamera: RearViewCamera;
  private rearExternalCamera: RearExternalCamera;
  private cockpitCamera: CockpitCamera;
  private cockpitInternalCamera: CockpitInternalCamera;
  private manualCamera: ManualCamera;
  private activeCamera: BaseCamera;

  // Exponer propiedades de la cámara activa
  public get viewMatrix(): Float32Array { return this.activeCamera.viewMatrix; }
  public get projectionMatrix(): Float32Array { return this.activeCamera.projectionMatrix; }
  public get position(): Vector3 { return this.activeCamera.position; }
  public get target(): Vector3 { return this.activeCamera.target; }
  public get up(): Vector3 { return this.activeCamera.up; }
  public get fov(): number { return this.activeCamera.fov; }
  
  constructor(aspect: number = 1.0) {
    this.rearViewCamera = new RearViewCamera(aspect);
    this.rearExternalCamera = new RearExternalCamera(aspect);
    this.cockpitCamera = new CockpitCamera(aspect);
    this.cockpitInternalCamera = new CockpitInternalCamera(aspect);
    this.manualCamera = new ManualCamera(aspect);
    this.activeCamera = this.cockpitInternalCamera; // Cockpit (modo 8) como modo por defecto
  }

  /**
   * Actualiza la cámara activa
   */
  public update(spaceship: Spaceship, deltaTime: number): void {
    this.activeCamera.update(spaceship, deltaTime);
  }

  /**
   * Cambia el modo de cámara
   */
  public setCameraMode(mode: CameraMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    switch (mode) {
      case CameraMode.INMOVILE_EXTERNAL:
        this.activeCamera = this.cockpitCamera;
        break;
      case CameraMode.MANUAL:
        this.activeCamera = this.manualCamera;
        break;
      case CameraMode.REAR_VIEW:
        this.activeCamera = this.rearViewCamera;
        break;
      case CameraMode.COCKPIT:
        this.activeCamera = this.cockpitInternalCamera;
        break;
      case CameraMode.REAR_TRACKING:
        this.activeCamera = this.rearExternalCamera;
        break;
    }
    
    GameLogger.info(LogCategory.GAME_LOOP, 'Camera mode changed', { from: CameraMode[previousMode], to: CameraMode[mode] });
  }

  /**
   * Semilla la cámara manual con una transformación dada (para iniciar una cinemática sin salto de posición).
   */
  public seedManualTransform(pos: {x:number;y:number;z:number}, target: {x:number;y:number;z:number}, up: {x:number;y:number;z:number}) {
    if (!this.manualCamera) return;
    this.manualCamera.position.x = pos.x; this.manualCamera.position.y = pos.y; this.manualCamera.position.z = pos.z;
    this.manualCamera.target.x = target.x; this.manualCamera.target.y = target.y; this.manualCamera.target.z = target.z;
    this.manualCamera.up.x = up.x; this.manualCamera.up.y = up.y; this.manualCamera.up.z = up.z;
    // Actualizar matrices inmediatamente
    (this.manualCamera as any).updateViewMatrix?.();
  }

  /** Marca la cámara activa como "dirty" forzando recomputo de la viewMatrix desde position/target actuales. */
  public markDirty(): void {
    if (!this.activeCamera) return;
    (this.activeCamera as any).updateViewMatrix?.();
  }

  /** Devuelve el FOV vertical actual (radianes) de la cámara activa. */
  public getFovRadians(): number {
    return this.activeCamera?.fov ?? (45 * Math.PI/180);
  }

  /**
   * Obtiene el modo actual de cámara
   */
  public getCurrentMode(): CameraMode {
    return this.currentMode;
  }

  /**
   * Maneja el zoom con la rueda del mouse
   */
  public handleZoom(delta: number): void {
    this.activeCamera.handleZoom(delta);
  }

  /**
   * Obtiene la distancia de zoom actual
   */
  public getZoomDistance(): number {
    return this.activeCamera.getZoomDistance();
  }

  /**
   * Actualiza la matriz de proyección
   */
  public updateProjectionMatrix(): void {
    this.rearViewCamera.updateProjectionMatrix();
    this.rearExternalCamera.updateProjectionMatrix();
    this.cockpitCamera.updateProjectionMatrix();
    this.cockpitInternalCamera.updateProjectionMatrix();
    this.manualCamera.updateProjectionMatrix();
  }

  /** Ajusta el FOV (grados) en todas las cámaras y actualiza proyección */
  public setFovDegrees(deg: number): void {
    this.rearViewCamera.setFovDegrees(deg);
    this.rearExternalCamera.setFovDegrees(deg);
    this.cockpitCamera.setFovDegrees(deg);
    this.cockpitInternalCamera.setFovDegrees(deg);
    this.manualCamera.setFovDegrees(deg);
  }

  /** Ajusta el FOV (radianes) en todas las cámaras y actualiza proyección */
  public setFovRadians(rad: number): void {
    this.rearViewCamera.setFovRadians(rad);
    this.rearExternalCamera.setFovRadians(rad);
    this.cockpitCamera.setFovRadians(rad);
    this.cockpitInternalCamera.setFovRadians(rad);
    this.manualCamera.setFovRadians(rad);
  }

  /**
   * Actualiza el aspect ratio
   */
  public setAspectRatio(aspect: number): void {
    this.rearViewCamera.setAspectRatio(aspect);
    this.rearExternalCamera.setAspectRatio(aspect);
    this.cockpitCamera.setAspectRatio(aspect);
    this.cockpitInternalCamera.setAspectRatio(aspect);
    this.manualCamera.setAspectRatio(aspect);
  }

  /**
   * Obtiene información de depuración
   */
  public getDebugInfo() {
    return {
      currentMode: CameraMode[this.currentMode],
      activeCamera: this.activeCamera === this.rearExternalCamera ? 
        this.rearExternalCamera.getDebugInfo() : 
        this.activeCamera === this.rearViewCamera ?
        this.rearViewCamera.getDebugInfo() :
        this.activeCamera === this.cockpitInternalCamera ?
        this.cockpitInternalCamera.getDebugInfo() :
        this.activeCamera === this.manualCamera ?
        this.manualCamera.getDebugInfo() :
        this.cockpitCamera.getDebugInfo()
    };
  }
}

/**
 * Cámara manual para cinemáticas/animaciones (modo 1)
 * No modifica posición/target automáticamente; sólo actualiza la viewMatrix.
 */
export class ManualCamera extends BaseCamera {
  protected updateCameraMode(_spaceship: Spaceship): void {
    // No-op: la animación externa gestiona position/target/up
  }
  public getDebugInfo() {
    return {
      mode: 'MANUAL (1)',
      position: { ...this.position },
      target: { ...this.target },
      up: { ...this.up },
      zoomDistance: this.getZoomDistance(),
      fov: this.fov * (180 / Math.PI)
    };
  }
}