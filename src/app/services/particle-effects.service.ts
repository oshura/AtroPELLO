import { Injectable } from '@angular/core';
import { WebGLService } from './webgl.service';
import { ShaderManager } from '../game/ShaderManager';
import { Spaceship } from '../game/Spaceship';
import { Camera } from '../game/Camera';
import { vec3, quat } from 'gl-matrix';

export interface ParticleEffect {
  position: { x: number; y: number; z: number };
  size: number;
  intensity: number;
  color: { r: number; g: number; b: number };
  life: number; // 0.0 to 1.0
}

/**
 * Servicio para manejar efectos de partículas del juego
 */
@Injectable({
  providedIn: 'root'
})
export class ParticleEffectsService {
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  
  // Buffers para partículas
  private particleVertexBuffer: WebGLBuffer | null = null;
  private particleColorBuffer: WebGLBuffer | null = null;
  
  // Efectos activos
  private thrusterParticles: ParticleEffect[] = [];
  // Permitir un poco más de partículas por mayor dispersión, manteniendo el throttle a 30 Hz
  private maxThrusterParticles = 10;
  // Parámetros de emisión del thruster (radio de la boquilla y jitter de profundidad, en unidades del mundo)
  private thrusterEmissionRadius = 0.22; // antes parecía puntiforme; ampliar a cubrir toda la "bola" del thruster
  private thrusterDepthJitter = 0.18;    // pequeña variación hacia atrás (-Z local)
  // Throttle: update thruster effect at ~30 Hz
  private thrusterAccum: number = 0;
  private readonly thrusterStep: number = 1 / 30;

  // Ambient space dust around the ship for speed sensation
  private ambientDust: Array<{ position: {x:number;y:number;z:number}; size: number; brightness: number } > = [];
  private ambientInitialized = false;
  private ambientCount = 380; // densidad
  private ambientNear = 6;    // un pelín más lejos al aumentar tamaño
  private ambientFar = 160;   // distancia máxima delante
  private ambientSideX = 90;  // dispersión lateral
  private ambientSideY = 60;  // dispersión vertical
  private ambientBaseDrift = 0; // sin deriva base: quieto en reposo

  constructor(private webglService: WebGLService) {}

  /**
   * Inicializa el servicio con contextos WebGL y shader
   */
  public initialize(shaderManager: ShaderManager): boolean {
    this.gl = this.webglService.getContext() as WebGL2RenderingContext;
    this.shaderManager = shaderManager;
    
    if (!this.gl || !this.shaderManager) {
      console.error('❌ ParticleEffectsService: Failed to initialize - missing WebGL or ShaderManager');
      return false;
    }

    this.createParticleBuffers();
    // Ambient dust will be seeded on first update when we have ship pose
    this.ambientInitialized = false;
    console.log('✅ ParticleEffectsService initialized');
    return true;
  }

  /**
   * Crea los buffers base para las partículas
   */
  private createParticleBuffers(): void {
    if (!this.gl) return;

    // Crear geometría de quad para partícula
    const vertices = new Float32Array([
      // Triángulo 1
      -0.1, -0.1, 0.0,  // Inferior izquierda
       0.1, -0.1, 0.0,  // Inferior derecha
      -0.1,  0.1, 0.0,  // Superior izquierda
      // Triángulo 2
       0.1, -0.1, 0.0,  // Inferior derecha
       0.1,  0.1, 0.0,  // Superior derecha
      -0.1,  0.1, 0.0   // Superior izquierda
    ]);

    this.particleVertexBuffer = this.gl.createBuffer();
    if (this.particleVertexBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleVertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    }
  }

  /**
   * Actualiza el efecto de propulsión de la nave
   */
  public updateThrusterEffect(spaceship: Spaceship, deltaTime: number): void {
    if (!spaceship) return;

    this.thrusterAccum += deltaTime;
    // Procesar en pasos fijos (30 Hz). Si el delta es grande, procesar varios pasos.
    while (this.thrusterAccum >= this.thrusterStep) {
      const step = this.thrusterStep;
      this.thrusterAccum -= step;

      // Calcular intensidad del propulsor
      const isAccelerating = spaceship.controls.speedUp || spaceship.currentSpeed > 0.1;
      const speedRatio = spaceship.currentSpeed / spaceship.maxSpeed;
      const accelerationBonus = spaceship.controls.speedUp ? 0.4 : 0.0;
      let thrusterIntensity = Math.max(0.0, (speedRatio + accelerationBonus));
      if (isAccelerating && thrusterIntensity < 0.3) {
        thrusterIntensity = 0.3;
      }

      // Limpiar partículas viejas
      this.thrusterParticles = this.thrusterParticles.filter(particle => particle.life > 0.0);

      // Crear nuevas partículas si hay propulsión
      if (thrusterIntensity > 0.0) {
        this.generateThrusterParticles(spaceship, thrusterIntensity, step);
      }

      // Actualizar partículas existentes
      this.thrusterParticles.forEach(particle => {
        particle.life -= step * 3.0; // Las partículas duran ~0.33 segundos
        particle.size *= 0.99; // Se encogen ligeramente
        const fadeMultiplier = Math.max(0.0, particle.life);
        particle.color.r *= fadeMultiplier;
        particle.color.g *= fadeMultiplier;
        particle.color.b *= fadeMultiplier;
      });
    }
  }

  /**
   * Mantiene partículas ambientales alrededor de la nave para dar sensación de velocidad.
   */
  public updateAmbientDust(spaceship: Spaceship, deltaTime: number): void {
    if (!this.ambientInitialized) {
      this.seedAmbientDustAroundShip(spaceship);
      this.ambientInitialized = true;
    }
    // Eje forward y posición de la nave
    const fwd = spaceship.forwardDirection;
    const pos = spaceship.position;
    // Nota: las partículas ambientales son estáticas en el espacio. No aplicamos jitter ni drift.
    // Sólo reciclamos las que quedan demasiado atrás o demasiado lejos.
    for (let i = 0; i < this.ambientDust.length; i++) {
      const d = this.ambientDust[i];
      const dx = d.position.x - pos.x;
      const dy = d.position.y - pos.y;
      const dz = d.position.z - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const forwardDot = this.dot({ x: dx, y: dy, z: dz }, fwd);
      // Si está muy lejos en general, o claramente detrás más allá de umbral, reubicar delante
      if (dist > this.ambientFar * 1.6 || forwardDot < -this.ambientFar * 0.5) {
        this.respawnAmbientParticleAhead(d, spaceship);
      }
    }
  }

  /**
   * Genera nuevas partículas de propulsión
   */
  private generateThrusterParticles(spaceship: Spaceship, intensity: number, deltaTime: number): void {
    // Limitar número de partículas
    if (this.thrusterParticles.length >= this.maxThrusterParticles) return;

    // Generar 1-3 partículas por paso según intensidad
    const particlesToCreate = intensity > 0.8 ? 3 : (intensity > 0.4 ? 2 : 1);

    for (let i = 0; i < particlesToCreate; i++) {
      // Muestrear dentro de un disco en el plano XY local del thruster y transformar a mundo
      const worldPos = this.sampleThrusterEmission(spaceship);

      const particle: ParticleEffect = {
        position: worldPos,
        // Aumentar tamaño base y escala con intensidad para que se noten más grandes
        size: 0.12 + intensity * 0.18,
        intensity: intensity,
        color: this.getThrusterColor(intensity, Math.random()),
        life: 1.0 // Vida completa al nacer
      };

      this.thrusterParticles.push(particle);
    }
  }

  /**
   * Muestras una posición de emisión en la "boquilla" del thruster como un disco orientado por la nave.
   * El plano del disco es el XY local; se añade un pequeño jitter en -Z local para profundidad.
   */
  private sampleThrusterEmission(spaceship: Spaceship): { x: number; y: number; z: number } {
    // Centro local del thruster relativo al centro de la nave
    const localCenter = vec3.fromValues(0, -0.05, -0.8);

    // Muestreo uniforme en un disco: r = R * sqrt(u), theta = 2*pi*v
    const u = Math.random();
    const v = Math.random();
    const r = this.thrusterEmissionRadius * Math.sqrt(u);
    const theta = 2 * Math.PI * v;
    const dx = r * Math.cos(theta);
    const dy = r * Math.sin(theta);
    const dz = -this.thrusterDepthJitter * Math.random(); // hacia atrás del thruster

    const localPos = vec3.fromValues(localCenter[0] + dx, localCenter[1] + dy, localCenter[2] + dz);

    // Rotar a espacio mundo con el cuaternión de la nave y trasladar
    const q = spaceship.getOrientationQuaternion();
    const worldOffset = vec3.create();
    vec3.transformQuat(worldOffset, localPos, q);

    return {
      x: spaceship.position.x + worldOffset[0],
      y: spaceship.position.y + worldOffset[1],
      z: spaceship.position.z + worldOffset[2]
    };
  }

  /**
   * Calcula la posición detrás de la nave para el propulsor usando cuaterniones
   */
  private calculateThrusterPosition(spaceship: Spaceship): { x: number; y: number; z: number } {
    // Offset local del propulsor (posición relativa al centro de la nave)
    const localThrusterOffset = vec3.fromValues(0, -0.05, -0.8); // Más cerca de la nave
    
    // Obtener el cuaternión de orientación de la nave
    const spaceshipQuaternion = spaceship.getOrientationQuaternion();
    
    // Rotar el offset usando el cuaternión de orientación de la nave
    const rotatedOffset = vec3.create();
    vec3.transformQuat(rotatedOffset, localThrusterOffset, spaceshipQuaternion);
    
    return {
      x: spaceship.position.x + rotatedOffset[0],
      y: spaceship.position.y + rotatedOffset[1],
      z: spaceship.position.z + rotatedOffset[2]
    };
  }

  /**
   * Obtiene el color del propulsor - amarillo intenso como solicitado
   */
  private getThrusterColor(intensity: number, randomFactor: number): { r: number; g: number; b: number } {
    // Colores amarillos intensos: naranja-amarillo -> amarillo brillante -> blanco-amarillo
    const baseColor = { r: 1.0, g: 0.8, b: 0.2 };    // Amarillo-naranja intenso
    const brightColor = { r: 1.0, g: 1.0, b: 0.4 };  // Amarillo brillante
    
    // Interpolar entre base y brillante basado en intensidad con variación aleatoria
    const t = Math.min(1.0, intensity * 0.8 + randomFactor * 0.4);
    
    return {
      r: baseColor.r + (brightColor.r - baseColor.r) * t,
      g: baseColor.g + (brightColor.g - baseColor.g) * t,
      b: baseColor.b + (brightColor.b - baseColor.b) * t
    };
  }

  /**
   * Renderiza todos los efectos de partículas
   */
  public render(camera: Camera): void {
    if (!this.gl || !this.shaderManager) {
      return;
    }

    // Usar programa básico para partículas
    this.shaderManager.useBasicProgram();
    
    // Habilitar blending para efecto brillante
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE); // Additive blending
    
    // Mantener depth test habilitado para oclusión correcta, pero deshabilitar escritura en depth buffer
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(false); // No escribir en depth buffer para permitir transparencias

    // Renderizar polvo ambiental (si existe)
    if (this.ambientDust.length) {
      for (const d of this.ambientDust) {
        this.renderAmbientDustParticle(d, camera);
      }
    }

    // Renderizar partículas del thruster
    if (this.thrusterParticles.length) {
      this.thrusterParticles.forEach(particle => {
        this.renderParticle(particle, camera);
      });
    }

    // Restaurar estados de OpenGL
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(true); // Restaurar escritura en depth buffer
    this.gl.disable(this.gl.BLEND);
  }

  /**
   * Renderiza una partícula individual
   */
  private renderParticle(particle: ParticleEffect, camera: Camera): void {
    if (!this.gl || !this.shaderManager || !this.particleVertexBuffer) return;

    const gl = this.gl;

    // Crear colores para los vértices (más brillante en el centro)
    const centerBrightness = particle.intensity * particle.life;
    const edgeBrightness = centerBrightness * 0.3;
    
    const colors = new Float32Array([
      // Triángulo 1
      particle.color.r * edgeBrightness, particle.color.g * edgeBrightness, particle.color.b * edgeBrightness,
      particle.color.r * edgeBrightness, particle.color.g * edgeBrightness, particle.color.b * edgeBrightness,
      particle.color.r * centerBrightness, particle.color.g * centerBrightness, particle.color.b * centerBrightness,
      // Triángulo 2
      particle.color.r * edgeBrightness, particle.color.g * edgeBrightness, particle.color.b * edgeBrightness,
      particle.color.r * centerBrightness, particle.color.g * centerBrightness, particle.color.b * centerBrightness,
      particle.color.r * centerBrightness, particle.color.g * centerBrightness, particle.color.b * centerBrightness
    ]);

    // Actualizar buffer de colores
    if (!this.particleColorBuffer) {
      this.particleColorBuffer = gl.createBuffer();
    }
    
    if (this.particleColorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    }

    // Configurar atributos
    const program = this.shaderManager.basicProgram;
    if (!program) return;

    const positionLocation = this.shaderManager.basicAttributes['position'];
    const colorLocation = this.shaderManager.basicAttributes['color'];

    // Configurar posición
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    // Configurar color
    if (this.particleColorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    }

    // Crear matriz de transformación
    const modelMatrix = new Float32Array(16);
    this.createIdentityMatrix(modelMatrix);
    this.translateMatrix(modelMatrix, particle.position.x, particle.position.y, particle.position.z);
    this.scaleMatrix(modelMatrix, particle.size, particle.size, particle.size);

    // Configurar matrices en shader
    this.shaderManager.setBasicMatrices(
      modelMatrix,
      camera.viewMatrix,
      camera.projectionMatrix
    );

    // Dibujar partícula
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Limpiar atributos
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(colorLocation);
  }

  /** Crea el polvo ambiental alrededor de la nave en la primera actualización */
  private seedAmbientDustAroundShip(spaceship: Spaceship): void {
    this.ambientDust = [];
    for (let i = 0; i < this.ambientCount; i++) {
      const d = { position: { x: 0, y: 0, z: 0 }, size: 0.28 + Math.random()*0.22, brightness: 0.05 + Math.random()*0.12 };
      this.respawnAmbientParticleAhead(d, spaceship);
      this.ambientDust.push(d);
    }
  }

  private renderAmbientDustParticle(d: { position: {x:number;y:number;z:number}; size:number; brightness:number }, camera: Camera): void {
    if (!this.gl || !this.shaderManager || !this.particleVertexBuffer) return;
    const gl = this.gl;
    // Colores blancos fríos suaves (ligeramente más brillantes)
    const b = d.brightness;
    const c = new Float32Array([
      b, b, b,
      b, b, b,
      b*1.4, b*1.4, b*1.4,
      b, b, b,
      b*1.4, b*1.4, b*1.4,
      b*1.4, b*1.4, b*1.4,
    ]);
    if (!this.particleColorBuffer) {
      this.particleColorBuffer = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, c, gl.DYNAMIC_DRAW);

    const program = this.shaderManager.basicProgram!;
    const positionLocation = this.shaderManager.basicAttributes['position'];
    const colorLocation = this.shaderManager.basicAttributes['color'];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

    // Construir un billboard que mire a cámara: columnas = right, up, forward
    const modelMatrix = new Float32Array(16);
    this.createIdentityMatrix(modelMatrix);
    // Calcular basis desde cámara
    const camPos = camera.position;
    const fwd = this.normalize({ x: camera.target.x - camPos.x, y: camera.target.y - camPos.y, z: camera.target.z - camPos.z });
    const worldUp = camera.up;
    const right = this.normalize({ x: fwd.y * worldUp.z - fwd.z * worldUp.y, y: fwd.z * worldUp.x - fwd.x * worldUp.z, z: fwd.x * worldUp.y - fwd.y * worldUp.x });
    const up = this.normalize({ x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x });
    const s = d.size;
    // Asignar base escalada a la matriz (3x3 rotación-escalado)
    modelMatrix[0] = right.x * s; modelMatrix[1] = right.y * s; modelMatrix[2] = right.z * s;
    modelMatrix[4] = up.x * s;    modelMatrix[5] = up.y * s;    modelMatrix[6] = up.z * s;
    modelMatrix[8] = -fwd.x * s;  modelMatrix[9] = -fwd.y * s;  modelMatrix[10] = -fwd.z * s;
    // Traslación
    modelMatrix[12] = d.position.x; modelMatrix[13] = d.position.y; modelMatrix[14] = d.position.z;
    this.shaderManager.setBasicMatrices(modelMatrix, camera.viewMatrix, camera.projectionMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(colorLocation);
  }

  private respawnAmbientParticleAhead(d: { position: {x:number;y:number;z:number}; size:number; brightness:number }, spaceship: Spaceship): void {
    const fwd = spaceship.forwardDirection;
    const pos = spaceship.position;
    const dist = this.ambientNear + Math.random() * (this.ambientFar - this.ambientNear);
    const sideX = (Math.random() * 2 - 1) * this.ambientSideX;
    const sideY = (Math.random() * 2 - 1) * this.ambientSideY;
    // Construir base delante del ship: pos + fwd*dist + pequeños desplazamientos laterales en un marco aproximado
    // Aproximamos el lateral como algún vector perpendicular fijo (no perfecto), suficiente visualmente
    const up = { x: 0, y: 1, z: 0 };
    const right = this.cross(fwd, up);
    d.position.x = pos.x + fwd.x * dist + right.x * sideX + up.x * sideY;
    d.position.y = pos.y + fwd.y * dist + right.y * sideX + up.y * sideY;
    d.position.z = pos.z + fwd.z * dist + right.z * sideX + up.z * sideY;
    d.size = 0.28 + Math.random()*0.22; // más grande para que se note
    d.brightness = 0.12 + Math.random()*0.18;
  }

  private dot(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): number { return a.x*b.x + a.y*b.y + a.z*b.z; }
  private cross(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): {x:number;y:number;z:number} { return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x }; }
  private normalize(v: {x:number;y:number;z:number}): {x:number;y:number;z:number} { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x/l, y: v.y/l, z: v.z/l }; }

  /**
   * Crea matriz identidad
   */
  private createIdentityMatrix(matrix: Float32Array): void {
    matrix.fill(0);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  }

  /**
   * Aplica traslación a matriz
   */
  private translateMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[12] += x;
    matrix[13] += y;
    matrix[14] += z;
  }

  /**
   * Aplica escala a matriz
   */
  private scaleMatrix(matrix: Float32Array, sx: number, sy: number, sz: number): void {
    matrix[0] *= sx;
    matrix[5] *= sy;
    matrix[10] *= sz;
  }

  /**
   * Obtiene el número de partículas activas
   */
  public getActiveParticleCount(): number {
    return this.thrusterParticles.length;
  }

  /**
   * Limpia todos los efectos
   */
  public cleanup(): void {
    if (this.gl) {
      if (this.particleVertexBuffer) {
        this.gl.deleteBuffer(this.particleVertexBuffer);
        this.particleVertexBuffer = null;
      }
      if (this.particleColorBuffer) {
        this.gl.deleteBuffer(this.particleColorBuffer);
        this.particleColorBuffer = null;
      }
    }
    
    this.thrusterParticles = [];
    this.gl = null;
    this.shaderManager = null;
    
    console.log('🧹 ParticleEffectsService cleaned up');
  }
}