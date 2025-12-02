import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LoggingService, LogCategory, LogLevel, LogEntry } from '../logging.service';
import { CharacterProfileService } from '../game/character-profile.service';
import { LesserBeing, LESSER_BEING_LABELS } from '../../game/types/cosmic-life.types';

@Injectable({ providedIn: 'root' })
export class DebugStatsOverlayService {
  private overlayElement: HTMLElement | null = null;
  private isVisible = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private emaFps = 0; // Exponential moving average for FPS
  private gameEngine: any | null = null; // runtime-reflection access
  private toolStatusTimer: number | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private logging: LoggingService,
    private characterProfile: CharacterProfileService
  ) {}

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
    if (this.toolStatusTimer) {
      clearTimeout(this.toolStatusTimer);
      this.toolStatusTimer = null;
    }
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
      <div class="dbg-header">📊 Stats & Logs (ñ)</div>
      <div class="dbg-sections">
        <div class="dbg-content" id="dbg-stats-section">
          <div>FPS: <span id="stat-fps">0</span></div>
          <div>Frame: <span id="stat-frame">0.0</span> ms</div>
          <div>Instancing: <span id="stat-instancing">unknown</span></div>
          <div>Camera: <span id="stat-cam-name">N/A</span> (<span id="stat-cam-mode">-</span>)</div>
          <div>Clusters: <span id="stat-clusters">-</span></div>
          <div>Objects: <span id="stat-objects">-</span></div>
        </div>
        <div class="dbg-tools" id="dbg-tools-section">
          <div class="dbg-subheader">Dev Controls</div>
          <div class="dbg-controls-row">
            <button id="dbg-btn-survivability-minus">Survivencia -9%</button>
            <button id="dbg-btn-age-plus">+365 días edad</button>
          </div>
          <div class="dbg-subheader">Spawn Lesser Beings</div>
          <div class="dbg-controls-row">
            <button id="dbg-btn-spawn-seed">Semilla estelar</button>
            <button id="dbg-btn-spawn-shoggoth">Shoggoth</button>
            <button id="dbg-btn-spawn-vamp">Vampiro de fuego</button>
          </div>
          <div id="dbg-tools-status" class="dbg-tools-status"></div>
        </div>
        <div class="dbg-logs" id="dbg-logs-section">
          <div class="dbg-subheader">Logs</div>
          <div id="log-controls"></div>
          <div id="log-entries"></div>
        </div>
      </div>
    `;
    el.style.cssText = `
      position: fixed; left: 20px; top: 20px; width: 360px; max-height: 70vh; overflow-y: auto; z-index: 10001;
      color: #0ff; background: rgba(0,0,0,0.85); border: 1px solid #0ff; border-radius: 8px;
      font: 12px 'Courier New', monospace; padding: 8px 10px; display: none;
      box-shadow: 0 0 12px rgba(0,255,255,0.25);
    `;
    const style = document.createElement('style');
    style.textContent = `
      #debug-stats-overlay .dbg-header { font-weight: bold; margin-bottom: 6px; color: #0ff; }
      #debug-stats-overlay .dbg-content div { margin: 2px 0; }
      #debug-stats-overlay .dbg-sections { display: flex; flex-direction: column; gap: 8px; }
      #debug-stats-overlay .dbg-logs { border-top: 1px solid #055; padding-top: 6px; }
      #debug-stats-overlay .dbg-subheader { font-weight: bold; margin-bottom: 4px; color: #0ff; }
      #debug-stats-overlay #log-controls { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
      #debug-stats-overlay #log-controls button, #debug-stats-overlay #log-controls select { background:#022; color:#0ff; border:1px solid #066; border-radius:4px; font-size:11px; padding:2px 6px; cursor:pointer; }
      #debug-stats-overlay #log-controls button.active { background:#0a4; border-color:#0f6; color:#fff; }
      #debug-stats-overlay #log-entries { max-height: 240px; overflow-y: auto; font-size:11px; line-height:1.3; }
      #debug-stats-overlay #log-entries .log-entry { margin:0 0 2px 0; white-space:nowrap; }
      #debug-stats-overlay #log-entries .lvl-ERROR { color:#f55; }
      #debug-stats-overlay #log-entries .lvl-WARN { color:#fa0; }
      #debug-stats-overlay #log-entries .lvl-INFO { color:#0af; }
      #debug-stats-overlay #log-entries .lvl-DEBUG { color:#888; }
      #debug-stats-overlay #log-entries .lvl-TRACE { color:#555; }
      #debug-stats-overlay .dbg-tools { border-top: 1px solid #055; padding-top: 6px; }
      #debug-stats-overlay .dbg-controls-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px; }
      #debug-stats-overlay .dbg-controls-row button { background:#022; color:#0ff; border:1px solid #066; border-radius:4px; font-size:11px; padding:4px 8px; cursor:pointer; }
      #debug-stats-overlay .dbg-controls-row button:hover { background:#044; }
      #debug-stats-overlay .dbg-tools-status { min-height: 16px; font-style: italic; color: #aff; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
    this.overlayElement = el;
    this.buildLogControls();
    this.wireDevControls();
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

  // ===== Logging UI =====
  private buildLogControls(): void {
    if (!this.overlayElement) return;
    const controls = this.overlayElement.querySelector('#log-controls');
    if (!controls) return;
    controls.innerHTML = '';
    // Level selector
    const levelSelect = document.createElement('select');
    Object.keys(LogLevel).filter(k => isNaN(Number(k))).forEach(k => {
      if (k === 'OFF' || k === 'TRACE' || k === 'DEBUG' || k === 'INFO' || k === 'WARN' || k === 'ERROR') {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        if (LogLevel[k as keyof typeof LogLevel] === this.logging.getLevelThreshold()) opt.selected = true;
        levelSelect.appendChild(opt);
      }
    });
    levelSelect.onchange = () => {
      const val = levelSelect.value as keyof typeof LogLevel;
      this.logging.setLevelThreshold(LogLevel[val]);
    };
    controls.appendChild(levelSelect);

    // Category buttons
    // Global toggles
    const btnEnableAll = document.createElement('button');
    btnEnableAll.textContent = 'Enable All';
    btnEnableAll.onclick = () => {
      Object.values(LogCategory).forEach((c) => this.logging.enableCategory(c as LogCategory));
      this.buildLogControls();
    };
    controls.appendChild(btnEnableAll);

    const btnDisableAll = document.createElement('button');
    btnDisableAll.textContent = 'Disable All';
    btnDisableAll.onclick = () => {
      Object.values(LogCategory).forEach((c) => this.logging.disableCategory(c as LogCategory));
      this.buildLogControls();
    };
    controls.appendChild(btnDisableAll);

    // One button per category
    const cats = Object.values(LogCategory);
    cats.forEach((cat: LogCategory) => {
      const btn = document.createElement('button');
      btn.textContent = cat.replace('SOLAR_SYSTEM_', 'SOLAR_');
      const updateBtn = () => {
        if (this.logging.isCategoryEnabled(cat as LogCategory)) btn.classList.add('active'); else btn.classList.remove('active');
      };
      btn.onclick = () => {
        if (this.logging.isCategoryEnabled(cat as LogCategory)) this.logging.disableCategory(cat as LogCategory); else this.logging.enableCategory(cat as LogCategory);
        updateBtn();
      };
      updateBtn();
      controls.appendChild(btn);
    });

    // Live update of entries via subscription
    this.logging.subscribe(() => this.renderLogEntries());
    this.renderLogEntries();
  }

  private renderLogEntries(): void {
    if (!this.overlayElement) return;
    const container = this.overlayElement.querySelector('#log-entries');
    if (!container) return;
  const history: LogEntry[] = this.logging.getHistory().slice(-120); // show last 120
  const lines = history.map((e: LogEntry) => this.formatEntry(e));
    container.innerHTML = lines.join('');
    // Scroll to bottom to show most recent
    container.scrollTop = container.scrollHeight;
  }

  private formatEntry(entry: LogEntry): string {
    const lvlName = LogLevel[entry.level];
    const t = (entry.time / 1000).toFixed(2).padStart(6,'0');
    const cat = entry.category;
    const msg = ('' + entry.message).replace(/</g,'&lt;');
    return `<div class="log-entry lvl-${lvlName}">${t}s [${lvlName}] [${cat}] ${msg}</div>`;
  }

  private wireDevControls(): void {
    if (!this.overlayElement) return;
    const survBtn = this.overlayElement.querySelector('#dbg-btn-survivability-minus') as HTMLButtonElement | null;
    const ageBtn = this.overlayElement.querySelector('#dbg-btn-age-plus') as HTMLButtonElement | null;
    const spawnButtons: Array<{ id: string; type: LesserBeing }> = [
      { id: '#dbg-btn-spawn-seed', type: LesserBeing.SEMILLAS_ESTELARES },
      { id: '#dbg-btn-spawn-shoggoth', type: LesserBeing.SHOGGOTH },
      { id: '#dbg-btn-spawn-vamp', type: LesserBeing.VAMPIRO_FUEGO },
    ];
    if (survBtn) {
      survBtn.onclick = () => this.handleSurvivabilityAdjustment(-9);
    }
    if (ageBtn) {
      ageBtn.onclick = () => this.handleAgeAdvance(365);
    }
    spawnButtons.forEach(({ id, type }) => {
      const btn = this.overlayElement?.querySelector(id) as HTMLButtonElement | null;
      if (!btn) {
        return;
      }
      btn.onclick = () => this.handleSpawnDebugLesser(type);
    });
  }

  private handleSurvivabilityAdjustment(delta: number): void {
    try {
      const result = this.characterProfile.adjustSurvivability(delta);
      this.showToolStatus(`Supervivencia → ${result.toFixed(1)}%`);
      this.logging.log(LogLevel.INFO, LogCategory.HUD, 'Dev survivability tweak', { delta, result });
    } catch (error) {
      this.showToolStatus('Error al ajustar supervivencia');
      this.logging.log(LogLevel.ERROR, LogCategory.HUD, 'Dev survivability tweak failed', error);
    }
  }

  private handleAgeAdvance(days: number): void {
    try {
      const info = this.characterProfile.addDaysToAge(days);
      this.showToolStatus(`Edad → ${info.newAge.years} años · ${info.newAge.days} días (+${info.daysApplied}d)`);
      this.logging.log(LogLevel.INFO, LogCategory.HUD, 'Dev age advance', { days });
    } catch (error) {
      this.showToolStatus('Error al ajustar edad');
      this.logging.log(LogLevel.ERROR, LogCategory.HUD, 'Dev age advance failed', error);
    }
  }

  private handleSpawnDebugLesser(species: LesserBeing): void {
    if (!this.gameEngine || typeof this.gameEngine.debugSpawnLesserBeing !== 'function') {
      this.showToolStatus('Engine no disponible para spawn');
      return;
    }
    try {
      this.gameEngine.debugSpawnLesserBeing(species);
      const label = LESSER_BEING_LABELS[species] ?? species;
      this.showToolStatus(`Spawn ${label} solicitado`);
    } catch (error) {
      this.showToolStatus('Error al spawnear lesser being');
      this.logging.log(LogLevel.ERROR, LogCategory.LESSER_BEINGS, 'Dev spawn lesser being failed', {
        species,
        error
      });
    }
  }

  private showToolStatus(message: string): void {
    if (!this.overlayElement) return;
    const status = this.overlayElement.querySelector('#dbg-tools-status');
    if (status) {
      status.textContent = message;
    }
    if (this.toolStatusTimer) {
      clearTimeout(this.toolStatusTimer);
    }
    this.toolStatusTimer = window.setTimeout(() => {
      if (status) {
        status.textContent = '';
      }
      this.toolStatusTimer = null;
    }, 2500);
  }
}
