import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';
import { mat4, vec3, quat } from 'gl-matrix';

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
  public maxSpeed: number = 5.0;
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

  // Energía del vacío (sistema hipotético)
  public voidConversionPower: number = 0.05; // 5% de conversión de masa → energía
  public voidEnergyMax: number = 100; // capacidad máxima
  public voidEnergyCurrent: number = 100; // inicia llena (100%)
  public voidEnergyConsumptionPerUnit: number = 0.01; // consumo por unidad recorrida
  private lastPositionForEnergy: Vector3 | null = null; // track recorrido
  
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

  constructor(position: Vector3 = { x: 0, y: 0, z: 0 }) {
    super('player-ship', position);
    this.color = { r: 0.7, g: 0.75, b: 0.8, a: 1.0 }; // Color metálico plateado base

    // Salud inicial de la nave (podrá equilibrarse luego)
    this.healthMax = 540; // valor de referencia mencionado
    this.healthCurrent = this.healthMax;
    
    // Inicializar matriz de orientación como identidad
    this.initializeOrientationMatrix();
    
    console.log('🚀 Spaceship created with geometry:', {
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
    // Calcular velocidad de rotación basada en la velocidad actual
    const speedFactor = this.currentSpeed / this.maxSpeed;
    const rotationMultiplier = 1.0 - (speedFactor * 0.58); // Reduce a 42% a velocidad máxima
    const currentRotationSpeed = this.rotationSpeed * rotationMultiplier;
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
    if (this.controls.speedUp) {
      this.targetSpeed = Math.min(this.targetSpeed + this.acceleration * deltaTime, this.maxSpeed);
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

  /**
   * Actualiza el movimiento de la nave
   */
  private updateMovement(deltaTime: number): void {
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

    // Aplicar velocidad en la dirección hacia adelante
    this.velocity.x = this.forwardDirection.x * this.currentSpeed;
    this.velocity.y = this.forwardDirection.y * this.currentSpeed;
    this.velocity.z = this.forwardDirection.z * this.currentSpeed;
  }

  /**
   * Actualiza la energía del vacío consumida por distancia recorrida
   */
  private updateVoidEnergy(deltaTime: number): void {
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
      const energySpent = distance * this.voidEnergyConsumptionPerUnit;
      this.voidEnergyCurrent = Math.max(0, Math.min(this.voidEnergyMax, this.voidEnergyCurrent - energySpent));
      this.lastPositionForEnergy = { ...pos };
    }
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
    const maxRadius = tubeOuterRadius * 1.05; // 5% más grande que el tubo
    
    // Calcular el factor de escala: de 1.0 (velocidad 0) a maxRadius/baseRadius (velocidad máxima)
    const maxScaleFactor = maxRadius / baseRadius;
    
    return 1.0 + (maxScaleFactor - 1.0) * speedRatio;
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
    
    // Dimensiones de las alas CORREGIDAS - intercambiando los valores
    const wingLength = 1.2;              // Longitud lateral (sin cambio)
    const wingWidth = 0.016;             // Ancho atrás-adelante: quinta parte (más estrechas)
    const wingThickness = 0.225;         // Grosor arriba-abajo: 1.5x (más altas)
    const wingRoot = 0.4;                // Conexión con cuerpo (sin cambio)
    
    // CREAR AMBAS ALAS CON WINDING ORDER CONSISTENTE
    // Cada ala como cubo independiente con coordenadas explícitas
    
    // ==================== ALA IZQUIERDA ====================
    // 8 vértices del cubo ala izquierda
    vertices.push(
      // Vértices 0-7 (ala izquierda)
      -wingRoot,   -wingWidth, -wingThickness,  // 0: cerca-frontal-abajo
      -wingLength, -wingWidth, -wingThickness,  // 1: lejos-frontal-abajo  
      -wingRoot,   -wingWidth,  wingThickness,  // 2: cerca-frontal-arriba
      -wingLength, -wingWidth,  wingThickness,  // 3: lejos-frontal-arriba
      -wingRoot,    wingWidth, -wingThickness,  // 4: cerca-trasero-abajo
      -wingLength,  wingWidth, -wingThickness,  // 5: lejos-trasero-abajo
      -wingRoot,    wingWidth,  wingThickness,  // 6: cerca-trasero-arriba
      -wingLength,  wingWidth,  wingThickness   // 7: lejos-trasero-arriba
    );
    
    // Índices ala izquierda - CORREGIDO para que coincida con la derecha
    indices.push(
      // Cara frontal (frente de la nave, -Y)
      0, 3, 2,  0, 1, 3,
      // Cara trasera (atrás de la nave, +Y)  
      4, 6, 7,  4, 7, 5,
      // Cara inferior (-Z)
      0, 4, 5,  0, 5, 1,
      // Cara superior (+Z)
      2, 7, 6,  2, 3, 7,
      // Cara interna (hacia cuerpo, +X)
      0, 2, 6,  0, 6, 4,
      // Cara externa (punta ala, -X)
      1, 5, 7,  1, 7, 3
    );
    
    // ==================== ALA DERECHA ====================  
    const rightStartIndex = 8; // Empezamos desde vértice 8
    
    // 8 vértices del cubo ala derecha
    vertices.push(
      // Vértices 8-15 (ala derecha)
      wingRoot,   -wingWidth, -wingThickness,   // 8:  cerca-frontal-abajo
      wingLength, -wingWidth, -wingThickness,   // 9:  lejos-frontal-abajo
      wingRoot,   -wingWidth,  wingThickness,   // 10: cerca-frontal-arriba  
      wingLength, -wingWidth,  wingThickness,   // 11: lejos-frontal-arriba
      wingRoot,    wingWidth, -wingThickness,   // 12: cerca-trasero-abajo
      wingLength,  wingWidth, -wingThickness,   // 13: lejos-trasero-abajo
      wingRoot,    wingWidth,  wingThickness,   // 14: cerca-trasero-arriba
      wingLength,  wingWidth,  wingThickness    // 15: lejos-trasero-arriba
    );
    
    // Índices ala derecha - mismo patrón pero con índices 8-15
    indices.push(
      // Cara frontal (frente de la nave, -Y)
      8, 10, 11,  8, 11, 9,
      // Cara trasera (atrás de la nave, +Y)
      12, 13, 15,  12, 15, 14,
      // Cara inferior (-Z)  
      8, 9, 13,  8, 13, 12,
      // Cara superior (+Z)
      10, 14, 15,  10, 15, 11,
      // Cara interna (hacia cuerpo, -X)
      8, 12, 14,  8, 14, 10,
      // Cara externa (punta ala, +X)
      9, 11, 15,  9, 15, 13
    );
    
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
}