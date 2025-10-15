import { Vector3 } from '../types/game.types';
import { Spaceship } from './Spaceship';

export enum CameraMode {
  INMOVILE_EXTERNAL = 0, // Cámara externa inmóvil que rota con la nave (modo por defecto)
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
  
  // Configuración de proyección - FOV vertical realista tipo humano
  public fov: number = 55 * (Math.PI / 180); // 55° vertical → ~90° horizontal en 16:9
  public aspect: number = 1.0;
  public near: number = 0.1;
  public far: number = 100000.0; // Aumentado para soportar distancias de hasta ~50ku sin recorte
  
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
    const forward = {
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

    // Right = forward × up
    const right = {
      x: forward.y * up.z - forward.z * up.y,
      y: forward.z * up.x - forward.x * up.z,
      z: forward.x * up.y - forward.y * up.x
    };

    // Normalizar right
    length = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.y /= length;
      right.z /= length;
    }

    // Up = right × forward
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
  private currentMode: CameraMode = CameraMode.INMOVILE_EXTERNAL;
  private rearExternalCamera: RearExternalCamera;
  private cockpitCamera: CockpitCamera;
  private cockpitInternalCamera: CockpitInternalCamera;
  private activeCamera: BaseCamera;

  // Exponer propiedades de la cámara activa
  public get viewMatrix(): Float32Array { return this.activeCamera.viewMatrix; }
  public get projectionMatrix(): Float32Array { return this.activeCamera.projectionMatrix; }
  public get position(): Vector3 { return this.activeCamera.position; }
  public get target(): Vector3 { return this.activeCamera.target; }
  public get up(): Vector3 { return this.activeCamera.up; }
  
  constructor(aspect: number = 1.0) {
    this.rearExternalCamera = new RearExternalCamera(aspect);
    this.cockpitCamera = new CockpitCamera(aspect);
    this.cockpitInternalCamera = new CockpitInternalCamera(aspect);
    this.activeCamera = this.cockpitCamera; // INMOVILE_EXTERNAL como modo por defecto
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
      case CameraMode.COCKPIT:
        this.activeCamera = this.cockpitInternalCamera;
        break;
      case CameraMode.REAR_TRACKING:
        this.activeCamera = this.rearExternalCamera;
        break;
    }
    
    console.log(`🎥 Cambio de cámara: ${CameraMode[previousMode]} → ${CameraMode[mode]}`);
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
    this.rearExternalCamera.updateProjectionMatrix();
    this.cockpitCamera.updateProjectionMatrix();
    this.cockpitInternalCamera.updateProjectionMatrix();
  }

  /**
   * Actualiza el aspect ratio
   */
  public setAspectRatio(aspect: number): void {
    this.rearExternalCamera.setAspectRatio(aspect);
    this.cockpitCamera.setAspectRatio(aspect);
    this.cockpitInternalCamera.setAspectRatio(aspect);
  }

  /**
   * Obtiene información de depuración
   */
  public getDebugInfo() {
    return {
      currentMode: CameraMode[this.currentMode],
      activeCamera: this.activeCamera === this.rearExternalCamera ? 
        this.rearExternalCamera.getDebugInfo() : 
        this.activeCamera === this.cockpitInternalCamera ?
        this.cockpitInternalCamera.getDebugInfo() :
        this.cockpitCamera.getDebugInfo()
    };
  }
}