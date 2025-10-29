/**
 * Manager Principal del Sistema de Retícula WebGL
 * FASE 1: Core Targeting System
 */

import { Injectable } from '@angular/core';
import { 
  ReticleState, 
  ReticleSystemState, 
  ScreenPosition,
  TargetingEvents,
  TargetingSystemConfig,
  DEFAULT_TARGETING_CONFIG,
  RaycastHit,
  HighlightType
} from '../types/reticle.types';
import { ITargetable } from '../../types/targeting.types';
import { TargetType } from '../../types/targeting.types';
import { TargetDetector } from './TargetDetector';
import { InputHandler } from './InputHandler';
import { ReticleRenderer } from '../rendering/ReticleRenderer';
import { TargetHighlighter } from '../rendering/TargetHighlighter';
import { OutlineRenderer, OutlineType } from '../rendering/OutlineRenderer';
import { Camera } from '../../Camera';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';
import { mat4 } from 'gl-matrix';
import { SpaceshipDebugCollector } from '../../../services/debug/spaceship-debug-collector.service';
import { RelationService } from '../../../services/relation.service';
import { TargetingWorkerService, WorkerResult } from '../worker/TargetingWorker.service';

@Injectable({
  providedIn: 'root'
})
export class ReticleManager {
  private state: ReticleSystemState;
  private config: TargetingSystemConfig;
  private events: TargetingEvents;
  
  private targetDetector: TargetDetector;
  private inputHandler: InputHandler;
  private reticleRenderer: ReticleRenderer;
  private targetHighlighter: TargetHighlighter;
  private outlineRenderer: OutlineRenderer;
  
  private isInitialized: boolean = false;
  private lastUpdateTime: number = 0;
  // Throttle para detección adaptativo según FPS
  private detectIntervalMs: number = 16; // ~60Hz base, se ajustará dinámicamente
  private lastDetectTime: number = 0;
  private frameTimings: number[] = []; // Historial de deltaTime para calcular FPS promedio
  
  // Tracking de velocidad del mouse para retícula dinámica
  private lastMousePosition: ScreenPosition = { x: 0, y: 0 };
  private mouseVelocity: number = 0;
  private reticleOpenness: number = 0.5; // 0=cerrado, 1=abierto
  private velocitySmoothing: number = 0.9; // Suavizado de velocidad
  
  // Estabilización de targeting para FPS altos
  private lastStableTarget: ITargetable | null = null;
  private targetStabilityFrames: number = 0;
  private readonly TARGET_STABILITY_THRESHOLD = 3; // Frames para confirmar cambio de target

  // Debug snapshot storage
  private lastHit: RaycastHit | null = null;
  private lastDetectionRadiusPx: number = 0;
  // Worker integration
  private workerService: TargetingWorkerService;
  private lastViewProjection: Float32Array | null = null;
  private lastViewport: { width: number; height: number } | null = null;
  private lastTargetsCompact: { positions: Float32Array; ids: string[] } | null = null;
  // Worker gating
  private snapshotVersion: number = 0; // increments when compact targets change
  private lastSentRequestTime: number = 0;
  private lastAccepted: { time: number; version: number } = { time: 0, version: -1 };
  private lastTargetsSignature: string = '';
  private lastViewportSize: { width: number; height: number } | null = null;

  constructor(
    targetDetector: TargetDetector,
    inputHandler: InputHandler,
    reticleRenderer: ReticleRenderer,
    targetHighlighter: TargetHighlighter,
    outlineRenderer: OutlineRenderer,
    private webglService: WebGLService,
    private debugCollector: SpaceshipDebugCollector,
    workerService: TargetingWorkerService,
    private relationService: RelationService
  ) {
    this.targetDetector = targetDetector;
    this.inputHandler = inputHandler;
    this.reticleRenderer = reticleRenderer;
    this.targetHighlighter = targetHighlighter;
    this.outlineRenderer = outlineRenderer;
    this.config = { ...DEFAULT_TARGETING_CONFIG };
  this.workerService = workerService;
    
    // Deshabilitar animación de pulso (solo velocidad del mouse)
    this.config.reticle.animated = false;
    this.config.reticle.animationSpeed = 0;
    
    // Estado inicial del sistema (retícula centrada por defecto)
    this.state = {
      currentState: ReticleState.IDLE,
      mousePosition: { x: 512, y: 384 }, // Centro por defecto
      currentTarget: null,
      hoveredTarget: null,
      reticlePosition: { x: 512, y: 384 }, // Centro por defecto
      isVisible: true,
      config: this.config.reticle
    };

    // Eventos del sistema
    this.events = {
      onTargetHovered: (target) => this.handleTargetHovered(target),
      onTargetSelected: (target) => this.handleTargetSelected(target),
      onTargetLocked: (target) => this.handleTargetLocked(target),
      onTargetLost: () => this.handleTargetLost(),
      onStateChanged: (newState, oldState) => this.handleStateChanged(newState, oldState),
      onCycleNext: () => this.cycleTarget(1),
      onCyclePrev: () => this.cycleTarget(-1)
    };
  }

  /**
   * Allow external code to provide the origin point used by distance calculations
   * in the TargetDetector (for example, the player's ship position).
   */
  public setDistanceOriginProvider(fn: (() => { x: number; y: number; z: number }) | null): void {
    this.targetDetector.setDistanceOriginProvider(fn);
    // Keep OutlineRenderer labels consistent with detector distances
    this.outlineRenderer.setDistanceOriginProvider(fn);
  }

  /**
   * Inicializa el sistema de retícula
   */
  public initialize(camera: Camera, shaderManager: ShaderManager): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const canvas = this.webglService.getCanvas();
        if (!canvas) {
          console.error('❌ ReticleManager: Canvas no disponible');
          resolve(false);
          return;
        }

  // Inicializar componentes
  this.targetDetector.initialize(camera);
  this.inputHandler.initialize(canvas, this.events);
  // Propagar configuración de input (incluye cycleNextKey 't') al handler
  this.inputHandler.updateConfig(this.config.input);
        this.targetHighlighter.initialize(shaderManager);
        
        // Inicializar renderizador de retícula
        const rendererInit = this.reticleRenderer.initialize(shaderManager);
        if (!rendererInit) {
          console.error('❌ ReticleManager: Error inicializando ReticleRenderer');
          resolve(false);
          return;
        }

        // Inicializar outline renderer
        const outlineInit = this.outlineRenderer.initialize(shaderManager);
        if (!outlineInit) {
          console.error('❌ ReticleManager: Error inicializando OutlineRenderer');
          resolve(false);
          return;
        }

    this.isInitialized = true;
    // Initialize worker
    this.workerService.init();
        this.lastUpdateTime = performance.now();

        console.log('🎯 ReticleManager inicializado correctamente con renderizador');
        console.log('🎯 Estado inicial:', this.state);
        resolve(true);
      } catch (error) {
        console.error('❌ Error inicializando ReticleManager:', error);
        resolve(false);
      }
    });
  }

  /**
   * Actualiza el sistema de retícula cada frame
   */
  public update(deltaTime: number, availableTargets: ITargetable[]): void {
    if (!this.isInitialized) {
      // Quiet when not initialized
      return;
    }
    
    // Debug crítico para verificar que update se ejecuta
    // Reduce periodic debug spam

    const currentTime = performance.now();
    
    // DEBUG: Temporalmente sin throttle para verificar renderizado
    // if (currentTime - this.lastUpdateTime < 1000 / this.config.performance.updateFrequency) {
    //   return;
    // }

    this.lastUpdateTime = currentTime;
    
    // Actualizar historial de frame timings para FPS adaptativo
    this.updateFrameTimings(deltaTime);

    // Actualizar targets disponibles
    this.targetDetector.updateAvailableTargets(availableTargets);

    // Actualizar posición del mouse
    this.state.mousePosition = this.inputHandler.getMousePosition();
    
    // Calcular velocidad del mouse para retícula dinámica
    this.updateMouseVelocity(deltaTime);
    
    // Actualizar posición de la retícula (sigue al mouse por defecto)
    this.updateReticlePosition();

    // ========================================
    // TARGETING SYSTEM DISABLED FOR REFACTORING
    // Solo mantenemos retícula dinámica y consumimos clicks para evitar errores
    // ========================================
    
    // Consumir clicks para que no se acumulen (pero no hacer nada)
    if (this.inputHandler.consumeClick()) {
      console.log('🎯 Click detectado - targeting system disabled during refactoring');
    }
    
    // Limpiar targets existentes si los hay
    if (this.state.currentTarget || this.state.hoveredTarget) {
      this.state.currentTarget = null;
      this.state.hoveredTarget = null;
      console.log('🧹 Targets limpiados - sistema deshabilitado');
    }

    // HUD hover info is handled by HUDManager texture, not here.
  }

  /**
   * Renderiza la retícula en pantalla
   */
  public render(deltaTime: number): void {
    if (!this.isInitialized || !this.state.isVisible) {
      // Quiet when not visible
      return;
    }

  // Quiet frequent render logs

    // Renderizar retícula en la posición actual
    this.reticleRenderer.render(
      this.state.reticlePosition,
      this.state.config,
      deltaTime
    );

    // Sistema de highlights deshabilitado durante refactoring
    // this.targetHighlighter.render();
  }

  /**
   * Renderiza outlines de targets (debe llamarse desde el GameEngine)
   * [DISABLED] - No renderiza outlines durante refactoring
   */
  public renderOutlines(viewMatrix: mat4, projectionMatrix: mat4, targets: ITargetable[]): void {
    if (!this.isInitialized) return;
    
    // Sistema deshabilitado - no renderizar outlines
    // this.outlineRenderer.renderOutlines(viewMatrix, projectionMatrix, targets);

    // Cache combined viewProjection and viewport for worker snapshot
    try {
      const vp = new Float32Array(16);
      // vp = projection * view (column-major) using minimal multiply to avoid extra dependency
      // mat4.multiply(out, a, b)
      const a = projectionMatrix as unknown as Float32Array;
      const b = viewMatrix as unknown as Float32Array;
      // Compute out = a*b
      for (let i = 0; i < 4; i++) {
        const ai0 = a[i];      const ai1 = a[i + 4];  const ai2 = a[i + 8];  const ai3 = a[i + 12];
        vp[i]      = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
        vp[i + 4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
        vp[i + 8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
        vp[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
      }
  this.lastViewProjection = vp;
  const canvas = this.webglService.getCanvas();
  if (canvas) this.lastViewport = { width: canvas.width, height: canvas.height };
      // Prepare compact targets buffer
      const active = targets.filter(t => t.isActive());
      const positions = new Float32Array(active.length * 3);
      const ids: string[] = new Array(active.length);
      for (let i = 0; i < active.length; i++) {
        const p = active[i].position; ids[i] = active[i].id;
        positions[i*3] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = p.z;
      }
      // Compute a stable signature based on IDs only (order-sensitive)
      const signature = ids.join('|');
      const viewportChanged = !this.lastViewportSize ||
        this.lastViewportSize.width !== this.lastViewport!.width ||
        this.lastViewportSize.height !== this.lastViewport!.height;

      this.lastTargetsCompact = { positions, ids };
      if (signature !== this.lastTargetsSignature || viewportChanged) {
        this.snapshotVersion++;
        this.lastTargetsSignature = signature;
        this.lastViewportSize = { ...this.lastViewport! };
      }
    } catch {}
  }

  /**
   * Actualiza la posición de la retícula
   */
  private updateReticlePosition(): void {
    // Siempre seguir al mouse para evitar congelamiento al seleccionar
    // (Podremos reintroducir seguimiento al target en un modo específico más adelante)
    this.state.reticlePosition = { ...this.state.mousePosition };
  }

  /**
   * Detecta targets bajo la posición actual
   */
  private updateTargetDetection(): void {
    const now = performance.now();
    // Throttle adaptativo: ajustar según FPS actual para mantener responsividad
    const adaptiveThrottle = this.calculateAdaptiveThrottle();
    if (now - this.lastDetectTime < adaptiveThrottle) {
      return;
    }
    this.lastDetectTime = now;
    // console.log('🔍 updateTargetDetection() - throttled - mousePos:', this.state.mousePosition);
    // Radio de detección inversamente proporcional al tamaño de la retícula
    // Objetivo UX: cuando la retícula es pequeña (mouse quieto), el radio de acierto es grande.
    // Cuando la retícula es grande (mouse rápido), el radio se reduce.
    // Además, aplicar un boost extra cuando la velocidad del mouse es baja para facilitar el apuntado fino.
    const reticleSize = this.state.config.size; // px (ver updateMouseVelocity: 25..70 aprox)

    // Rango esperado de tamaño dinámico de la retícula (ver updateMouseVelocity)
    const MIN_SIZE = 25;
    const MAX_SIZE = 70;
    const sizeT = Math.max(0, Math.min(1, (reticleSize - MIN_SIZE) / (MAX_SIZE - MIN_SIZE))); // 0..1

    // Rango del radio base (en píxeles): grande cuando sizeT=0, pequeño cuando sizeT=1
    const MIN_R = 35;  // radio mínimo cuando la retícula está grande (aumentado significativamente de 25)
    const MAX_R = 220; // radio máximo cuando la retícula está pequeña / quieta (aumentado de 180)
    const baseRadius = MAX_R - (MAX_R - MIN_R) * sizeT; // inverse lerp

    // Factor por velocidad del mouse: más boost cuanto más quieto
    const vNorm = Math.min(1, this.mouseVelocity / 600); // 0..1 (ver normalización en updateMouseVelocity)
    const velFactor = 1.6 - 0.3 * vNorm; // 1.6 en reposo → 1.3 a velocidad alta (MUY tolerante)

  // Escala aumentada significativamente para objetos lejanos
  const SCALE = 1.0; // Aumentado de 0.85 a 1.0 para máxima tolerancia
  const detectionRadius = Math.max(30, Math.min(220, baseRadius * velFactor * SCALE));
    this.lastDetectionRadiusPx = detectionRadius;
  // Try worker-assisted shortlist first
  const hit = this.detectWithWorkerFallback(detectionRadius);
  this.lastHit = hit || null;
  // Quiet frequent hit logs

    // If worker is in use and we haven't accepted a fresh result recently, clear hover to avoid sticky outlines
    const workerActive = this.workerService.ready();
    const staleMs = performance.now() - this.lastAccepted.time;
    if (workerActive && staleMs > Math.max(250, this.detectIntervalMs * 3)) {
      if (this.state.hoveredTarget) {
        this.events.onTargetHovered(null);
      }
    }

    // Exportar snapshot para overlay de debug (si está activo)
    try {
      this.debugCollector.setTargetingSnapshot(this.getDebugSnapshot());
    } catch {}
    
    const newHoveredTarget = hit?.target || null;
    
    // Sistema de estabilización para evitar flickering a FPS altos
    const stabilizedTarget = this.stabilizeTargetSelection(newHoveredTarget);
    
    // Debug FORZADO para verificar detección
    // Reduced debug noise
    
    // Verificar cambio en hover usando target estabilizado
    if (stabilizedTarget !== this.state.hoveredTarget) {
      // Importante: NO mutar state.hoveredTarget aquí. Dejamos que el handler lo actualice,
      // así puede comparar correctamente contra el valor previo y disparar efectos (outline/highlight).
      // Quiet hover change spam
      this.events.onTargetHovered(stabilizedTarget);
    }
  }

  // Sends a snapshot to the worker and uses the latest result to choose hovered target; falls back if needed
  private detectWithWorkerFallback(detectionRadius: number): RaycastHit | null {
    try {
      if (this.workerService.ready() && this.lastViewProjection && this.lastViewport && this.lastTargetsCompact) {
        // Request fresh computation
        const reqTime = performance.now();
        this.lastSentRequestTime = reqTime;
        this.workerService.requestHover({
          vp: Array.from(this.lastViewProjection),
          viewport: this.lastViewport,
          mouse: { x: this.state.mousePosition.x, y: this.state.mousePosition.y },
          positions: this.lastTargetsCompact.positions,
          time: reqTime,
          targetsVersion: this.snapshotVersion,
          topK: 8
        });
        const res: WorkerResult | null = this.workerService.getLastResult(200);
        // Accept only if result is for the latest snapshot version and not older than the last accepted
        if (res && res.indices.length && res.targetsVersion === this.snapshotVersion && res.time >= this.lastAccepted.time) {
          this.lastAccepted = { time: res.time, version: res.targetsVersion };
          // Build a tiny shortlist and re-check precisely in main thread
          const shortlistIds: string[] = res.indices.map(i => this.lastTargetsCompact!.ids[i]);
          const all = this.targetDetector.getVisibleTargets();
          const candidates = all.filter(t => shortlistIds.includes(String(t.id)));
          const precise = this.targetDetector.detectAmong(this.state.mousePosition, detectionRadius, candidates);
          return precise;
        }
      }
    } catch (e) {
      console.warn('⚠️ Worker detect failed, ignoring this cycle:', e);
    }
    // If worker is ready but we didn't accept a result this cycle, avoid conflicting fallback to reduce jitter
    if (this.workerService.ready()) {
      return null;
    }
    // Fallback only when worker is not available
    return this.targetDetector.detectTargetAt(this.state.mousePosition, detectionRadius);
  }

  /**
   * Devuelve un snapshot de debug con info de targeting y mouse
   */
  public getDebugSnapshot(): {
    mouse: { x: number; y: number; velocity: number };
    hovered?: { id: string; name: string; type: string } | null;
    selected?: { id: string; name: string; type: string } | null;
    hit?: {
      distance?: number;
      screenPosition?: { x: number; y: number } | null;
      radiusPx: number;
    } | null;
  } {
    const hovered = this.state.hoveredTarget
      ? { id: String(this.state.hoveredTarget.id), name: this.state.hoveredTarget.getDisplayName(), type: this.state.hoveredTarget.getTargetType() }
      : null;
    const selected = this.state.currentTarget
      ? { id: String(this.state.currentTarget.id), name: this.state.currentTarget.getDisplayName(), type: this.state.currentTarget.getTargetType() }
      : null;

    const hit = this.lastHit
      ? {
          distance: this.lastHit.distance,
          screenPosition: this.lastHit.screenPosition,
          radiusPx: this.lastDetectionRadiusPx,
        }
      : this.lastDetectionRadiusPx
      ? { radiusPx: this.lastDetectionRadiusPx }
      : null;

    return {
      mouse: { x: this.state.mousePosition.x, y: this.state.mousePosition.y, velocity: this.mouseVelocity },
      hovered,
      selected,
      hit,
    };
  }

  /**
   * Actualiza el historial de frame timings para calcular FPS promedio
   */
  private updateFrameTimings(deltaTime: number): void {
    // Mantener los últimos 30 frames para calcular FPS estable
    this.frameTimings.push(deltaTime);
    if (this.frameTimings.length > 30) {
      this.frameTimings.shift();
    }
  }

  /**
   * Calcula el throttle adaptativo basado en FPS actual
   */
  private calculateAdaptiveThrottle(): number {
    if (this.frameTimings.length < 5) {
      return this.detectIntervalMs; // Usar default hasta tener suficientes muestras
    }
    
    // Calcular FPS promedio de los últimos frames
    const avgDeltaTime = this.frameTimings.reduce((sum, dt) => sum + dt, 0) / this.frameTimings.length;
    const currentFPS = avgDeltaTime > 0 ? 1000 / avgDeltaTime : 60;
    
    // Throttle adaptativo: más detecciones por segundo a FPS más altos
    // - A 60+ FPS: detectar cada frame (0ms throttle)
    // - A 30-60 FPS: detectar cada 16ms (~60Hz)
    // - A 15-30 FPS: detectar cada 33ms (~30Hz) 
    // - Menos de 15 FPS: detectar cada 50ms (~20Hz)
    
    if (currentFPS >= 55) {
      return 0; // Sin throttle a FPS altos - detectar cada frame
    } else if (currentFPS >= 35) {
      return 16; // ~60Hz
    } else if (currentFPS >= 20) {
      return 33; // ~30Hz
    } else {
      return 50; // ~20Hz para FPS muy bajos
    }
  }

  /**
   * Estabiliza la selección de targets para evitar flickering a FPS altos
   */
  private stabilizeTargetSelection(candidateTarget: ITargetable | null): ITargetable | null {
    // Si no hay candidato, resetear estabilidad
    if (!candidateTarget) {
      this.lastStableTarget = null;
      this.targetStabilityFrames = 0;
      return null;
    }
    
    // Si es el mismo target que antes, mantenerlo
    if (candidateTarget === this.lastStableTarget) {
      this.targetStabilityFrames = Math.min(this.targetStabilityFrames + 1, this.TARGET_STABILITY_THRESHOLD + 5);
      return candidateTarget;
    }
    
    // Si es un target diferente, verificar estabilidad
    if (candidateTarget !== this.lastStableTarget) {
      this.targetStabilityFrames = 0;
      this.lastStableTarget = candidateTarget;
    }
    
    // Solo cambiar después de algunos frames consecutivos
    if (this.targetStabilityFrames >= this.TARGET_STABILITY_THRESHOLD) {
      return candidateTarget;
    }
    
    // Mantener el target anterior hasta que se estabilice
    return this.state.hoveredTarget;
  }

  /**
   * Calcula la velocidad del mouse para retícula dinámica
   */
  private updateMouseVelocity(deltaTime: number): void {
    const currentPos = this.state.mousePosition;
    const lastPos = this.lastMousePosition;
    
    // Calcular distancia euclidiana
    const dx = currentPos.x - lastPos.x;
    const dy = currentPos.y - lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calcular velocidad instantánea (píxeles por segundo)
    const instantVelocity = deltaTime > 0 ? distance / deltaTime : 0;
    
    // Aplicar suavizado exponencial para evitar saltos bruscos
    this.mouseVelocity = this.mouseVelocity * this.velocitySmoothing + 
                        instantVelocity * (1 - this.velocitySmoothing);
    
    // Actualizar openness con curva logarítmica/exponencial
    // Velocidades bajas: poco cambio. Velocidades altas: crecimiento rápido
    const velocityNormalized = Math.min(this.mouseVelocity / 600, 2.0); // Normalizar hasta 600px/s
    
    // Curva exponencial: f(x) = x^2.5 para crecimiento rápido en extremos
    const exponentialCurve = Math.pow(velocityNormalized, 2.5);
    const targetOpenness = Math.min(exponentialCurve, 1.0);
    
    // Suavizar transición de openness
    this.reticleOpenness += (targetOpenness - this.reticleOpenness) * deltaTime * 5.0;
    
    // Configuración con mayor rango dinámico
    this.state.config.size = 25 + (this.reticleOpenness * 45); // 25-70px
    this.state.config.thickness = 1.5 + (this.reticleOpenness * 2.5); // 1.5-4px  
    this.state.config.opacity = 0.5 + (this.reticleOpenness * 0.5); // 0.5-1.0
    
    // Guardar posición para próximo frame
    this.lastMousePosition = { ...currentPos };
    
    // Debug ocasional con info de FPS y targeting
    if (Math.random() < 0.005) { // 0.5% de chance por frame para reducir spam
      const currentFPS = this.frameTimings.length > 0 ? 
        Math.round(1000 / (this.frameTimings.reduce((sum, dt) => sum + dt, 0) / this.frameTimings.length)) : 0;
      const throttle = this.calculateAdaptiveThrottle();
      console.log('� Targeting Status:', {
        FPS: currentFPS,
        throttle: throttle + 'ms',
        mouseVelocity: Math.round(this.mouseVelocity),
        reticleOpenness: Math.round(this.reticleOpenness * 100) + '%',
        stabilityFrames: this.targetStabilityFrames
      });
    }
  }

  /**
   * Actualiza la máquina de estados
   */
  private updateStateMachine(): void {
    const oldState = this.state.currentState;
    let newState = oldState;

    switch (this.state.currentState) {
      case ReticleState.IDLE:
        if (this.state.hoveredTarget) {
          newState = ReticleState.SCANNING;
        }
        break;

      case ReticleState.SCANNING:
        if (!this.state.hoveredTarget) {
          newState = ReticleState.IDLE;
        } else if (this.state.currentTarget) {
          newState = ReticleState.LOCKED;
        }
        break;

      case ReticleState.LOCKED:
        if (!this.state.currentTarget) {
          newState = ReticleState.IDLE;
        } else if (!this.isTargetVisible(this.state.currentTarget)) {
          newState = ReticleState.TRANSITIONING;
        }
        break;

      case ReticleState.TRANSITIONING:
        if (this.state.currentTarget && this.isTargetVisible(this.state.currentTarget)) {
          newState = ReticleState.LOCKED;
        } else if (!this.state.currentTarget) {
          newState = ReticleState.IDLE;
        }
        break;
    }

    if (newState !== oldState) {
      this.state.currentState = newState;
      this.events.onStateChanged(newState, oldState);
    }
  }

  /**
   * Verifica si un target está visible en pantalla
   */
  private isTargetVisible(target: ITargetable): boolean {
    return this.targetDetector.isInViewFrustum(target);
  }

  /**
   * Obtiene la posición en pantalla de un target
   */
  private getTargetScreenPosition(target: ITargetable): ScreenPosition | null {
    // Usar el detector para convertir posición mundial a pantalla
    const hit = this.targetDetector.detectTargetAt(this.state.mousePosition);
    if (hit && hit.target.id === target.id) {
      return hit.screenPosition;
    }
    return null;
  }

  /**
   * Cicla el target seleccionado entre todos los disponibles, ordenados por ángulo azimutal alrededor del forward de la cámara.
   * - Limita el ciclo a los targets VISIBLES en pantalla (incluye planetas cuando están en el frustum).
   */
  private cycleTarget(direction: 1 | -1): void {
    const basis = this.targetDetector.getCameraBasis();
    // Recuperar comportamiento previo: solo targets en pantalla
    const visible = this.targetDetector.getVisibleTargets();
    if (!basis || !visible.length) return;

    // Proyectar vector desde cámara a cada target y calcular ángulo en plano XZ de la base cámara
    const { position: cam, forward, right } = basis;
    const entries: Array<{ t: ITargetable; angle: number; dist: number }> = [];
    for (const t of visible) {
      const dx = t.position.x - cam.x;
      const dy = t.position.y - cam.y;
      const dz = t.position.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!isFinite(dist) || dist <= 0) continue;
      // Componentes en base (forward/right) proyectadas al plano horizontal respecto al forward
      const fDot = dx * forward.x + dy * forward.y + dz * forward.z;
      const rDot = dx * right.x + dy * right.y + dz * right.z;
      // ángulo azimutal [-pi, pi] relativo a forward (usar atan2(right, forward))
      const angle = Math.atan2(rDot, fDot);
      entries.push({ t, angle, dist });
    }
    if (!entries.length) return;

    // Orden estable: por ángulo ascendente; desempate por distancia (cercano primero)
    entries.sort((a, b) => (a.angle - b.angle) || (a.dist - b.dist));

    const current = this.state.currentTarget;
    let idx = -1;
    if (current) idx = entries.findIndex(e => e.t.id === current.id);

    const n = entries.length;
    const nextIdx = ((idx >= 0 ? idx : -1) + direction + n) % n;
    const nextTarget = entries[nextIdx].t;
    this.events.onTargetSelected(nextTarget);
  }

  // ===============================
  // EVENT HANDLERS
  // ===============================

  private handleTargetHovered(target: ITargetable | null): void {
    const previousTarget = this.state.hoveredTarget;
    this.state.hoveredTarget = target;

    if (target && target !== previousTarget) {
      // Si el nuevo hover es el mismo que el seleccionado, limpiar hover anterior y no aplicar hover al seleccionado
      if (target === this.state.currentTarget) {
        if (previousTarget && previousTarget !== this.state.currentTarget) {
          this.targetHighlighter.removeHighlight(previousTarget);
          this.outlineRenderer.removeOutline(previousTarget.id);
        }
        return;
      }
  // Quiet hover logs
      
  // Aplicar highlighting al target hovered
      this.targetHighlighter.highlightTarget(target);
      
      // Aplicar outline de hover (GLOW suave)
  // Quiet outline add logs
  const relation = this.relationService.getRelation(target);
      const hoverColor = this.getRelationColor(relation, false);
      this.outlineRenderer.addOutline(target, OutlineType.GLOW, {
        thickness: 2.0,
        intensity: 0.7,
        color: hoverColor
      });
      
      // Remover highlighting del target anterior si existe
      if (previousTarget && previousTarget !== this.state.currentTarget) {
        this.targetHighlighter.removeHighlight(previousTarget);
        this.outlineRenderer.removeOutline(previousTarget.id);
      }
    } else if (!target && previousTarget) {
  // Quiet unhover logs
      
      // Remover highlighting solo si no está seleccionado
      if (previousTarget !== this.state.currentTarget) {
        this.targetHighlighter.removeHighlight(previousTarget);
        this.outlineRenderer.removeOutline(previousTarget.id);
      }
      // HUD overlay not used
    }
  }

  private handleTargetSelected(target: ITargetable | null): void {
    const previousTarget = this.state.currentTarget;
    this.state.currentTarget = target;
    
    if (target) {
  // Quiet selection logs
      // Si había un target previamente seleccionado y es distinto, limpiar su estado visual
      if (previousTarget && previousTarget !== target) {
        this.targetHighlighter.removeHighlight(previousTarget);
        this.outlineRenderer.removeOutline(previousTarget.id);
      }
      
      // Aplicar highlighting especial al target seleccionado
      this.targetHighlighter.highlightTarget(target, {
        type: HighlightType.PULSING,
        color: [1.0, 1.0, 0.0, 0.9], // Amarillo brillante
        intensity: 1.5,
        pulseSpeed: 4.0
      });

      // Aplicar outline de selección (PULSE intenso) con color por relación
  const relation = this.relationService.getRelation(target);
      const selectedColor = this.getRelationColor(relation, true);
      this.outlineRenderer.addOutline(target, OutlineType.PULSE, {
        thickness: 4.0,
        intensity: 1.0,
        frequency: 3.0,
        color: selectedColor
      });
      
      this.events.onTargetLocked(target);
    } else {
  // Quiet deselect logs
      
      // Remover highlighting del target anterior
      if (previousTarget) {
        this.targetHighlighter.removeHighlight(previousTarget);
        this.outlineRenderer.removeOutline(previousTarget.id);
      }
      
      this.events.onTargetLost();
    }
  }

  // Relation logic centralized in RelationService

  private getRelationColor(relation: 'ally' | 'neutral' | 'enemy', selected: boolean): [number, number, number, number] {
    // Hover: tonos claros; Selected: versión viva pero más oscura
    if (!selected) {
      switch (relation) {
        case 'ally': return [0.4, 1.0, 0.4, 1.0]; // verde claro
        case 'neutral': return [0.5, 0.7, 1.0, 1.0]; // azul claro
        case 'enemy': return [1.0, 0.5, 0.5, 1.0]; // rojo claro
      }
    } else {
      switch (relation) {
        case 'ally': return [0.05, 0.8, 0.05, 1.0]; // verde vivo más oscuro
        case 'neutral': return [0.1, 0.4, 1.0, 1.0]; // azul vivo más oscuro
        case 'enemy': return [0.9, 0.1, 0.1, 1.0]; // rojo vivo más oscuro
      }
    }
    return [1,1,1,1];
  }

  private handleTargetLocked(target: ITargetable): void {
  // Quiet locked logs
  }

  private handleTargetLost(): void {
  // Quiet lost logs
  }

  private handleStateChanged(newState: ReticleState, oldState: ReticleState): void {
  // Quiet state machine logs
  }

  // ===============================
  // API PÚBLICA
  // ===============================

  /**
   * Selecciona un target específico
   * [DISABLED] - No hace nada durante refactoring
   */
  public selectTarget(target: ITargetable | null): void {
    console.log('🎯 selectTarget llamado pero sistema deshabilitado:', target?.getDisplayName());
    // Sistema deshabilitado
  }

  /**
   * Obtiene el target actualmente seleccionado
   * [DISABLED] - Siempre devuelve null durante refactoring
   */
  public getCurrentTarget(): ITargetable | null {
    return null; // Sistema deshabilitado
  }

  /**
   * Obtiene el target bajo el cursor
   * [DISABLED] - Siempre devuelve null durante refactoring
   */
  public getHoveredTarget(): ITargetable | null {
    return null; // Sistema deshabilitado
  }

  /**
   * Obtiene el estado actual del sistema
   */
  public getState(): ReticleSystemState {
    return { ...this.state };
  }

  /**
   * Obtiene todos los targets visibles
   */
  public getVisibleTargets(): ITargetable[] {
    return this.targetDetector.getVisibleTargets();
  }

  /**
   * Actualiza la configuración del sistema
   */
  public updateConfig(newConfig: Partial<TargetingSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.input) {
      this.inputHandler.updateConfig(newConfig.input);
    }
    
    if (newConfig.detection) {
      this.targetDetector.updateConfig(newConfig.detection);
    }
  }

  /**
   * Alterna la visibilidad de la retícula
   */
  public toggleVisibility(): void {
    this.state.isVisible = !this.state.isVisible;
  }

  /**
   * Actualiza el tamaño del canvas
   */
  public updateCanvasSize(width: number, height: number): void {
    this.reticleRenderer.updateCanvasSize(width, height);
  }

  /**
   * Limpia recursos y destruye el manager
   */
  public destroy(): void {
    this.inputHandler.destroy();
    this.reticleRenderer.dispose();
    this.isInitialized = false;
    
  // Quiet destroy logs
  }
}