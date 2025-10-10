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
  RaycastHit
} from '../types/reticle.types';
import { ITargetable } from '../../types/targeting.types';
import { TargetDetector } from './TargetDetector';
import { InputHandler } from './InputHandler';
import { ReticleRenderer } from '../rendering/ReticleRenderer';
import { Camera } from '../../Camera';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';

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
  
  private isInitialized: boolean = false;
  private lastUpdateTime: number = 0;

  constructor(
    targetDetector: TargetDetector,
    inputHandler: InputHandler,
    reticleRenderer: ReticleRenderer,
    private webglService: WebGLService
  ) {
    this.targetDetector = targetDetector;
    this.inputHandler = inputHandler;
    this.reticleRenderer = reticleRenderer;
    this.config = { ...DEFAULT_TARGETING_CONFIG };
    
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
        
        // Inicializar renderizador de retícula
        const rendererInit = this.reticleRenderer.initialize(shaderManager);
        if (!rendererInit) {
          console.error('❌ ReticleManager: Error inicializando ReticleRenderer');
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
    if (!this.isInitialized) return;

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
    
    // Actualizar posición de la retícula (sigue al mouse por defecto)
    this.updateReticlePosition();

    // Detectar target bajo el cursor
    this.updateTargetDetection();

    // Actualizar máquina de estados
    this.updateStateMachine();
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
  }

  /**
   * Actualiza la posición de la retícula
   */
  private updateReticlePosition(): void {
    if (this.state.currentState === ReticleState.LOCKED && this.state.currentTarget) {
      // Si está locked, seguir al target
      const targetScreenPos = this.getTargetScreenPosition(this.state.currentTarget);
      if (targetScreenPos) {
        this.state.reticlePosition = targetScreenPos;
      }
    } else {
      // Seguir al mouse
      this.state.reticlePosition = { ...this.state.mousePosition };
    }
  }

  /**
   * Detecta targets bajo la posición actual
   */
  private updateTargetDetection(): void {
    const hit = this.targetDetector.detectTargetAt(this.state.mousePosition);
    
    const newHoveredTarget = hit?.target || null;
    
    // Verificar cambio en hover
    if (newHoveredTarget !== this.state.hoveredTarget) {
      this.state.hoveredTarget = newHoveredTarget;
      this.events.onTargetHovered(newHoveredTarget);
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
    console.log('🎯 Target hovered:', target?.getDisplayName() || 'none');
  }

  private handleTargetSelected(target: ITargetable | null): void {
    this.state.currentTarget = target;
    
    if (target) {
      console.log('✅ Target selected:', target.getDisplayName());
      this.events.onTargetLocked(target);
    } else {
      console.log('❌ Target deselected');
      this.events.onTargetLost();
    }
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