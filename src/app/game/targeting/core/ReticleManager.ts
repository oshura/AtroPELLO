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
  
  // Tracking de velocidad del mouse para retícula dinámica
  private lastMousePosition: ScreenPosition = { x: 0, y: 0 };
  private mouseVelocity: number = 0;
  private reticleOpenness: number = 0.5; // 0=cerrado, 1=abierto
  private velocitySmoothing: number = 0.9; // Suavizado de velocidad

  // Debug snapshot storage
  private lastHit: RaycastHit | null = null;
  private lastDetectionRadiusPx: number = 0;

  constructor(
    targetDetector: TargetDetector,
    inputHandler: InputHandler,
    reticleRenderer: ReticleRenderer,
    targetHighlighter: TargetHighlighter,
    outlineRenderer: OutlineRenderer,
    private webglService: WebGLService,
    private debugCollector: SpaceshipDebugCollector
  ) {
    this.targetDetector = targetDetector;
    this.inputHandler = inputHandler;
    this.reticleRenderer = reticleRenderer;
    this.targetHighlighter = targetHighlighter;
    this.outlineRenderer = outlineRenderer;
    this.config = { ...DEFAULT_TARGETING_CONFIG };
    
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
      onStateChanged: (newState, oldState) => this.handleStateChanged(newState, oldState)
    };
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
      console.log('⚠️ ReticleManager.update() - NO inicializado', {
        isInitialized: this.isInitialized,
        deltaTime,
        targetsReceived: availableTargets.length
      });
      return;
    }
    
    // Debug crítico para verificar que update se ejecuta
    if (performance.now() % 2000 < 50) { // Cada 2 segundos aprox
      console.log('🔄 ReticleManager.update() EJECUTADO:', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        targetsReceived: availableTargets.length,
        mousePos: this.state.mousePosition,
        initialized: this.isInitialized,
        currentState: this.state.currentState
      });
      
      // DEBUG FORZADO - Verificar que se llama a updateTargetDetection
      console.log('🔍 ABOUT TO CALL updateTargetDetection...');
    }

    const currentTime = performance.now();
    
    // DEBUG: Temporalmente sin throttle para verificar renderizado
    // if (currentTime - this.lastUpdateTime < 1000 / this.config.performance.updateFrequency) {
    //   return;
    // }

    this.lastUpdateTime = currentTime;

    // Actualizar targets disponibles
    this.targetDetector.updateAvailableTargets(availableTargets);

    // Actualizar posición del mouse
    this.state.mousePosition = this.inputHandler.getMousePosition();
    
    // Calcular velocidad del mouse para retícula dinámica
    this.updateMouseVelocity(deltaTime);
    
    // Actualizar posición de la retícula (sigue al mouse por defecto)
    this.updateReticlePosition();

    // Detectar target bajo el cursor
    console.log('🔍 CALLING updateTargetDetection...');
    this.updateTargetDetection();

    // Actualizar máquina de estados
    this.updateStateMachine();

    // Actualizar sistema de highlighting
    this.targetHighlighter.update(deltaTime);

    // Actualizar outline renderer
    this.outlineRenderer.update(deltaTime);

    // Click-to-select: si hay click pendiente, seleccionar hovered si existe
    if (this.inputHandler.consumeClick()) {
      const hovered = this.state.hoveredTarget;
      if (hovered) {
        this.events.onTargetSelected(hovered);
      }
    }

    // Si el target seleccionado desaparece, limpiar selección
    if (this.state.currentTarget) {
      const stillExists = availableTargets.some(t => t.id === this.state.currentTarget!.id && t.isActive());
      if (!stillExists) {
        this.events.onTargetSelected(null);
      }
    }

    // HUD hover info is handled by HUDManager texture, not here.
  }

  /**
   * Renderiza la retícula en pantalla
   */
  public render(deltaTime: number): void {
    if (!this.isInitialized || !this.state.isVisible) {
      console.log('🎯 Retícula NO renderizada:', { 
        initialized: this.isInitialized, 
        visible: this.state.isVisible 
      });
      return;
    }

    console.log('🎯 Renderizando retícula en:', this.state.reticlePosition);

    // Renderizar retícula en la posición actual
    this.reticleRenderer.render(
      this.state.reticlePosition,
      this.state.config,
      deltaTime
    );

    // Renderizar highlights de targets
    this.targetHighlighter.render();
  }

  /**
   * Renderiza outlines de targets (debe llamarse desde el GameEngine)
   */
  public renderOutlines(viewMatrix: mat4, projectionMatrix: mat4, targets: ITargetable[]): void {
    if (!this.isInitialized) return;
    
    // Renderizar outlines avanzados
    this.outlineRenderer.renderOutlines(viewMatrix, projectionMatrix, targets);
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
    console.log('🔍 updateTargetDetection() EJECUTADO - mousePos:', this.state.mousePosition);
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
    const MIN_R = 20;  // radio mínimo cuando la retícula está grande
    const MAX_R = 160; // radio máximo cuando la retícula está pequeña / quieta
    const baseRadius = MAX_R - (MAX_R - MIN_R) * sizeT; // inverse lerp

    // Factor por velocidad del mouse: más boost cuanto más quieto
    const vNorm = Math.min(1, this.mouseVelocity / 600); // 0..1 (ver normalización en updateMouseVelocity)
    const velFactor = 1.3 - 0.5 * vNorm; // 1.3 en reposo → 0.8 a velocidad alta

  // Reducir ligeramente el radio resultante (≈2/3 del valor actual)
  const SCALE = 2 / 3;
  const detectionRadius = Math.max(16, Math.min(160, baseRadius * velFactor * SCALE));
    this.lastDetectionRadiusPx = detectionRadius;
    const hit = this.targetDetector.detectTargetAt(this.state.mousePosition, detectionRadius);
    this.lastHit = hit || null;
    console.log('🔍 detectTargetAt result:', hit ? `HIT: ${hit.target.getDisplayName()}` : 'NO HIT');

    // Exportar snapshot para overlay de debug (si está activo)
    try {
      this.debugCollector.setTargetingSnapshot(this.getDebugSnapshot());
    } catch {}
    
    const newHoveredTarget = hit?.target || null;
    
    // Debug FORZADO para verificar detección
    if (Math.random() < 0.01) { // 1% chance - más frecuente
      console.log('🔍 Target detection DEBUG:', {
        mousePos: this.state.mousePosition,
        hit: hit ? `${hit.target.getDisplayName()} at ${Math.round(hit.distance)}` : 'none',
        availableTargets: this.targetDetector.getVisibleTargets().length,
        detectorInitialized: !!this.targetDetector
      });
    }
    
    // Verificar cambio en hover
    if (newHoveredTarget !== this.state.hoveredTarget) {
      // Importante: NO mutar state.hoveredTarget aquí. Dejamos que el handler lo actualice,
      // así puede comparar correctamente contra el valor previo y disparar efectos (outline/highlight).
      console.log('🎯 Target hover changed:', 
        newHoveredTarget?.getDisplayName() || 'none');
      this.events.onTargetHovered(newHoveredTarget);
    }
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
    
    // Debug ocasional
    if (Math.random() < 0.01) { // 1% de chance por frame
      console.log('🏃 Mouse velocity:', Math.round(this.mouseVelocity), 
                  'Openness:', Math.round(this.reticleOpenness * 100) + '%');
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
      console.log('👁️ Target hovered:', target.getDisplayName());
      
  // Aplicar highlighting al target hovered
      this.targetHighlighter.highlightTarget(target);
      
      // Aplicar outline de hover (GLOW suave)
      console.log('🟡 ReticleManager: llamando a addOutline (hover) para', target.id);
      const relation = this.getRelationFor(target);
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
      console.log('👁️ Target unhovered:', previousTarget.getDisplayName());
      
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
      console.log('✅ Target selected:', target.getDisplayName());
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
      const relation = this.getRelationFor(target);
      const selectedColor = this.getRelationColor(relation, true);
      this.outlineRenderer.addOutline(target, OutlineType.PULSE, {
        thickness: 4.0,
        intensity: 1.0,
        frequency: 3.0,
        color: selectedColor
      });
      
      this.events.onTargetLocked(target);
    } else {
      console.log('❌ Target deselected');
      
      // Remover highlighting del target anterior
      if (previousTarget) {
        this.targetHighlighter.removeHighlight(previousTarget);
        this.outlineRenderer.removeOutline(previousTarget.id);
      }
      
      this.events.onTargetLost();
    }
  }

  private getRelationFor(target: ITargetable): 'ally' | 'neutral' | 'enemy' {
    const t = target.getTargetType?.();
    switch (t) {
      case TargetType.ASTEROID:
        return 'neutral';
      // TODO: integrar facciones reales cuando estén disponibles
      default:
        return 'enemy';
    }
  }

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
    console.log('🔒 Target locked:', target.getDisplayName());
  }

  private handleTargetLost(): void {
    console.log('💨 Target lost');
  }

  private handleStateChanged(newState: ReticleState, oldState: ReticleState): void {
    console.log('🔄 State changed:', oldState, '→', newState);
  }

  // ===============================
  // API PÚBLICA
  // ===============================

  /**
   * Selecciona un target específico
   */
  public selectTarget(target: ITargetable | null): void {
    this.events.onTargetSelected(target);
  }

  /**
   * Obtiene el target actualmente seleccionado
   */
  public getCurrentTarget(): ITargetable | null {
    return this.state.currentTarget;
  }

  /**
   * Obtiene el target bajo el cursor
   */
  public getHoveredTarget(): ITargetable | null {
    return this.state.hoveredTarget;
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
    
    console.log('🧹 ReticleManager destroyed');
  }
}