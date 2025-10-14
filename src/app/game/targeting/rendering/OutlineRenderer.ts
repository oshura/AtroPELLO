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

  // Label overlay (2D texture without HTML)
  private labelProgram: WebGLProgram | null = null;
  private labelVAO: WebGLVertexArrayObject | null = null;
  private labelVBO: WebGLBuffer | null = null;
  private labelEBO: WebGLBuffer | null = null;
  private labelUniforms: {
    screenSize: WebGLUniformLocation | null;
    translate: WebGLUniformLocation | null;
    size: WebGLUniformLocation | null;
    sampler: WebGLUniformLocation | null;
  } = { screenSize: null, translate: null, size: null, sampler: null };
  private labelTextureCache: Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: WebGLTexture; w: number; h: number; lastType: string; lastDist: string; lastColorKey: string }>= new Map();
  private lastViewMatrix: mat4 | null = null;
  private lastProjectionMatrix: mat4 | null = null;
  private lastTargets: ITargetable[] = [];

  // World-space billboard pipeline (simple replacement for complex outlines)
  private worldBillboardProgram: WebGLProgram | null = null;
  private worldBillboardVAO: WebGLVertexArrayObject | null = null;
  private worldBillboardVBO: WebGLBuffer | null = null;
  private worldBillboardEBO: WebGLBuffer | null = null;
  private worldBillboardUniforms: {
    model: WebGLUniformLocation | null;
    view: WebGLUniformLocation | null;
    proj: WebGLUniformLocation | null;
    sampler: WebGLUniformLocation | null;
  } = { model: null, view: null, proj: null, sampler: null };

  // Programa aislado para primera pasada (evita atributos compartidos)
  private firstPassProgram: WebGLProgram | null = null;
  private firstPassUniforms: {
    modelMatrix: WebGLUniformLocation | null;
    viewMatrix: WebGLUniformLocation | null;
    projectionMatrix: WebGLUniformLocation | null;
  } = { modelMatrix: null, viewMatrix: null, projectionMatrix: null };
  private firstPassPositionLoc: number = -1;

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

  // Crear shader de primera pasada dedicado (solo posición + matrices)
  this.createFirstPassShader();

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

    // Crear shader y geometría para labels 2D
    this.setupLabelPipeline();

  // Crear pipeline para billboards en el mundo (texto 2D sobre quad)
  this.setupWorldBillboardPipeline();

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
    if (!this.gl || !this.shaderManager) return;
    if (this.activeOutlines.size === 0) return;

    // Guardar estado básico
    const originalViewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array;
    const prevBlend = this.gl.isEnabled(this.gl.BLEND);
    const prevCull = this.gl.isEnabled(this.gl.CULL_FACE);
    const prevDepth = this.gl.isEnabled(this.gl.DEPTH_TEST);
    const prevDepthFunc = this.gl.getParameter(this.gl.DEPTH_FUNC);
    const prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    const prevActiveTex = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    this.gl.activeTexture(this.gl.TEXTURE0);
    const prevTex0Binding = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);

    try {
      // Renderizado simplificado: quads 3D que miran a cámara con la textura del label
      this.lastViewMatrix = mat4.clone(viewMatrix);
      this.lastProjectionMatrix = mat4.clone(projectionMatrix);
      this.lastTargets = targets.slice();
      this.renderWorldBillboards(viewMatrix, projectionMatrix, targets);
    } catch (error) {
      console.error('❌ Error renderizando billboards:', error);
    } finally {
      // Restaurar estado
      this.gl.viewport(originalViewport[0], originalViewport[1], originalViewport[2], originalViewport[3]);
      if (prevBlend) this.gl.enable(this.gl.BLEND); else this.gl.disable(this.gl.BLEND);
      if (prevCull) this.gl.enable(this.gl.CULL_FACE); else this.gl.disable(this.gl.CULL_FACE);
      if (prevDepth) this.gl.enable(this.gl.DEPTH_TEST); else this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.depthFunc(prevDepthFunc);
      if (prevProgram) this.gl.useProgram(prevProgram);
      this.gl.bindTexture(this.gl.TEXTURE_2D, prevTex0Binding);
      this.gl.activeTexture(prevActiveTex);
    }
  }

  /**
   * Segunda pasada: Post-procesamiento para generar outlines
   */
  private renderSecondPass(outlineColor?: [number, number, number, number]): void {
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
  const uOutlineColor = this.gl.getUniformLocation(outlineProgram, 'u_outlineColor');

    this.gl.uniform1i(uColorTexture, 0);
    this.gl.uniform2f(uResolution, this.canvasWidth, this.canvasHeight);
  this.gl.uniform1f(uTime, performance.now() * 0.001);
  const col = outlineColor || [0.0, 1.0, 1.0, 1.0];
  this.gl.uniform4f(uOutlineColor, col[0], col[1], col[2], col[3]);

  // Configurar blend para overlay de outlines
  const prevBlend = this.gl.isEnabled(this.gl.BLEND);
  const prevBlendSrcRGB = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
  const prevBlendDstRGB = this.gl.getParameter(this.gl.BLEND_DST_RGB);
  const prevBlendSrcAlpha = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
  const prevBlendDstAlpha = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
  this.gl.enable(this.gl.BLEND);
  this.gl.blendFuncSeparate(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA, this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Renderizar screen quad
    this.gl.bindVertexArray(this.screenQuadVAO);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.bindVertexArray(null);

    // Unbind textura y restaurar blend
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.blendFuncSeparate(prevBlendSrcRGB, prevBlendDstRGB, prevBlendSrcAlpha, prevBlendDstAlpha);
    if (!prevBlend) this.gl.disable(this.gl.BLEND);
  }

  // Componer labels una sola vez tras pintar todos los outlines
  public compositeLabelsOnce(): void {
    if (!this.gl) return;
    this.renderLabelsOverlay();
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
    if (!this.gl || !this.firstPassProgram) return;

    // Usar el programa aislado y establecer matrices correctas
    this.gl.useProgram(this.firstPassProgram);

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

    // Establecer matrices en el shader de primera pasada
    this.gl.uniformMatrix4fv(this.firstPassUniforms.modelMatrix, false, modelMatrix as unknown as Float32Array);
    this.gl.uniformMatrix4fv(this.firstPassUniforms.viewMatrix, false, viewMatrix as unknown as Float32Array);
    this.gl.uniformMatrix4fv(this.firstPassUniforms.projectionMatrix, false, projectionMatrix as unknown as Float32Array);

    // Renderizar quad billboard (solo frente a la cámara)
    const posLoc = this.firstPassPositionLoc;
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

  // === LABEL OVERLAY PIPELINE ===
  private setupLabelPipeline(): void {
    if (!this.gl) return;
    const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec2 a_pos; // [-0.5,0.5] quad
      layout(location=1) in vec2 a_uv;
      uniform vec2 u_screenSize;
      uniform vec2 u_translate; // center in pixels
      uniform vec2 u_size;      // size in pixels
      out vec2 v_uv;
      void main(){
        vec2 posPx = u_translate + a_pos * u_size;
        vec2 ndc = vec2((posPx.x / u_screenSize.x) * 2.0 - 1.0,
                        1.0 - (posPx.y / u_screenSize.y) * 2.0);
        gl_Position = vec4(ndc, 0.0, 1.0);
        // Aplicar solo flip vertical; mantener orientación horizontal
        v_uv = vec2(a_uv.x, 1.0 - a_uv.y);
      }
    `;
    const fs = `#version 300 es
      precision highp float;
      uniform sampler2D u_tex;
      in vec2 v_uv;
      out vec4 fragColor;
      void main(){
        vec4 c = texture(u_tex, v_uv);
        fragColor = c;
      }
    `;
    const prog = this.createProgram(vs, fs);
    if (!prog) return;
    this.labelProgram = prog;
    this.labelUniforms.screenSize = this.gl.getUniformLocation(prog, 'u_screenSize');
    this.labelUniforms.translate = this.gl.getUniformLocation(prog, 'u_translate');
    this.labelUniforms.size = this.gl.getUniformLocation(prog, 'u_size');
    this.labelUniforms.sampler = this.gl.getUniformLocation(prog, 'u_tex');

    // Quad centrado [-0.5,0.5]
    const verts = new Float32Array([
      // x, y,   u, v  (UVs mapeadas a canvas sin UNPACK_FLIP_Y: v=1 es la parte superior del canvas)
      -0.5, -0.5, 0, 1, // top-left
       0.5, -0.5, 1, 1, // top-right
       0.5,  0.5, 1, 0, // bottom-right
      -0.5,  0.5, 0, 0  // bottom-left
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    this.labelVAO = this.gl.createVertexArray();
    this.labelVBO = this.gl.createBuffer();
    this.labelEBO = this.gl.createBuffer();
    this.gl.bindVertexArray(this.labelVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.labelVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.labelEBO);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, idx, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 4*4, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 4*4, 2*4);
    this.gl.bindVertexArray(null);
  }

  // === WORLD-SPACE BILLBOARD PIPELINE ===
  private setupWorldBillboardPipeline(): void {
    if (!this.gl) return;
    const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec3 a_pos;   // quad in XY plane centered at origin
      layout(location=1) in vec2 a_uv;
      uniform mat4 u_model;
      uniform mat4 u_view;
      uniform mat4 u_proj;
      out vec2 v_uv;
      void main(){
        // Flip vertical para alinear canvas (origen arriba-izquierda) con UV estándar
        v_uv = vec2(a_uv.x, 1.0 - a_uv.y);
        gl_Position = u_proj * u_view * u_model * vec4(a_pos, 1.0);
      }
    `;
    const fs = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_tex;
      out vec4 fragColor;
      void main(){
        vec4 c = texture(u_tex, v_uv);
        fragColor = c;
      }
    `;
    const prog = this.createProgram(vs, fs);
    if (!prog) return;
    this.worldBillboardProgram = prog;
    this.worldBillboardUniforms.model = this.gl.getUniformLocation(prog, 'u_model');
    this.worldBillboardUniforms.view = this.gl.getUniformLocation(prog, 'u_view');
    this.worldBillboardUniforms.proj = this.gl.getUniformLocation(prog, 'u_proj');
    this.worldBillboardUniforms.sampler = this.gl.getUniformLocation(prog, 'u_tex');

    // Quad unitario en XY con UVs estándar (top v=1), centraremos con model matrix
    const verts = new Float32Array([
      // x, y, z,  u, v
      -0.5, -0.5, 0,  0, 0,
       0.5, -0.5, 0,  1, 0,
       0.5,  0.5, 0,  1, 1,
      -0.5,  0.5, 0,  0, 1,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    this.worldBillboardVAO = this.gl.createVertexArray();
    this.worldBillboardVBO = this.gl.createBuffer();
    this.worldBillboardEBO = this.gl.createBuffer();
    this.gl.bindVertexArray(this.worldBillboardVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.worldBillboardVBO);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.worldBillboardEBO);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, idx, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5*4, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5*4, 3*4);
    this.gl.bindVertexArray(null);
  }

  private renderWorldBillboards(view: mat4, proj: mat4, targets: ITargetable[]): void {
    if (!this.gl || !this.worldBillboardProgram || !this.worldBillboardVAO) return;

    // Estado para dibujar quads con alpha sobre la escena
    const prevBlend = this.gl.isEnabled(this.gl.BLEND);
    const prevCull = this.gl.isEnabled(this.gl.CULL_FACE);
    const prevDepth = this.gl.isEnabled(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.disable(this.gl.DEPTH_TEST);

    this.gl.useProgram(this.worldBillboardProgram);
    this.gl.uniformMatrix4fv(this.worldBillboardUniforms.view, false, view as unknown as Float32Array);
    this.gl.uniformMatrix4fv(this.worldBillboardUniforms.proj, false, proj as unknown as Float32Array);
    this.gl.bindVertexArray(this.worldBillboardVAO);

  // Invert view to orient the quads to camera
  const invView = mat4.create();
  mat4.invert(invView, view);
  const camPos = { x: invView[12], y: invView[13], z: invView[14] };

    // Precálculos para clamp por tamaño en píxeles (horizontal)
    const viewportW = Math.max(1, this.canvasWidth);
    const viewportH = Math.max(1, this.canvasHeight);
    const aspect = viewportW / viewportH;
    // En matriz de proyección estándar: proj[5] = 1/tan(fovy/2)
    const tanHalfFovy = 1 / (proj[5] || 1);
    const tanHalfFovx = tanHalfFovy * aspect;
    // Límites deseados en píxeles para el ancho del label
    const minPx = 96;   // ancho mínimo visible
    const maxPx = 384;  // ancho máximo para evitar dominancia

    // Preparar lista ordenada por distancia (lejos primero) para mejorar blending
    const sorted = Array.from(this.activeOutlines.entries())
      .filter(([_, ot]) => ot.isVisible)
      .map(([id, ot]) => {
        const t = ot.target;
        const dx = t.position.x - camPos.x;
        const dy = t.position.y - camPos.y;
        const dz = t.position.z - camPos.z;
        const dist = Math.hypot(dx, dy, dz);
        return { id, ot, dx, dy, dz, dist };
      })
      .sort((a, b) => b.dist - a.dist); // más lejos primero (desc) para que cercanos dibujen al final

    for (const entry of sorted) {
      const { id, ot: outlineTarget, dx, dy, dz, dist } = entry;
      const target = outlineTarget.target;
      const typeLabel = this.typeToLabel(target.getTargetType?.());
      const distLabel = `${Math.round(dist)}u`;
      // Modulación de alpha por distancia cercana al fadeDistance
      const baseCol = outlineTarget.config.color;
      const fadeMax = Math.max(1e-3, outlineTarget.config.fadeDistance || 10000);
      const fadeStart = 0.8 * fadeMax;
      let fadeT = 0;
      if (dist > fadeStart) {
        fadeT = Math.min(1, (dist - fadeStart) / (fadeMax - fadeStart));
      }
      const alphaEff = (baseCol[3] ?? 1.0) * (1.0 - fadeT);
      const textColor = `rgba(${Math.round(baseCol[0]*255)}, ${Math.round(baseCol[1]*255)}, ${Math.round(baseCol[2]*255)}, ${alphaEff.toFixed(3)})`;
      const texEntry = this.getOrCreateLabelTexture(id, typeLabel, distLabel, textColor);

      // Model matrix: translate to target, orient to camera (copy rotation from invView), scale to a readable size
  const model = mat4.create();
  // Centrado sobre el objetivo (sin desplazamiento vertical)
  const radius = (target as any).radius ? Number((target as any).radius) : 2.0;
  mat4.translate(model, model, [target.position.x, target.position.y, target.position.z]);
      model[0] = invView[0]; model[1] = invView[1]; model[2] = invView[2];
      model[4] = invView[4]; model[5] = invView[5]; model[6] = invView[6];
      model[8] = invView[8]; model[9] = invView[9]; model[10] = invView[10];

      // Ancho base por radio
  const baseWidth = Math.max(2.0, radius * 2.2);
      // Clamp por píxeles: convertir límites de px a unidades de mundo a la distancia de este target
  const distance = Math.max(0.001, dist);
  const minWorldW = 2 * distance * tanHalfFovx * (minPx / viewportW);
  const maxWorldW = 2 * distance * tanHalfFovx * (maxPx / viewportW);
      const width = Math.min(Math.max(baseWidth, minWorldW), maxWorldW);
      mat4.scale(model, model, [width, width * (texEntry.h/texEntry.w), 1]);
      this.gl.uniformMatrix4fv(this.worldBillboardUniforms.model, false, model as unknown as Float32Array);

      // Bind texture
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texEntry.tex);
      this.gl.uniform1i(this.worldBillboardUniforms.sampler, 0);

      // Draw
      this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    }

    // Restore
    this.gl.bindVertexArray(null);
    if (!prevBlend) this.gl.disable(this.gl.BLEND);
    if (prevCull) this.gl.enable(this.gl.CULL_FACE); else this.gl.disable(this.gl.CULL_FACE);
    if (prevDepth) this.gl.enable(this.gl.DEPTH_TEST); else this.gl.disable(this.gl.DEPTH_TEST);
  }

  private renderLabelsOverlay(): void {
    if (!this.gl || !this.labelProgram || !this.lastViewMatrix || !this.lastProjectionMatrix) return;
    const gl = this.gl;
    gl.useProgram(this.labelProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.labelVAO);
    gl.uniform2f(this.labelUniforms.screenSize, this.canvasWidth, this.canvasHeight);

    // Obtener posición de cámara a partir de invView
    const invView = mat4.create();
    mat4.invert(invView, this.lastViewMatrix);
    const camPos = { x: invView[12], y: invView[13], z: invView[14] };

    for (const [id, outlineTarget] of this.activeOutlines) {
      if (!outlineTarget.isVisible) continue;
      const target = outlineTarget.target;
      // Proyectar a pantalla
      const scr = this.worldToScreen(target.position, this.lastViewMatrix, this.lastProjectionMatrix);
      if (!scr || scr.w <= 0) continue; // detrás de cámara
      // Crear/actualizar textura de label
  const typeLabel = this.typeToLabel(target.getTargetType?.());
      const dist = Math.hypot(target.position.x - camPos.x, target.position.y - camPos.y, target.position.z - camPos.z);
      const distLabel = `${Math.round(dist)}u`;
  // Color heredado del outline (animosidad)
  const col = outlineTarget.config.color || [0,1,1,0.95];
  const rgbaCss = `rgba(${Math.round(col[0]*255)}, ${Math.round(col[1]*255)}, ${Math.round(col[2]*255)}, ${col[3] ?? 0.95})`;
  const cache = this.getOrCreateLabelTexture(id, typeLabel, distLabel, rgbaCss);
      // Posicionar y dibujar (centrado en el target)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cache.tex);
      gl.uniform1i(this.labelUniforms.sampler, 0);
      gl.uniform2f(this.labelUniforms.translate, scr.x, scr.y);
  // Escala 1:1 con un pequeño factor para legibilidad en distancia
  gl.uniform2f(this.labelUniforms.size, cache.w, cache.h);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
  }

  private worldToScreen(pos: {x:number;y:number;z:number}, view: mat4, proj: mat4): {x:number;y:number;w:number} | null {
    // clip = proj * view * pos4
    const x = pos.x, y = pos.y, z = pos.z;
    const m = mat4.create();
    mat4.multiply(m, proj, view);
    const cx = m[0]*x + m[4]*y + m[8]*z + m[12]*1.0;
    const cy = m[1]*x + m[5]*y + m[9]*z + m[13]*1.0;
    const cz = m[2]*x + m[6]*y + m[10]*z + m[14]*1.0;
    const cw = m[3]*x + m[7]*y + m[11]*z + m[15]*1.0;
    if (cw === 0) return null;
    const nx = cx / cw, ny = cy / cw; // NDC
    // Fuera del rango visible: aún así podemos dibujar si quieres, pero mejor descartar
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
    const sx = (nx * 0.5 + 0.5) * this.canvasWidth;
    const sy = (1 - (ny * 0.5 + 0.5)) * this.canvasHeight;
    return { x: sx, y: sy, w: cw };
  }

  private getOrCreateLabelTexture(id: string, typeLabel: string, distLabel: string, textColorCss: string) {
    if (!this.gl) throw new Error('GL missing');
    let entry = this.labelTextureCache.get(id);
    const dirty = !entry || entry.lastType !== typeLabel || entry.lastDist !== distLabel || entry.lastColorKey !== textColorCss;
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 72;
      const ctx = canvas.getContext('2d')!;
      const tex = this.gl.createTexture()!;
      entry = { canvas, ctx, tex, w: canvas.width, h: canvas.height, lastType: '', lastDist: '', lastColorKey: '' };
      this.labelTextureCache.set(id, entry);
      // Inicializar textura
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }
    if (dirty) {
      // Redibujar label
      const ctx = entry.ctx;
      // Aumentar altura para más espacio vertical
      if (entry.h < 88) {
        entry.canvas.height = 88; entry.h = 88;
      }
      const W = entry.w, H = entry.h;
      ctx.clearRect(0,0,W,H);
  // fondo totalmente transparente (sin placa)
  // Nota: clearRect ya deja el canvas transparente
  // ctx.clearRect(0,0,W,H);
      // Optional border rectangle for better visibility
      ctx.lineWidth = 1;
      ctx.strokeStyle = textColorCss.replace('rgba(', 'rgba(').replace(/\)$/, '')
        .replace(/,\s*([0-9]*\.?[0-9]+)\s*$/, (_, a)=>`, ${Math.min(1, Math.max(0, Number(a)*0.6))}`) + ')';
      ctx.strokeRect(0.5, 0.5, W-1, H-1);

  // top: type
  ctx.fillStyle = textColorCss;
  // Tipografía más fina y un poco más pequeña
  ctx.font = '400 18px Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
  // Sombra sutil para legibilidad
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
      ctx.fillText(typeLabel, W/2, 8);
      // bottom: distance
  ctx.font = '300 16px Segoe UI, Roboto, sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(distLabel, W/2, H-8);
  // Limpiar sombra para futuros trazos si hiciera falta
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
      // Subir a textura
      this.gl.bindTexture(this.gl.TEXTURE_2D, entry.tex);
  // Asegurar orientación consistente: no realizar UNPACK_FLIP_Y, usamos UVs ya corregidas
  this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, entry.canvas);
      entry.lastType = typeLabel;
      entry.lastDist = distLabel;
      entry.lastColorKey = textColorCss;
    }
    return entry;
  }

  private typeToLabel(tt: any): string {
    const t = String(tt || 'unknown').toLowerCase();
    if (t.includes('asteroid')) return 'Asteroid';
    if (t.includes('spaceship')) return 'Spaceship';
    if (t.includes('planet')) return 'Planet';
    if (t.includes('portal')) return 'Portal';
    if (t.includes('waypoint')) return 'Waypoint';
    return 'Unknown';
  }

  private createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
    if (!this.gl) return null;
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    this.gl.shaderSource(vs, vsSrc); this.gl.compileShader(vs);
    if (!this.gl.getShaderParameter(vs, this.gl.COMPILE_STATUS)) { console.error(this.gl.getShaderInfoLog(vs)); return null; }
    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(fs, fsSrc); this.gl.compileShader(fs);
    if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) { console.error(this.gl.getShaderInfoLog(fs)); return null; }
    const prog = this.gl.createProgram()!;
    this.gl.attachShader(prog, vs); this.gl.attachShader(prog, fs); this.gl.linkProgram(prog);
    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) { console.error(this.gl.getProgramInfoLog(prog)); return null; }
    return prog;
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
   * Crea un shader simple para la primera pasada (solo posición + matrices, color constante)
   * Evita tocar atributos compartidos como a_color que puedan colisionar con otros programas.
   */
  private createFirstPassShader(): void {
    if (!this.gl) return;

    const vs = `#version 300 es
      precision highp float;
      in vec3 a_position;
      uniform mat4 u_modelMatrix;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;
      void main() {
        vec4 world = u_modelMatrix * vec4(a_position, 1.0);
        vec4 view = u_viewMatrix * world;
        gl_Position = u_projectionMatrix * view;
      }
    `;
    const fs = `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() {
        fragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `;

    const program = this.compileShaderProgram(vs, fs);
    if (!program) return;
    this.firstPassProgram = program;
    this.firstPassPositionLoc = this.gl.getAttribLocation(program, 'a_position');
    this.firstPassUniforms.modelMatrix = this.gl.getUniformLocation(program, 'u_modelMatrix');
    this.firstPassUniforms.viewMatrix = this.gl.getUniformLocation(program, 'u_viewMatrix');
    this.firstPassUniforms.projectionMatrix = this.gl.getUniformLocation(program, 'u_projectionMatrix');
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
  uniform vec4 u_outlineColor;
      
      void main() {
        vec2 texel = 1.0 / u_resolution;
        float aC = texture(u_colorTexture, v_uv).a;
        // 4-neighborhood sampling
        float aL = texture(u_colorTexture, v_uv + vec2(-texel.x, 0.0)).a;
        float aR = texture(u_colorTexture, v_uv + vec2( texel.x, 0.0)).a;
        float aT = texture(u_colorTexture, v_uv + vec2(0.0,  texel.y)).a;
        float aB = texture(u_colorTexture, v_uv + vec2(0.0, -texel.y)).a;
        
        // Edge if alpha changes between center and any neighbor
        float edge = 0.0;
        edge += float(aC != aL);
        edge += float(aC != aR);
        edge += float(aC != aT);
        edge += float(aC != aB);
        edge = clamp(edge, 0.0, 1.0);
        
        if (edge > 0.0) {
          fragColor = u_outlineColor; // thin, 1px outline, color parametrizable
        } else {
          fragColor = vec4(0.0);
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
      color: [0.0, 1.0, 1.0, 1.0], // Cyan (coherente con wireframe)
      thickness: 1.0,
      intensity: 0.6,
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