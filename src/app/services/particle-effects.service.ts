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
  private maxThrusterParticles = 6;

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

    // Calcular intensidad del propulsor
    const isAccelerating = spaceship.controls.speedUp || spaceship.currentSpeed > 0.1;
    const speedRatio = spaceship.currentSpeed / spaceship.maxSpeed;
    const accelerationBonus = spaceship.controls.speedUp ? 0.4 : 0.0;
    
    let thrusterIntensity = Math.max(0.0, (speedRatio + accelerationBonus));
    
    // Si está acelerando, intensidad mínima
    if (isAccelerating && thrusterIntensity < 0.3) {
      thrusterIntensity = 0.3;
    }

    // Limpiar partículas viejas
    this.thrusterParticles = this.thrusterParticles.filter(particle => particle.life > 0.0);

    // Crear nuevas partículas si hay propulsión
    if (thrusterIntensity > 0.0) {
      this.generateThrusterParticles(spaceship, thrusterIntensity, deltaTime);
    }

    // Actualizar partículas existentes
    this.thrusterParticles.forEach(particle => {
      particle.life -= deltaTime * 3.0; // Las partículas duran ~0.33 segundos
      particle.size *= 0.99; // Se encogen ligeramente
      
      // Fade out del color
      const fadeMultiplier = Math.max(0.0, particle.life);
      particle.color.r *= fadeMultiplier;
      particle.color.g *= fadeMultiplier;
      particle.color.b *= fadeMultiplier;
    });

    // Log ocasional para debugging
    if (Math.random() < 0.02) {
      console.log('🔥 Thruster particles:', {
        intensity: thrusterIntensity.toFixed(2),
        accelerating: isAccelerating,
        particleCount: this.thrusterParticles.length
      });
    }
  }

  /**
   * Genera nuevas partículas de propulsión
   */
  private generateThrusterParticles(spaceship: Spaceship, intensity: number, deltaTime: number): void {
    // Limitar número de partículas
    if (this.thrusterParticles.length >= this.maxThrusterParticles) return;

    // Generar 1-2 partículas por frame cuando hay propulsión alta
    const particlesToCreate = intensity > 0.5 ? 2 : 1;

    for (let i = 0; i < particlesToCreate; i++) {
      const thrusterPos = this.calculateThrusterPosition(spaceship);
      
      // Añadir variación aleatoria
      // Offset aleatorio más pequeño para mantener partículas cerca del propulsor
      const randomOffset = {
        x: (Math.random() - 0.5) * 0.08, // Reducido
        y: (Math.random() - 0.5) * 0.04, // Reducido 
        z: (Math.random() - 0.5) * 0.12  // Reducido
      };

      const particle: ParticleEffect = {
        position: {
          x: thrusterPos.x + randomOffset.x,
          y: thrusterPos.y + randomOffset.y,
          z: thrusterPos.z + randomOffset.z
        },
        size: 0.05 + intensity * 0.08, // Partículas mucho más pequeñas
        intensity: intensity,
        color: this.getThrusterColor(intensity, Math.random()),
        life: 1.0 // Vida completa al nacer
      };

      this.thrusterParticles.push(particle);
    }
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
    if (!this.gl || !this.shaderManager || this.thrusterParticles.length === 0) {
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

    // Renderizar cada partícula
    this.thrusterParticles.forEach(particle => {
      this.renderParticle(particle, camera);
    });

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