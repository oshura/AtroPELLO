/**
 * Sistema de Resaltado de Targets
 * FASE 3: Target Highlighting
 */

import { Injectable } from '@angular/core';
import { 
  ITargetHighlighter, 
  HighlightConfig, 
  HighlightType,
  DEFAULT_HIGHLIGHT_CONFIG
} from '../types/reticle.types';
import { ITargetable } from '../../types/targeting.types';
import { ShaderManager } from '../../ShaderManager';
import { WebGLService } from '../../../services/webgl.service';

interface HighlightedTarget {
  target: ITargetable;
  config: HighlightConfig;
  animationTime: number;
  intensity: number;
}

@Injectable({
  providedIn: 'root'
})
export class TargetHighlighter implements ITargetHighlighter {
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  // Snapshot de estado GL para restaurar tras render
  private prevBlendEnabled: boolean = false;
  private prevDepthTestEnabled: boolean = true;
  private prevProgram: WebGLProgram | null = null;
  
  // Targets actualmente resaltados
  private highlightedTargets: Map<string, HighlightedTarget> = new Map();
  
  // Estado de animación global
  private globalTime: number = 0;
  
  // Configuraciones por tipo de target
  private typeConfigs: Map<string, HighlightConfig> = new Map();

  constructor(
    private webglService: WebGLService
  ) {
    this.setupDefaultConfigs();
  }

  /**
   * Inicializa el sistema de highlighting
   */
  public initialize(shaderManager: ShaderManager): boolean {
    this.gl = this.webglService.getContext() as WebGL2RenderingContext;
    this.shaderManager = shaderManager;
    
    if (!this.gl || !this.shaderManager) {
      console.error('❌ TargetHighlighter: WebGL o ShaderManager no disponibles');
      return false;
    }

    console.log('✨ TargetHighlighter inicializado');
    return true;
  }

  /**
   * Aplica highlighting a un target
   */
  public highlightTarget(target: ITargetable, config?: HighlightConfig): void {
    const targetConfig = config || this.getConfigForTarget(target);
    
    const highlighted: HighlightedTarget = {
      target,
      config: targetConfig,
      animationTime: 0,
      intensity: 0
    };
    
    this.highlightedTargets.set(target.id, highlighted);
    
    console.log('✨ Target highlighted:', target.getDisplayName(), 'Type:', targetConfig.type);
  }

  /**
   * Remueve highlighting de un target
   */
  public removeHighlight(target: ITargetable): void {
    if (this.highlightedTargets.has(target.id)) {
      this.highlightedTargets.delete(target.id);
      console.log('🚫 Highlight removed:', target.getDisplayName());
    }
  }

  /**
   * Actualiza efectos de highlighting
   */
  public update(deltaTime: number): void {
    this.globalTime += deltaTime;
    
    // Actualizar cada target resaltado
    this.highlightedTargets.forEach((highlighted) => {
      highlighted.animationTime += deltaTime;
      
      // Calcular intensidad según tipo de efecto
      switch (highlighted.config.type) {
        case HighlightType.PULSING:
          highlighted.intensity = this.calculatePulsingIntensity(highlighted);
          break;
          
        case HighlightType.GLOW:
          highlighted.intensity = this.calculateGlowIntensity(highlighted);
          break;
          
        case HighlightType.OUTLINE:
          highlighted.intensity = highlighted.config.intensity;
          break;
          
        default:
          highlighted.intensity = highlighted.config.intensity;
      }
    });
  }

  /**
   * Renderiza todos los highlights activos
   */
  public render(): void {
    if (!this.gl || !this.shaderManager || this.highlightedTargets.size === 0) {
      return;
    }

    // Configurar estado WebGL para highlighting
    this.setupHighlightRendering();

    // Renderizar cada target resaltado
    this.highlightedTargets.forEach((highlighted) => {
      this.renderTargetHighlight(highlighted);
    });

    // Restaurar estado WebGL
    this.restoreRenderingState();
  }

  /**
   * Obtiene configuración apropiada para un tipo de target
   */
  private getConfigForTarget(target: ITargetable): HighlightConfig {
    const targetType = target.getTargetType();
    
    return this.typeConfigs.get(targetType) || {
      ...DEFAULT_HIGHLIGHT_CONFIG,
      color: this.getColorForTargetType(targetType)
    };
  }

  /**
   * Obtiene color según tipo de target
   */
  private getColorForTargetType(targetType: string): [number, number, number, number] {
    switch (targetType) {
      case 'asteroid':
        return [0.0, 1.0, 0.0, 0.8]; // Verde brillante
      case 'spaceship':
        return [1.0, 0.0, 0.0, 0.9]; // Rojo peligro
      case 'planet':
        return [0.0, 0.5, 1.0, 0.7]; // Azul planeta
      case 'portal':
        return [1.0, 0.0, 1.0, 0.8]; // Magenta portal
      default:
        return [1.0, 1.0, 0.0, 0.8]; // Amarillo genérico
    }
  }

  /**
   * Configura configuraciones por defecto para cada tipo
   */
  private setupDefaultConfigs(): void {
    // Asteroides: Outline verde pulsante
    this.typeConfigs.set('asteroid', {
      type: HighlightType.PULSING,
      color: [0.0, 1.0, 0.0, 0.8],
      intensity: 1.2,
      pulseSpeed: 3.0,
      glowRadius: 8.0
    });

    // Naves: Outline rojo intenso
    this.typeConfigs.set('spaceship', {
      type: HighlightType.OUTLINE,
      color: [1.0, 0.0, 0.0, 0.9],
      intensity: 1.5,
      glowRadius: 10.0
    });

    // Planetas: Glow azul suave
    this.typeConfigs.set('planet', {
      type: HighlightType.GLOW,
      color: [0.0, 0.5, 1.0, 0.7],
      intensity: 1.0,
      glowRadius: 15.0
    });
  }

  /**
   * Calcula intensidad para efecto pulsante
   */
  private calculatePulsingIntensity(highlighted: HighlightedTarget): number {
    const pulseSpeed = highlighted.config.pulseSpeed || 2.0;
    const baseIntensity = highlighted.config.intensity;
    const pulse = Math.sin(highlighted.animationTime * pulseSpeed) * 0.3 + 0.7;
    
    return baseIntensity * pulse;
  }

  /**
   * Calcula intensidad para efecto glow
   */
  private calculateGlowIntensity(highlighted: HighlightedTarget): number {
    const baseIntensity = highlighted.config.intensity;
    const breathe = Math.sin(highlighted.animationTime * 1.5) * 0.2 + 0.8;
    
    return baseIntensity * breathe;
  }

  /**
   * Configura WebGL para renderizado de highlights
   */
  private setupHighlightRendering(): void {
    if (!this.gl) return;

    // Habilitar blending para efectos translúcidos
    // Snapshot de estado previo
    this.prevBlendEnabled = this.gl.isEnabled(this.gl.BLEND);
    this.prevDepthTestEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    this.prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    
    // Deshabilitar depth test para que highlights aparezcan encima
    this.gl.disable(this.gl.DEPTH_TEST);
    
    // Usar programa básico por ahora (outline shader vendrá después)
    if (this.shaderManager?.basicProgram) {
      this.gl.useProgram(this.shaderManager.basicProgram);
    }
  }

  /**
   * Renderiza highlight de un target específico
   */
  private renderTargetHighlight(highlighted: HighlightedTarget): void {
    if (!this.gl || !this.shaderManager) return;

    const target = highlighted.target;
    
    // Por ahora, renderizar un wireframe del objeto con color highlight
    // TODO: Implementar outline shader más sofisticado
    
    // Configurar color de highlight
    const color = new Float32Array([
      highlighted.config.color[0],
      highlighted.config.color[1], 
      highlighted.config.color[2],
      highlighted.config.color[3] * highlighted.intensity
    ]);

    console.log('🎨 Rendering highlight for:', target.getDisplayName(), 'Intensity:', highlighted.intensity);
    
    // El renderizado específico dependerá del tipo de objeto
    // Por ahora solo loggeamos para verificar que funciona
  }

  /**
   * Restaura estado WebGL después del highlighting
   */
  private restoreRenderingState(): void {
    if (!this.gl) return;

    // Restaurar depth test
    if (this.prevDepthTestEnabled) {
      this.gl.enable(this.gl.DEPTH_TEST);
    } else {
      this.gl.disable(this.gl.DEPTH_TEST);
    }

    // Restaurar blending
    if (this.prevBlendEnabled) {
      this.gl.enable(this.gl.BLEND);
    } else {
      this.gl.disable(this.gl.BLEND);
    }

    // Restaurar programa previo si existía
    if (this.prevProgram) {
      this.gl.useProgram(this.prevProgram);
    }
  }

  /**
   * Obtiene todos los targets actualmente resaltados
   */
  public getHighlightedTargets(): ITargetable[] {
    return Array.from(this.highlightedTargets.values()).map(h => h.target);
  }

  /**
   * Verifica si un target está siendo resaltado
   */
  public isHighlighted(target: ITargetable): boolean {
    return this.highlightedTargets.has(target.id);
  }

  /**
   * Limpia todos los highlights
   */
  public clear(): void {
    this.highlightedTargets.clear();
    console.log('🧹 All highlights cleared');
  }

  /**
   * Limpia recursos
   */
  public dispose(): void {
    this.clear();
    console.log('🧹 TargetHighlighter disposed');
  }
}