/**
 * ADAPTIVE TARGETING INTEGRATOR
 * 
 * Integra el nuevo AdaptiveTargetingSystem con el ReticleManager existente
 * manteniendo la API pública pero usando el nuevo sistema internamente.
 */

import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { Camera } from '../../Camera';
import { ShaderManager } from '../../ShaderManager';
import { mat4 } from 'gl-matrix';
import { AdaptiveTargetingSystem, TargetDisplayInfo } from './AdaptiveTargetingSystem';
import { ReticleSystemState, ScreenPosition } from '../types/reticle.types';

@Injectable({
  providedIn: 'root'
})
export class AdaptiveTargetingIntegrator {
  private adaptiveSystem: AdaptiveTargetingSystem;
  private isInitialized = false;
  
  // Mouse tracking for reticle dynamics (preserved from original)
  private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private lastMousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private mouseVelocity = 0;
  private reticleOpenness = 0.5;
  private velocitySmoothing = 0.9;
  private updateCount = 0; // For debugging integration
  
  // Reticle visibility
  private reticleVisible = true;
  
  constructor(adaptiveSystem: AdaptiveTargetingSystem) {
    this.adaptiveSystem = adaptiveSystem;
  }

  // ===================================
  // INITIALIZATION (matching ReticleManager API)
  // ===================================

  public initialize(camera: Camera, shaderManager: ShaderManager): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.adaptiveSystem.initialize(camera);
        this.isInitialized = true;
        console.log('🎯 AdaptiveTargetingIntegrator initialized successfully', {
          camera: !!camera,
          adaptiveSystem: !!this.adaptiveSystem,
          timestamp: new Date().toLocaleTimeString()
        });
        resolve(true);
      } catch (error) {
        console.error('❌ Error initializing AdaptiveTargetingIntegrator:', error);
        resolve(false);
      }
    });
  }

  public setDistanceOriginProvider(fn: (() => { x: number; y: number; z: number }) | null): void {
    this.adaptiveSystem.setDistanceOriginProvider(fn);
  }

  // ===================================
  // UPDATE CYCLE
  // ===================================

  public update(deltaTime: number, availableTargets: ITargetable[], mousePos: { x: number; y: number }): void {
    if (!this.isInitialized) {
      // Log occasionally if not initialized
      if (Math.random() < 0.01) {
        console.warn('⚠️ AdaptiveTargetingIntegrator.update() called but not initialized');
      }
      return;
    }
    
    // Debug log occasionally to verify integration
    if (Math.random() < 0.001) { // 0.1% chance
      console.log('🔄 AdaptiveTargetingIntegrator.update() called:', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        targets: availableTargets.length,
        mousePos: `${Math.round(mousePos.x)},${Math.round(mousePos.y)}`
      });
    }
    
    // Update mouse position and velocity (for reticle dynamics)
    this.mousePosition = mousePos;
    this.updateMouseVelocity(deltaTime);
    
    // Update available targets in adaptive system
    this.adaptiveSystem.updateAvailableTargets(availableTargets);
    
    // Perform adaptive detection
    const result = this.adaptiveSystem.detectTargetAt(mousePos);
    
    // Debug info (frequent for testing)
    if (Math.random() < 0.05) { // 5% chance for more frequent testing logs
      console.log('🎯 Adaptive Targeting:', {
        hovered: result.hoveredTarget?.name || 'none',
        selected: result.selectedTarget?.name || 'none',
        nearby: result.nearbyTargets.length,
        mouseVelocity: Math.round(this.mouseVelocity),
        mousePos: `${Math.round(mousePos.x)},${Math.round(mousePos.y)}`,
        initialized: this.isInitialized
      });
    }
  }

  public handleClick(): void {
    if (!this.isInitialized) return;
    
    const hoveredInfo = this.adaptiveSystem.getCurrentHovered();
    if (hoveredInfo) {
      this.adaptiveSystem.selectTarget(hoveredInfo.target);
      console.log('🎯 Target selected:', hoveredInfo.name, `[${hoveredInfo.category}]`, `${Math.round(hoveredInfo.distanceToCenter)}u`);
    } else {
      this.adaptiveSystem.selectTarget(null);
      console.log('🎯 Target deselected');
    }
  }

  // ===================================
  // TESTING METHODS (STEP 2)
  // ===================================

  /**
   * STEP 2 Testing: Muestra estadísticas de detección por categoría
   */
  public showDetectionStats(): void {
    if (!this.isInitialized) {
      console.log('❌ Sistema no inicializado');
      return;
    }

    const categories = this.adaptiveSystem.getTargetsByCategory();
    console.log('📊 DETECTION STATS - STEP 2 Testing:');
    
    for (const [category, targets] of categories) {
      const distances = targets.map(t => Math.round(t.distanceToCenter));
      const avgDist = distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : 0;
      
      console.log(`📏 ${category.toUpperCase()}: ${targets.length} targets, avg: ${avgDist}u, range: ${Math.min(...distances)}-${Math.max(...distances)}u`);
      
      // Mostrar algunos ejemplos
      targets.slice(0, 3).forEach(t => {
        console.log(`  - ${t.name}: ${Math.round(t.distanceToCenter)}u (edge: ${Math.round(t.distanceToEdge)}u)`);
      });
    }
  }

  /**
   * STEP 2 Testing: Verifica detección en diferentes rangos
   */
  public testDetectionRanges(): void {
    console.log('🧪 TESTING Detection Ranges - STEP 2:');
    this.showDetectionStats();
    
    const hovered = this.adaptiveSystem.getCurrentHovered();
    const selected = this.adaptiveSystem.getCurrentSelected();
    
    console.log('🎯 Current State:');
    console.log('  Hovered:', hovered ? `${hovered.name} [${hovered.category}] ${Math.round(hovered.distanceToCenter)}u` : 'none');
    console.log('  Selected:', selected ? `${selected.name} [${selected.category}] ${Math.round(selected.distanceToCenter)}u` : 'none');
  }

  // ===================================
  // RENDER (matching ReticleManager API)
  // ===================================

  public render(deltaTime: number): void {
    if (!this.isInitialized || !this.reticleVisible) return;
    
    // Render dynamic reticle (preserved behavior)
    this.renderDynamicReticle(deltaTime);
  }

  public renderOutlines(viewMatrix: mat4, projectionMatrix: mat4, targets: ITargetable[]): void {
    // Outlines disabled during refactoring - will be re-implemented with new system
    // console.log('🚫 Outlines disabled during adaptive targeting refactoring');
  }

  private renderDynamicReticle(deltaTime: number): void {
    // This would render the dynamic reticle based on mouse velocity
    // For now, just update the reticle state for when we re-implement rendering
    
    const reticleSize = 25 + (this.reticleOpenness * 45); // 25-70px
    const reticleThickness = 1.5 + (this.reticleOpenness * 2.5); // 1.5-4px  
    const reticleOpacity = 0.5 + (this.reticleOpenness * 0.5); // 0.5-1.0
    
    // TODO: Implement actual reticle rendering when ready
  }

  // ===================================
  // PUBLIC API (matching ReticleManager)
  // ===================================

  public getCurrentTarget(): ITargetable | null {
    const selected = this.adaptiveSystem.getCurrentSelected();
    return selected ? selected.target : null;
  }

  public getHoveredTarget(): ITargetable | null {
    const hovered = this.adaptiveSystem.getCurrentHovered();
    return hovered ? hovered.target : null;
  }

  public selectTarget(target: ITargetable | null): void {
    this.adaptiveSystem.selectTarget(target);
  }

  public getState(): ReticleSystemState {
    const hovered = this.getHoveredTarget();
    const selected = this.getCurrentTarget();
    
    return {
      currentState: selected ? 'LOCKED' as any : (hovered ? 'SCANNING' as any : 'IDLE' as any),
      mousePosition: this.mousePosition,
      currentTarget: selected,
      hoveredTarget: hovered,
      reticlePosition: this.mousePosition,
      isVisible: this.reticleVisible,
      config: {
        type: 'CROSSHAIR' as any,
        size: 25 + (this.reticleOpenness * 45),
        color: [0, 1, 1, 0.8] as [number, number, number, number],
        thickness: 1.5 + (this.reticleOpenness * 2.5),
        opacity: 0.5 + (this.reticleOpenness * 0.5),
        animated: false,
        animationSpeed: 0
      }
    };
  }

  public getVisibleTargets(): ITargetable[] {
    // Return all targets from adaptive system
    const byCategory = this.adaptiveSystem.getTargetsByCategory();
    const allTargets: ITargetable[] = [];
    
    for (const targets of byCategory.values()) {
      for (const info of targets) {
        if (info.screenPosition) { // Only visible targets
          allTargets.push(info.target);
        }
      }
    }
    
    return allTargets;
  }

  public toggleVisibility(): void {
    this.reticleVisible = !this.reticleVisible;
  }

  public updateCanvasSize(width: number, height: number): void {
    // Handle canvas resize if needed
    console.log('🎯 Canvas resized:', { width, height });
  }

  public destroy(): void {
    this.isInitialized = false;
    console.log('🎯 AdaptiveTargetingIntegrator destroyed');
  }

  // ===================================
  // ADAPTIVE SYSTEM SPECIFIC API
  // ===================================

  public getTargetDisplayInfo(target: ITargetable): TargetDisplayInfo | null {
    const hovered = this.adaptiveSystem.getCurrentHovered();
    const selected = this.adaptiveSystem.getCurrentSelected();
    
    if (hovered && hovered.target.id === target.id) return hovered;
    if (selected && selected.target.id === target.id) return selected;
    
    return null;
  }

  public getNearbyTargets(): TargetDisplayInfo[] {
    const result = this.adaptiveSystem.detectTargetAt(this.mousePosition);
    return result.nearbyTargets;
  }

  public getTargetsByCategory(): Map<string, TargetDisplayInfo[]> {
    return this.adaptiveSystem.getTargetsByCategory();
  }

  // ===================================
  // MOUSE VELOCITY TRACKING (preserved)
  // ===================================

  private updateMouseVelocity(deltaTime: number): void {
    const currentPos = this.mousePosition;
    const lastPos = this.lastMousePosition;
    
    const dx = currentPos.x - lastPos.x;
    const dy = currentPos.y - lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const instantVelocity = deltaTime > 0 ? distance / deltaTime : 0;
    
    this.mouseVelocity = this.mouseVelocity * this.velocitySmoothing + 
                        instantVelocity * (1 - this.velocitySmoothing);
    
    const velocityNormalized = Math.min(this.mouseVelocity / 600, 2.0);
    const exponentialCurve = Math.pow(velocityNormalized, 2.5);
    const targetOpenness = Math.min(exponentialCurve, 1.0);
    
    this.reticleOpenness += (targetOpenness - this.reticleOpenness) * deltaTime * 5.0;
    
    this.lastMousePosition = { ...currentPos };
  }
}