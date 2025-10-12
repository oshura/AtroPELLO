/**
 * Sistema de Renderizado de Outlines Avanzado
 * FASE 4: Outline Shaders con Post-procesamiento
 */

import { Injectable } from '@angular/core';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';
import { ITargetable } from '../../types/targeting.types';
import { mat4, vec3 } from 'gl-matrix';

export enum OutlineType {
  SOLID = 'solid',         // Outline sólido
  GLOW = 'glow',          // Efecto de brillo
  PULSE = 'pulse',        // Pulsante animado  
  SCAN = 'scan',          // Efecto de escaneo
  DANGER = 'danger'       // Outline de peligro
}

export interface OutlineConfig {
  type: OutlineType;
  color: [number, number, number, number]; // RGBA
  thickness: number;       // Grosor del outline (píxeles)
  intensity: number;       // Intensidad del efecto (0-1)
  frequency: number;       // Frecuencia de animación
  fadeDistance: number;    // Distancia de fade
}

export interface OutlineTarget {
  target: ITargetable;
  config: OutlineConfig;
  animationTime: number;
  isVisible: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OutlineRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;

  // Framebuffers para renderizado en dos pasadas
  private outlineFramebuffer: WebGLFramebuffer | null = null;
  private colorTexture: WebGLTexture | null = null;
  private depthTexture: WebGLTexture | null = null;
  
  // Buffers de post-procesamiento  
  private screenQuadVAO: WebGLVertexArrayObject | null = null;
  private screenQuadVBO: WebGLBuffer | null = null;
  // Billboard quad for first pass
  private billboardVAO: WebGLVertexArrayObject | null = null;
  private billboardVBO: WebGLBuffer | null = null;
  private billboardEBO: WebGLBuffer | null = null;

  // Targets con outline activo
  private activeOutlines: Map<string, OutlineTarget> = new Map();

  // Configuraciones predefinidas
  private presetConfigs: Map<OutlineType, OutlineConfig> = new Map();

  // Dimensiones del canvas
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  constructor(private webglService: WebGLService) {
    this.setupPresetConfigs();
  }

  /**
   * Inicializa el sistema de outline rendering
   */
  public initialize(shaderManager: ShaderManager): boolean {
    try {
      this.gl = this.webglService.getContext() as WebGL2RenderingContext;
      this.shaderManager = shaderManager;

      if (!this.gl || !this.shaderManager) {
        console.error('❌ OutlineRenderer: WebGL context o ShaderManager no disponible');
        return false;
      }

      // Crear shaders específicos para outlines
      this.createOutlineShaders();

  // Configurar framebuffer para renderizado en dos pasadas
  // Asegurar tamaños iniciales usando drawingBuffer actual
  const glAny = this.gl as any;
  this.canvasWidth = glAny?.drawingBufferWidth || this.canvasWidth;
  this.canvasHeight = glAny?.drawingBufferHeight || this.canvasHeight;
  this.setupFramebuffer();

      // Reaccionar a cambios de tamaño del canvas para mantener buffers correctos
      const canvas = this.webglService.getCanvas();
      if (canvas) {
        canvas.addEventListener('webgl-resize', (e: Event) => {
          const detail: any = (e as CustomEvent).detail || {};
          const w = Number(detail.width ?? (this.gl as any)?.drawingBufferWidth ?? canvas.width);
          const h = Number(detail.height ?? (this.gl as any)?.drawingBufferHeight ?? canvas.height);
          this.resizeFramebuffer(w, h);
        });
      }

  // Crear geometría de screen quad para post-procesamiento
      this.setupScreenQuad();

  // Crear geometría de billboard para primera pasada
  this.setupBillboardQuad();

      console.log('🟡 OutlineRenderer inicializado correctamente');
      return true;

    } catch (error) {
      console.error('❌ Error inicializando OutlineRenderer:', error);
      return false;
    }
  }

  /**
   * Agrega un target para renderizar con outline
   */
  public addOutline(target: ITargetable, type: OutlineType, customConfig?: Partial<OutlineConfig>): void {
    const config = customConfig 
      ? { ...this.presetConfigs.get(type)!, ...customConfig }
      : this.presetConfigs.get(type)!;

    const outlineTarget: OutlineTarget = {
      target,
      config,
      animationTime: 0,
      isVisible: true
    };

    this.activeOutlines.set(target.id, outlineTarget);
    console.log(`🟡 Outline+ add id=${target.id} type=${type}`, outlineTarget.config);
  }

  /**
   * Remueve el outline de un target
   */
  public removeOutline(targetId: string): void {
    if (this.activeOutlines.delete(targetId)) {
      console.log(`🟡 Outline removido para target ${targetId}`);
    }
  }

  /**
   * Actualiza animaciones de outlines
   */
  public update(deltaTime: number): void {
    for (const [targetId, outlineTarget] of this.activeOutlines) {
      outlineTarget.animationTime += deltaTime;
      
      // Actualizar visibilidad basada en distancia
      const distance = this.calculateTargetDistance(outlineTarget.target);
      outlineTarget.isVisible = distance <= outlineTarget.config.fadeDistance;
    }
  }

  /**
   * Renderiza todos los outlines activos
   */
  public renderOutlines(
    viewMatrix: mat4, 
    projectionMatrix: mat4,
    targets: ITargetable[]
  ): void {
    if (!this.gl || !this.shaderManager) {
      return;
    }

  if (this.activeOutlines.size === 0) {
      // Debug puntual para confirmar estado
      if (Math.random() < 0.01) {
        console.log('🟡 Outline: sin activos, skip frame');
      }
      return;
    }

  // Guardar estado actual básico
  const originalViewport = this.gl.getParameter(this.gl.VIEWPORT);
  const prevBlend = this.gl.isEnabled(this.gl.BLEND);
  const prevCull = this.gl.isEnabled(this.gl.CULL_FACE);
  const prevDepth = this.gl.isEnabled(this.gl.DEPTH_TEST);
  const prevDepthFunc = this.gl.getParameter(this.gl.DEPTH_FUNC);
  const prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    // Asegurar que las dimensiones del framebuffer coinciden cada frame (por si hubo resize sin evento)
    const glAny = this.gl as any;
    const dw = glAny?.drawingBufferWidth;
    const dh = glAny?.drawingBufferHeight;
    if ((dw && dh) && (dw !== this.canvasWidth || dh !== this.canvasHeight)) {
      this.resizeFramebuffer(dw, dh);
    }

    try {
      // Primera pasada: Renderizar geometría a framebuffer
      console.log('🟡 Outline FirstPass start', {
        framebufferSize: { w: this.canvasWidth, h: this.canvasHeight },
        activeOutlines: this.activeOutlines.size,
        targetsCount: targets.length
      });
      this.renderFirstPass(viewMatrix, projectionMatrix, targets);
      
      // Segunda pasada: Post-procesamiento de outlines
  this.renderSecondPass();
  console.log('🟡 Outline SecondPass done');

    } catch (error) {
      console.error('❌ Error renderizando outlines:', error);
    } finally {
      // Restaurar estado
      this.gl.viewport(originalViewport[0], originalViewport[1], originalViewport[2], originalViewport[3]);
      if (prevBlend) this.gl.enable(this.gl.BLEND); else this.gl.disable(this.gl.BLEND);
      if (prevCull) this.gl.enable(this.gl.CULL_FACE); else this.gl.disable(this.gl.CULL_FACE);
      if (prevDepth) this.gl.enable(this.gl.DEPTH_TEST); else this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.depthFunc(prevDepthFunc);
      if (prevProgram) this.gl.useProgram(prevProgram);
    }
  }

  /**
   * Primera pasada: Renderizar geometría de targets a framebuffer
   */
  private renderFirstPass(viewMatrix: mat4, projectionMatrix: mat4, targets: ITargetable[]): void {
    if (!this.gl || !this.outlineFramebuffer) return;

    // Bind framebuffer para outline
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.outlineFramebuffer);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    // Clear
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

  // Estado GL (solo primera pasada)
  this.gl.enable(this.gl.DEPTH_TEST);
  this.gl.depthFunc(this.gl.LEQUAL);
  this.gl.disable(this.gl.CULL_FACE);
  this.gl.disable(this.gl.BLEND);

    // Renderizar solo los targets que tienen outline activo
    let drawn = 0;
    for (const target of targets) {
      const outlineTarget = this.activeOutlines.get(target.id);
      if (!outlineTarget || !outlineTarget.isVisible) continue;

  // Renderizar geometría del target con shader específico
  this.renderTargetGeometry(target, viewMatrix, projectionMatrix, outlineTarget.config);
      drawn++;
    }
    console.log('🟡 Outline FirstPass drawn proxies:', drawn);
  }

  /**
   * Segunda pasada: Post-procesamiento para generar outlines
   */
  private renderSecondPass(): void {
    if (!this.gl || !this.screenQuadVAO) return;

    // Volver al framebuffer por defecto (pantalla)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    // Usar shader de post-procesamiento
    const outlineProgram = (this.shaderManager as any)?.outlineProgram;
    if (!outlineProgram) return;

    this.gl.useProgram(outlineProgram);

    // Bind textura de color del framebuffer
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colorTexture);
    
    // Configurar uniformes
    const uColorTexture = this.gl.getUniformLocation(outlineProgram, 'u_colorTexture');
    const uResolution = this.gl.getUniformLocation(outlineProgram, 'u_resolution');
    const uTime = this.gl.getUniformLocation(outlineProgram, 'u_time');

    this.gl.uniform1i(uColorTexture, 0);
    this.gl.uniform2f(uResolution, this.canvasWidth, this.canvasHeight);
    this.gl.uniform1f(uTime, performance.now() * 0.001);

    // Configurar blend para overlay
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Renderizar screen quad
    this.gl.bindVertexArray(this.screenQuadVAO);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.bindVertexArray(null);

    this.gl.disable(this.gl.BLEND);
  }

  /**
   * Renderiza la geometría de un target individual
   */
  private renderTargetGeometry(
    target: ITargetable, 
    viewMatrix: mat4, 
    projectionMatrix: mat4, 
    config: OutlineConfig
  ): void {
    if (!this.gl || !this.shaderManager?.basicProgram) return;

    // Usar el programa básico y establecer matrices correctas
    this.shaderManager.useBasicProgram();

    // Calcular matriz modelo para un QUAD billboard: siempre paralelo al plano de la cámara
    const position = target.position;
    // Extraer rotación de la cámara (usar invView para orientar el quad)
    const invView = mat4.create();
    mat4.invert(invView, viewMatrix);
    // Construir modelo: traslación a target, orientación igual a cámara (para quedar paralelo) y escalado por radio
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, [position.x, position.y, position.z]);
    // Copiar la parte rotacional de la invView (columna 0..2 y fila 0..2)
    modelMatrix[0] = invView[0]; modelMatrix[1] = invView[1]; modelMatrix[2] = invView[2];
    modelMatrix[4] = invView[4]; modelMatrix[5] = invView[5]; modelMatrix[6] = invView[6];
    modelMatrix[8] = invView[8]; modelMatrix[9] = invView[9]; modelMatrix[10] = invView[10];
    // Escalado: el quad será del tamaño del diámetro del objeto (en X/Y), sin profundidad
    const radius = (target as any).radius ? Number((target as any).radius) : 10;
    const scale = Math.max(1, radius * 2);
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, 1]);

    // Establecer matrices en el shader básico
    this.shaderManager.setBasicMatrices(
      modelMatrix as unknown as Float32Array,
      viewMatrix as unknown as Float32Array,
      projectionMatrix as unknown as Float32Array
    );

    // Preparar atributos: posición y color constante
    const posLoc = this.shaderManager.basicAttributes['position'];
    const colorLoc = this.shaderManager.basicAttributes['color'];

    // Asegurar que el atributo de color tenga un valor constante (usar color del outline)
    if (colorLoc !== -1) {
      // Deshabilitar array para usar valor constante y setear RGB (ignorar alpha)
      this.gl.disableVertexAttribArray(colorLoc);
      this.gl.vertexAttrib3f(colorLoc, config.color[0], config.color[1], config.color[2]);
    }

    // Renderizar quad billboard (solo frente a la cámara)
    this.renderBillboardQuad(posLoc);
  }

  /**
   * Configura los framebuffers para renderizado en dos pasadas
   */
  private setupFramebuffer(): void {
    if (!this.gl) return;

    const canvas = this.webglService.getCanvas();
    if (!canvas) return;

    // Tomar tamaño del drawing buffer para resolución real
    this.canvasWidth = (this.gl as any).drawingBufferWidth || canvas.width;
    this.canvasHeight = (this.gl as any).drawingBufferHeight || canvas.height;

    // Crear framebuffer
    this.outlineFramebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.outlineFramebuffer);

    // Crear textura de color
    this.colorTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colorTexture);
    // Usar formato con tamaño explícito en WebGL2
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA8,
      this.canvasWidth, this.canvasHeight, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    // Crear textura de depth
    this.depthTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.depthTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.DEPTH_COMPONENT24,
      this.canvasWidth, this.canvasHeight, 0,
      this.gl.DEPTH_COMPONENT, this.gl.UNSIGNED_INT, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

    // Attach textures to framebuffer
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D, this.colorTexture, 0
    );
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT,
      this.gl.TEXTURE_2D, this.depthTexture, 0
    );

    // Definir draw buffers para el framebuffer (WebGL2 requiere especificarlo)
    (this.gl as any).drawBuffers([this.gl.COLOR_ATTACHMENT0]);

    // Verificar completeness
    if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error('❌ Framebuffer incompleto');
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /**
   * Recrea los attachments del framebuffer al cambiar de tamaño
   */
  private resizeFramebuffer(width: number, height: number): void {
    if (!this.gl) return;

    this.canvasWidth = Math.max(1, Math.floor(width));
    this.canvasHeight = Math.max(1, Math.floor(height));

    // Re-crear color texture
    if (this.colorTexture) this.gl.deleteTexture(this.colorTexture);
    this.colorTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colorTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA8,
      this.canvasWidth, this.canvasHeight, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    // Re-crear depth texture
    if (this.depthTexture) this.gl.deleteTexture(this.depthTexture);
    this.depthTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.depthTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.DEPTH_COMPONENT24,
      this.canvasWidth, this.canvasHeight, 0,
      this.gl.DEPTH_COMPONENT, this.gl.UNSIGNED_INT, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

    // Re-attach
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.outlineFramebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.colorTexture, 0);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, this.depthTexture, 0);
    this.gl.drawBuffers([this.gl.COLOR_ATTACHMENT0]);
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error('❌ Framebuffer incompleto tras resize:', status);
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /**
   * Configura la geometría del screen quad para post-procesamiento
   */
  private setupScreenQuad(): void {
    if (!this.gl) return;

    // Vértices de screen quad (triángulos que cubren toda la pantalla)
    const quadVertices = new Float32Array([
      // Posición   // UV
      -1, -1,       0, 0,
       1, -1,       1, 0,
      -1,  1,       0, 1,
       1, -1,       1, 0,
       1,  1,       1, 1,
      -1,  1,       0, 1
    ]);

    this.screenQuadVAO = this.gl.createVertexArray();
    this.screenQuadVBO = this.gl.createBuffer();

    this.gl.bindVertexArray(this.screenQuadVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.screenQuadVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, quadVertices, this.gl.STATIC_DRAW);

    // Atributo de posición
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 4 * 4, 0);

    // Atributo de UV
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 4 * 4, 2 * 4);

    this.gl.bindVertexArray(null);
  }

  /**
   * Crea la geometría para un quad billboard (para primera pasada)
   */
  private setupBillboardQuad(): void {
    if (!this.gl) return;

    // Quad en el plano XY, centrado en el origen
    const vertices = new Float32Array([
      -0.5, -0.5, 0.0,
       0.5, -0.5, 0.0,
       0.5,  0.5, 0.0,
      -0.5,  0.5, 0.0
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3
    ]);

    this.billboardVAO = this.gl.createVertexArray();
    this.billboardVBO = this.gl.createBuffer();
    this.billboardEBO = this.gl.createBuffer();

    this.gl.bindVertexArray(this.billboardVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.billboardVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.billboardEBO);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

    // El atributo de posición real se habilita en renderTargetGeometry con la ubicación del shader
    this.gl.bindVertexArray(null);
  }

  /**
   * Dibuja el quad billboard usando la ubicación de atributo de posición proporcionada
   */
  private renderBillboardQuad(positionLocation: number): void {
    if (!this.gl || !this.billboardVAO || !this.billboardVBO || !this.billboardEBO) return;

    this.gl.bindVertexArray(this.billboardVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.billboardVBO);
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.billboardEBO);
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    if (positionLocation >= 0) this.gl.disableVertexAttribArray(positionLocation);
    this.gl.bindVertexArray(null);
  }

  /**
   * Crea los shaders específicos para outlines
   */
  private createOutlineShaders(): void {
    if (!this.gl || !this.shaderManager) return;

    // Shader para post-procesamiento de outlines
    const outlineProgram = this.createOutlinePostProcessShader();
    if (outlineProgram) {
      (this.shaderManager as any).outlineProgram = outlineProgram;
    }
  }

  /**
   * Crea el shader de post-procesamiento para outlines
   */
  private createOutlinePostProcessShader(): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = `#version 300 es
      precision highp float;
      
      layout(location = 0) in vec2 a_position;
      layout(location = 1) in vec2 a_uv;
      
      out vec2 v_uv;
      
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShader = `#version 300 es
      precision highp float;
      
      in vec2 v_uv;
      out vec4 fragColor;
      
      uniform sampler2D u_colorTexture;
      uniform vec2 u_resolution;
      uniform float u_time;
      
      // Configuración del outline
      const float OUTLINE_THICKNESS = 2.0;
      const vec3 OUTLINE_COLOR = vec3(0.0, 1.0, 1.0); // Cyan
      const float GLOW_INTENSITY = 0.8;
      
      void main() {
        vec2 texelSize = 1.0 / u_resolution;
        vec4 centerColor = texture(u_colorTexture, v_uv);
        
        // Detectar bordes usando kernel Sobel
        float outline = 0.0;
        
        // Sampling en cruz y diagonal
        for (float x = -OUTLINE_THICKNESS; x <= OUTLINE_THICKNESS; x++) {
          for (float y = -OUTLINE_THICKNESS; y <= OUTLINE_THICKNESS; y++) {
            vec2 offset = vec2(x, y) * texelSize;
            float alpha = texture(u_colorTexture, v_uv + offset).a;
            
            // Distancia desde el centro
            float distance = length(vec2(x, y));
            if (distance <= OUTLINE_THICKNESS && alpha > 0.0) {
              outline = max(outline, 1.0 - distance / OUTLINE_THICKNESS);
            }
          }
        }
        
        if (outline > 0.0) {
          // Efecto de pulso
          float pulse = 0.5 + 0.5 * sin(u_time * 4.0);
          float intensity = GLOW_INTENSITY * outline * pulse;
          
          // Color del outline con efecto de glow
          vec3 glowColor = OUTLINE_COLOR * intensity;
          fragColor = vec4(glowColor, clamp(outline * 0.9, 0.0, 1.0));
        } else {
          fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
      }
    `;

    return this.compileShaderProgram(vertexShader, fragmentShader);
  }

  /**
   * Compila un programa de shader
   */
  private compileShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('❌ Error enlazando shader program:', this.gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  /**
   * Compila un shader individual
   */
  private compileShader(source: string, type: number): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('❌ Error compilando shader:', this.gl.getShaderInfoLog(shader));
      return null;
    }

    return shader;
  }

  /**
   * Configura las configuraciones predefinidas para diferentes tipos de outline
   */
  private setupPresetConfigs(): void {
    this.presetConfigs.set(OutlineType.SOLID, {
      type: OutlineType.SOLID,
      color: [0.0, 1.0, 1.0, 1.0], // Cyan
      thickness: 2.0,
      intensity: 1.0,
      frequency: 0.0,
      fadeDistance: 1000.0
    });

    this.presetConfigs.set(OutlineType.GLOW, {
      type: OutlineType.GLOW,
      color: [1.0, 0.8, 0.0, 0.8], // Dorado
      thickness: 4.0,
      intensity: 0.8,
      frequency: 2.0,
      fadeDistance: 800.0
    });

    this.presetConfigs.set(OutlineType.PULSE, {
      type: OutlineType.PULSE,
      color: [1.0, 0.0, 0.5, 0.9], // Rosa
      thickness: 3.0,
      intensity: 0.9,
      frequency: 3.0,
      fadeDistance: 600.0
    });

    this.presetConfigs.set(OutlineType.SCAN, {
      type: OutlineType.SCAN,
      color: [0.0, 1.0, 0.0, 0.7], // Verde
      thickness: 2.5,
      intensity: 0.7,
      frequency: 1.5,
      fadeDistance: 1200.0
    });

    this.presetConfigs.set(OutlineType.DANGER, {
      type: OutlineType.DANGER,
      color: [1.0, 0.2, 0.0, 1.0], // Rojo
      thickness: 5.0,
      intensity: 1.0,
      frequency: 5.0,
      fadeDistance: 500.0
    });
  }

  /**
   * Calcula la distancia a un target (placeholder)
   */
  private calculateTargetDistance(target: ITargetable): number {
    // TODO: Implementar cálculo real de distancia desde la cámara
    return 100.0; // Placeholder
  }

  /**
   * Renderiza un cubo básico para representar targets
   */
  private renderBasicCube(positionLocation: number): void {
    if (!this.gl) return;

    // Vértices básicos de un cubo unitario
    const vertices = new Float32Array([
      // Front face
      -0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,
       0.5,  0.5,  0.5,
      -0.5,  0.5,  0.5,
      // Back face
      -0.5, -0.5, -0.5,
      -0.5,  0.5, -0.5,
       0.5,  0.5, -0.5,
       0.5, -0.5, -0.5
    ]);

    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3,    // front
      4, 5, 6, 4, 6, 7,    // back
      5, 0, 3, 5, 3, 6,    // left
      1, 4, 7, 1, 7, 2,    // right
      3, 2, 6, 3, 6, 5,    // top
      1, 0, 4, 1, 4, 7     // bottom
    ]);

    // Crear VAO y buffers temporales
    const vao = this.gl.createVertexArray();
    const vertexBuffer = this.gl.createBuffer();
    const indexBuffer = this.gl.createBuffer();

    this.gl.bindVertexArray(vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

    // Configurar atributo de posición según ubicación del shader
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Renderizar
    this.gl.drawElements(this.gl.TRIANGLES, indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar
    if (positionLocation >= 0) {
      this.gl.disableVertexAttribArray(positionLocation);
    }
    this.gl.bindVertexArray(null);
    this.gl.deleteBuffer(vertexBuffer);
    this.gl.deleteBuffer(indexBuffer);
    if (vao) this.gl.deleteVertexArray(vao);
  }

  /**
   * Limpia recursos
   */
  public dispose(): void {
    if (!this.gl) return;

    // Limpiar framebuffer
    if (this.outlineFramebuffer) {
      this.gl.deleteFramebuffer(this.outlineFramebuffer);
    }
    if (this.colorTexture) {
      this.gl.deleteTexture(this.colorTexture);
    }
    if (this.depthTexture) {
      this.gl.deleteTexture(this.depthTexture);
    }

    // Limpiar VAO y VBO
    if (this.screenQuadVAO) {
      this.gl.deleteVertexArray(this.screenQuadVAO);
    }
    if (this.screenQuadVBO) {
      this.gl.deleteBuffer(this.screenQuadVBO);
    }

    // Limpiar targets
    this.activeOutlines.clear();
  }
}