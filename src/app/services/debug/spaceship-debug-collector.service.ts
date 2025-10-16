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
  private pendingTargeting?: {
    mouse: { x: number; y: number; velocity: number };
    hovered?: { id: string; name: string; type: string } | null;
    selected?: { id: string; name: string; type: string } | null;
    hit?: { distance?: number; radiusPx: number; screenPosition?: { x: number; y: number } | null } | null;
  };

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
        if (this.pendingTargeting) {
          (spaceshipData as any).targeting = this.pendingTargeting;
        }
        this.debugOverlay.updateData(spaceshipData);
      }
    } catch (error) {
      console.error('Error collecting spaceship debug data:', error);
    }
  }

  /**
   * Permite inyectar un snapshot de targeting (desde ReticleManager)
   */
  setTargetingSnapshot(snapshot: {
    mouse: { x: number; y: number; velocity: number };
    hovered?: { id: string; name: string; type: string } | null;
    selected?: { id: string; name: string; type: string } | null;
    hit?: { distance?: number; radiusPx: number; screenPosition?: { x: number; y: number } | null } | null;
  }): void {
    this.pendingTargeting = snapshot;
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

    // Obtener información de cámara del GameEngine
    const cameraInfo = this.getCameraInfo();

    return {
      position: status.position,
      rotation: rotationDegrees,
      sphericalCoordinates: {
        radius: 0, // Se calcula en el overlay
        theta: 0,  // Se calcula en el overlay
        phi: 0     // Se calcula en el overlay
      },
      velocity: velocity,
      speed: speed,
      camera: cameraInfo
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
   * Obtiene la información de cámara del GameEngine
   */
  private getCameraInfo(): { mode: string; modeName: string; zoomDistance: number } {
    if (!this.gameEngine) {
      return { mode: 'N/A', modeName: 'Unknown', zoomDistance: 0 };
    }

    try {
      // Acceder a la cámara del GameEngine
      const engineAny = this.gameEngine as any;
      const camera = engineAny.camera;
      
      if (!camera) {
        return { mode: 'N/A', modeName: 'No Camera', zoomDistance: 0 };
      }

      // Obtener información de debug de la cámara
      const debugInfo = camera.getDebugInfo ? camera.getDebugInfo() : null;
      const currentMode = camera.getCurrentMode ? camera.getCurrentMode() : 'Unknown';
      const zoomDistance = camera.getZoomDistance ? camera.getZoomDistance() : 0;

      // Mapear números de modo a nombres legibles
      const modeNames: { [key: number]: string } = {
        0: 'INMOVILE_EXTERNAL',
        7: 'REAR_VIEW',
        8: 'COCKPIT',
        9: 'REAR_TRACKING'
      };

      const modeName = modeNames[currentMode] || `Mode ${currentMode}`;

      return {
        mode: currentMode.toString(),
        modeName: modeName,
        zoomDistance: Math.round(zoomDistance * 100) / 100 // Redondear a 2 decimales
      };
    } catch (error) {
      console.warn('Could not access camera info from GameEngine:', error);
      return { mode: 'Error', modeName: 'Error accessing camera', zoomDistance: 0 };
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