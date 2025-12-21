import { Injectable } from '@angular/core';
import { WebGLService } from './webgl.service';
import { ShaderManager } from '../game/ShaderManager';
import { Spaceship } from '../game/game-objects/Spaceship';
import { Camera } from '../game/Camera';
import { vec3 } from 'gl-matrix';
import { LoggingService, LogCategory, LogLevel } from './logging.service';
import { Vector3 } from '../types/game.types';
import { PrecipitationType } from '../game/atmosphere/AtmosphereWeatherService';

export interface ParticleEffect {
  position: { x: number; y: number; z: number };
  size: number;
  intensity: number;
  color: { r: number; g: number; b: number };
  life: number; // 0.0 to 1.0
}

export interface DebrisParticle {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  size: number;
  brightness: number;
  life: number; // 0.0 to 1.0, decays over time
  maxLife: number; // tiempo inicial de vida
}

interface WeatherParticle {
  position: Vector3;
  velocity: Vector3;
  size: number;
  color: { r: number; g: number; b: number };
  life: number;
  maxLife: number;
}

export interface WeatherPrecipitationConfig {
  type: PrecipitationType;
  intensity: number;
  driftVector: Vector3;
  upVector: Vector3;
  forwardVector: Vector3;
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

  // Destruction debris particles (explosion remnants)
  private destructionDebris: DebrisParticle[] = [];
  private maxDebrisParticles = 500; // límite para rendimiento

  // Weather precipitation particles (rain/dust sheets)
  private weatherParticles: WeatherParticle[] = [];
  private weatherParticleAccum: number = 0;
  private readonly maxWeatherParticles = 160;

  constructor(private webglService: WebGLService, private logger: LoggingService) {}

  /**
   * Inicializa el servicio con contextos WebGL y shader
   */
  public initialize(shaderManager: ShaderManager): boolean {
    this.gl = this.webglService.getContext() as WebGL2RenderingContext;
    this.shaderManager = shaderManager;
    
    if (!this.gl || !this.shaderManager) {
      this.logger.log(LogLevel.ERROR, LogCategory.PARTICLES, 'ParticleEffectsService: Failed to initialize - missing WebGL or ShaderManager');
      return false;
    }

    this.createParticleBuffers();
    // Ambient dust will be seeded on first update when we have ship pose
    this.ambientInitialized = false;
    this.logger.log(LogLevel.INFO, LogCategory.PARTICLES, 'ParticleEffectsService initialized');
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
  const speedRatioRaw = spaceship.currentSpeed / Math.max(1e-6, spaceship.maxSpeed);
  // Clamp visual thruster ratio to 1.0 ALWAYS (void jump may exceed maxSpeed but visuals must not)
  const speedRatio = Math.min(1.0, speedRatioRaw);
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
   * Actualiza las partículas de debris de destrucción
   * Se eliminan cuando su vida llega a 0 o cuando se alejan demasiado de la cámara
   */
  public updateDestructionDebris(camera: Camera, deltaTime: number): void {
    if (!camera) return;
    
    const cameraPos = camera.position;
    const maxDistance = 200; // Distancia máxima antes de eliminar (similar a ambientFar)
    
    // Limpiar debris sin vida o demasiado lejos
    this.destructionDebris = this.destructionDebris.filter(d => {
      if (d.life <= 0) return false;
      
      // Calcular distancia a la cámara
      const dx = d.position.x - cameraPos.x;
      const dy = d.position.y - cameraPos.y;
      const dz = d.position.z - cameraPos.z;
      const distance = Math.hypot(dx, dy, dz);
      
      return distance <= maxDistance;
    });
    
    // Actualizar cada partícula de debris
    this.destructionDebris.forEach(debris => {
      // Mover según velocidad
      debris.position.x += debris.velocity.x * deltaTime;
      debris.position.y += debris.velocity.y * deltaTime;
      debris.position.z += debris.velocity.z * deltaTime;
      
      // Aplicar fricción espacial leve (desaceleración gradual)
      const friction = 0.92;
      debris.velocity.x *= friction;
      debris.velocity.y *= friction;
      debris.velocity.z *= friction;
      
      // Decrementar vida basado en maxLife
      debris.life -= deltaTime / debris.maxLife;
      debris.life = Math.max(0, debris.life);
      
      // Fade out: reducir brillo según vida restante
      debris.brightness *= (0.98 + 0.02 * debris.life);
    });
  }

  /**
   * Crea partículas de debris cuando un objeto se destruye
   * @param position Posición del objeto destruido
   * @param size Tamaño aproximado del objeto (para calcular cantidad de partículas)
   * @param color Color del debris (basado en tipo de objeto)
   */
  public createDestructionDebris(
    position: { x: number; y: number; z: number },
    size: number,
    color?: { r: number; g: number; b: number }
  ): void {
    // Calcular cantidad de partículas basado en tamaño del objeto (min 10, max 40)
    const particleCount = Math.min(40, Math.max(10, Math.floor(size * 20)));
    
    // Color por defecto: gris-naranja (asteroides/rocas)
    const debrisColor = color || { r: 0.7, g: 0.5, b: 0.3 };
    
    for (let i = 0; i < particleCount; i++) {
      // Limitar número total de partículas
      if (this.destructionDebris.length >= this.maxDebrisParticles) break;
      
      // Velocidad inicial aleatoria en todas direcciones (explosión)
      const speed = 2 + Math.random() * 8; // velocidad entre 2 y 10
      const theta = Math.random() * Math.PI * 2; // ángulo horizontal
      const phi = Math.random() * Math.PI; // ángulo vertical
      
      const vx = speed * Math.sin(phi) * Math.cos(theta);
      const vy = speed * Math.sin(phi) * Math.sin(theta);
      const vz = speed * Math.cos(phi);
      
      // Tiempo de vida: 2-5 segundos
      const maxLife = 2 + Math.random() * 3;
      
      const debris: DebrisParticle = {
        position: {
          x: position.x + (Math.random() - 0.5) * size * 0.5, // pequeña dispersión inicial
          y: position.y + (Math.random() - 0.5) * size * 0.5,
          z: position.z + (Math.random() - 0.5) * size * 0.5
        },
        velocity: { x: vx, y: vy, z: vz },
        size: 0.15 + Math.random() * 0.25, // tamaño entre 0.15 y 0.4
        brightness: 0.4 + Math.random() * 0.4,
        life: 1.0,
        maxLife: maxLife
      };
      
      this.destructionDebris.push(debris);
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
   * Weather precipitation (rain/dust) particles that streak across the canopy.
   */
  public updateWeatherPrecipitation(
    spaceship: Spaceship,
    deltaTime: number,
    config: WeatherPrecipitationConfig | null,
  ): void {
    if (!spaceship) {
      return;
    }
    const drift = config?.driftVector ?? { x: 0, y: 0, z: 0 };
    const normalizedUp = config?.upVector ? this.normalize(config.upVector) : { x: 0, y: 1, z: 0 };
    const gravityDir = { x: -normalizedUp.x, y: -normalizedUp.y, z: -normalizedUp.z };
    const gravity = config?.type === 'rain' ? 26 : 9;

    // Update existing particles
    const updated: WeatherParticle[] = [];
    for (const particle of this.weatherParticles) {
      particle.position.x += (particle.velocity.x + drift.x) * deltaTime;
      particle.position.y += (particle.velocity.y + drift.y) * deltaTime;
      particle.position.z += (particle.velocity.z + drift.z) * deltaTime;
      particle.velocity.x += gravityDir.x * gravity * deltaTime;
      particle.velocity.y += gravityDir.y * gravity * deltaTime;
      particle.velocity.z += gravityDir.z * gravity * deltaTime;
      particle.life -= deltaTime;
      if (particle.life > 0) {
        updated.push(particle);
      }
    }
    this.weatherParticles = updated;

    if (!config || config.type === 'none' || config.intensity <= 0) {
      this.weatherParticleAccum = 0;
      return;
    }

    const spawnRate = config.type === 'rain' ? 95 : 60;
    this.weatherParticleAccum += spawnRate * Math.max(0.05, config.intensity) * deltaTime;
    const basis = this.computeShipBasis(spaceship, config);

    while (this.weatherParticleAccum >= 1 && this.weatherParticles.length < this.maxWeatherParticles) {
      this.spawnWeatherParticle(spaceship, config, basis);
      this.weatherParticleAccum -= 1;
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
        // Tamaño ligeramente reducido en el máximo para un look menos invasivo
        // Antes: 0.12 + intensity * 0.18 (máx ≈ 0.30). Ahora reducimos el factor de escala.
  // Clamp size growth strictly to what intensity within [0..1] allows (never exceed base 100%)
  size: 0.12 + Math.min(1.0, intensity) * 0.12,
        intensity: intensity,
        color: this.getThrusterColor(intensity, Math.random()),
        life: 1.0 // Vida completa al nacer
      };

      this.thrusterParticles.push(particle);
    }
  }

  private spawnWeatherParticle(
    spaceship: Spaceship,
    config: WeatherPrecipitationConfig,
    basis: { forward: Vector3; right: Vector3; up: Vector3 },
  ): void {
    const upLift = config.type === 'rain' ? 5 + Math.random() * 2 : 2 + Math.random() * 1.5;
    const forwardOffset = config.type === 'rain' ? 4 + Math.random() * 4 : 2 + Math.random() * 6;
    const lateralOffset = (Math.random() * 2 - 1) * (config.type === 'rain' ? 2 : 4);
    const verticalOffset = (Math.random() * 1.5 - 0.75);

    const spawnPos: Vector3 = {
      x: spaceship.position.x + basis.forward.x * forwardOffset + basis.right.x * lateralOffset + basis.up.x * upLift,
      y: spaceship.position.y + basis.forward.y * forwardOffset + basis.right.y * lateralOffset + basis.up.y * upLift,
      z: spaceship.position.z + basis.forward.z * forwardOffset + basis.right.z * lateralOffset + basis.up.z * upLift,
    };
    spawnPos.x += basis.up.x * verticalOffset;
    spawnPos.y += basis.up.y * verticalOffset;
    spawnPos.z += basis.up.z * verticalOffset;

    const alongForward = config.type === 'rain' ? 2.5 + Math.random() * 1.5 : 6 + Math.random() * 4;
    const downward = config.type === 'rain' ? 15 + Math.random() * 6 : 5 + Math.random() * 3;
    const lateralSpeed = (Math.random() * 2 - 1) * (config.type === 'rain' ? 0.8 : 2.2);

    const velocity: Vector3 = {
      x: basis.forward.x * alongForward - basis.up.x * downward + basis.right.x * lateralSpeed,
      y: basis.forward.y * alongForward - basis.up.y * downward + basis.right.y * lateralSpeed,
      z: basis.forward.z * alongForward - basis.up.z * downward + basis.right.z * lateralSpeed,
    };

    const maxLife = config.type === 'rain' ? 0.9 + Math.random() * 0.4 : 1.4 + Math.random() * 0.8;
    const particle: WeatherParticle = {
      position: spawnPos,
      velocity,
      size: config.type === 'rain' ? 0.06 + Math.random() * 0.05 : 0.16 + Math.random() * 0.08,
      color: config.type === 'rain'
        ? { r: 0.55 + Math.random() * 0.1, g: 0.7 + Math.random() * 0.1, b: 0.9 + Math.random() * 0.05 }
        : { r: 0.78 + Math.random() * 0.05, g: 0.58 + Math.random() * 0.07, b: 0.32 + Math.random() * 0.05 },
      life: maxLife,
      maxLife,
    };
    this.weatherParticles.push(particle);
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
   * Color del propulsor en gradiente: rojo (reposo) → naranja (medio) → amarillo (máximo)
   */
  private getThrusterColor(intensity: number, randomFactor: number): { r: number; g: number; b: number } {
    // intensity ≈ proxy de velocidad/actividad [0..1]
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const t = clamp(intensity, 0, 1);
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const mix = (c0: [number,number,number], c1: [number,number,number], u: number): [number,number,number] => [
      lerp(c0[0], c1[0], u),
      lerp(c0[1], c1[1], u),
      lerp(c0[2], c1[2], u)
    ];
    const RED: [number,number,number] = [1.0, 0.15, 0.05];
    const ORANGE: [number,number,number] = [1.0, 0.6, 0.0];
    const YELLOW: [number,number,number] = [1.0, 0.95, 0.2];
    let c: [number,number,number];
    if (t <= 0.5) c = mix(RED, ORANGE, t / 0.5);
    else c = mix(ORANGE, YELLOW, (t - 0.5) / 0.5);
    // Variación leve para evitar uniformidad total
    const jitter = 0.06 * (randomFactor - 0.5);
    return { r: clamp(c[0] + jitter, 0, 1), g: clamp(c[1] + jitter, 0, 1), b: clamp(c[2] + jitter, 0, 1) };
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

    // Renderizar partículas de debris de destrucción
    if (this.destructionDebris.length) {
      this.destructionDebris.forEach(debris => {
        this.renderDebrisParticle(debris, camera);
      });
    }

    if (this.weatherParticles.length) {
      for (const particle of this.weatherParticles) {
        this.renderWeatherParticle(particle, camera);
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

  /**
   * Renderiza una partícula de debris de destrucción
   */
  private renderDebrisParticle(debris: DebrisParticle, camera: Camera): void {
    if (!this.gl || !this.shaderManager || !this.particleVertexBuffer) return;
    const gl = this.gl;
    
    // Color cálido (gris-naranja) con fade out
    const fadeAlpha = debris.life * debris.brightness;
    const r = 0.7 * fadeAlpha;
    const g = 0.5 * fadeAlpha;
    const b = 0.3 * fadeAlpha;
    
    // Más brillante en el centro
    const colors = new Float32Array([
      r * 0.7, g * 0.7, b * 0.7,
      r * 0.7, g * 0.7, b * 0.7,
      r, g, b,
      r * 0.7, g * 0.7, b * 0.7,
      r, g, b,
      r, g, b,
    ]);
    
    if (!this.particleColorBuffer) {
      this.particleColorBuffer = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    const program = this.shaderManager.basicProgram!;
    const positionLocation = this.shaderManager.basicAttributes['position'];
    const colorLocation = this.shaderManager.basicAttributes['color'];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

    // Crear matriz de modelo (simple traslación y escala)
    const modelMatrix = new Float32Array(16);
    this.createIdentityMatrix(modelMatrix);
    this.translateMatrix(modelMatrix, debris.position.x, debris.position.y, debris.position.z);
    this.scaleMatrix(modelMatrix, debris.size, debris.size, debris.size);
    
    this.shaderManager.setBasicMatrices(modelMatrix, camera.viewMatrix, camera.projectionMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(colorLocation);
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

  private renderWeatherParticle(particle: WeatherParticle, camera: Camera): void {
    if (!this.gl || !this.shaderManager || !this.particleVertexBuffer) {
      return;
    }
    const gl = this.gl;
    const lifeRatio = Math.max(0, particle.life / particle.maxLife);
    const edge = lifeRatio * 0.35;
    const head = lifeRatio;
    const colors = new Float32Array([
      particle.color.r * edge, particle.color.g * edge, particle.color.b * edge,
      particle.color.r * edge, particle.color.g * edge, particle.color.b * edge,
      particle.color.r * head, particle.color.g * head, particle.color.b * head,
      particle.color.r * edge, particle.color.g * edge, particle.color.b * edge,
      particle.color.r * head, particle.color.g * head, particle.color.b * head,
      particle.color.r * head, particle.color.g * head, particle.color.b * head,
    ]);

    if (!this.particleColorBuffer) {
      this.particleColorBuffer = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer!);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    const program = this.shaderManager.basicProgram!;
    const positionLocation = this.shaderManager.basicAttributes['position'];
    const colorLocation = this.shaderManager.basicAttributes['color'];

    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleColorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

    const dir = this.normalize(particle.velocity);
    let widthAxis = this.cross(dir, camera.up);
    if (this.vectorLength(widthAxis) < 1e-3) {
      widthAxis = this.cross(dir, { x: 0, y: 1, z: 0 });
    }
    if (this.vectorLength(widthAxis) < 1e-3) {
      widthAxis = { x: 1, y: 0, z: 0 };
    }
    widthAxis = this.normalize(widthAxis);
    const lengthAxis = this.normalize(dir);
    const normal = this.normalize(this.cross(widthAxis, lengthAxis));

    const widthScale = Math.max(0.02, particle.size * 0.7);
    const lengthScale = particle.size * 10;

    const modelMatrix = new Float32Array(16);
    this.createIdentityMatrix(modelMatrix);
    modelMatrix[0] = widthAxis.x * widthScale;
    modelMatrix[1] = widthAxis.y * widthScale;
    modelMatrix[2] = widthAxis.z * widthScale;
    modelMatrix[4] = -lengthAxis.x * lengthScale;
    modelMatrix[5] = -lengthAxis.y * lengthScale;
    modelMatrix[6] = -lengthAxis.z * lengthScale;
    modelMatrix[8] = normal.x * widthScale;
    modelMatrix[9] = normal.y * widthScale;
    modelMatrix[10] = normal.z * widthScale;
    modelMatrix[12] = particle.position.x;
    modelMatrix[13] = particle.position.y;
    modelMatrix[14] = particle.position.z;

    this.shaderManager.setBasicMatrices(modelMatrix, camera.viewMatrix, camera.projectionMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(positionLocation);
    gl.disableVertexAttribArray(colorLocation);
  }

  private respawnAmbientParticleAhead(d: { position: {x:number;y:number;z:number}; size:number; brightness:number }, spaceship: Spaceship): void {
    const forward = this.normalize({
      x: spaceship.forwardDirection.x,
      y: spaceship.forwardDirection.y,
      z: spaceship.forwardDirection.z
    });
    const pos = spaceship.position;
    const dist = this.ambientNear + Math.random() * (this.ambientFar - this.ambientNear);
    const sideX = (Math.random() * 2 - 1) * this.ambientSideX;
    const sideY = (Math.random() * 2 - 1) * this.ambientSideY;

    let shipRight: { x: number; y: number; z: number } = { x: 1, y: 0, z: 0 };
    let shipUp: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 };

    const orientation = typeof spaceship.getOrientationQuaternion === 'function'
      ? spaceship.getOrientationQuaternion()
      : null;

    if (orientation) {
      const upVec = vec3.create();
      vec3.transformQuat(upVec, vec3.fromValues(0, 1, 0), orientation);
      shipUp = this.normalize({ x: upVec[0], y: upVec[1], z: upVec[2] });

      const rightVec = vec3.create();
      vec3.transformQuat(rightVec, vec3.fromValues(1, 0, 0), orientation);
      shipRight = this.normalize({ x: rightVec[0], y: rightVec[1], z: rightVec[2] });
    } else {
      shipRight = this.normalize(this.cross(forward, shipUp));
      if (this.vectorLength(shipRight) < 1e-3) {
        shipUp = { x: 0, y: 0, z: 1 };
        shipRight = this.normalize(this.cross(forward, shipUp));
      }
    }

    if (this.vectorLength(shipRight) < 1e-3) {
      const fallbackUp = Math.abs(forward.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      shipRight = this.normalize(this.cross(forward, fallbackUp));
    }

    shipUp = this.normalize(this.cross(shipRight, forward));
    if (this.vectorLength(shipUp) < 1e-3) {
      shipUp = { x: 0, y: 1, z: 0 };
    }

    d.position.x = pos.x + forward.x * dist + shipRight.x * sideX + shipUp.x * sideY;
    d.position.y = pos.y + forward.y * dist + shipRight.y * sideX + shipUp.y * sideY;
    d.position.z = pos.z + forward.z * dist + shipRight.z * sideX + shipUp.z * sideY;
    d.size = 0.28 + Math.random() * 0.22;
    d.brightness = 0.12 + Math.random() * 0.18;
  }

  private vectorLength(v: { x: number; y: number; z: number }): number {
    return Math.hypot(v.x, v.y, v.z);
  }

  private dot(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): number { return a.x*b.x + a.y*b.y + a.z*b.z; }
  private cross(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): {x:number;y:number;z:number} { return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x }; }
  private normalize(v: {x:number;y:number;z:number}): {x:number;y:number;z:number} { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x/l, y: v.y/l, z: v.z/l }; }

  private computeShipBasis(
    spaceship: Spaceship,
    config: WeatherPrecipitationConfig,
  ): { forward: Vector3; right: Vector3; up: Vector3 } {
    let forward = config.forwardVector ? this.normalize(config.forwardVector) : this.normalize(spaceship.forwardDirection);
    if (this.vectorLength(forward) < 1e-3) {
      forward = { x: 0, y: 0, z: 1 };
    }

    let up = config.upVector ? this.normalize(config.upVector) : null;

    const orientation = typeof spaceship.getOrientationQuaternion === 'function'
      ? spaceship.getOrientationQuaternion()
      : null;
    if (orientation) {
      const upVec = vec3.create();
      vec3.transformQuat(upVec, vec3.fromValues(0, 1, 0), orientation);
      up = this.normalize({ x: upVec[0], y: upVec[1], z: upVec[2] });
    }

    if (!up || this.vectorLength(up) < 1e-3) {
      up = { x: 0, y: 1, z: 0 };
    }

    let right = this.normalize(this.cross(forward, up));
    if (this.vectorLength(right) < 1e-3) {
      const fallbackUp = Math.abs(forward.y) < 0.98 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      right = this.normalize(this.cross(forward, fallbackUp));
    }
    if (this.vectorLength(right) < 1e-3) {
      right = { x: 1, y: 0, z: 0 };
    }

    const correctedUp = this.normalize(this.cross(right, forward));
    return { forward, right, up: correctedUp };
  }

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
    this.destructionDebris = [];
    this.ambientDust = [];
    this.weatherParticles = [];
    this.weatherParticleAccum = 0;
    this.gl = null;
    this.shaderManager = null;
    
    this.logger.log(LogLevel.INFO, LogCategory.PARTICLES, 'ParticleEffectsService cleaned up');
  }
}