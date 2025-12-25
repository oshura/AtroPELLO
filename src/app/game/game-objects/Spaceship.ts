import { GameObject } from '../GameObject';
import { Vector3 } from '../../types/game.types';
import { mat4, vec3, quat } from 'gl-matrix';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';
import { GameObjectType } from '../types/game-object.types';
import { OrientationBasis } from '../targeting/compass-direction.util';
import { OrientationSnapshot } from '../types/respawn.types';

/**
 * Estados del thruster para diferentes efectos visuales
 */
export enum ThrusterState {
  IDLE = 'idle',          // Rojo - parado
  ACCELERATING = 'accelerating', // Amarillo/naranja - acelerando (+)
  CRUISING = 'cruising',  // Azul - con velocidad pero sin input
  BRAKING = 'braking'     // Rojo intenso - frenando (-)
}

/**
 * Clase para la nave del jugador
 */
export class Spaceship extends GameObject {
  // Propiedades específicas de la nave
  public maxSpeed: number = 10.0;
  public acceleration: number = 2.0;
  public deceleration: number = 2.5;
  public rotationSpeed: number = Math.PI / 2.5; // 72 grados por segundo (180 grados en 2.5 segundos)
  public minRotationSpeed: number = Math.PI / 5; // 36 grados por segundo
  
  // Quaternion de orientación para rotaciones locales verdaderas (gl-matrix)
  private orientationQuaternion!: quat;
  // Matriz de orientación derivada del quaternion
  private orientationMatrix!: mat4;
  
  public currentSpeed: number = 0.0;
  public targetSpeed: number = 0.0;
  public forwardDirection: Vector3 = { x: 0, y: 0, z: 1 }; // Dirección hacia adelante
  
  // Estado del motor para efectos visuales
  public isThrusting: boolean = false;
  public thrusterIntensity: number = 0.0;
  public thrusterState: ThrusterState = ThrusterState.IDLE;
  public thrusterScaleFactor: number = 1.0; // Factor de escala dinámico del thruster
  private speedControlGain: number = 1.0;
  private wingDeploymentProgress = 0;
  private noseAnchorProgress = 0;

  // --- Mitigación e instrumentación de jitter a alta velocidad ---
  private highSpeedSmoothingEnabled: boolean = false; // activable externamente
  private smoothedVelocity: Vector3 = { x: 0, y: 0, z: 0 }; // buffer de velocidad filtrada
  private lastForwardDir: Vector3 | null = null; // para medir variación angular frame a frame
  private jitterAccum: number = 0; // acumulador de variaciones angulares (radianes)
  private jitterSamples: number = 0; // muestras acumuladas
  private lastJitterReportMs: number = performance.now(); // timestamp del último reporte

  // Energía del vacío (sistema hipotético)
  public voidConversionPower: number = 0.05; // 5% de conversión de masa → energía
  public voidEnergyMax: number = 100; // capacidad máxima
  public voidEnergyCurrent: number = 100; // inicia llena (100%)
  public voidEnergyConsumptionPerUnit: number = 0.01; // consumo por unidad recorrida
  // Pausa de consumo de energía del vacío (e.g., durante animaciones)
  public voidEnergyPaused: boolean = false;
  private lastPositionForEnergy: Vector3 | null = null; // track recorrido
  // Estado de deriva por falta de energía
  private outOfVoidEnergy: boolean = false; // sin energía: no acelera; deriva
  private driftVelocity: Vector3 = { x: 0, y: 0, z: 0 }; // velocidad constante en mundo (10% de la anterior)
  private voidEnergyResumeTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Fuerzas externas (gravedad, vientos, etc.) que se suman al velocity
  public externalForces: Vector3 = { x: 0, y: 0, z: 0 };
  
  // Capacidad de carga (HUD de cargamento)
  public cargoCapacityMax: number = 10;
  public cargoCapacityCurrent: number = 0;
  
  // Armamento disponible (por ahora vacío)
  public weapons: any[] = [];
  
  // Callback para notificar cambios de salud (patrón reactivo)
  private onHealthChangeCallback: ((newHealth: number, oldHealth: number) => void) | null = null;
  
  // Control de entrada
  public controls = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    speedUp: false,
    speedDown: false,
    rollLeft: false,  // R key - Roll hacia la izquierda
    rollRight: false  // F key - Roll hacia la derecha
  };

  private precisionRotationActive: boolean = false;
  private precisionRotationScalar: number = 1;

  /** Escala aplicada al control de aceleración para efectos atmosféricos */
  public setAtmosphereSpeedControlGain(scale: number | null | undefined): void {
    if (!Number.isFinite(scale as number)) {
      this.speedControlGain = 1;
      return;
    }
    const clamped = Math.max(0.25, Math.min(1, scale as number));
    this.speedControlGain = clamped;
  }

  public resetAtmosphereSpeedControlGain(): void {
    this.speedControlGain = 1;
  }

  public setWingDeploymentProgress(progress: number | null | undefined): boolean {
    const numeric = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0;
    const clamped = Math.max(0, Math.min(1, numeric));
    if (Math.abs(clamped - this.wingDeploymentProgress) <= 1e-4) {
      return false;
    }
    this.wingDeploymentProgress = clamped;
    return true;
  }

  public getWingDeploymentProgress(): number {
    return this.wingDeploymentProgress;
  }

  public setNoseAnchorProgress(progress: number | null | undefined): boolean {
    const numeric = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0;
    const clamped = Math.max(0, Math.min(1, numeric));
    if (Math.abs(clamped - this.noseAnchorProgress) <= 1e-4) {
      return false;
    }
    this.noseAnchorProgress = clamped;
    return true;
  }

  public getNoseAnchorProgress(): number {
    return this.noseAnchorProgress;
  }

  // Override healthCurrent con getter/setter reactivo
  public override get healthCurrent(): number {
    return this._healthCurrent;
  }
  
  public override set healthCurrent(value: number) {
    const oldValue = this._healthCurrent;
    this._healthCurrent = value;
    
    // Notificar cambio si hay callback registrado y el valor cambió
    if (oldValue !== value && this.onHealthChangeCallback) {
      this.onHealthChangeCallback(value, oldValue);
    }
    
    // IMPORTANTE: Llamar también al setter del padre para verificación de destrucción
    // GameObject.healthCurrent setter verifica si value <= 0 y llama onDestroyedCallback
    // Pero como estamos overriding, necesitamos hacerlo manualmente:
    if (value <= 0 && oldValue > 0) {
      // GameObject maneja la destrucción vía su callback
      // El setter de GameObject ya no se ejecuta porque lo estamos overriding
      // Así que llamamos directamente a getDestroyedCallback si existe
      const destroyCallback = (this as any).onDestroyedCallback;
      if (destroyCallback) {
        destroyCallback(this);
      }
    }
  }
  
  /**
   * Registrar callback para notificación reactiva de cambios de salud
   */
  public setHealthChangeCallback(callback: (newHealth: number, oldHealth: number) => void): void {
    this.onHealthChangeCallback = callback;
  }

  /** Remaining cargo slots before overfilling */
  public get cargoCapacityRemaining(): number {
    return Math.max(0, this.cargoCapacityMax - this.cargoCapacityCurrent);
  }

  /**
   * Adds cargo units, clamping to capacity. Returns the units actually stored.
   */
  public addCargo(units: number): number {
    if (!Number.isFinite(units) || units <= 0) {
      return 0;
    }
    const available = this.cargoCapacityRemaining;
    const applied = Math.min(available, Math.floor(units));
    if (applied <= 0) {
      return 0;
    }
    this.cargoCapacityCurrent = Math.min(this.cargoCapacityMax, this.cargoCapacityCurrent + applied);
    return applied;
  }

  /**
   * Removes cargo units safely. Returns the units actually removed.
   */
  public removeCargo(units: number): number {
    if (!Number.isFinite(units) || units <= 0) {
      return 0;
    }
    const removable = Math.min(this.cargoCapacityCurrent, Math.floor(units));
    if (removable <= 0) {
      return 0;
    }
    this.cargoCapacityCurrent = Math.max(0, this.cargoCapacityCurrent - removable);
    return removable;
  }

  constructor(position: Vector3 = { x: 0, y: 0, z: 0 }) {
    super('player-ship', position);
    this.setType(GameObjectType.SPACESHIP); // Establecer tipo de GameObject
    this.color = { r: 0.7, g: 0.75, b: 0.8, a: 1.0 }; // Color metálico plateado base

    // Salud inicial de la nave (podrá equilibrarse luego)
    this.healthMax = 100;
    this._healthCurrent = this.healthMax; // Usar backing field directamente en constructor
    
    // Inicializar matriz de orientación como identidad
    this.initializeOrientationMatrix();

    if (this.boundingSphere) {
      this.boundingSphere.radius *= 0.8; // give player a slight buffer on collisions
    }
    
    GameLogger.info(LogCategory.GAME_INITIALIZATION, 'Spaceship created with geometry', {
      vertices: this.vertices.length,
      indices: this.indices.length,
      position: this.position
    });
  }

  /**
   * Inicializa la geometría de la nave modular con componentes separados
   */
  protected initGeometry(): void {
    // La nueva nave será renderizada como componentes separados
    // Este método crea una geometría temporal básica que será reemplazada por el renderizado modular
    this.createBasicGeometry();
  }

  /**
   * Crea una geometría básica temporal (será reemplazada por renderizado modular)
   */
  private createBasicGeometry(): void {
    // Geometría simple para el sistema de colisiones
    this.vertices = new Float32Array([
      // Caja simple para colisiones
      -0.5, -0.3, -0.8,  // 0
       0.5, -0.3, -0.8,  // 1
      -0.5,  0.3, -0.8,  // 2
       0.5,  0.3, -0.8,  // 3
      -0.5, -0.3,  1.2,  // 4
       0.5, -0.3,  1.2,  // 5
      -0.5,  0.3,  1.2,  // 6
       0.5,  0.3,  1.2,  // 7
    ]);

    this.indices = new Uint16Array([
      // Cara frontal
      4, 5, 7, 4, 7, 6,
      // Cara trasera
      0, 2, 3, 0, 3, 1,
      // Lados
      0, 4, 6, 0, 6, 2,
      1, 3, 7, 1, 7, 5,
      // Arriba y abajo
      2, 6, 7, 2, 7, 3,
      0, 1, 5, 0, 5, 4
    ]);

    // Normales básicas
    this.normals = new Float32Array([
      -1, 0, 0,  0, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0,  1, 0, 0,  -1, 0, 0,  1, 0, 0
    ]);

    // UVs básicas
    this.uvs = new Float32Array([
      0, 0,  1, 0,  0, 1,  1, 1,
      0, 0,  1, 0,  0, 1,  1, 1
    ]);
  }

  /**
   * Actualiza la nave con entrada del jugador
   */
  public override update(deltaTime: number): void {
    this.handleInput(deltaTime);
    this.updateMovement(deltaTime);
    this.thrusterScaleFactor = this.calculateThrusterScale(); // Actualizar escala del thruster
    super.update(deltaTime);
    this.updateVoidEnergy(deltaTime);
  }

  /**
   * Override del updateModelMatrix para usar quaternion de orientación con gl-matrix
   */
  public override updateModelMatrix(): void {
    // Si el quaternion o matriz de orientación no están inicializados, usar el método padre
    if (!this.orientationQuaternion || !this.orientationMatrix) {
      super.updateModelMatrix();
      return;
    }
    
    // Crear una matriz temporal de gl-matrix para los cálculos
    const tempMatrix = mat4.create();
    
    // 1. Aplicar traslación
    mat4.translate(tempMatrix, tempMatrix, [this.position.x, this.position.y, this.position.z]);
    
    // 2. Aplicar la matriz de orientación acumulativa (rotaciones locales verdaderas)
    mat4.multiply(tempMatrix, tempMatrix, this.orientationMatrix);
    
    // 3. Aplicar escala
    mat4.scale(tempMatrix, tempMatrix, [this.scale.x, this.scale.y, this.scale.z]);
    
    // 4. Copiar el resultado a this.modelMatrix (Float32Array)
    for (let i = 0; i < 16; i++) {
      this.modelMatrix[i] = tempMatrix[i];
    }
  }

  /**
   * Maneja la entrada del jugador con rotaciones sobre ejes locales reales de la nave
   */
  private handleInput(deltaTime: number): void {
    // Si no hay energía del vacío, bloquear inputs de velocidad y forzar motor inactivo
    if (this.outOfVoidEnergy) {
      this.controls.speedUp = false;
      this.controls.speedDown = false;
    }

    // Calcular velocidad de rotación basada en la velocidad actual
    const speedFactor = this.currentSpeed / this.maxSpeed;
    const rotationMultiplier = 1.0 - (speedFactor * 0.58); // Reduce a 42% a velocidad máxima
    const currentRotationSpeed = this.rotationSpeed * rotationMultiplier * this.precisionRotationScalar;
    const deltaRotation = currentRotationSpeed * deltaTime;

    // EXTRAER EJES LOCALES REALES DE LA NAVE desde la matriz de orientación
    // Estos son los ejes tal como están ahora en el espacio mundial
    
    // Eje Right (X local) - Primera fila de la matriz de rotación
    const rightAxis = vec3.fromValues(
      this.orientationMatrix[0], 
      this.orientationMatrix[1], 
      this.orientationMatrix[2]
    );
    
    // Eje Up (Y local) - Segunda fila de la matriz de rotación
    const upAxis = vec3.fromValues(
      this.orientationMatrix[4], 
      this.orientationMatrix[5], 
      this.orientationMatrix[6]
    );
    
    // Eje Forward (Z local) - Tercera fila de la matriz de rotación
    const forwardAxis = vec3.fromValues(
      this.orientationMatrix[8], 
      this.orientationMatrix[9], 
      this.orientationMatrix[10]
    );

    let hasRotation = false;
    
    // Pitch (W/S) - Rotación sobre el eje Right actual de la nave (transversal a las alas)
    if (this.controls.up) {
      const pitchQuat = quat.create();
      quat.setAxisAngle(pitchQuat, rightAxis, -deltaRotation);
      quat.multiply(this.orientationQuaternion, pitchQuat, this.orientationQuaternion);
      hasRotation = true;
    } else if (this.controls.down) {
      const pitchQuat = quat.create();
      quat.setAxisAngle(pitchQuat, rightAxis, deltaRotation);
      quat.multiply(this.orientationQuaternion, pitchQuat, this.orientationQuaternion);
      hasRotation = true;
    }

    // Yaw (Q/E) - Rotación sobre el eje Up actual de la nave (perpendicular al plano de las alas)
    if (this.controls.left) {
      const yawQuat = quat.create();
      quat.setAxisAngle(yawQuat, upAxis, deltaRotation);
      quat.multiply(this.orientationQuaternion, yawQuat, this.orientationQuaternion);
      hasRotation = true;
    } else if (this.controls.right) {
      const yawQuat = quat.create();
      quat.setAxisAngle(yawQuat, upAxis, -deltaRotation);
      quat.multiply(this.orientationQuaternion, yawQuat, this.orientationQuaternion);
      hasRotation = true;
    }

    // Roll (A/D) - Rotación sobre el eje Forward actual de la nave (longitudinal)
    if (this.controls.rollLeft) {
      const rollQuat = quat.create();
      quat.setAxisAngle(rollQuat, forwardAxis, deltaRotation);
      quat.multiply(this.orientationQuaternion, rollQuat, this.orientationQuaternion);
      hasRotation = true;
    } else if (this.controls.rollRight) {
      const rollQuat = quat.create();
      quat.setAxisAngle(rollQuat, forwardAxis, -deltaRotation);
      quat.multiply(this.orientationQuaternion, rollQuat, this.orientationQuaternion);
      hasRotation = true;
    }
    
    // Actualizar matriz solo si hubo rotación
    if (hasRotation) {
      // Normalizar el quaternion para evitar drift
      quat.normalize(this.orientationQuaternion, this.orientationQuaternion);
      // Convertir quaternion actualizado de vuelta a matriz
      mat4.fromQuat(this.orientationMatrix, this.orientationQuaternion);
    }

    // Extraer ángulos de Euler para compatibilidad con el sistema existente
    this.extractEulerFromOrientationMatrix();

    // Control de velocidad con +/-
    if (this.outOfVoidEnergy) {
      // Sin energía: no se puede acelerar ni frenar; la velocidad propia es 0
      this.targetSpeed = 0;
      this.thrusterState = ThrusterState.IDLE;
      this.isThrusting = false;
    } else if (this.controls.speedUp) {
      const accel = this.acceleration * this.speedControlGain;
      this.targetSpeed = Math.min(this.targetSpeed + accel * deltaTime, this.maxSpeed);
      this.thrusterState = ThrusterState.ACCELERATING;
      this.isThrusting = true;
    } else if (this.controls.speedDown) {
      this.targetSpeed = Math.max(this.targetSpeed - this.acceleration * deltaTime, 0);
      this.thrusterState = ThrusterState.BRAKING;
      this.isThrusting = this.currentSpeed > 0.1;
    } else {
      // Sin input de aceleración/frenado
      if (this.currentSpeed > 0.1) {
        this.thrusterState = ThrusterState.CRUISING;
        this.isThrusting = true;
      } else {
        this.thrusterState = ThrusterState.IDLE;
        this.isThrusting = false;
      }
    }
  }

  /** Activa/desactiva el modo de rotación precisa (mitad de velocidad) */
  public setPrecisionRotationActive(active: boolean): void {
    if (this.precisionRotationActive === active) {
      return;
    }
    this.precisionRotationActive = active;
    this.precisionRotationScalar = active ? 0.2 : 1;
  }

  public isPrecisionRotationActive(): boolean {
    return this.precisionRotationActive;
  }

  /**
   * Actualiza el movimiento de la nave
   */
  private updateMovement(deltaTime: number): void {
    // Si está sin energía, anular movimiento propio y aplicar deriva constante
    if (this.outOfVoidEnergy) {
      this.currentSpeed = 0;
      this.targetSpeed = 0;
      this.thrusterIntensity = 0.0;
      // Mantener dirección de avance actual para sistemas dependientes, pero no afecta a la deriva
      this.updateForwardDirection();
      // Usar velocidad de deriva fija (independiente de orientación)
      this.velocity.x = this.driftVelocity.x;
      this.velocity.y = this.driftVelocity.y;
      this.velocity.z = this.driftVelocity.z;
      return;
    }

    // Suavizar transición de velocidad
    if (this.currentSpeed < this.targetSpeed) {
      this.currentSpeed = Math.min(this.currentSpeed + this.acceleration * deltaTime, this.targetSpeed);
    } else if (this.currentSpeed > this.targetSpeed) {
      this.currentSpeed = Math.max(this.currentSpeed - this.deceleration * deltaTime, this.targetSpeed);
    }

    // Actualizar intensidad del thruster basado en el estado y actividad
    switch (this.thrusterState) {
      case ThrusterState.IDLE:
        this.thrusterIntensity = 0.0;
        break;
      case ThrusterState.ACCELERATING:
        this.thrusterIntensity = Math.min(this.currentSpeed / this.maxSpeed + 0.5, 1.0);
        break;
      case ThrusterState.BRAKING:
        this.thrusterIntensity = 1.0; // Máxima intensidad para frenado
        break;
      case ThrusterState.CRUISING:
        this.thrusterIntensity = Math.max(0.3, this.currentSpeed / this.maxSpeed * 0.6);
        break;
    }

    // Calcular dirección hacia adelante basada en la rotación
    this.updateForwardDirection();

    // Instrumentación de jitter: medir variación angular del forward entre frames cuando v > 80u/s
    if (this.lastForwardDir) {
      const ax = this.lastForwardDir.x; const ay = this.lastForwardDir.y; const az = this.lastForwardDir.z;
      const bx = this.forwardDirection.x; const by = this.forwardDirection.y; const bz = this.forwardDirection.z;
      const al = Math.hypot(ax, ay, az) || 1; const bl = Math.hypot(bx, by, bz) || 1;
      const dot = (ax * bx + ay * by + az * bz) / (al * bl);
      const clamped = Math.min(1, Math.max(-1, dot));
      const angle = Math.acos(clamped); // variación angular en radianes
      if (this.currentSpeed > Math.max(80, this.maxSpeed * 0.8)) {
        this.jitterAccum += angle;
        this.jitterSamples++;
      }
    }
    this.lastForwardDir = { ...this.forwardDirection };

    // Reporte periódico (1s) si smoothing está desactivado y hay jitter perceptible
    const now = performance.now();
    if (now - this.lastJitterReportMs >= 1000 && this.jitterSamples > 0) {
      const avgAngle = this.jitterAccum / Math.max(1, this.jitterSamples);
      // Umbral muy pequeño (~0.1 grados ≈ 0.001745 rad) para detectar micro-oscilaciones
      if (!this.highSpeedSmoothingEnabled && avgAngle > 0.0018) {
        try { GameLogger.info(LogCategory.GAME_INITIALIZATION, 'High-speed jitter detectado', { avgAngleRad: +(avgAngle.toFixed(6)), samples: this.jitterSamples, speed: +(this.currentSpeed.toFixed(2)) }); } catch {}
      }
      this.jitterAccum = 0; this.jitterSamples = 0; this.lastJitterReportMs = now;
    }

    // Aplicar velocidad en la dirección hacia adelante con posible suavizado
    const targetVx = this.forwardDirection.x * this.currentSpeed;
    const targetVy = this.forwardDirection.y * this.currentSpeed;
    const targetVz = this.forwardDirection.z * this.currentSpeed;

    if (this.highSpeedSmoothingEnabled && this.currentSpeed > Math.max(80, this.maxSpeed * 0.8)) {
      // Filtro exponencial: acerca suavemente la velocidad real al objetivo para amortiguar pequeñas variaciones de forward
      // Factor adaptativo basado en deltaTime y fracción de velocidad sobre el máximo
      const speedRatio = Math.min(1, this.currentSpeed / Math.max(1e-6, this.maxSpeed));
      const baseAlpha = 12; // respuesta base
      const alpha = Math.min(1, deltaTime * baseAlpha * (0.6 + 0.4 * speedRatio));
      this.smoothedVelocity.x += (targetVx - this.smoothedVelocity.x) * alpha;
      this.smoothedVelocity.y += (targetVy - this.smoothedVelocity.y) * alpha;
      this.smoothedVelocity.z += (targetVz - this.smoothedVelocity.z) * alpha;
      this.velocity.x = this.smoothedVelocity.x;
      this.velocity.y = this.smoothedVelocity.y;
      this.velocity.z = this.smoothedVelocity.z;
    } else {
      this.velocity.x = targetVx;
      this.velocity.y = targetVy;
      this.velocity.z = targetVz;
      // Mantener buffer sincronizado para evitar salto cuando se active smoothing
      this.smoothedVelocity.x = this.velocity.x;
      this.smoothedVelocity.y = this.velocity.y;
      this.smoothedVelocity.z = this.velocity.z;
    }

    // Aplicar fuerzas externas acumuladas (gravedad atmosférica, etc.)
    this.velocity.x += this.externalForces.x;
    this.velocity.y += this.externalForces.y;
    this.velocity.z += this.externalForces.z;
    // Resetear para el próximo frame
    this.externalForces.x = 0;
    this.externalForces.y = 0;
    this.externalForces.z = 0;
  }

  /**
   * Actualiza la energía del vacío consumida por distancia recorrida
   */
  private updateVoidEnergy(deltaTime: number): void {
    // Si está pausado el consumo, actualizar el marcador de posición y salir
    if (this.voidEnergyPaused) {
      this.lastPositionForEnergy = { ...this.position };
      return;
    }
    const pos = this.position;
    if (!this.lastPositionForEnergy) {
      this.lastPositionForEnergy = { ...pos };
      return;
    }
    const dx = pos.x - this.lastPositionForEnergy.x;
    const dy = pos.y - this.lastPositionForEnergy.y;
    const dz = pos.z - this.lastPositionForEnergy.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (distance > 0) {
      const prevEnergy = this.voidEnergyCurrent;
      const energySpent = distance * this.voidEnergyConsumptionPerUnit;
      this.voidEnergyCurrent = Math.max(0, Math.min(this.voidEnergyMax, this.voidEnergyCurrent - energySpent));
      this.lastPositionForEnergy = { ...pos };

      // Transición a sin energía: capturar deriva (10% de la velocidad actual del mundo)
      if (prevEnergy > 0 && this.voidEnergyCurrent <= 0 && !this.outOfVoidEnergy) {
        this.outOfVoidEnergy = true;
        this.driftVelocity = {
          x: this.velocity.x * 0.1,
          y: this.velocity.y * 0.1,
          z: this.velocity.z * 0.1,
        };
        // Forzar motor a 0; el HUD debe mostrar 0 aunque la nave se desplace por deriva
        this.targetSpeed = 0;
        this.currentSpeed = 0;
        this.thrusterState = ThrusterState.IDLE;
        this.isThrusting = false;
      }
    }

    // Si de alguna forma recupera energía (sistemas externos), salir del estado de deriva
    if (this.voidEnergyCurrent > 0 && this.outOfVoidEnergy) {
      this.outOfVoidEnergy = false;
      // Mantener la velocidad actual como base; el jugador deberá acelerar manualmente
      this.driftVelocity = { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Restaura la energía del vacío tras respawn y evita drenarla por teletransporte
   */
  public applyRespawnVoidEnergy(targetEnergy: number, pauseMs: number = 1200): void {
    const clamped = Math.max(0, Math.min(this.voidEnergyMax, targetEnergy));
    this.voidEnergyCurrent = clamped;
    this.outOfVoidEnergy = clamped <= 0;
    if (!this.outOfVoidEnergy) {
      this.driftVelocity = { x: 0, y: 0, z: 0 };
    }
    this.lastPositionForEnergy = { ...this.position };
    this.voidEnergyPaused = true;
    if (this.voidEnergyResumeTimeout !== null) {
      clearTimeout(this.voidEnergyResumeTimeout);
      this.voidEnergyResumeTimeout = null;
    }
    const delay = Math.max(0, pauseMs);
    if (delay === 0) {
      this.lastPositionForEnergy = { ...this.position };
      this.voidEnergyPaused = false;
      return;
    }
    this.voidEnergyResumeTimeout = setTimeout(() => {
      this.lastPositionForEnergy = { ...this.position };
      this.voidEnergyPaused = false;
      this.voidEnergyResumeTimeout = null;
    }, delay);
  }

  /**
   * Reinicia el muestreo de energía del vacío tomando como referencia la posición actual
   * (o una posición opcional proporcionada).
   */
  public resetVoidEnergyBaseline(anchor?: Vector3 | null): void {
    const source = anchor ?? this.position;
    this.lastPositionForEnergy = { x: source.x, y: source.y, z: source.z };
  }

  /**
   * Actualiza la dirección hacia adelante usando la matriz de orientación
   */
  private updateForwardDirection(): void {
    // Extraer la dirección hacia adelante directamente de la matriz de orientación
    // El eje Z local (forward) está en la columna 2 de la matriz
    this.forwardDirection = {
      x: this.orientationMatrix[8],
      y: this.orientationMatrix[9],
      z: this.orientationMatrix[10]
    };
  }

  /**
   * Aplica rotaciones a un vector usando el orden X→Y→Z (igual que GameObject)
   */
  private applyRotationToVector(localVector: Vector3, rotation: Vector3): Vector3 {
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const cosZ = Math.cos(rotation.z);
    const sinZ = Math.sin(rotation.z);
    
    // Aplicar rotaciones en orden X, Y, Z (igual que GameObject)
    let x = localVector.x;
    let y = localVector.y;
    let z = localVector.z;
    
    // Primero X (pitch)
    const tempY1 = y * cosX - z * sinX;
    z = y * sinX + z * cosX;
    y = tempY1;
    
    // Luego Y (yaw)
    const tempX = x * cosY - z * sinY;
    z = x * sinY + z * cosY;
    x = tempX;
    
    // Finalmente Z (roll)
    const tempX2 = x * cosZ - y * sinZ;
    y = x * sinZ + y * cosZ;
    x = tempX2;
    
    return { x, y, z };
  }

  /**
   * Establece el estado de un control
   */
  public setControl(control: keyof typeof this.controls, state: boolean): void {
    this.controls[control] = state;
  }

  /**
   * Obtiene la velocidad actual como porcentaje
   */
  public getSpeedPercentage(): number {
    return (this.currentSpeed / this.maxSpeed) * 100;
  }

  /**
   * Obtiene información de estado de la nave
   */
  public getStatus() {
    return {
      speed: this.currentSpeed,
      maxSpeed: this.maxSpeed,
      speedPercentage: this.getSpeedPercentage(),
      position: { ...this.position },
      rotation: { ...this.rotation },
      forwardDirection: { ...this.forwardDirection },
      voidEnergy: {
        current: this.voidEnergyCurrent,
        max: this.voidEnergyMax,
        pct: (this.voidEnergyCurrent / this.voidEnergyMax) * 100
      }
    };
  }

  /**
   * Obtiene el cuaternión de orientación actual para sistemas externos (como partículas)
   */
  public getOrientationQuaternion(): quat {
    return quat.clone(this.orientationQuaternion);
  }

  public getOrientationBasis(): OrientationBasis {
    const forward = {
      x: this.orientationMatrix[8],
      y: this.orientationMatrix[9],
      z: this.orientationMatrix[10]
    };
    const right = {
      x: this.orientationMatrix[0],
      y: this.orientationMatrix[1],
      z: this.orientationMatrix[2]
    };
    const up = {
      x: this.orientationMatrix[4],
      y: this.orientationMatrix[5],
      z: this.orientationMatrix[6]
    };
    return { forward, right, up };
  }

  /** Activa/desactiva el suavizado de velocidad para mitigar jitter a alta velocidad */
  public setHighSpeedSmoothing(enabled: boolean): void {
    this.highSpeedSmoothingEnabled = enabled;
    if (!enabled) {
      // Al desactivar, forzar sincronización inmediata para evitar "rebotes"
      this.smoothedVelocity.x = this.forwardDirection.x * this.currentSpeed;
      this.smoothedVelocity.y = this.forwardDirection.y * this.currentSpeed;
      this.smoothedVelocity.z = this.forwardDirection.z * this.currentSpeed;
      this.velocity.x = this.smoothedVelocity.x;
      this.velocity.y = this.smoothedVelocity.y;
      this.velocity.z = this.smoothedVelocity.z;
    }
  }

  /**
   * Calcula el factor de escala del thruster basado en la velocidad
   * A velocidad máxima, el thruster crecerá hasta un 5% más del diámetro del tubo exterior
   */
  private calculateThrusterScale(): number {
    const speedRatio = this.currentSpeed / this.maxSpeed;
    
    // Radio base del thruster: 0.15
    // Radio exterior del tubo: 0.1625
    // A velocidad máxima, queremos que el thruster sea 5% más grande que el tubo exterior
    const baseRadius = 0.15;
    const tubeOuterRadius = 0.1625;
    
    // Visuals must never exceed "100%" scale even if speed temporarily surpasses maxSpeed (e.g. void jump)
    const rawRatio = this.currentSpeed / Math.max(1e-6, this.maxSpeed);
    const ratio = Math.min(1.0, rawRatio); // clamp visual ratio
    // Slight bias so idle thruster isn't too small
    const biased = 0.85 + ratio * 0.15;
    // Preserve prior upper bound semantics but ratio clamp ensures <=1.0 path
    return Math.min(biased, 1.03);
  }

  /**
   * Resetea la nave a su estado inicial
   */
  public reset(): void {
    this.position = { x: 100, y: 100, z: 100 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.currentSpeed = 0;
    this.targetSpeed = 0;
    this.forwardDirection = { x: 0, y: 0, z: 1 };
    
    // Reset controls
    Object.keys(this.controls).forEach(key => {
      (this.controls as any)[key] = false;
    });
  }

  /**
   * Crear geometría para el cono/pirámide de la punta delantera
   */
  createNoseGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Vértice de la punta (frente) - movido más atrás
    vertices.push(0, 0, 1.25); // Era 1.5, ahora 1.25
    
    // Base del cono (círculo) - aplanado en Y y movido atrás
    const segments = 8;
    const radius = 0.4;
    const baseZ = 0.35; // Era 0.5, ahora 0.35
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.7; // Aplanar en Y (profundidad)
      vertices.push(x, y, baseZ);
    }
    
    // Índices para las caras laterales del cono
    for (let i = 0; i < segments; i++) {
      const current = i + 1;
      const next = (i + 1) % segments + 1;
      
      // Triángulo desde la punta a los vértices de la base
      indices.push(0, current, next);
    }
    
    // Base del cono (cerrar por abajo)
    const centerBase = vertices.length / 3;
    vertices.push(0, 0, baseZ); // Centro de la base
    
    for (let i = 0; i < segments; i++) {
      const current = i + 1;
      const next = (i + 1) % segments + 1;
      indices.push(centerBase, next, current);
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para el cuerpo esférico principal
   */
  createBodyGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    const latSegments = 12;
    const lonSegments = 16;
    const radius = 0.6;
    
    // Generar vértices de la esfera
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        const x = cosPhi * sinTheta * radius;
        const y = sinPhi * sinTheta * radius * 0.5; // Aplanar más en Y (50% profundidad)
        const z = cosTheta * radius;
        
        vertices.push(x, y, z);
      }
    }
    
    // Generar índices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const current = lat * (lonSegments + 1) + lon;
        const next = current + lonSegments + 1;
        
        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para las alas laterales
   */
  createWingsGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Dimensiones base
    const wingLength = 1.2;      // Extensión lateral
    const wingWidth = 0.016;     // Profundidad (eje Y)
    const wingThickness = 0.225; // Altura (eje Z local)
    const wingRoot = 0.4;        // Punto donde nace el ala en el fuselaje
    const verticalLiftMax = 0.28; // Altura máxima aplicada al plegar completamente
    const bodyEmbedDepth = 0.18;  // Cuánto se introduce la base del ala en el fuselaje

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const foldProgress = clamp01(this.wingDeploymentProgress);
    const maxFoldAngle = Math.PI * 0.5; // 90° exactos para un plegado vertical
    const foldAngle = foldProgress * maxFoldAngle;
    const lateralCollapse = 1 - 0.6 * Math.pow(foldProgress, 0.85); // Traer las alas al centro al plegar
    const verticalLift = foldProgress * verticalLiftMax; // Elevarlas sobre el fuselaje
    const embedDepth = foldProgress * bodyEmbedDepth; // Inserción progresiva en el fuselaje
    const forwardTuck = foldProgress * 0.08; // Pequeña traslación para que se entrelacen como alas de ave

    const computeEmbedInfluence = (x: number) => {
      const span = wingLength - wingRoot;
      if (span <= 0) {
        return 0;
      }
      const distanceToTip = wingLength - Math.abs(x);
      return clamp01(distanceToTip / span);
    };

    const rotateAroundZAxis = (x: number, y: number, pivotX: number, pivotY: number, angle: number) => {
      const translatedX = x - pivotX;
      const translatedY = y - pivotY;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotatedX = translatedX * cos - translatedY * sin;
      const rotatedY = translatedX * sin + translatedY * cos;
      return { x: rotatedX + pivotX, y: rotatedY + pivotY };
    };

    const transformVertex = (x: number, y: number, z: number, sign: -1 | 1) => {
      const embedInfluence = computeEmbedInfluence(x);
      const collapsedX = x * lateralCollapse;
      const sweptY = y + forwardTuck * sign;
      const rotationAngle = sign * foldAngle;
      const rotated = rotateAroundZAxis(collapsedX, sweptY, 0, 0, rotationAngle);
      const embeddedY = rotated.y + verticalLift - embedDepth * embedInfluence;
      vertices.push(rotated.x, embeddedY, z);
    };

    const pushWing = (sign: -1 | 1) => {
      const baseIndex = vertices.length / 3;
      const xNear = sign * wingRoot;
      const xFar = sign * wingLength;

      const addVertex = (x: number, y: number, z: number) => {
        transformVertex(x, y, z, sign);
      };

      addVertex(xNear, -wingWidth, -wingThickness);
      addVertex(xFar, -wingWidth, -wingThickness);
      addVertex(xNear, -wingWidth,  wingThickness);
      addVertex(xFar, -wingWidth,  wingThickness);
      addVertex(xNear,  wingWidth, -wingThickness);
      addVertex(xFar,  wingWidth, -wingThickness);
      addVertex(xNear,  wingWidth,  wingThickness);
      addVertex(xFar,  wingWidth,  wingThickness);

      const localIndices = [
        0, 2, 3, 0, 3, 1,
        4, 7, 6, 4, 5, 7,
        0, 4, 5, 0, 5, 1,
        2, 7, 6, 2, 3, 7,
        0, 2, 6, 0, 6, 4,
        1, 5, 7, 1, 7, 3,
      ];
      for (const idx of localIndices) {
        indices.push(baseIndex + idx);
      }
    };

    pushWing(-1);
    pushWing(1);
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para la esfera del thruster trasero con escalado dinámico
   */
  createThrusterGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    const latSegments = 8;
    const lonSegments = 12;
    const baseRadius = 0.15;
    const scaledRadius = baseRadius * this.thrusterScaleFactor; // Radio dinámico
    const positionZ = -0.65; // Posición trasera - acercada al cuerpo
    
    // Generar vértices de la esfera del thruster
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        const x = cosPhi * sinTheta * scaledRadius;
        const y = sinPhi * sinTheta * scaledRadius;
        const z = cosTheta * scaledRadius + positionZ;
        
        vertices.push(x, y, z);
      }
    }
    
    // Generar índices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const current = lat * (lonSegments + 1) + lon;
        const next = current + lonSegments + 1;
        
        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Inicializa el quaternion y matriz de orientación como identidad usando gl-matrix
   */
  private initializeOrientationMatrix(): void {
    this.orientationQuaternion = quat.create();
    quat.identity(this.orientationQuaternion);
    this.orientationMatrix = mat4.create();
    mat4.fromQuat(this.orientationMatrix, this.orientationQuaternion);
  }

  /**
   * Crear geometría para la cabina del piloto (esfera azul reflectante)
   */
  createCockpitGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    const latSegments = 8;  // Menos segmentos para la cabina pequeña
    const lonSegments = 12;
    const radius = 0.15; // 40% más pequeña: 0.25 * 0.6 = 0.15
    
    // Posición: Un poquitín más adelante y un pelín más abajo
    const offsetZ = 0.68; // Ligeramente más adelante (era 0.65)
    const offsetY = 0.1; // Un pelín más abajo: era 0.15, ahora 0.1
    
    // Factores de escala para hacer una elipse aplastada por los laterales
    const scaleX = 0.7; // Aplastar en X (laterales)
    const scaleY = 1.0; // Mantener Y normal (altura)
    const scaleZ = 1.0; // Mantener Z normal (profundidad)
    
    // Generar vértices de la cabina elipsoidal (aplastada por los laterales)
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        // Aplicar escalas diferentes para crear elipse aplastada lateralmente
        const x = cosPhi * sinTheta * radius * scaleX; // Aplastado lateralmente
        const y = sinPhi * sinTheta * radius * scaleY + offsetY; // Normal en altura
        const z = cosTheta * radius * scaleZ + offsetZ; // Normal en profundidad
        
        vertices.push(x, y, z);
      }
    }
    
    // Generar índices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const current = lat * (lonSegments + 1) + lon;
        const next = current + lonSegments + 1;
        
        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para el tubo que conecta el cuerpo con el thruster
   */
  createEngineNozzleGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Dimensiones del tubo
    const innerRadius = 0.15;     // Igual al radio del thruster
    const outerRadius = 0.1625;   // Mantiene la misma relación: 0.15 * (0.65/0.6) ≈ 0.1625
    const segments = 16;          // Segmentos para suavidad
    
    // Posiciones Z: desde centro (0) hasta fin del thruster (-0.8)
    const startZ = 0;             // Centro de la nave
    const endZ = -0.8;            // Fin del thruster: -0.65 - 0.15 = -0.8
    
    // Crear vértices del cilindro hueco
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      
      // Vértices en el inicio (z = 0)
      // Círculo interior inicio
      vertices.push(innerRadius * cosA, innerRadius * sinA, startZ);
      // Círculo exterior inicio  
      vertices.push(outerRadius * cosA, outerRadius * sinA, startZ);
      
      // Vértices en el final (z = endZ)
      // Círculo interior final
      vertices.push(innerRadius * cosA, innerRadius * sinA, endZ);
      // Círculo exterior final
      vertices.push(outerRadius * cosA, outerRadius * sinA, endZ);
    }
    
    // Crear índices para las caras del tubo
    for (let i = 0; i < segments; i++) {
      const base = i * 4;
      const next = ((i + 1) % (segments + 1)) * 4;
      
      // Cara exterior del tubo
      indices.push(
        base + 1, base + 3, next + 1,     // Triángulo 1
        next + 1, base + 3, next + 3      // Triángulo 2  
      );
      
      // Cara interior del tubo (orden inverso para normal hacia adentro)
      indices.push(
        base, next, base + 2,             // Triángulo 1
        next, next + 2, base + 2          // Triángulo 2
      );
      
      // Cara frontal (anillo en z = 0)
      indices.push(
        base, base + 1, next,             // Triángulo 1
        next, base + 1, next + 1          // Triángulo 2
      );
      
      // Cara trasera (anillo en z = endZ)  
      indices.push(
        base + 2, next + 2, base + 3,     // Triángulo 1
        next + 2, next + 3, base + 3      // Triángulo 2
      );
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Extrae ángulos de Euler de la matriz de orientación para compatibilidad con el sistema existente
   */
  private extractEulerFromOrientationMatrix(): void {
    // Extraer ángulos de Euler de la matriz de orientación usando gl-matrix
    // Esto mantiene compatibilidad con el resto del sistema que espera rotation.x, .y, .z
    
    // Extraer rotación Y (yaw) - atan2(m[8], m[10])
    this.rotation.y = Math.atan2(this.orientationMatrix[8], this.orientationMatrix[10]);
    
    // Extraer rotación X (pitch) - asin(-m[9])  
    const sy = Math.sqrt(this.orientationMatrix[0] * this.orientationMatrix[0] + this.orientationMatrix[4] * this.orientationMatrix[4]);
    const singular = sy < 1e-6; // Si sy está cerca de 0, tenemos gimbal lock
    
    if (!singular) {
      this.rotation.x = Math.atan2(-this.orientationMatrix[9], sy);
      this.rotation.z = Math.atan2(this.orientationMatrix[4], this.orientationMatrix[0]);
    } else {
      this.rotation.x = Math.atan2(-this.orientationMatrix[6], this.orientationMatrix[5]);
      this.rotation.z = 0;
    }
  }

  /**
   * Ajusta la orientación de la nave para mirar hacia un punto objetivo.
   * Construye una base ortonormal (right, up, forward) y actualiza quaternion/matriz.
   */
  public lookAt(target: Vector3, upHint: Vector3 = { x: 0, y: 1, z: 0 }): void {
    // Dirección deseada (forward Z local)
    const fx = target.x - this.position.x;
    const fy = target.y - this.position.y;
    const fz = target.z - this.position.z;
    let fl = Math.hypot(fx, fy, fz) || 1;
    const fwd = [fx / fl, fy / fl, fz / fl] as [number, number, number];

    // Construir ejes right y up ortogonales usando upHint
    // right = normalize(cross(upHint, fwd))
    let rx = upHint.y * fwd[2] - upHint.z * fwd[1];
    let ry = upHint.z * fwd[0] - upHint.x * fwd[2];
    let rz = upHint.x * fwd[1] - upHint.y * fwd[0];
    let rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-6) {
      // upHint colineal con fwd: usar eje X mundial como fallback
      const alt = { x: 1, y: 0, z: 0 };
      rx = alt.y * fwd[2] - alt.z * fwd[1];
      ry = alt.z * fwd[0] - alt.x * fwd[2];
      rz = alt.x * fwd[1] - alt.y * fwd[0];
      rl = Math.hypot(rx, ry, rz) || 1;
    }
    rx /= rl; ry /= rl; rz /= rl;

    // up = cross(fwd, right)
    const ux = fwd[1] * rz - fwd[2] * ry;
    const uy = fwd[2] * rx - fwd[0] * rz;
    const uz = fwd[0] * ry - fwd[1] * rx;

    // Construir matriz de rotación con columnas (right, up, forward)
    // Coincide con updateModelMatrix() que multiplica orientación antes de escala
    this.orientationMatrix[0] = rx; this.orientationMatrix[1] = ry; this.orientationMatrix[2] = rz; this.orientationMatrix[3] = 0;
    this.orientationMatrix[4] = ux; this.orientationMatrix[5] = uy; this.orientationMatrix[6] = uz; this.orientationMatrix[7] = 0;
    this.orientationMatrix[8] = fwd[0]; this.orientationMatrix[9] = fwd[1]; this.orientationMatrix[10] = fwd[2]; this.orientationMatrix[11] = 0;
    this.orientationMatrix[12] = 0; this.orientationMatrix[13] = 0; this.orientationMatrix[14] = 0; this.orientationMatrix[15] = 1;

    // Extraer quaternion desde la matriz y sincronizar Euler para compatibilidad
    mat4.getRotation(this.orientationQuaternion, this.orientationMatrix);
    this.extractEulerFromOrientationMatrix();
    this.updateForwardDirection();
  }

  /** Apply a serialized orientation snapshot captured from Respawn Sigillum. */
  public applyOrientationSnapshot(snapshot?: OrientationSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    let applied = false;

    if (Array.isArray(snapshot.matrix) && snapshot.matrix.length >= 16) {
      for (let i = 0; i < 16; i++) {
        this.orientationMatrix[i] = snapshot.matrix[i];
      }
      mat4.getRotation(this.orientationQuaternion, this.orientationMatrix);
      applied = true;
    } else if (Array.isArray(snapshot.quaternion) && snapshot.quaternion.length >= 4) {
      quat.set(
        this.orientationQuaternion,
        snapshot.quaternion[0] ?? 0,
        snapshot.quaternion[1] ?? 0,
        snapshot.quaternion[2] ?? 0,
        snapshot.quaternion[3] ?? 1
      );
      quat.normalize(this.orientationQuaternion, this.orientationQuaternion);
      mat4.fromQuat(this.orientationMatrix, this.orientationQuaternion);
      applied = true;
    } else if (snapshot.forward) {
      const upHint = snapshot.up ?? { x: 0, y: 1, z: 0 };
      const next = {
        x: this.position.x + snapshot.forward.x,
        y: this.position.y + snapshot.forward.y,
        z: this.position.z + snapshot.forward.z
      };
      this.lookAt(next, upHint);
      applied = true;
    }

    if (applied) {
      this.extractEulerFromOrientationMatrix();
      this.updateForwardDirection();
    }
  }
}