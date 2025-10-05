import { Injectable } from '@angular/core';
import { DebugOverlayService, SpaceshipDebugData } from './debug-overlay.service';
import { GameEngine } from '../../game/GameEngine';

/**
 * Servicio para recopilar y actualizar datos de debug de la nave
 */
@Injectable({
  providedIn: 'root'
})
export class SpaceshipDebugCollector {
  private updateInterval: number | null = null;
  private isActive: boolean = false;
  private gameEngine: GameEngine | null = null;

  constructor(private debugOverlay: DebugOverlayService) {}

  /**
   * Inicializa la recopilación de datos
   */
  initialize(gameEngine: GameEngine): void {
    this.gameEngine = gameEngine;
    this.debugOverlay.initialize();
  }

  /**
   * Inicia la recopilación automática de datos
   */
  startDataCollection(updateFrequency: number = 60): void {
    if (this.isActive || !this.gameEngine) {
      return;
    }

    this.isActive = true;
    const intervalMs = 1000 / updateFrequency; // Convertir FPS a ms

    this.updateInterval = window.setInterval(() => {
      this.collectAndUpdateData();
    }, intervalMs);

    console.log(`🎯 Debug data collection started at ${updateFrequency} FPS`);
  }

  /**
   * Para la recopilación de datos
   */
  stopDataCollection(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isActive = false;
    console.log('⏹️ Debug data collection stopped');
  }

  /**
   * Recopila datos de la nave y actualiza el overlay
   */
  private collectAndUpdateData(): void {
    if (!this.gameEngine || !this.isActive) {
      return;
    }

    try {
      const spaceshipData = this.getSpaceshipData();
      if (spaceshipData) {
        this.debugOverlay.updateData(spaceshipData);
      }
    } catch (error) {
      console.error('Error collecting spaceship debug data:', error);
    }
  }

  /**
   * Obtiene los datos actuales de la nave del GameEngine
   */
  private getSpaceshipData(): SpaceshipDebugData | null {
    if (!this.gameEngine) {
      return null;
    }

    // Obtener la nave del GameEngine usando reflexión
    const spaceship = this.getSpaceshipFromEngine();
    if (!spaceship) {
      return null;
    }

    // Obtener datos básicos
    const status = spaceship.getStatus();
    
    // Calcular velocidad vectorial
    const velocity = spaceship.velocity || { x: 0, y: 0, z: 0 };
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);

    // Convertir rotación de radianes a grados
    const rotationDegrees = {
      x: (status.rotation.x * 180) / Math.PI,
      y: (status.rotation.y * 180) / Math.PI,
      z: (status.rotation.z * 180) / Math.PI
    };

    return {
      position: status.position,
      rotation: rotationDegrees,
      sphericalCoordinates: {
        radius: 0, // Se calcula en el overlay
        theta: 0,  // Se calcula en el overlay
        phi: 0     // Se calcula en el overlay
      },
      velocity: velocity,
      speed: speed
    };
  }

  /**
   * Obtiene la instancia de la nave del GameEngine usando reflexión
   */
  private getSpaceshipFromEngine(): any {
    if (!this.gameEngine) {
      return null;
    }

    try {
      // Acceder a la propiedad privada 'spaceship' usando reflexión
      const engineAny = this.gameEngine as any;
      return engineAny.spaceship || null;
    } catch (error) {
      console.warn('Could not access spaceship from GameEngine:', error);
      return null;
    }
  }

  /**
   * Muestra el overlay de debug
   */
  showDebugOverlay(): void {
    this.debugOverlay.show();
    if (!this.isActive && this.gameEngine) {
      this.startDataCollection();
    }
  }

  /**
   * Oculta el overlay de debug
   */
  hideDebugOverlay(): void {
    this.debugOverlay.hide();
    this.stopDataCollection();
  }

  /**
   * Toggle del overlay de debug
   */
  toggleDebugOverlay(): boolean {
    const isVisible = this.debugOverlay.toggle();
    
    if (isVisible && !this.isActive && this.gameEngine) {
      this.startDataCollection();
    } else if (!isVisible) {
      this.stopDataCollection();
    }

    return isVisible;
  }

  /**
   * Verifica si el debug está activo
   */
  isDebugActive(): boolean {
    return this.isActive && this.debugOverlay.isOverlayVisible();
  }

  /**
   * Obtiene los datos actuales sin actualizar
   */
  getCurrentDebugData(): SpaceshipDebugData | null {
    return this.debugOverlay.getCurrentData();
  }

  /**
   * Actualiza manualmente los datos (para uso single-shot)
   */
  updateOnce(): void {
    if (this.gameEngine) {
      this.collectAndUpdateData();
    }
  }

  /**
   * Limpia recursos
   */
  cleanup(): void {
    this.stopDataCollection();
    this.debugOverlay.cleanup();
    this.gameEngine = null;
    console.log('🧹 Spaceship debug collector cleaned up');
  }
}