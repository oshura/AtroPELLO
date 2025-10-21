/**
 * Sistema de Renderizado de Outlines Avanzado
 * FASE 4: Outline Shaders con Post-procesamiento
 */

import { Injectable } from '@angular/core';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';
import { ITargetable } from '../../types/targeting.types';
import { SuperAsteroid } from '../../SuperAsteroid';
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
  private labelTextureCache: Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: WebGLTexture; w: number; h: number; lastType: string; lastDist: string; lastColorKey: string; lastHealthPct?: string }>= new Map();
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
  // Texturas sólidas para marcadores lejanos (color puro 1x1)
  private solidColorTextures: Map<string, WebGLTexture> | null = null;

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

  // Optional distance origin provider (e.g., ship center). When not set, falls back to camera position.
  private distanceOriginProvider: (() => { x: number; y: number; z: number }) | null = null;

  constructor(private webglService: WebGLService) {
    this.setupPresetConfigs();
  }

  /**
   * Allow external code to provide the origin point used for distance labels.
   * If null, the camera position will be used.
   */
  public setDistanceOriginProvider(fn: (() => { x: number; y: number; z: number }) | null): void {
    this.distanceOriginProvider = fn;
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

  // Outline post-process shader is now owned by OutlineShaderService via ShaderManager

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
  // Siempre visibles (removemos fadeDistance para labels persistentes a largas distancias)
  outlineTarget.isVisible = true;
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
  const outlineProgram = this.shaderManager?.outlineProgram as WebGLProgram | null;
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
    const anyT: any = target as any;
    let radius = Number(anyT.radius);
    if (!(isFinite(radius) && radius > 0)) {
      if (anyT.boundingSphere && typeof anyT.boundingSphere.radius === 'number') {
        radius = Number(anyT.boundingSphere.radius);
      } else if (anyT.scale && typeof anyT.scale.x === 'number') {
        radius = Number(anyT.scale.x);
      } else {
        radius = 10;
      }
    }
    // Giant planet outlines 4x larger
    const isGiantPlanet = (typeof anyT.getTargetType === 'function' && String(anyT.getTargetType()) === 'planet') && anyT.planetType === 'Giant';
    let scale = Math.max(1, radius * 2);
    if (isGiantPlanet) scale *= 4.0;
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
  const originPos = this.getDistanceOriginPosition(view);

  // Parámetros para tamaño fijo en pantalla:
  // Queremos que el billboard mantenga el mismo tamaño aparente que tendría a una distancia de referencia (30u)
  const viewportW = Math.max(1, this.canvasWidth);
  const viewportH = Math.max(1, this.canvasHeight);
  const aspect = viewportW / viewportH;
  const tanHalfFovy = 1 / (proj[5] || 1); // proj[5] = 1 / tan(fovy/2)
  const tanHalfFovx = tanHalfFovy * aspect;
  const distRef = 30; // distancia de referencia solicitada

    // Preparar lista ordenada por distancia (lejos primero) para mejorar blending
    const sorted = Array.from(this.activeOutlines.entries())
      .filter(([_, ot]) => ot.isVisible)
      .map(([id, ot]) => {
        const t = ot.target;
        // Camera-space distance for sorting/blending and screen-size scaling
        const dx = t.position.x - camPos.x;
        const dy = t.position.y - camPos.y;
        const dz = t.position.z - camPos.z;
        const distCam = Math.hypot(dx, dy, dz);
        return { id, ot, dx, dy, dz, distCam };
      })
      .sort((a, b) => b.distCam - a.distCam); // más lejos primero (desc) para que cercanos dibujen al final

    for (const entry of sorted) {
      const { id, ot: outlineTarget, dx, dy, dz, distCam } = entry;
      const target = outlineTarget.target;
      const anyT: any = target as any;
      const isPlanet = (typeof anyT.getTargetType === 'function' && String(anyT.getTargetType()) === 'planet');
      const isGiantPlanet = isPlanet && anyT.planetType === 'Giant';
  // Mostrar etiqueta explícita para SuperAsteroid si aplica
  const typeLabel = target instanceof SuperAsteroid ? 'SuperAsteroid' : this.typeToLabel(target.getTargetType?.());
      // Distance label should be relative to the provided origin (e.g., ship center)
      const dOx = target.position.x - originPos.x;
      const dOy = target.position.y - originPos.y;
      const dOz = target.position.z - originPos.z;
      const distOrigin = Math.hypot(dOx, dOy, dOz);
      const distLabel = `${Math.round(distOrigin)}u`;
      // Sin modulación de alpha por distancia: color constante
      const baseCol = outlineTarget.config.color;
      const textColor = `rgba(${Math.round(baseCol[0]*255)}, ${Math.round(baseCol[1]*255)}, ${Math.round(baseCol[2]*255)}, ${ (baseCol[3] ?? 1.0).toFixed(3) })`;
      // Calcular porcentaje de salud
      let hc = (target as any).healthCurrent ?? (target as any).health;
      let hm = (target as any).healthMax;
      if (hc === undefined && hm === undefined) {
        // Por defecto 100%
        hc = 1; hm = 1;
      } else if (hc !== undefined && hm === undefined) {
        hm = hc; // asumir full
      }
      let healthPctLabel = '';
      if (hc !== undefined && hm !== undefined && hm > 0) {
        const pct = Math.min(999, Math.max(0, (hc / hm) * 100));
        healthPctLabel = `${Math.round(pct)}%`;
      }
  const texEntry = this.getOrCreateLabelTexture(id, typeLabel, distLabel, textColor, healthPctLabel);

      // Model matrix: translate to target, orient to camera (copy rotation from invView), scale to a readable size
  const model = mat4.create();
  // Centrado sobre el objetivo (sin desplazamiento vertical)
  const radius = (target as any).radius ? Number((target as any).radius) : 2.0;
  mat4.translate(model, model, [target.position.x, target.position.y, target.position.z]);
      model[0] = invView[0]; model[1] = invView[1]; model[2] = invView[2];
      model[4] = invView[4]; model[5] = invView[5]; model[6] = invView[6];
      model[8] = invView[8]; model[9] = invView[9]; model[10] = invView[10];

  // Screen-size scaling uses camera distance to maintain constant apparent size
  const distance = Math.max(0.001, distCam);
  const distantThreshold = 300;
      if (distance > distantThreshold) {
        // Renderizar marcador compacto: cuadrado pequeño fijo (ej: 18px) manteniendo orientación a cámara.
        let markerPx = 18;
        if (isGiantPlanet) markerPx *= 4; // gigantes: marcador 4x grande
        const markerWorld = (markerPx / viewportW) * 2.0 * distance * tanHalfFovx;
        mat4.scale(model, model, [markerWorld, markerWorld, 1]);
        this.gl.uniformMatrix4fv(this.worldBillboardUniforms.model, false, model as unknown as Float32Array);
        // Generar un color sólido en una mini-textura 1x1 cacheada por color clave
        const colorKey = baseCol.join('_');
        if (!this.solidColorTextures) this.solidColorTextures = new Map();
        let solidTex = this.solidColorTextures.get(colorKey);
        if (!solidTex) {
          const tmp = this.gl.createTexture()!;
          this.gl.bindTexture(this.gl.TEXTURE_2D, tmp);
          const rgba = new Uint8Array([
            Math.min(255, Math.max(0, Math.round(baseCol[0]*255))),
            Math.min(255, Math.max(0, Math.round(baseCol[1]*255))),
            Math.min(255, Math.max(0, Math.round(baseCol[2]*255))),
            Math.min(255, Math.max(0, Math.round((baseCol[3] ?? 1)*255)))
          ]);
          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, rgba);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
          this.solidColorTextures.set(colorKey, tmp);
          solidTex = tmp;
        }
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, solidTex!);
        this.gl.uniform1i(this.worldBillboardUniforms.sampler, 0);
        this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
      } else {
        // Billboard normal con textura
        let constantPxWidth = 162; // ancho base cercano
        if (isGiantPlanet) constantPxWidth *= 4; // gigantes: ancho 4x para destacar outline/label
  let widthWorld = (constantPxWidth / viewportW) * 2.0 * distance * tanHalfFovx;
        const minWidthWorld = 0.01;
        if (widthWorld < minWidthWorld) widthWorld = minWidthWorld;
        const heightWorld = widthWorld * (texEntry!.h / texEntry!.w);
        mat4.scale(model, model, [widthWorld, heightWorld, 1]);
        this.gl.uniformMatrix4fv(this.worldBillboardUniforms.model, false, model as unknown as Float32Array);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texEntry!.tex);
        this.gl.uniform1i(this.worldBillboardUniforms.sampler, 0);
        this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
      }
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

  // Obtener posiciones: cámara (para proyección) y origen de distancia (para etiqueta)
  const invView = mat4.create();
  mat4.invert(invView, this.lastViewMatrix);
  const camPos = { x: invView[12], y: invView[13], z: invView[14] };
  const originPos = this.getDistanceOriginPosition(this.lastViewMatrix);

    for (const [id, outlineTarget] of this.activeOutlines) {
      if (!outlineTarget.isVisible) continue;
      const target = outlineTarget.target;
      // Proyectar a pantalla
      const scr = this.worldToScreen(target.position, this.lastViewMatrix, this.lastProjectionMatrix);
      if (!scr || scr.w <= 0) continue; // detrás de cámara
      // Crear/actualizar textura de label
  // Mostrar etiqueta explícita para SuperAsteroid si aplica
  const typeLabel = target instanceof SuperAsteroid ? 'SuperAsteroid' : this.typeToLabel(target.getTargetType?.());
      // Distancia para etiqueta: respecto al origen compartido (p.ej. centro de la nave)
      const dist = Math.hypot(
        target.position.x - originPos.x,
        target.position.y - originPos.y,
        target.position.z - originPos.z
      );
      const distLabel = `${Math.round(dist)}u`;
  // Color heredado del outline (animosidad)
  const col = outlineTarget.config.color || [0,1,1,0.95];
  const rgbaCss = `rgba(${Math.round(col[0]*255)}, ${Math.round(col[1]*255)}, ${Math.round(col[2]*255)}, ${col[3] ?? 0.95})`;
  const cache = this.getOrCreateLabelTexture(id, typeLabel, distLabel, rgbaCss);
      // Posicionar y dibujar (centrado en el target)
      gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cache!.tex);
      gl.uniform1i(this.labelUniforms.sampler, 0);
      gl.uniform2f(this.labelUniforms.translate, scr.x, scr.y);
  // Escala 1:1 con un pequeño factor para legibilidad en distancia
  gl.uniform2f(this.labelUniforms.size, cache!.w, cache!.h);
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
  // Margen relajado para evitar parpadeo en límites (overscan 10%)
  const margin = 0.1;
  if (nx < -1 - margin || nx > 1 + margin || ny < -1 - margin || ny > 1 + margin) return null;
    const sx = (nx * 0.5 + 0.5) * this.canvasWidth;
    const sy = (1 - (ny * 0.5 + 0.5)) * this.canvasHeight;
    return { x: sx, y: sy, w: cw };
  }

  private getOrCreateLabelTexture(id: string, typeLabel: string, distLabel: string, textColorCss: string, healthPctLabel: string = '') {
    if (!this.gl) throw new Error('GL missing');
  let entry = this.labelTextureCache.get(id);
  const dirty = !entry || entry.lastType !== typeLabel || entry.lastDist !== distLabel || entry.lastColorKey !== textColorCss || (entry as any).lastHealthPct !== healthPctLabel;
  if (!entry) {
  const canvas = document.createElement('canvas');
  canvas.width = 172; canvas.height = 88; // ancho reducido para evitar escalado lateral, altura fija
      const ctx = canvas.getContext('2d')!;
      const tex = this.gl.createTexture()!;
  entry = { canvas, ctx, tex, w: canvas.width, h: canvas.height, lastType: '', lastDist: '', lastColorKey: '', lastHealthPct: '' };
      this.labelTextureCache.set(id, entry);
      // Inicializar textura
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }
  if (entry && entry.w !== 172) {
      entry.canvas.width = 172; entry.w = 172;
    }
  if (dirty && entry) {
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
      // Borde compuesto: laterales sólidos + líneas superior/inferior discontinuas con huecos bajo el texto
      ctx.lineWidth = 1;
      const strokeColor = textColorCss.replace('rgba(', 'rgba(').replace(/\)$/, '')
        .replace(/,\s*([0-9]*\.?[0-9]+)\s*$/, (_, a)=>`, ${Math.min(1, Math.max(0, Number(a)*0.6))}`) + ')';
      ctx.strokeStyle = strokeColor;

      // Medir textos para determinar huecos
      ctx.font = '400 18px Segoe UI, Roboto, sans-serif';
      const typeMetrics = ctx.measureText(typeLabel);
      const typeWidth = typeMetrics.width;
      ctx.font = '300 16px Segoe UI, Roboto, sans-serif';
  const distMetrics = ctx.measureText(distLabel);
  const distWidth = distMetrics.width;
  ctx.font = '300 16px Segoe UI, Roboto, sans-serif';
  const healthWidth = healthPctLabel ? ctx.measureText(healthPctLabel).width : 0;

  const padX = 10; // margen desde los lados (ajustado para ancho 120px)
      const gapPad = 8; // margen interno alrededor del texto dentro de la línea

  // (Eliminadas verticales completas para usar solo el tramo interno entre topY y bottomY)

      // --- Revertido a lógica simple de líneas dash sin esquinas reforzadas ---
      // Ajustes: reducir altura tipografía y hacer que sobresalga medio cuerpo fuera del rectángulo
      const topFontSize = 16; // antes 18
      const bottomFontSize = 14; // antes 16
      // Re-medimos con nuevas fuentes
      ctx.font = `400 ${topFontSize}px Segoe UI, Roboto, sans-serif`;
      const typeMetrics2 = ctx.measureText(typeLabel);
      const typeWidth2 = typeMetrics2.width;
      ctx.font = `300 ${bottomFontSize}px Segoe UI, Roboto, sans-serif`;
      const distWidth2 = ctx.measureText(distLabel).width;
      const healthWidth2 = healthPctLabel ? ctx.measureText(healthPctLabel).width : 0;

      // Definimos línea superior/inferior desplazadas hacia el centro para permitir sobresalir textos
      const marginTop = topFontSize * 0.5 + 2; // espacio para que media altura sobresalga
      const marginBottom = bottomFontSize * 0.5 + 2;
      const topY = marginTop; // línea superior interna
      const bottomY = H - marginBottom; // línea inferior interna

      // Verticales sólidas (ajustadas a nuevas Y)
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0.5, topY);
      ctx.lineTo(0.5, bottomY);
      ctx.moveTo(W-0.5, topY);
      ctx.lineTo(W-0.5, bottomY);
      ctx.stroke();

      // Líneas horizontales con puntos (dotted) dejando huecos bajo textos
      const typeStart = (W - typeWidth2) / 2 - gapPad;
      const typeEnd = (W + typeWidth2) / 2 + gapPad;
      const distLeftX2 = padX;
      const distRightX2 = padX + distWidth2;
      const healthRightX2 = W - padX;
      const healthLeftX2 = healthPctLabel ? (healthRightX2 - healthWidth2) : healthRightX2;
      const gapDistPad = 4, gapHealthPad = 4;
      // Helper para dibujar puntos en un rango
      const drawDots = (x1: number, x2: number, y: number) => {
        const dotSpacing = 7; // px entre centros (se mantiene)
        const r = 0.8; // radio reducido para puntos más finos
        if (x2 - x1 < r*2) return;
        for (let x = x1; x <= x2; x += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI*2);
          ctx.fillStyle = strokeColor; // usar strokeColor para coherencia
          ctx.fill();
        }
      };
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      // TOP: segmentos izquierdo y derecho fuera del hueco del tipo
      const topLeftEnd = Math.max(padX, typeStart);
      const topRightStart = Math.min(typeEnd, W - padX);
      drawDots(padX, topLeftEnd, topY);
      drawDots(topRightStart, W - padX, topY);
      // BOTTOM: segmentos antes distancia, entre distancia y salud, y después salud
      const beforeDistEnd = Math.max(padX, distLeftX2 - gapDistPad);
      drawDots(padX, beforeDistEnd, bottomY);
      const afterDist2 = distRightX2 + gapDistPad;
      if (healthPctLabel && afterDist2 < healthLeftX2 - gapHealthPad) {
        drawDots(afterDist2, healthLeftX2 - gapHealthPad, bottomY);
      }
      if (healthPctLabel) {
        drawDots(healthRightX2 + gapHealthPad, W - padX, bottomY);
      } else {
        drawDots(distRightX2 + gapDistPad, W - padX, bottomY);
      }

      // Dibujar pequeños marcos 1px alrededor de cada texto (tipo centrado, dist izquierda, salud derecha)
      const framePadX = 4, framePadY = 2;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      // Coordenadas cajas
      const typeBoxW = typeWidth2 + framePadX*2;
      const typeBoxH = topFontSize + framePadY*2;
      const typeBoxX = (W - typeBoxW)/2;
      const typeBoxY = topY - topFontSize*0.5 - framePadY; // mitad sobresaliendo
      const distBoxW = distWidth2 + framePadX*2;
      const distBoxH = bottomFontSize + framePadY*2;
      const distBoxX = padX - framePadX;
      const distBoxY = bottomY - bottomFontSize*0.5 - framePadY;
      const healthBoxW = healthWidth2 + framePadX*2;
      const healthBoxH = bottomFontSize + framePadY*2;
      const healthBoxX = healthPctLabel ? (healthLeftX2 - framePadX) : (W - padX - framePadX);
      const healthBoxY = distBoxY;
      ctx.beginPath();
      // type frame
      ctx.rect(typeBoxX+0.5, typeBoxY+0.5, typeBoxW, typeBoxH);
      // distance frame
      ctx.rect(distBoxX+0.5, distBoxY+0.5, distBoxW, distBoxH);
      if (healthPctLabel) ctx.rect(healthBoxX+0.5, healthBoxY+0.5, healthBoxW, healthBoxH);
      ctx.stroke();

      // Texto
      ctx.fillStyle = textColorCss;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      // top type: baseline top y tal que sobresalga mitad
      ctx.font = `400 ${topFontSize}px Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const typeTextY = topY - topFontSize*0.5; // medio fuera
      ctx.fillText(typeLabel, W/2, typeTextY);
      // bottom distance / health
      ctx.font = `300 ${bottomFontSize}px Segoe UI, Roboto, sans-serif`;
      ctx.textBaseline = 'bottom';
      const bottomTextY = bottomY + bottomFontSize*0.5; // medio fuera
      ctx.textAlign = 'left';
      ctx.fillText(distLabel, padX, bottomTextY);
      ctx.textAlign = 'right';
      ctx.fillText(healthPctLabel, W - padX, bottomTextY);
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
  entry.lastHealthPct = healthPctLabel;
    }
    return entry;
  }

  private typeToLabel(tt: any): string {
    const t = String(tt || 'unknown').toLowerCase();
    if (t.includes('super_asteroid') || t === 'superasteroid') return 'SuperAsteroid';
    if (t.includes('cluster')) return 'Cluster';
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

  // Outline shaders are provided by OutlineShaderService; no creation here

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

  // Removed: createOutlinePostProcessShader (outline program now comes from OutlineShaderService via ShaderManager)

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
    // Prefer the shared origin provider when available, otherwise camera (from lastViewMatrix)
    const origin = this.getDistanceOriginPosition(this.lastViewMatrix || undefined);
    const dx = target.position.x - origin.x;
    const dy = target.position.y - origin.y;
    const dz = target.position.z - origin.z;
    return Math.hypot(dx, dy, dz);
  }

  /**
   * Returns the world-space position used as origin for distance labels.
   * - If a custom provider is set, use it.
   * - Otherwise, fall back to camera position extracted from the given view matrix.
   */
  private getDistanceOriginPosition(viewMatrix?: mat4): { x: number; y: number; z: number } {
    if (this.distanceOriginProvider) {
      try {
        const v = this.distanceOriginProvider();
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) return v;
      } catch {}
    }
    // Fallback: camera from view matrix
    const vm = viewMatrix ?? this.lastViewMatrix;
    if (vm) {
      const inv = mat4.create();
      mat4.invert(inv, vm);
      return { x: inv[12], y: inv[13], z: inv[14] };
    }
    // Ultimate fallback
    return { x: 0, y: 0, z: 0 };
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