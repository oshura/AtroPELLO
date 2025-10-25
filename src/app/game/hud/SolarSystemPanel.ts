import { Vector3 } from '../../types/game.types';

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
  private enabled: boolean = false;
  private lastViewportW = 0;
  private lastViewportH = 0;
  // Zoom/pan state (applied on top of fit-to-bounds scale)
  private fitScale: number = 1; // computed each updateMap
  private zoomScale: number = 1; // user-controlled zoom factor (>= 1)
  private readonly zoomMax: number = 20; // max zoom-in factor
  private tx: number = 0; // screen-space translation in canvas pixels
  private ty: number = 0;
  private items: Array<{
    id: string;
    label: string;
    category: 'planet' | 'cluster' | 'debris' | 'ship' | 'center';
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

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('SolarSystemPanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
  }

  public setEnabled(v: boolean) { this.enabled = v; }
  public isEnabled(): boolean { return this.enabled; }
  public setSelectedId(id: string | null) { this.selectedId = id; }
  public setHoveredId(id: string | null) { this.hoveredId = id; }
  public getSelectedId(): string | null { return this.selectedId; }
  public getHoveredId(): string | null { return this.hoveredId; }
  public setCursorFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    // Convert to canvas pixel coords (texture covers full viewport)
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * viewportW;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * viewportH;
    this.cursorPx = (x / viewportW) * this.canvas.width;
    this.cursorPy = (y / viewportH) * this.canvas.height;
  }

  /** Reset view to initial fit (no pan, no zoom) */
  public resetView(): void {
    this.zoomScale = 1;
    this.tx = 0; this.ty = 0;
  }

  /** Handle wheel from viewport coords: zoom towards cursor position */
  public handleWheelFromViewport(deltaY: number, clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    // Convert to canvas pixel coords (texture covers full viewport)
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * viewportW;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * viewportH;
    const mapX = (x / viewportW) * this.canvas.width;
    const mapY = (y / viewportH) * this.canvas.height;
    this.zoomAtCanvasPoint(mapX, mapY, deltaY);
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
    const fsSrc = `#version 300 es\nprecision mediump float;\nuniform sampler2D u_tex;\nin vec2 v_uv;\nout vec4 frag;\nvoid main(){ frag = texture(u_tex, v_uv); }`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('SolarSystemPanel shader link error', gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;

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
    planets: Array<{ id: string; pos: Vector3; label?: string; orbit?: { center: Vector3; a: number; b: number; orient: number } }>;
    clusters: Array<{ id: string; center: Vector3; label?: string }>; // always included regardless of gameplay culling
    debris: Array<{ id: string; pos: Vector3; label?: string }>; // e.g., Earth mega-asteroids
    ship?: { pos: Vector3; label?: string };
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

    // 1) Compute max radial distance in XZ plane from center
    let maxR = 1;
    const radXZ = (p: Vector3) => Math.hypot(p.x - data.center.x, p.z - data.center.z);
    for (const p of data.planets) maxR = Math.max(maxR, radXZ(p.pos));
    for (const d of data.debris) maxR = Math.max(maxR, radXZ(d.pos));
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
    c.fillStyle = '#05060a'; // deep dark
    c.fillRect(0, 0, W, H);

    // 3) Draw orbits as ellipses
    c.strokeStyle = 'rgba(160,180,220,0.55)';
    c.lineWidth = 1;
    for (const p of data.planets) {
      if (!p.orbit) continue;
      const oc = p.orbit.center;
      const a = p.orbit.a; const b = p.orbit.b; const ang = p.orbit.orient;
      // Sample ellipse with 256 points
      c.beginPath();
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      for (let i = 0; i <= 256; i++) {
        const t = (i / 256) * Math.PI * 2;
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

    // 4) Draw objects and accumulate interactive items with screen positions
    const project = (pos: Vector3) => ({
      px: cx + (pos.x - data.center.x) * s + this.tx,
      py: cy - (pos.z - data.center.z) * s + this.ty,
    });
    const pushItem = (
      id: string,
      label: string,
      category: 'planet' | 'cluster' | 'debris' | 'ship' | 'center',
      pos: Vector3,
      rPx: number,
      color: string
    ) => {
      const { px, py } = project(pos);
      this.items.push({ id, label, category, pos, px, py, rPx: Math.max(1, rPx), color });
      c.beginPath(); c.fillStyle = color; c.arc(px, py, Math.max(1, rPx), 0, Math.PI * 2); c.fill();
    };

    // Sun/center
  pushItem('center', 'Sol', 'center', data.center, 5, '#ffe08a');
    // Planets
    for (const p of data.planets) {
      pushItem(p.id, p.label ?? p.id, 'planet', p.pos, 3, planetColor);
    }
    // Debris
    for (const d of data.debris) pushItem(d.id, d.label ?? d.id, 'debris', d.pos, 1.5, megaColor);
    // Clusters (always included)
    for (const cl of data.clusters) pushItem(cl.id, cl.label ?? cl.id, 'cluster', cl.center, 2.5, megaColor);
  // Ship (friendly green)
  if (data.ship) pushItem('ship', data.ship.label ?? 'Ship', 'ship', data.ship.pos, 3.5, shipColor);

    // 4.b) Simple outliner: draw circle stroke + label based on rules
    c.font = '12px Segoe UI, Roboto, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    for (const it of this.items) {
      const isPlanet = it.category === 'planet';
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
        const isShip = it.category === 'ship';
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
        c.strokeStyle = sel.category === 'ship' ? '#70f0a8' : '#ffeb7a';
        c.lineWidth = 2;
        c.beginPath(); c.arc(sel.px, sel.py, sel.rPx + 6, 0, Math.PI * 2); c.stroke();
      }
    }

    // 5) Border
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
    c.restore();

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
            case 'planet': return 'Planeta';
            case 'center': return 'Estrella';
            case 'cluster': return 'Cúmulo';
            case 'debris': return 'Escombros';
            case 'ship': return 'Nave';
            default: return 'Objeto';
          }
        })();

        // Build details lines similar to HUD TargetPanel
        const d = data.details || {};
        const detailLines: string[] = [];
        const prettyKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
        const prettyVal = (v: any) => (typeof v === 'number') ? (Number.isFinite(v) ? v.toFixed(2) : String(v)) : (Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
        const pushDetail = (text: string) => { if (text && detailLines.length < 12) detailLines.push(text); };
        const albedo = d['albedo']; if (typeof albedo === 'number') pushDetail(`Albedo(Refl.): ${Math.max(0, Math.min(100, Math.round(albedo * 100)))}%`);
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
        const pol = d['probabilityOfLifePct']; if (typeof pol === 'number') pushDetail(`Probability of Life: ${Math.max(0, Math.min(100, Math.round(pol)))}%`);
        // Generic remaining keys (skip internal ones and already shown)
        for (const [k, v] of Object.entries(d)) {
          const lk = k.toLowerCase();
          if (lk === 'albedo' || lk === 'healthpct' || lk === 'healthcurrent' || lk === 'healthmax' || lk === 'volumemu' || lk === 'volumegu' || lk === 'voidmassunits' || lk === 'probabilityoflifepct' || lk === 'previewstatus' || lk === 'type' || lk === 'name') continue;
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

    // 7) Draw cursor crosshair if available
    if (this.cursorPx !== null && this.cursorPy !== null) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
      const len = 10;
      c.beginPath();
      c.moveTo(this.cursorPx - len, this.cursorPy); c.lineTo(this.cursorPx + len, this.cursorPy);
      c.moveTo(this.cursorPx, this.cursorPy - len); c.lineTo(this.cursorPx, this.cursorPy + len);
      c.stroke();
      c.restore();
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

    // Adjust viewport if changed (optional; we rely on caller's viewport)
    this.lastViewportW = viewportW; this.lastViewportH = viewportH;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const loc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(loc, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Restore
    gl.bindVertexArray(null);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  }

  /** Map a viewport click to the nearest item id within tolerance (in pixels) */
  public hitTestViewport(clientX: number, clientY: number, canvasRect: DOMRect, viewportW: number, viewportH: number): string | null {
    if (!this.enabled || this.items.length === 0) return null;
    // Convert client coords to canvas pixel coords
    const x = ((clientX - canvasRect.left) / Math.max(1, canvasRect.width)) * viewportW;
    const y = ((clientY - canvasRect.top) / Math.max(1, canvasRect.height)) * viewportH;
    // Map to internal map canvas space (texture covers full viewport)
    const mapX = (x / viewportW) * this.canvas.width;
    const mapY = (y / viewportH) * this.canvas.height;
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
