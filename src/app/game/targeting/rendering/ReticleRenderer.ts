/**
 * Renderizador de Retícula WebGL
 * FASE 2: Visual Reticle System
 */

import { Injectable } from '@angular/core';
import { 
  IReticleRenderer, 
  ReticleType, 
  ReticleConfig, 
  ScreenPosition,
  ReticleState
} from '../types/reticle.types';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';

@Injectable({
  providedIn: 'root'
})
export class ReticleRenderer implements IReticleRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  
  // Buffers para geometría de retícula
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  
  // Estado de animación
  private animationTime: number = 0;
  private currentType: ReticleType = ReticleType.CROSSHAIR;
  private transitionProgress: number = 1.0; // 1.0 = transición completa
  private targetType: ReticleType = ReticleType.CROSSHAIR;
  
  // Configuración de renderizado
  private canvasWidth: number = 1024;
  private canvasHeight: number = 768;
  
  // Matriz de proyección ortogonal para screen space
  private orthographicMatrix: Float32Array = new Float32Array(16);

  constructor(
    private webglService: WebGLService
  ) {}

  /**
   * Inicializa el renderizador
   */
  public initialize(shaderManager: ShaderManager): boolean {
    this.gl = this.webglService.getContext() as WebGL2RenderingContext;
    this.shaderManager = shaderManager;
    
    if (!this.gl || !this.shaderManager) {
      console.error('❌ ReticleRenderer: WebGL o ShaderManager no disponibles');
      return false;
    }

    // Obtener dimensiones del canvas
    const canvas = this.webglService.getCanvas();
    if (canvas) {
      this.canvasWidth = canvas.width;
      this.canvasHeight = canvas.height;
    }

    // Crear recursos WebGL
    this.createBuffers();
    this.updateOrthographicMatrix();

    console.log('🎯 ReticleRenderer inicializado');
    return true;
  }

  /**
   * Renderiza la retícula en la posición especificada
   */
  public render(position: ScreenPosition, config: ReticleConfig, deltaTime: number): void {
    if (!this.gl || !this.shaderManager || !this.shaderManager.reticleProgram) {
      console.error('❌ ReticleRenderer: Recursos no disponibles', {
        gl: !!this.gl,
        shaderManager: !!this.shaderManager,
        reticleProgram: !!this.shaderManager?.reticleProgram
      });
      return;
    }

    console.log('🎨 ReticleRenderer.render() ejecutando en posición:', position);

    // Actualizar animaciones - DESHABILITADO para solo usar velocidad mouse
    // this.update(deltaTime);

    // Usar programa retícula dedicado
    this.gl.useProgram(this.shaderManager.reticleProgram);

    // Configurar blending para transparencia
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Generar geometría según tipo de retícula
    const geometry = this.generateReticleGeometry(position, config);
    
    // Actualizar buffers con nueva geometría
    this.updateBuffers(geometry.vertices, geometry.indices);

    // Configurar matrices (screen space rendering)
    this.setupMatrices(position);

    // Configurar uniformes del shader
    this.setupUniforms(config);

    // Renderizar
    this.drawReticle(geometry.indices.length);

    // Restaurar estado WebGL
    this.gl.disable(this.gl.BLEND);
  }

  /**
   * Actualiza animaciones de la retícula
   */
  public update(deltaTime: number): void {
    this.animationTime += deltaTime;
    
    // Actualizar transición entre tipos
    if (this.currentType !== this.targetType) {
      this.transitionProgress += deltaTime * 3.0; // 3 segundos para transición
      
      if (this.transitionProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.currentType = this.targetType;
      }
    }
  }

  /**
   * Cambia el tipo de retícula con transición suave
   */
  public setReticleType(type: ReticleType, animated: boolean = true): void {
    if (animated) {
      this.targetType = type;
      this.transitionProgress = 0.0;
    } else {
      this.currentType = type;
      this.targetType = type;
      this.transitionProgress = 1.0;
    }
  }

  /**
   * Genera la geometría para el tipo de retícula actual
   */
  private generateReticleGeometry(position: ScreenPosition, config: ReticleConfig): {
    vertices: number[], 
    indices: number[]
  } {
    const size = config.size;
    const thickness = config.thickness;
    
    switch (config.type) {
      case ReticleType.CROSSHAIR:
        return this.generateCrosshairGeometry(size, thickness);
      
      case ReticleType.BRACKETS:
        return this.generateBracketsGeometry(size, thickness);
        
      case ReticleType.CIRCLE:
        return this.generateCircleGeometry(size, thickness);
        
      case ReticleType.DYNAMIC:
        return this.generateDynamicGeometry(size, thickness);
        
      default:
        return this.generateCrosshairGeometry(size, thickness);
    }
  }

  /**
   * Genera geometría de cruz (CROSSHAIR)
   */
  private generateCrosshairGeometry(size: number, thickness: number): {
    vertices: number[], 
    indices: number[]
  } {
    const halfSize = size * 0.5;
    const halfThickness = thickness * 0.5;
    
    // Animación de pulsado
    const pulse = 1.0 + Math.sin(this.animationTime * 4.0) * 0.2;
    const animatedSize = halfSize * pulse;
    const gap = 8; // Gap central
    
    const vertices = [
      // Línea horizontal izquierda
      -animatedSize, -halfThickness, 0, // 0
      -gap, -halfThickness, 0,          // 1
      -gap, halfThickness, 0,           // 2
      -animatedSize, halfThickness, 0,  // 3
      
      // Línea horizontal derecha
      gap, -halfThickness, 0,           // 4
      animatedSize, -halfThickness, 0,  // 5
      animatedSize, halfThickness, 0,   // 6
      gap, halfThickness, 0,            // 7
      
      // Línea vertical arriba
      -halfThickness, gap, 0,           // 8
      halfThickness, gap, 0,            // 9
      halfThickness, animatedSize, 0,   // 10
      -halfThickness, animatedSize, 0,  // 11
      
      // Línea vertical abajo
      -halfThickness, -animatedSize, 0, // 12
      halfThickness, -animatedSize, 0,  // 13
      halfThickness, -gap, 0,           // 14
      -halfThickness, -gap, 0           // 15
    ];
    
    const indices = [
      // Horizontal izquierda
      0, 1, 2, 0, 2, 3,
      // Horizontal derecha  
      4, 5, 6, 4, 6, 7,
      // Vertical arriba
      8, 9, 10, 8, 10, 11,
      // Vertical abajo
      12, 13, 14, 12, 14, 15
    ];
    
    return { vertices, indices };
  }

  /**
   * Genera geometría de brackets angulares (BRACKETS)
   */
  private generateBracketsGeometry(size: number, thickness: number): {
    vertices: number[], 
    indices: number[]
  } {
    const halfSize = size * 0.5;
    const cornerSize = halfSize * 0.3;
    const halfThickness = thickness * 0.5;
    
    // Animación de cierre progresivo
    const closeFactor = Math.sin(this.animationTime * 2.0) * 0.1 + 0.9;
    const adjustedSize = halfSize * closeFactor;
    
    const vertices = [
      // Bracket superior izquierdo
      -adjustedSize, adjustedSize, 0,                    // 0
      -adjustedSize + cornerSize, adjustedSize, 0,       // 1
      -adjustedSize + cornerSize, adjustedSize - halfThickness, 0, // 2
      -adjustedSize + halfThickness, adjustedSize - halfThickness, 0, // 3
      -adjustedSize + halfThickness, adjustedSize - cornerSize, 0, // 4
      -adjustedSize, adjustedSize - cornerSize, 0,       // 5
      
      // Bracket superior derecho
      adjustedSize - cornerSize, adjustedSize, 0,        // 6
      adjustedSize, adjustedSize, 0,                     // 7
      adjustedSize, adjustedSize - cornerSize, 0,        // 8
      adjustedSize - halfThickness, adjustedSize - cornerSize, 0, // 9
      adjustedSize - halfThickness, adjustedSize - halfThickness, 0, // 10
      adjustedSize - cornerSize, adjustedSize - halfThickness, 0, // 11
      
      // Bracket inferior izquierdo  
      -adjustedSize, -adjustedSize + cornerSize, 0,      // 12
      -adjustedSize + halfThickness, -adjustedSize + cornerSize, 0, // 13
      -adjustedSize + halfThickness, -adjustedSize + halfThickness, 0, // 14
      -adjustedSize + cornerSize, -adjustedSize + halfThickness, 0, // 15
      -adjustedSize + cornerSize, -adjustedSize, 0,      // 16
      -adjustedSize, -adjustedSize, 0,                   // 17
      
      // Bracket inferior derecho
      adjustedSize - cornerSize, -adjustedSize + halfThickness, 0, // 18
      adjustedSize - halfThickness, -adjustedSize + halfThickness, 0, // 19
      adjustedSize - halfThickness, -adjustedSize + cornerSize, 0, // 20
      adjustedSize, -adjustedSize + cornerSize, 0,       // 21
      adjustedSize, -adjustedSize, 0,                    // 22
      adjustedSize - cornerSize, -adjustedSize, 0        // 23
    ];
    
    const indices = [
      // Superior izquierdo
      0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5,
      // Superior derecho
      6, 7, 8, 6, 8, 9, 6, 9, 10, 6, 10, 11,
      // Inferior izquierdo
      12, 13, 14, 12, 14, 15, 12, 15, 16, 12, 16, 17,
      // Inferior derecho
      18, 19, 20, 18, 20, 21, 18, 21, 22, 18, 22, 23
    ];
    
    return { vertices, indices };
  }

  /**
   * Genera geometría de círculo (CIRCLE)
   */
  private generateCircleGeometry(size: number, thickness: number): {
    vertices: number[], 
    indices: number[]
  } {
    const segments = 32;
    const radius = size * 0.5;
    const innerRadius = radius - thickness;
    
    // Animación rotatoria
    const rotation = this.animationTime * 0.5;
    
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Generar vértices del anillo
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2 + rotation;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      // Vértice exterior
      vertices.push(cos * radius, sin * radius, 0);
      // Vértice interior
      vertices.push(cos * innerRadius, sin * innerRadius, 0);
    }
    
    // Generar índices para el anillo
    for (let i = 0; i < segments; i++) {
      const outer1 = i * 2;
      const inner1 = i * 2 + 1;
      const outer2 = (i + 1) * 2;
      const inner2 = (i + 1) * 2 + 1;
      
      // Triángulo 1
      indices.push(outer1, outer2, inner1);
      // Triángulo 2
      indices.push(inner1, outer2, inner2);
    }
    
    // Punto central
    const centerIndex = vertices.length / 3;
    vertices.push(0, 0, 0);
    
    // Pequeño círculo central
    const dotRadius = 3;
    for (let i = 0; i <= 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      vertices.push(Math.cos(angle) * dotRadius, Math.sin(angle) * dotRadius, 0);
      
      if (i > 0) {
        indices.push(centerIndex, centerIndex + i, centerIndex + (i % 8) + 1);
      }
    }
    
    return { vertices, indices };
  }

  /**
   * Genera geometría dinámica según estado
   */
  private generateDynamicGeometry(size: number, thickness: number): {
    vertices: number[], 
    indices: number[]
  } {
    // Por ahora, usar crosshair como base para dynamic
    return this.generateCrosshairGeometry(size, thickness);
  }

  // ===============================
  // MÉTODOS AUXILIARES WebGL
  // ===============================

  private createBuffers(): void {
    if (!this.gl) return;

    this.vertexBuffer = this.gl.createBuffer();
    this.indexBuffer = this.gl.createBuffer();
    this.vao = this.gl.createVertexArray();

    if (!this.vertexBuffer || !this.indexBuffer || !this.vao) {
      console.error('❌ Error creando buffers para retícula');
    }
  }

  private updateBuffers(vertices: number[], indices: number[]): void {
    if (!this.gl || !this.vertexBuffer || !this.indexBuffer || !this.vao) return;

    this.gl.bindVertexArray(this.vao);

    // Actualizar buffer de vértices
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.DYNAMIC_DRAW);

    // Configurar atributos de posición
    const positionLocation = this.shaderManager?.reticleAttributes['position'] ?? 0;
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);

    // Actualizar buffer de índices
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.DYNAMIC_DRAW);

    this.gl.bindVertexArray(null);
  }

  private setupMatrices(position: ScreenPosition): void {
    if (!this.gl || !this.shaderManager) return;

    // Matriz de modelo (traslación a posición de pantalla)
    const modelMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      position.x - this.canvasWidth * 0.5, -(position.y - this.canvasHeight * 0.5), 0, 1
    ]);

    // Matriz de vista (identidad para screen space)
    const viewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Configurar uniformes
    this.gl.uniformMatrix4fv(this.shaderManager.reticleUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.shaderManager.reticleUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.shaderManager.reticleUniforms['projectionMatrix'], false, this.orthographicMatrix);
  }

  private updateOrthographicMatrix(): void {
    const left = -this.canvasWidth * 0.5;
    const right = this.canvasWidth * 0.5;
    const bottom = -this.canvasHeight * 0.5;
    const top = this.canvasHeight * 0.5;
    const near = -1;
    const far = 1;

    this.orthographicMatrix = new Float32Array([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, -2 / (far - near), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1
    ]);
  }

  private setupUniforms(config: ReticleConfig): void {
    if (!this.gl || !this.shaderManager) return;

    // Color (convertir de array a vec4)
    const color = new Float32Array([
      config.color[0], 
      config.color[1], 
      config.color[2], 
      config.color[3]
    ]);
    this.gl.uniform4fv(this.shaderManager.reticleUniforms['color'], color);
    
    // Opacidad
    this.gl.uniform1f(this.shaderManager.reticleUniforms['opacity'], config.opacity);
  }

  private drawReticle(indexCount: number): void {
    if (!this.gl || !this.vao) return;

    this.gl.bindVertexArray(this.vao);
    this.gl.drawElements(this.gl.TRIANGLES, indexCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.bindVertexArray(null);
  }

  /**
   * Actualiza las dimensiones del canvas
   */
  public updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.updateOrthographicMatrix();
  }

  /**
   * Limpia recursos WebGL
   */
  public dispose(): void {
    if (!this.gl) return;

    if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) this.gl.deleteBuffer(this.indexBuffer);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
  }
}