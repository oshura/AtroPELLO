import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface SpaceshipDebugData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  sphericalCoordinates: {
    radius: number;
    theta: number; // ángulo azimutal (0-360°)
    phi: number;   // ángulo polar (0-180°)
  };
  velocity: { x: number; y: number; z: number };
  speed: number;
  camera: {
    mode: string;
    modeName: string;
    zoomDistance: number;
  };
  targeting?: {
    mouse: { x: number; y: number; velocity: number };
    hovered?: { id: string; name: string; type: string } | null;
    selected?: { id: string; name: string; type: string } | null;
    hit?: { distance?: number; radiusPx: number; screenPosition?: { x: number; y: number } | null } | null;
  };
}

/**
 * Servicio para mostrar información de debug en overlay
 */
@Injectable({
  providedIn: 'root'
})
export class DebugOverlayService {
  private overlayElement: HTMLElement | null = null;
  private isVisible: boolean = false;
  private updateInterval: number | null = null;
  private currentData: SpaceshipDebugData | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Inicializa el overlay de debug
   */
  initialize(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.createOverlayElement();
  }

  /**
   * Crea el elemento HTML del overlay
   */
  private createOverlayElement(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Eliminar overlay existente si lo hay
    const existing = document.getElementById('debug-overlay');
    if (existing) {
      existing.remove();
    }

    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'debug-overlay';
    this.overlayElement.innerHTML = `
      <div class="debug-header">
        <span>🚀 Spaceship Debug Info</span>
        <button id="debug-toggle" title="Toggle Debug Overlay">×</button>
      </div>
      <div class="debug-content">
        <div class="debug-section">
          <h4>📍 Position (Cartesian)</h4>
          <div class="debug-values">
            <span>X: <span id="pos-x">0.000</span></span>
            <span>Y: <span id="pos-y">0.000</span></span>
            <span>Z: <span id="pos-z">0.000</span></span>
          </div>
        </div>
        
        <div class="debug-section">
          <h4>🌐 Position (Spherical)</h4>
          <div class="debug-values">
            <span>Radius: <span id="sph-radius">0.000</span></span>
            <span>Theta (θ): <span id="sph-theta">0.0°</span></span>
            <span>Phi (φ): <span id="sph-phi">0.0°</span></span>
          </div>
        </div>

        <div class="debug-section">
          <h4>🔄 Rotation</h4>
          <div class="debug-values">
            <span>Pitch: <span id="rot-x">0.0°</span></span>
            <span>Yaw: <span id="rot-y">0.0°</span></span>
            <span>Roll: <span id="rot-z">0.0°</span></span>
          </div>
        </div>

        <div class="debug-section">
          <h4>💨 Velocity</h4>
          <div class="debug-values">
            <span>Speed: <span id="velocity-speed">0.000</span></span>
            <span>VX: <span id="velocity-x">0.000</span></span>
            <span>VY: <span id="velocity-y">0.000</span></span>
            <span>VZ: <span id="velocity-z">0.000</span></span>
          </div>
        </div>

        <div class="debug-section">
          <h4>🎥 Camera</h4>
          <div class="debug-values">
            <span>Mode: <span id="camera-mode">N/A</span></span>
            <span>Name: <span id="camera-name">Unknown</span></span>
            <span>Zoom: <span id="camera-zoom">0.00</span></span>
          </div>
        </div>

        <div class="debug-section">
          <h4>🎯 Targeting</h4>
          <div class="debug-values">
            <span>Mouse: <span id="tgt-mouse">(0,0) v0</span></span>
            <span>Hovered: <span id="tgt-hovered">none</span></span>
            <span>Selected: <span id="tgt-selected">none</span></span>
            <span>Hit: <span id="tgt-hit">none</span></span>
          </div>
        </div>
      </div>
    `;

    // Estilos CSS inline para el overlay
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 280px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      border: 2px solid #00ff00;
      border-radius: 8px;
      padding: 0;
      z-index: 10000;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
      backdrop-filter: blur(5px);
      display: none;
      transition: all 0.3s ease;
    `;

    // Estilos para elementos internos
    const style = document.createElement('style');
    style.textContent = `
      #debug-overlay .debug-header {
        background: #00ff00;
        color: #000;
        padding: 8px 12px;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 6px 6px 0 0;
      }

      #debug-overlay .debug-header button {
        background: none;
        border: none;
        color: #000;
        font-size: 16px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #debug-overlay .debug-content {
        padding: 12px;
      }

      #debug-overlay .debug-section {
        margin-bottom: 12px;
      }

      #debug-overlay .debug-section:last-child {
        margin-bottom: 0;
      }

      #debug-overlay h4 {
        margin: 0 0 6px 0;
        color: #00ff00;
        font-size: 11px;
        text-transform: uppercase;
      }

      #debug-overlay .debug-values {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      #debug-overlay .debug-values span {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
      }

      #debug-overlay .debug-values span span {
        color: #ffffff;
        font-weight: bold;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(this.overlayElement);

    // Configurar event listeners
    this.setupEventListeners();
  }

  /**
   * Configura los event listeners del overlay
   */
  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    const toggleButton = this.overlayElement.querySelector('#debug-toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.hide();
      });
    }
  }

  /**
   * Convierte coordenadas cartesianas a esféricas
   */
  private cartesianToSpherical(x: number, y: number, z: number) {
    const radius = Math.sqrt(x * x + y * y + z * z);
    const theta = Math.atan2(y, x) * (180 / Math.PI); // Convertir a grados
    const phi = Math.acos(z / (radius || 1)) * (180 / Math.PI); // Convertir a grados

    return {
      radius: radius,
      theta: theta < 0 ? theta + 360 : theta, // Normalizar a 0-360°
      phi: phi
    };
  }

  /**
   * Actualiza los datos mostrados en el overlay
   */
  updateData(data: SpaceshipDebugData): void {
    if (!isPlatformBrowser(this.platformId) || !this.overlayElement || !this.isVisible) {
      return;
    }

    this.currentData = data;

    // Calcular coordenadas esféricas
    const spherical = this.cartesianToSpherical(
      data.position.x, 
      data.position.y, 
      data.position.z
    );

    // Actualizar valores en el DOM
    this.updateElementText('pos-x', data.position.x.toFixed(3));
    this.updateElementText('pos-y', data.position.y.toFixed(3));
    this.updateElementText('pos-z', data.position.z.toFixed(3));

    this.updateElementText('sph-radius', spherical.radius.toFixed(3));
    this.updateElementText('sph-theta', spherical.theta.toFixed(1) + '°');
    this.updateElementText('sph-phi', spherical.phi.toFixed(1) + '°');

    this.updateElementText('rot-x', data.rotation.x.toFixed(1) + '°');
    this.updateElementText('rot-y', data.rotation.y.toFixed(1) + '°');
    this.updateElementText('rot-z', data.rotation.z.toFixed(1) + '°');

    this.updateElementText('velocity-speed', data.speed.toFixed(3));
    this.updateElementText('velocity-x', data.velocity.x.toFixed(3));
    this.updateElementText('velocity-y', data.velocity.y.toFixed(3));
    this.updateElementText('velocity-z', data.velocity.z.toFixed(3));

    // Actualizar información de cámara
    this.updateElementText('camera-mode', data.camera.mode);
    this.updateElementText('camera-name', data.camera.modeName);
    this.updateElementText('camera-zoom', data.camera.zoomDistance.toFixed(2));

    // Actualizar targeting si llega
    if (data.targeting) {
      const m = data.targeting.mouse;
      const mouseText = `(${Math.round(m.x)},${Math.round(m.y)}) v${Math.round(m.velocity)}`;
      this.updateElementText('tgt-mouse', mouseText);

      const hoveredText = data.targeting.hovered
        ? `${data.targeting.hovered.name} [${data.targeting.hovered.type}]`
        : 'none';
      this.updateElementText('tgt-hovered', hoveredText);

      const selectedText = data.targeting.selected
        ? `${data.targeting.selected.name} [${data.targeting.selected.type}]`
        : 'none';
      this.updateElementText('tgt-selected', selectedText);

      const hit = data.targeting.hit;
      const hitText = hit
        ? `r=${Math.round(hit.radiusPx)}${hit.distance != null ? `, d=${Math.round(hit.distance)}` : ''}${hit.screenPosition ? ` @(${Math.round(hit.screenPosition.x)},${Math.round(hit.screenPosition.y)})` : ''}`
        : 'none';
      this.updateElementText('tgt-hit', hitText);
    }
  }

  /**
   * Actualiza el texto de un elemento por ID
   */
  private updateElementText(id: string, text: string): void {
    const element = this.overlayElement?.querySelector(`#${id}`);
    if (element) {
      element.textContent = text;
    }
  }

  /**
   * Muestra el overlay
   */
  show(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (!this.overlayElement) {
      this.initialize();
    }

    this.isVisible = true;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'block';
    }
  }

  /**
   * Oculta el overlay
   */
  hide(): void {
    this.isVisible = false;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  /**
   * Toggle de visibilidad del overlay
   */
  toggle(): boolean {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
    return this.isVisible;
  }

  /**
   * Verifica si el overlay está visible
   */
  isOverlayVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Obtiene los datos actuales
   */
  getCurrentData(): SpaceshipDebugData | null {
    return this.currentData;
  }

  /**
   * Limpia recursos
   */
  cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }

    this.isVisible = false;
    this.currentData = null;
  }
}