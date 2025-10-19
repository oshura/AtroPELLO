import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class DebugStatsOverlayService {
  private overlayElement: HTMLElement | null = null;
  private isVisible = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private emaFps = 0; // Exponential moving average for FPS
  private gameEngine: any | null = null; // runtime-reflection access

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  initialize(engine?: any): void {
    this.gameEngine = engine ?? this.gameEngine;
    if (!isPlatformBrowser(this.platformId)) return;
    this.ensureOverlay();
  }

  attachEngine(engine: any): void {
    this.gameEngine = engine;
  }

  show(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.ensureOverlay();
    if (this.overlayElement) this.overlayElement.style.display = 'block';
    this.isVisible = true;
    this.startLoop();
  }

  hide(): void {
    this.isVisible = false;
    if (this.overlayElement) this.overlayElement.style.display = 'none';
    this.stopLoop();
  }

  toggle(): boolean {
    if (this.isVisible) this.hide(); else this.show();
    return this.isVisible;
  }

  isOverlayVisible(): boolean { return this.isVisible; }

  cleanup(): void {
    this.stopLoop();
    if (this.overlayElement) { this.overlayElement.remove(); this.overlayElement = null; }
    this.gameEngine = null;
  }

  // ===== internal =====
  private ensureOverlay(): void {
    if (this.overlayElement) return;
    // Remove existing if any
    const existing = document.getElementById('debug-stats-overlay');
    if (existing) existing.remove();

    // Container
    const el = document.createElement('div');
    el.id = 'debug-stats-overlay';
    el.innerHTML = `
      <div class="dbg-header">📊 Stats (ñ)</div>
      <div class="dbg-content">
        <div>FPS: <span id="stat-fps">0</span></div>
        <div>Frame: <span id="stat-frame">0.0</span> ms</div>
        <div>Instancing: <span id="stat-instancing">unknown</span></div>
        <div>Camera: <span id="stat-cam-name">N/A</span> (<span id="stat-cam-mode">-</span>)</div>
        <div>Clusters: <span id="stat-clusters">-</span></div>
        <div>Objects: <span id="stat-objects">-</span></div>
      </div>
    `;
    el.style.cssText = `
      position: fixed; left: 20px; top: 20px; width: 240px; z-index: 10001;
      color: #0ff; background: rgba(0,0,0,0.85); border: 1px solid #0ff; border-radius: 8px;
      font: 12px 'Courier New', monospace; padding: 8px 10px; display: none;
      box-shadow: 0 0 12px rgba(0,255,255,0.25);
    `;
    const style = document.createElement('style');
    style.textContent = `
      #debug-stats-overlay .dbg-header { font-weight: bold; margin-bottom: 6px; color: #0ff; }
      #debug-stats-overlay .dbg-content div { margin: 2px 0; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
    this.overlayElement = el;
  }

  private startLoop(): void {
    if (this.rafId != null) return;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.isVisible) { this.rafId = null; return; }
      const now = performance.now();
      const dt = Math.max(0.000001, (now - this.lastTime) / 1000);
      this.lastTime = now;
      const fps = 1 / dt;
      // EMA smoothing
      this.emaFps = this.emaFps === 0 ? fps : (this.emaFps * 0.9 + fps * 0.1);
      this.updateDOM(this.emaFps, dt * 1000);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private updateDOM(fps: number, frameMs: number): void {
    if (!this.overlayElement) return;
    const setText = (id: string, val: string) => {
      const el = this.overlayElement!.querySelector(`#${id}`);
      if (el) el.textContent = val;
    };

    setText('stat-fps', String(Math.round(fps)));
    setText('stat-frame', frameMs.toFixed(1));

    // optional engine data
    const eng: any = this.gameEngine;
    if (eng) {
      // instancing (best-effort)
      let instancing = 'unknown';
      try { instancing = String(!!eng['USE_INSTANCING']); } catch {}
      setText('stat-instancing', instancing);

      // camera info
      let mode = '-'; let name = 'N/A';
      try {
        const cam = eng['camera'];
        const modeNum = cam?.getCurrentMode ? cam.getCurrentMode() : undefined;
        const modeNames: { [k: number]: string } = { 0: 'INMOVILE_EXTERNAL', 7: 'REAR_VIEW', 8: 'COCKPIT', 9: 'REAR_TRACKING' };
        mode = modeNum != null ? String(modeNum) : '-';
        name = modeNum != null ? (modeNames[modeNum] || `Mode ${modeNum}`) : 'N/A';
      } catch {}
      setText('stat-cam-mode', mode);
      setText('stat-cam-name', name);

      // clusters/objects summary
      let clustersTxt = '-'; let objectsTxt = '-';
      try {
        const svc = eng['asteroidClusterService'];
        const clusters = svc?.getClusters ? svc.getClusters() : [];
        let full = 0, proxy = 0, objects = 0;
        clusters.forEach((c: any) => {
          if (c?.lodMode === 'full') { full++; objects += (c.objects?.length || 0); }
          else if (c?.lodMode === 'proxy') { proxy++; }
        });
        clustersTxt = `${clusters.length} (full: ${full}, proxy: ${proxy})`;
        objectsTxt = `${objects}`;
      } catch {}
      setText('stat-clusters', clustersTxt);
      setText('stat-objects', objectsTxt);
    }
  }
}
