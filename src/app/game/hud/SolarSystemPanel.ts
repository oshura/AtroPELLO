import { Vector3 } from '../../types/game.types';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';
import { GameObjectCategory, getCategoryIcon } from '../types/game-object.types';
import { computePanelLetterbox, mapViewportPointToCanvas, PANEL_HORIZONTAL_STRETCH } from './utils/panel-letterbox';
import { PanelCursorOverlayState } from './utils/panel-cursor.types';

// Matches the tinted grey that ends up in the HUD letterbox bars so edge pixels
// blend seamlessly with the "dead zone" backdrop.
const PANEL_DEAD_ZONE_GRAY = '#05060a';

/**
 * SolarSystemPanel: renders a full-screen, opaque top-down map of the solar system
 * onto a canvas, then draws it as a textured quad in front of the camera.
 * - Always considers clusters regardless of gameplay culling.
 * - Scales so the farthest object from the chosen center fits within the panel with a margin.
 */
export class SolarSystemPanel {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private program: WebGLProgram | null = null;
  private uvTransformLoc: WebGLUniformLocation | null = null;
  private enabled: boolean = false;
  // Zoom/pan state (applied on top of fit-to-bounds scale)
  private fitScale: number = 1; // computed each updateMap
  private zoomScale: number = 1; // user-controlled zoom factor (>= 1)
  private readonly zoomMax: number = 20; // max zoom-in factor
  private tx: number = 0; // screen-space translation in canvas pixels
  private ty: number = 0;
  private panActive: boolean = false;
  private panAnchorPx: number = 0;
  private panAnchorPy: number = 0;
  private panStartTx: number = 0;
  private panStartTy: number = 0;
  private items: Array<{
    id: string;
    label: string;
    category: GameObjectCategory | 'center'; // 'center' es especial (no es un GameObject)
    pos: Vector3;
    px: number;
    py: number;
    rPx: number;
    color: string;
  }> = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private cursorPx: number | null = null;
  private cursorPy: number | null = null;
  private cursorViewportX: number | null = null;
  private cursorViewportY: number | null = null;
  // Filtering state (categories + 'center' special)
  private visibleCategories: Set<GameObjectCategory | 'center'> = new Set([
    'center',
    GameObjectCategory.PLANET,
    GameObjectCategory.CLUSTER,
    GameObjectCategory.ASTEROID,
    GameObjectCategory.PORTAL,
    GameObjectCategory.SHIP,
    GameObjectCategory.ENEMY,
    GameObjectCategory.STATION
  ]);
  private showOrbits: boolean = true;
  private filterButtons: Array<{ cat: string; x: number; y: number; w: number; h: number; active: boolean; label: string }> = [];
  // Fine-grained planet-type filters
  private visiblePlanetKinds: Set<string> = new Set(['giant','dwarf','protoplanet','gaseous','tierra','ringed','planetoid']);

  private togglePlanetKind(kind: string): void {
    const k = kind.toLowerCase();
    if (this.visiblePlanetKinds.has(k)) this.visiblePlanetKinds.delete(k); else this.visiblePlanetKinds.add(k);
  }

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('SolarSystemPanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
  }

  public setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      this.cursorPx = null;
      this.cursorPy = null;
      this.cursorViewportX = null;
      this.cursorViewportY = null;
      this.panActive = false;
    }
  }
  public isEnabled(): boolean { return this.enabled; }
  /**
   * Check if this panel occludes the 3D scene at the given viewport coordinates.
   * Since the panel is fullscreen when enabled, it occludes the entire viewport.
   */
  public containsPoint(_x: number, _y: number): boolean { return this.enabled; }
  public getCursorOverlayState(): PanelCursorOverlayState | null {
    if (!this.enabled || this.cursorViewportX == null || this.cursorViewportY == null) {
      return null;
    }
    const base = Math.min(this.canvas.width, this.canvas.height) || 1;
    const radius = Math.max(10, base * 0.015);
    return {
      mode: 'map',
      viewportX: this.cursorViewportX,
      viewportY: this.cursorViewportY,
      radius,
    };
  }
  public setSelectedId(id: string | null) { this.selectedId = id; }
  public setHoveredId(id: string | null) { this.hoveredId = id; }
  public getSelectedId(): string | null { return this.selectedId; }
  public getHoveredId(): string | null { return this.hoveredId; }
  public setCursorFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    this.cursorViewportX = mapped.viewportX;
    this.cursorViewportY = mapped.viewportY;
    if (!mapped.inside) {
      this.cursorPx = null;
      this.cursorPy = null;
      return;
    }
    this.cursorPx = mapped.mapX;
    this.cursorPy = mapped.mapY;
  }

  public toggleCategory(cat: GameObjectCategory | 'center' | 'orbits'): void {
    if (cat === 'orbits') {
      this.showOrbits = !this.showOrbits; return;
    }
    if (this.visibleCategories.has(cat)) this.visibleCategories.delete(cat); else this.visibleCategories.add(cat);
  }

  public isCategoryVisible(cat: GameObjectCategory | 'center'): boolean { return this.visibleCategories.has(cat); }
  public areOrbitsVisible(): boolean { return this.showOrbits; }

  /** Reset view to initial fit (no pan, no zoom) */
  public resetView(): void {
    this.zoomScale = 1;
    this.tx = 0; this.ty = 0;
  }

  /** Handle wheel from viewport coords: zoom towards cursor position */
  public handleWheelFromViewport(deltaY: number, clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    if (!mapped.inside) {
      return;
    }
    this.zoomAtCanvasPoint(mapped.mapX, mapped.mapY, deltaY);
  }

  /** Begin a pan gesture from viewport coordinates (expects RMB drag) */
  public beginPanFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): boolean {
    if (!this.enabled) {
      return false;
    }
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    if (!mapped.inside) {
      return false;
    }
    this.panActive = true;
    this.panAnchorPx = mapped.mapX;
    this.panAnchorPy = mapped.mapY;
    this.panStartTx = this.tx;
    this.panStartTy = this.ty;
    return true;
  }

  /** Update an active pan gesture */
  public updatePanFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    if (!this.panActive) {
      return;
    }
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    this.tx = this.panStartTx + (mapped.mapX - this.panAnchorPx);
    this.ty = this.panStartTy + (mapped.mapY - this.panAnchorPy);
  }

  public endPan(): void {
    this.panActive = false;
  }

  public isPanActive(): boolean {
    return this.panActive;
  }

  /** Zoom at a canvas pixel coordinate, adjusting translation to keep the focus point stable */
  private zoomAtCanvasPoint(mapX: number, mapY: number, deltaY: number): void {
    // Wheel delta: positive means zoom out, negative zoom in
    const prevZoom = this.zoomScale;
    // Smooth exponential zoom factor
    const factor = Math.pow(1.0015, -deltaY);
    let nextZoom = prevZoom * factor;
    // Clamp and auto-reset if trying to zoom out past the initial fit
    if (nextZoom <= 1.0001) {
      this.resetView();
      return;
    }
    if (nextZoom > this.zoomMax) nextZoom = this.zoomMax;

    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const prevSEff = this.fitScale * prevZoom;
    const nextSEff = this.fitScale * nextZoom;
    const r = nextSEff / Math.max(1e-6, prevSEff);

    // Keep the point under cursor fixed on screen
    // tx' = X - cx - (X - cx - tx) * r
    // ty' = Y - cy - (Y - cy - ty) * r
    this.tx = mapX - cx - (mapX - cx - this.tx) * r;
    this.ty = mapY - cy - (mapY - cy - this.ty) * r;
    this.zoomScale = nextZoom;
  }

  private initGLResources(): void {
    const gl = this.gl;
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Fullscreen quad (clip-space coords)
    const vertices = new Float32Array([
      // x, y, u, v
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    const indices = new Uint16Array([0,1,2, 0,2,3]);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Simple textured quad shader
    const vsSrc = `#version 300 es\nprecision mediump float;\nlayout(location=0) in vec2 a_pos;\nlayout(location=1) in vec2 a_uv;\nout vec2 v_uv;\nvoid main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const fsSrc = `#version 300 es\nprecision mediump float;\nuniform sampler2D u_tex;\nuniform vec4 u_uvTransform;\nin vec2 v_uv;\nout vec4 frag;\nvoid main(){\n  vec2 coverage = max(u_uvTransform.xy, vec2(0.0001));\n  vec2 uv = (v_uv - u_uvTransform.zw) / coverage;\n  uv = clamp(uv, vec2(0.0), vec2(1.0));\n  frag = texture(u_tex, uv);\n}`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'SolarSystemPanel shader link error', { info: gl.getProgramInfoLog(prog) }); } catch {}
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;
    this.uvTransformLoc = gl.getUniformLocation(prog, 'u_uvTransform');

    // Enable attributes
    const stride = 4 * 4; // 4 floats per vertex
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
  }

  /**
   * Draw a top-down (Y-axis) map to the internal canvas and upload to texture.
   */
  public updateMap(data: {
    center: Vector3;
    centerLabel?: string;
    planets: Array<{
      id: string;
      pos: Vector3;
      label?: string;
      kind?: string; // normalized lowercase kind: giant|dwarf|protoplanet|gaseous|tierra|ringed|planetoid
      orbit?: { center: Vector3; a: number; b: number; orient: number };
      orbit3d?: { center: Vector3; a: number; b: number; u: Vector3; n: Vector3; orient: number };
    }>;
    clusters: Array<{ id: string; center: Vector3; label?: string }>; // always included regardless of gameplay culling
    debris: Array<{ id: string; pos: Vector3; label?: string; color?: string; radiusPx?: number }>; // e.g., Earth mega-asteroids
    enemies?: Array<{ id: string; pos: Vector3; label?: string; color?: string; radiusPx?: number }>;
    stations?: Array<{ id: string; pos: Vector3; label?: string; color?: string; radiusPx?: number }>;
    ship?: { pos: Vector3; label?: string };
    portals?: Array<{ id: string; pos: Vector3; label?: string }>;
    marginPx?: number;
    // Optional: details to display for the active (selected or hovered) item
    details?: Record<string, any>;
  }): void {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2;
    const margin = Math.max(16, Math.min(128, data.marginPx ?? 48));
    // Palette
    const planetColor = '#68a0ff';
    const megaColor = '#e88d3a'; // shared for debris and clusters
  const shipColor = '#32d296';
  const portalColor = '#c084fc';
  const enemyColor = '#ff4d4f';

  // Local vector math helpers (for orbit projection)
  const len = (v: Vector3) => Math.hypot(v.x, v.y, v.z);
  const norm = (v: Vector3) => { const L = len(v) || 1; return { x: v.x/L, y: v.y/L, z: v.z/L }; };
  const dot = (a: Vector3, b: Vector3) => a.x*b.x + a.y*b.y + a.z*b.z;
  const sub = (a: Vector3, b: Vector3) => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
  const addV = (a: Vector3, b: Vector3) => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z });
  const scaleV = (v: Vector3, s: number) => ({ x: v.x*s, y: v.y*s, z: v.z*s });
  const cross = (a: Vector3, b: Vector3) => ({ x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x });
  const projectToPlane = (v: Vector3, n: Vector3) => { const d = dot(v, n); return { x: v.x - d*n.x, y: v.y - d*n.y, z: v.z - d*n.z }; };

    // 1) Compute max radial distance in XZ plane from center
    let maxR = 1;
    const radXZ = (p: Vector3) => Math.hypot(p.x - data.center.x, p.z - data.center.z);
    for (const p of data.planets) maxR = Math.max(maxR, radXZ(p.pos));
    for (const d of data.debris) maxR = Math.max(maxR, radXZ(d.pos));
    for (const e of data.enemies || []) maxR = Math.max(maxR, radXZ(e.pos));
    for (const st of data.stations || []) maxR = Math.max(maxR, radXZ(st.pos));
    for (const cl of data.clusters) maxR = Math.max(maxR, radXZ(cl.center));
    if (data.ship) maxR = Math.max(maxR, radXZ(data.ship.pos));

  const Rpanel = Math.min(cx, cy) - margin;
  const sFit = (maxR > 0) ? (Rpanel / maxR) : 1;
  this.fitScale = sFit;
  const s = sFit * this.zoomScale;

  // Clear items for re-projection this frame
  this.items = [];

  // 2) Clear opaque background
    c.save();
    c.fillStyle = PANEL_DEAD_ZONE_GRAY; // deep dark, matches letterbox grey
    c.fillRect(0, 0, W, H);

    // Build filter buttons (top-left) based on present categories
    this.filterButtons = [];
    const present: Array<GameObjectCategory | 'center'> = [];
    if (data.planets.length) present.push(GameObjectCategory.PLANET);
    if (data.clusters.length) present.push(GameObjectCategory.CLUSTER);
    if (data.debris.length) present.push(GameObjectCategory.ASTEROID); // debris = asteroids
    if ((data.enemies?.length ?? 0) > 0) present.push(GameObjectCategory.ENEMY);
    if ((data.stations?.length ?? 0) > 0) present.push(GameObjectCategory.STATION);
    if ((data.portals||[]).length) present.push(GameObjectCategory.PORTAL);
    if (data.ship) present.push(GameObjectCategory.SHIP);
    if (data.centerLabel) present.unshift('center');
    const btnSize = 22; const pad = 6; let bx = pad; const by = pad;
    const iconFor = (cat: GameObjectCategory | 'center' | 'orbits') => {
      if (cat === 'center') return '*';
      if (cat === 'orbits') return 'Orb';
      return getCategoryIcon(cat as GameObjectCategory);
    };
    for (const cat of present) {
      this.filterButtons.push({ cat: cat as string, x: bx, y: by, w: btnSize, h: btnSize, active: this.visibleCategories.has(cat), label: iconFor(cat) });
      bx += btnSize + 4;
    }
    // Orbits toggle button
    this.filterButtons.push({ cat: 'orbits', x: bx, y: by, w: btnSize+14, h: btnSize, active: this.showOrbits, label: iconFor('orbits') });
    // Planet-type fine-grained filters (only shown if planets present)
    if (data.planets.length && this.visibleCategories.has(GameObjectCategory.PLANET)) {
      const kindsPresent = new Set<string>();
      for (const p of data.planets) {
        const k = (p.kind || '').toLowerCase();
        if (k) kindsPresent.add(k);
      }
      const kindOrder = ['tierra','rocky','planetoid','ringed','gaseous','giant','dwarf','protoplanet'];
      const kindIcon = (k: string) => {
        switch (k) {
          case 'tierra': return 'Te';
          case 'rocky': return 'Ro';
          case 'planetoid': return 'Pl';
          case 'ringed': return 'Ri';
          case 'gaseous': return 'Ga';
          case 'giant': return 'Gi';
          case 'dwarf': return 'Dw';
          case 'protoplanet': return 'Pr';
          default: return k.slice(0,2).toUpperCase();
        }
      };
      // New row for kinds
      const byKinds = by + btnSize + 6;
      bx = pad;
      for (const k of kindOrder) {
        if (!kindsPresent.has(k)) continue;
        const active = this.visiblePlanetKinds.has(k);
        const w = btnSize + 6;
        this.filterButtons.push({ cat: `kind:${k}`, x: bx, y: byKinds, w, h: btnSize, active, label: kindIcon(k) });
        bx += w + 4;
      }
    }
    // Draw buttons
    c.save();
    c.font = '11px Segoe UI, Roboto, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const b of this.filterButtons) {
      c.beginPath();
      c.fillStyle = b.active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      c.strokeStyle = b.active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)';
      c.lineWidth = 1;
      c.rect(b.x, b.y, b.w, b.h);
      c.fill(); c.stroke();
      c.fillStyle = b.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      c.fillText(b.label, b.x + b.w/2, b.y + b.h/2 + 1);
    }
    c.restore();

    // 3) Draw orbits as ellipses (independent from planet visibility)
    if (this.showOrbits) {
      c.strokeStyle = 'rgba(160,180,220,0.55)';
      c.lineWidth = 1;
      for (const p of data.planets) {
      const segs = 256;
      if (p.orbit3d) {
        const oc = p.orbit3d.center; const a = p.orbit3d.a; const b = p.orbit3d.b; const ang = p.orbit3d.orient || 0;
        // Build in-plane basis (u,v) and rotate by orient
        const n0 = norm(p.orbit3d.n);
        let u0 = projectToPlane(p.orbit3d.u, n0);
        if (len(u0) < 1e-6) u0 = projectToPlane({ x: 1, y: 0, z: 0 }, n0);
        u0 = norm(u0);
        let v0 = cross(n0, u0); v0 = norm(v0);
        const co = Math.cos(ang), so = Math.sin(ang);
        const uR = addV(scaleV(u0, co), scaleV(v0, so));
        const vR = addV(scaleV(u0, -so), scaleV(v0, co));
        c.beginPath();
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * Math.PI * 2;
          const ct = Math.cos(t), st = Math.sin(t);
          const wx = oc.x + uR.x * (a * ct) + vR.x * (b * st);
          const wz = oc.z + uR.z * (a * ct) + vR.z * (b * st);
          const px = cx + (wx - data.center.x) * s + this.tx;
          const py = cy - (wz - data.center.z) * s + this.ty;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      } else if (p.orbit) {
        const oc = p.orbit.center;
        const a = p.orbit.a; const b = p.orbit.b; const ang = p.orbit.orient;
        // Sample ellipse with 256 points
        c.beginPath();
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * Math.PI * 2;
          const ex = Math.cos(t) * a;
          const ez = Math.sin(t) * b;
          // Rotate by orient and translate
          const rx = ex * cosA - ez * sinA; const rz = ex * sinA + ez * cosA;
          const worldX = oc.x + rx; const worldZ = oc.z + rz;
          const px = cx + (worldX - data.center.x) * s + this.tx;
          const py = cy - (worldZ - data.center.z) * s + this.ty;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      }
      }
    }

    // 4) Draw objects and accumulate interactive items with screen positions
    const project = (pos: Vector3) => ({
      px: cx + (pos.x - data.center.x) * s + this.tx,
      py: cy - (pos.z - data.center.z) * s + this.ty,
    });
    const pushItem = (
      id: string,
      label: string,
      category: GameObjectCategory | 'center',
      pos: Vector3,
      rPx: number,
      color: string,
      kind?: string
    ) => {
      const { px, py } = project(pos);
      const item: any = { id, label, category, pos, px, py, rPx: Math.max(1, rPx), color };
      if (kind) item.kind = kind.toLowerCase();
      this.items.push(item);
      c.beginPath(); c.fillStyle = color; c.arc(px, py, Math.max(1, rPx), 0, Math.PI * 2); c.fill();
    };

    // Sun/center
  if (data.centerLabel && this.visibleCategories.has('center')) {
    const starLabel = data.centerLabel;
    pushItem('center', starLabel, 'center', data.center, 5, '#ffe08a');
  }
    // Planets
    if (this.visibleCategories.has(GameObjectCategory.PLANET)) {
      for (const p of data.planets) {
        const k = (p.kind || '').toLowerCase();
        // If a kind is provided, respect fine-grained filters
        if (k && !this.visiblePlanetKinds.has(k)) continue;
        pushItem(p.id, p.label ?? p.id, GameObjectCategory.PLANET, p.pos, 3, planetColor, k);
      }
    }
    // Debris (asteroids)
    if (this.visibleCategories.has(GameObjectCategory.ASTEROID)) {
      for (const d of data.debris) {
        const customColor = d.color && d.color.trim().length ? d.color : null;
        const radius = typeof d.radiusPx === 'number' && isFinite(d.radiusPx) ? Math.max(0.5, d.radiusPx) : 1.5;
        pushItem(d.id, d.label ?? d.id, GameObjectCategory.ASTEROID, d.pos, radius, customColor ?? megaColor);
      }
    }
    // Enemies (lesser beings)
    if (this.visibleCategories.has(GameObjectCategory.ENEMY)) {
      for (const enemy of (data.enemies || [])) {
        const color = enemy.color && enemy.color.trim().length ? enemy.color : enemyColor;
        const radius = typeof enemy.radiusPx === 'number' && isFinite(enemy.radiusPx) ? Math.max(0.8, enemy.radiusPx) : 3.2;
        pushItem(enemy.id, enemy.label ?? enemy.id, GameObjectCategory.ENEMY, enemy.pos, radius, color);
      }
    }
    // Stations (estaciones espaciales — cian)
    if (this.visibleCategories.has(GameObjectCategory.STATION)) {
      for (const st of (data.stations || [])) {
        const color = st.color && st.color.trim().length ? st.color : '#6fe0ff';
        const radius = typeof st.radiusPx === 'number' && isFinite(st.radiusPx) ? Math.max(1, st.radiusPx) : 4;
        pushItem(st.id, st.label ?? st.id, GameObjectCategory.STATION, st.pos, radius, color);
      }
    }
    // Clusters
    if (this.visibleCategories.has(GameObjectCategory.CLUSTER)) {
      for (const cl of data.clusters) pushItem(cl.id, cl.label ?? cl.id, GameObjectCategory.CLUSTER, cl.center, 2.5, megaColor);
    }
    // Portals (arcane purple)
    if (this.visibleCategories.has(GameObjectCategory.PORTAL)) {
      for (const p of (data.portals || [])) pushItem(p.id, p.label ?? p.id, GameObjectCategory.PORTAL, p.pos, 3.2, portalColor);
    }
  // Ship (friendly green)
  if (data.ship && this.visibleCategories.has(GameObjectCategory.SHIP)) pushItem('ship', data.ship.label ?? 'Ship', GameObjectCategory.SHIP, data.ship.pos, 3.5, shipColor);

    // 4.b) Simple outliner: draw circle stroke + label based on rules
    c.font = '12px Segoe UI, Roboto, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    for (const it of this.items) {
      const isPlanet = it.category === GameObjectCategory.PLANET;
      const isCenter = it.category === 'center';
      const isSel = this.selectedId === it.id;
      const isHover = this.hoveredId === it.id;
      // Show persistent labels for planets and the Sun (center) EXCEPT when hovered/selected to avoid double text
      if ((isPlanet || isCenter) && !(isHover || isSel)) {
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText(it.label, it.px, it.py - (it.rPx + 4));
      }
      // Show circle+label only if hovered or selected (for all categories)
      if (isHover || isSel) {
        // Ally-friendly outline for the ship; gold for selected others, white on hover
        const isShip = it.category === GameObjectCategory.SHIP;
        c.strokeStyle = isShip ? (isSel ? '#70f0a8' : '#46d88f') : (isSel ? '#ffeb7a' : 'rgba(255,255,255,0.6)');
        c.lineWidth = isSel ? 2 : 1;
        c.beginPath(); c.arc(it.px, it.py, it.rPx + (isSel ? 6 : 2), 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.95)';
        c.fillText(it.label, it.px, it.py - (it.rPx + (isSel ? 8 : 4)));
      }
    }

    // 4.c) Selected highlight
    if (this.selectedId) {
      const sel = this.items.find(i => i.id === this.selectedId);
      if (sel) {
        // Ally selection ring for ship; gold otherwise
        c.strokeStyle = sel.category === GameObjectCategory.SHIP ? '#70f0a8' : '#ffeb7a';
        c.lineWidth = 2;
        c.beginPath(); c.arc(sel.px, sel.py, sel.rPx + 6, 0, Math.PI * 2); c.stroke();
      }
    }

    // 5) Border
    c.strokeStyle = PANEL_DEAD_ZONE_GRAY;
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, W - 1, H - 1);
    c.restore();

    // 5.b) Scale bar (bottom-right). Prefers 1000u at initial zoom if it fits; adapts with zoom.
    try {
      const s = this.fitScale * this.zoomScale; // pixels per world unit
      const pad = 12;
      const minPx = 80, maxPx = 180;
      const prefer = 1000; // prefer at initial zoom if feasible
      let dist = prefer;
      const pxPrefer = prefer * s;
      const niceList: number[] = [];
      // Build nice sequence 1,2,5 * 10^k from 0.01..100000
      for (let k = -2; k <= 5; k++) {
        const base = Math.pow(10, k);
        niceList.push(1 * base, 2 * base, 5 * base);
      }
      // Choose distance: try prefer first if within bounds; otherwise closest nice within bounds, else closest overall
      const within = (px: number) => px >= minPx && px <= maxPx;
      if (!within(pxPrefer)) {
        let best = prefer; let bestScore = Infinity;
        for (const v of niceList) {
          const px = v * s;
          const score = within(px) ? 0 : Math.min(Math.abs(px - minPx), Math.abs(px - maxPx));
          const tieBreak = Math.abs(Math.log10(v/1000));
          const total = score * 10 + tieBreak; // prefer in-range; then closer to 1000u
          if (total < bestScore) { bestScore = total; best = v; }
        }
        dist = best;
      }
      const pxLen = Math.max(1, dist * s);
      // Draw the scale bar: two end bands and a connecting line, with label
      const barX2 = W - pad;
      const barX1 = Math.max(pad + 40, barX2 - Math.min(pxLen, maxPx + 40));
      const y = H - pad - 18; // a bit above bottom border
      const bandH = 10; const bandW = 3;
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 2;
      // End bands
      c.fillRect(barX1 - bandW, y - bandH/2, bandW, bandH);
      c.fillRect(barX2, y - bandH/2, bandW, bandH);
      // Main line
      c.beginPath(); c.moveTo(barX1, y); c.lineTo(barX2, y); c.stroke();
      // Label
      c.font = '12px Segoe UI, Roboto, sans-serif';
      c.textAlign = 'right'; c.textBaseline = 'bottom';
      const label = `${(dist >= 1 ? dist : Number(dist.toFixed(2)))} u`;
      c.fillText(label, barX2 + bandW + 2, y - 2);
      c.restore();
    } catch {}

    // 6) Info panel (Tipo Nombre ------- distancia) + optional details (from HUD TargetPanel)
    {
      const active = (this.selectedId && this.items.find(i => i.id === this.selectedId))
        || (this.hoveredId && this.items.find(i => i.id === this.hoveredId))
        || null;
      if (active) {
        const ship = data.ship;
        const dx = (ship ? (active.pos.x - ship.pos.x) : 0);
        const dy = (ship ? (active.pos.y - ship.pos.y) : 0);
        const dz = (ship ? (active.pos.z - ship.pos.z) : 0);
        const dist = ship ? Math.hypot(dx, dy, dz) : 0;
        const typeStr = (() => {
          switch (active!.category) {
            case GameObjectCategory.PLANET: return 'Planeta';
            case 'center': return 'Estrella';
            case GameObjectCategory.CLUSTER: return 'Cúmulo';
            case GameObjectCategory.ASTEROID: return 'Escombros';
            case GameObjectCategory.PORTAL: return 'Portal';
            case GameObjectCategory.SHIP: return 'Nave';
            case GameObjectCategory.ENEMY: return 'Enemigo';
            default: return 'Objeto';
          }
        })();

        // Build details lines similar to HUD TargetPanel
        const d = data.details || {};
        const detailLines: string[] = [];
        const prettyKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
        const prettyVal = (v: any) => (typeof v === 'number') ? (Number.isFinite(v) ? v.toFixed(2) : String(v)) : (Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
        const pushDetail = (text: string) => { if (text && detailLines.length < 12) detailLines.push(text); };
        const lifeIntelKnown = !!d['planetLifeIntelKnown'];
        const hasKnownSpecies = !!d['planetHasKnownSpecies'];
        const showLifeProbability = !lifeIntelKnown;
        const pushIntelLine = (key: string, label: string) => {
          const raw = d[key];
          if (typeof raw === 'string' && raw.trim().length) {
            pushDetail(`${label}: ${raw}`);
          }
        };
        if (lifeIntelKnown && hasKnownSpecies) {
          pushIntelLine('planetInhabitantsDisplay', 'Habitantes');
        }
        pushIntelLine('planetLesserBeingDisplay', 'Ser menor');
        if (typeof d['planetVisited'] === 'boolean') {
          pushDetail(`Visitado: ${d['planetVisited'] ? 'Sí' : 'No'}`);
        }
        // Albedo eliminado: no mostrar
        const hpPct = ((): number | null => {
          if (typeof d['healthPct'] === 'number') return Math.max(0, Math.min(100, Math.round(d['healthPct'])));
          const hc = typeof d['healthCurrent'] === 'number' ? d['healthCurrent'] as number : NaN;
          const hm = typeof d['healthMax'] === 'number' ? d['healthMax'] as number : NaN;
          if (Number.isFinite(hc) && Number.isFinite(hm) && hm > 0) return Math.max(0, Math.min(100, Math.round((hc / hm) * 100)));
          return null;
        })();
        if (hpPct !== null) pushDetail(`Salud: ${hpPct}%`);
        // Volume: prefer volumeMu, fallback volumeGu→Mu
        const volMu = ((): number | null => {
          if (typeof d['volumeMu'] === 'number' && isFinite(d['volumeMu'])) return d['volumeMu'];
          if (typeof d['volumeGu'] === 'number' && isFinite(d['volumeGu'])) return Number((d['volumeGu'] * 1000).toFixed(2));
          return null;
        })();
        if (volMu !== null) pushDetail(`Volume: ${volMu.toFixed(2)} Mu³`);
        const voidMass = d['voidMassUnits']; if (typeof voidMass === 'number' && isFinite(voidMass)) pushDetail(`Void mass: ${Math.max(0, Math.round(voidMass))}u`);
        const pol = d['probabilityOfLifePct'];
        if (showLifeProbability && typeof pol === 'number') {
          pushDetail(`Probability of Life: ${Math.max(0, Math.min(100, Math.round(pol)))}%`);
        }
        // Generic remaining keys (skip internal ones and already shown)
        for (const [k, v] of Object.entries(d)) {
          const lk = k.toLowerCase();
          if (lk === 'healthpct' || lk === 'healthcurrent' || lk === 'healthmax' || lk === 'volumemu' || lk === 'volumegu' || lk === 'voidmassunits' || lk === 'probabilityoflifepct' || lk === 'previewstatus' || lk === 'type' || lk === 'name' || lk === 'planetinhabitantsdisplay' || lk === 'planetlesserbeingdisplay' || lk === 'planetlifeintelknown' || lk === 'planetcreatureintelknown' || lk === 'planetvisited' || lk === 'planethasknownspecies') continue; // albedo removido
          pushDetail(`${prettyKey(k)}: ${prettyVal(v)}`);
        }

        // Layout for info box: grow height to include details
        const leftPad = 12; const bottomPad = 12;
        const boxW = Math.min(W - 24, 500);
        const lineH = 16;
        const extraH = detailLines.length ? (8 + detailLines.length * lineH) : 0;
        const boxH = 40 + extraH;
        const bx = leftPad;
        const by = H - bottomPad - boxH;
        c.save();
        // Background box
        c.fillStyle = 'rgba(0, 0, 0, 0.55)';
        c.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        c.lineWidth = 1;
        c.beginPath();
        // simple rounded rect
        const r = 8;
        c.moveTo(bx + r, by);
        c.lineTo(bx + boxW - r, by);
        c.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
        c.lineTo(bx + boxW, by + boxH - r);
        c.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
        c.lineTo(bx + r, by + boxH);
        c.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
        c.lineTo(bx, by + r);
        c.quadraticCurveTo(bx, by, bx + r, by);
        c.closePath();
        c.fill();
        c.stroke();

        // Header row (type + name ------- distance)
        c.fillStyle = 'rgba(255,255,255,0.95)';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.font = '12px Segoe UI, Roboto, sans-serif';
        const dash = ' ------- ';
        const name = active.label;
        const distText = ship ? `${dist.toFixed(0)} u` : '';
        const text = `${typeStr} ${name}${dash}${distText}`;
        const headerY = by + 20; // top area for header
        c.fillText(text, bx + 12, headerY);

        // Details block under header
        if (detailLines.length) {
          c.textBaseline = 'top';
          let yLine = headerY + 12;
          for (const ln of detailLines) {
            if (yLine > by + boxH - 10) break;
            c.fillText(ln, bx + 12, yLine);
            yLine += lineH;
          }
        }
        c.restore();
      }
    }


    // Upload to texture
    const gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  // Flip Y so 2D canvas top-left maps to screen top-left, but restore previous state after
  const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Draws the fullscreen panel in front of the scene (opaque) */
  public render(viewportW: number, viewportH: number): void {
    if (!this.enabled || !this.texture || !this.program || !this.vao) return;
    const gl = this.gl;

    // Save previous GL state
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);

    // Opaque panel: depth off, blending off
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const safeW = Math.max(1, Math.floor(viewportW));
    const safeH = Math.max(1, Math.floor(viewportH));
    const letterbox = computePanelLetterbox(
      safeW,
      safeH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    gl.viewport(0, 0, safeW, safeH);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const texLoc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(texLoc, 0);
    if (this.uvTransformLoc) {
      const coverageX = Math.max(letterbox.coverageX, 1e-4);
      const coverageY = Math.max(letterbox.coverageY, 1e-4);
      gl.uniform4f(this.uvTransformLoc, coverageX, coverageY, letterbox.offsetX, letterbox.offsetY);
    }

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Restore
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  }

  /** Map a viewport click to the nearest item id within tolerance (in pixels) */
  public hitTestViewport(clientX: number, clientY: number, canvasRect: DOMRect, viewportW: number, viewportH: number, eventType: 'move' | 'click' = 'move'): string | null {
    if (!this.enabled) return null;
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      canvasRect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    if (!mapped.inside) {
      return null;
    }
    const mapX = mapped.mapX;
    const mapY = mapped.mapY;
    // Check filter buttons first: only toggle on click, ignore on move
    if (eventType === 'click') {
      for (const b of this.filterButtons) {
        if (mapX >= b.x && mapX <= b.x + b.w && mapY >= b.y && mapY <= b.y + b.h) {
          if (b.cat.startsWith('kind:')) {
            this.togglePlanetKind(b.cat.slice('kind:'.length));
          } else {
            // Convert string to enum (button cat can be enum value or 'center'/'orbits')
            const cat = (b.cat === 'center' || b.cat === 'orbits') ? b.cat : (b.cat as GameObjectCategory);
            this.toggleCategory(cat);
          }
          return null; // Do not treat as item selection
        }
      }
    }
    // If no items are present, there's nothing to select/hover
    if (this.items.length === 0) return null;
    // Find nearest item within radius+padding
    let bestId: string | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const dx = mapX - it.px;
      const dy = mapY - it.py;
      const d = Math.hypot(dx, dy);
      const tol = it.rPx + 8;
      if (d <= tol && d < bestD) { bestD = d; bestId = it.id; }
    }
    return bestId;
  }

}
