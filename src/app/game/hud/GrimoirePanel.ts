import { Vector3 } from '../../types/game.types';

/**
 * GrimoirePanel: full-screen, opaque panel rendering an ancient open book
 * with yellowed pages, occult icons, and a crimson pentacle cursor.
 *
 * Implementation mirrors SolarSystemPanel plumbing (canvas→texture→fullscreen quad),
 * but the content is decorative instead of a navigable map.
 */
export class GrimoirePanel {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private program: WebGLProgram | null = null;
  private enabled: boolean = false;
  private cursorPx: number | null = null;
  private cursorPy: number | null = null;
  // Page geometry (for layout/hit-test)
  private leftPage!: { x:number; y:number; w:number; h:number };
  private rightPage!: { x:number; y:number; w:number; h:number };

  // Simple internal animation time
  private t: number = 0;
  private startTime: number = performance.now();
  // Static layout data (seeded RNG)
  private rng!: () => number;
  private speckles: Array<{ x: number; y: number; r: number; color: string }> = [];
  private iconPlacements: Array<{ type: 'speed'| 'longjump'| 'eye'|'star'|'tentacle'; x: number; y: number; s: number; r: number }> = [];
  private handwritingLines: Array<Array<{ x: number; y: number }>> = [];
  // Handwriting as segmented "words": each line is an array of word-polylines
  private handwritingSegments: Array<Array<Array<{ x: number; y: number }>>> = [];
  private pageWrinkles: Array<Array<{ x:number; y:number }>> = [];
  private hoveredIconIndex: number = -1;

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('GrimoirePanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
    this.initializeStaticLayout();
  }

  public setEnabled(v: boolean) { this.enabled = v; }
  public isEnabled(): boolean { return this.enabled; }
  public setCursorFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    // Convert to canvas pixel coords (texture covers full viewport)
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * viewportW;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * viewportH;
    this.cursorPx = (x / viewportW) * this.canvas.width;
    this.cursorPy = (y / viewportH) * this.canvas.height;
  }

  // Expose hovered spell type for casting
  public getHoveredSpellType(): 'speed' | 'longjump' | null {
    if (this.hoveredIconIndex < 0) return null;
    const t = this.iconPlacements[this.hoveredIconIndex]?.type;
    return (t === 'speed' || t === 'longjump') ? t : null;
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

    // Fullscreen quad (clip-space)
    const vertices = new Float32Array([
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
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;

    // Enable attributes
    const stride = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
  }

  /** Re-render the book to the internal canvas and upload to texture */
  public update(deltaTime: number = 0): void {
    // Drive time from a monotonic clock so animation runs even if delta is 0
    const now = performance.now();
    this.t = (now - this.startTime) / 1000;
    const c = this.ctx; const W = this.canvas.width; const H = this.canvas.height;
    c.save();
    // Background parchment
    this.drawParchment(c, W, H);
    // Book frame and pages (static wrinkles)
    this.drawBook(c, W, H);
    // Determine hover over icons
    this.hoveredIconIndex = -1;
    if (this.cursorPx !== null && this.cursorPy !== null) {
      for (let i=0;i<this.iconPlacements.length;i++) {
        const ic = this.iconPlacements[i];
        const dx = this.cursorPx - ic.x; const dy = this.cursorPy - ic.y;
        if (dx*dx + dy*dy <= (ic.r*ic.r)) { this.hoveredIconIndex = i; break; }
      }
    }
    // Page content: handwriting + icons (static), plus hover effects
    this.drawPageContent(c, W, H);
    // Cursor
    if (this.cursorPx !== null && this.cursorPy !== null) {
      this.drawPentacle(c, this.cursorPx, this.cursorPy, Math.max(12, Math.min(22, Math.min(W, H) * 0.018)));
    }
    c.restore();

    // Upload canvas to texture
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  public render(viewportW: number, viewportH: number): void {
    if (!this.enabled || !this.texture || !this.program || !this.vao) return;
    const gl = this.gl;
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const loc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(loc, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  }

  // ===== Drawing helpers =====
  private drawParchment(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Base gradient
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e9d8a6'); // light ochre
    g.addColorStop(1, '#d4b483'); // deeper ochre
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Edge vignetting
    const vg = c.createRadialGradient(W/2, H/2, Math.min(W,H)*0.2, W/2, H/2, Math.max(W,H)*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0.0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.18)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // Speckles/stains (precomputed)
    c.globalAlpha = 0.045;
    for (const sp of this.speckles) {
      c.fillStyle = sp.color;
      c.beginPath(); c.arc(sp.x, sp.y, sp.r, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawBook(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Book outer shadow
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 40;
    c.shadowOffsetX = 0; c.shadowOffsetY = 18;
  // Hard cover (make book visually narrower by increasing horizontal padding)
  const basePad = Math.min(W, H) * 0.06;
  const padX = Math.round(basePad * 2.5); // even wider left/right margins (narrower book)
  const padY = Math.round(basePad * 1.0); // keep top/bottom similar
    c.fillStyle = '#2b2018';
  this.roundRect(c, padX, padY, W-2*padX, H-2*padY, 18);
    c.fill();
    c.restore();
    // Inner pages area (must match initializeStaticLayout)
    const innerPadX = padX + Math.round(Math.min(W,H) * 0.02);
    const innerPadY = padY + Math.round(Math.min(W,H) * 0.02);
    const pageW = (W - 2*innerPadX);
    const pageH = (H - 2*innerPadY);
    // Draw two pages
    const seamX = Math.floor(W/2);
    const left = { x: innerPadX, y: innerPadY, w: seamX - innerPadX, h: pageH };
    // Right page ends at (W - innerPadX), symmetric to left
    const right = { x: seamX, y: innerPadY, w: (W - innerPadX) - seamX, h: pageH };
    // Cache page rects for other passes
    this.leftPage = left; this.rightPage = right;
    const pageFill = (x: number, y: number, w: number, h: number) => {
      const pg = c.createLinearGradient(x, y, x+w, y);
      pg.addColorStop(0, '#f0e3bf');
      pg.addColorStop(0.5, '#efe0b6');
      pg.addColorStop(1, '#f3e8c6');
      c.fillStyle = pg; this.roundRect(c, x, y, w, h, 8); c.fill();
      // Edge darkening
      c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
      c.fillRect(x, y, 8, h); c.fillRect(x+w-8, y, 8, h); c.restore();
    };
    pageFill(left.x, left.y, left.w, left.h);
    pageFill(right.x, right.y, right.w, right.h);
    // Center seam shading
    const seamGrad = c.createLinearGradient(seamX-16, 0, seamX+16, 0);
    seamGrad.addColorStop(0, 'rgba(0,0,0,0.15)');
    seamGrad.addColorStop(0.5, 'rgba(0,0,0,0.02)');
    seamGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
  c.fillStyle = seamGrad; c.fillRect(seamX-16, innerPadY, 32, pageH);
    // Page wrinkles faint (precomputed)
    c.globalAlpha = 0.15; c.strokeStyle = 'rgba(100,80,60,0.5)';
    for (const line of this.pageWrinkles) {
      c.beginPath();
      c.moveTo(line[0].x, line[0].y);
      for (let i=1;i<line.length;i++) c.lineTo(line[i].x, line[i].y);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawPageContent(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Handwriting word segments (precomputed), draw beneath frames/icons
    c.strokeStyle = 'rgba(60,45,35,0.85)';
    c.lineWidth = 1.2; c.lineCap = 'round';
    for (const lineSegs of this.handwritingSegments) {
      for (const seg of lineSegs) {
        if (!seg.length) continue;
        c.beginPath();
        c.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) c.lineTo(seg[i].x, seg[i].y);
        c.stroke();
      }
    }
    // Frames behind spell glyphs to mask handwriting beneath
    for (let i = 0; i < this.iconPlacements.length; i++) {
      const p = this.iconPlacements[i];
      if (p.type === 'speed' || p.type === 'longjump') {
        this.drawGlyphFrame(c, p.x, p.y, p.r);
      }
    }
    // Icons (precomputed) and hover effects (on top)
    for (let i=0;i<this.iconPlacements.length;i++) {
      const p = this.iconPlacements[i];
      if (p.type === 'speed') this.drawSpeedRune(c, p.x, p.y, p.r*0.9);
      else if (p.type === 'longjump') this.drawLongJumpRune(c, p.x, p.y, p.r*0.9);
      else if (p.type === 'eye') this.drawEye(c, p.x, p.y, p.r*1.0);
      else if (p.type === 'star') this.drawStarSymbol(c, p.x, p.y, p.r*0.7);
      // tentacle intentionally avoided (had per-frame randomness)
      if (i === this.hoveredIconIndex) {
        this.drawIconHover(c, p.x, p.y, p.r);
      }
    }
  }

  // Initialize seeded RNG and precompute all static layout content
  private initializeStaticLayout(): void {
    // Seeded RNG (constant for reproducibility). You can tweak seed to change layout.
    this.rng = this.makeMulberry32(0xA11CE5);
    const W = this.ctx.canvas.width;
    const H = this.ctx.canvas.height;

    // Speckles/stains
    this.speckles.length = 0;
    const speckCount = 800;
    for (let i=0;i<speckCount;i++) {
      const x = this.rng()*W;
      const y = this.rng()*H;
      const r = 0.5 + this.rng()*2.5;
      const color = (this.rng() < 0.33) ? '#5a3e2b' : '#7f5f3f';
      this.speckles.push({ x, y, r, color });
    }

    // Compute page rects exactly like drawBook
    const basePad = Math.min(W, H) * 0.06;
    const padX = Math.round(basePad * 2.5);
    const padY = Math.round(basePad * 1.0);
    const innerPadX = padX + Math.round(Math.min(W,H) * 0.02);
    const innerPadY = padY + Math.round(Math.min(W,H) * 0.02);
    const pageW = (W - 2*innerPadX);
    const pageH = (H - 2*innerPadY);
    const seamX = Math.floor(W/2);
    this.leftPage = { x: innerPadX, y: innerPadY, w: seamX - innerPadX, h: pageH };
    this.rightPage = { x: seamX, y: innerPadY, w: (W - innerPadX) - seamX, h: pageH };

    // Page wrinkles precomputed (8 subtle lines across spread)
    this.pageWrinkles = [];
    for (let i=0;i<8;i++) {
      const y = innerPadY + (i+1)*(pageH/9) + (this.rng()-0.5)*6;
      const pts: Array<{x:number;y:number}> = [];
      for (let x = this.leftPage.x+12; x < this.rightPage.x+this.rightPage.w-12; x+= 24) {
        const yy = y + Math.sin(x*0.03 + i)*1.5 + (this.rng()-0.5)*0.6;
        pts.push({x, y: yy});
      }
      this.pageWrinkles.push(pts);
    }

    // Handwriting lines: segmented words per line (22 per page), with slant and jitter
    this.handwritingSegments = [];
    const buildWordPolyline = (x1:number, x2:number, y:number, slant:number, amp:number): Array<{x:number;y:number}> => {
      const pts: Array<{x:number;y:number}> = [];
      const len = Math.max(2, x2 - x1);
      const steps = Math.max(10, Math.floor(len / 10));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        // base: slight upward slant; add wavy micro-jitter
        const yOff = (x - x1) * slant + Math.sin(t * 10 + y * 0.003) * amp + (this.rng() - 0.5) * (amp * 0.3);
        pts.push({ x, y: y + yOff });
      }
      return pts;
    };
    const buildPageLinesWords = (page:{x:number;y:number;w:number;h:number}) => {
      const marginX = 18; const marginY = 20;
      const usableW = page.w - marginX*2;
      const usableH = page.h - marginY*2;
      const lines = 22; // ≥ 20
      const lineGap = usableH / (lines+1);
      for (let i=0;i<lines;i++) {
        const baselineY = page.y + marginY + (i+1)*lineGap + (this.rng()-0.5)*0.8;
        // Small slant per line (handwriting lean)
        const slant = (this.rng()-0.5) * 0.02; // px per px, tiny
        const amp = 1.6 + this.rng()*0.8;      // wave amplitude
        // Word distribution across the line width
        const xStart = page.x + marginX;
        const xEnd = xStart + usableW;
        let x = xStart;
        const lineSegs: Array<Array<{x:number;y:number}>> = [];
        while (x < xEnd) {
          // Word length and gap in pixels
          const wordLen = 20 + this.rng()*80;   // 20..100px
          const gap = 6 + this.rng()*18;       // 6..24px
          const x2 = Math.min(x + wordLen, xEnd);
          // Optionally skip tiny last word
          if (x2 - x >= 10) {
            // Slight per-word slant/amp variation
            const wSlant = slant + (this.rng()-0.5) * 0.006;
            const wAmp = amp * (0.85 + this.rng()*0.3);
            lineSegs.push(buildWordPolyline(x, x2, baselineY, wSlant, wAmp));
          }
          x = x2 + gap;
        }
        this.handwritingSegments.push(lineSegs);
      }
    };
    buildPageLinesWords(this.leftPage);
    buildPageLinesWords(this.rightPage);

    // Icons: 'speed' and 'longjump' on right page, fixed placements
    this.iconPlacements = [];
    const baseR = Math.min(this.rightPage.w, this.rightPage.h);
    const speedR = baseR * 0.10;
    const ljR = baseR * 0.095;
    const speedX = this.rightPage.x + this.rightPage.w * 0.72;
    const speedY = this.rightPage.y + this.rightPage.h * 0.30;
    const ljX = this.rightPage.x + this.rightPage.w * 0.60;
    const ljY = this.rightPage.y + this.rightPage.h * 0.62;
    this.iconPlacements.push({ type: 'speed', x: speedX, y: speedY, s: 1.0, r: speedR });
    this.iconPlacements.push({ type: 'longjump', x: ljX, y: ljY, s: 1.0, r: ljR });
  }

  // Mulberry32 PRNG
  private makeMulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private drawEye(c: CanvasRenderingContext2D, x:number,y:number, size:number): void {
    const w = size; const h = size*0.6;
    c.save(); c.translate(x,y);
    c.beginPath(); c.ellipse(0,0,w*0.6,h*0.45,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.ellipse(0,0,w*0.28,h*0.28,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.arc(0,0, Math.min(w,h)*0.15, 0, Math.PI*2); c.fill();
    // lashes
    for (let i=-3;i<=3;i++) {
      const ang = (i/6)*Math.PI;
      const lx = Math.cos(ang)*w*0.6; const ly = Math.sin(ang)*h*0.45;
      const ex = lx + Math.cos(ang)*8; const ey = ly + Math.sin(ang)*8;
      c.beginPath(); c.moveTo(lx,ly); c.lineTo(ex,ey); c.stroke();
    }
    c.restore();
  }

  private drawStarSymbol(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y);
    c.beginPath();
    const pts: Array<[number,number]> = [];
    for (let i=0;i<5;i++) {
      const ang = (-Math.PI/2) + i*2*Math.PI/5;
      pts.push([Math.cos(ang)*r, Math.sin(ang)*r]);
    }
    const order = [0,2,4,1,3,0];
    c.moveTo(pts[order[0]][0], pts[order[0]][1]);
    for (let i=1;i<order.length;i++) c.lineTo(pts[order[i]][0], pts[order[i]][1]);
    c.stroke();
    c.restore();
  }

  // Long-jump rune: concentric rings with a portal sigil
  private drawLongJumpRune(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y);
    c.strokeStyle = '#3b2b1f';
    // Outer/inner rings
    c.lineWidth = 2;
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    c.globalAlpha = 0.75; c.beginPath(); c.arc(0,0,r*0.82,0,Math.PI*2); c.stroke(); c.globalAlpha = 1;
    // Portal glyph: three arcs opening clockwise
    const arc = (R:number, a0:number, a1:number) => { c.beginPath(); c.arc(0,0,R,a0,a1,false); c.stroke(); };
    c.lineWidth = 3;
    arc(r*0.55, -Math.PI*0.15, Math.PI*0.35);
    arc(r*0.68, -Math.PI*0.10, Math.PI*0.40);
    arc(r*0.40, -Math.PI*0.20, Math.PI*0.30);
    // Small center mark
    c.lineWidth = 2; c.beginPath(); c.arc(0,0, r*0.06, 0, Math.PI*2); c.stroke();
    c.restore();
  }

  // Speed rune: circular sigil with double chevrons ("velocity")
  private drawSpeedRune(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y);
    // Outer circle
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2;
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    // Inner ring
    c.globalAlpha = 0.6; c.beginPath(); c.arc(0,0,r*0.78,0,Math.PI*2); c.stroke(); c.globalAlpha = 1;
    // Double chevrons pointing right
    const ch = (sx:number,sy:number, s:number)=>{
      c.beginPath();
      c.moveTo(sx-10*s, sy-6*s); c.lineTo(sx, sy); c.lineTo(sx-10*s, sy+6*s);
      c.stroke();
    };
    c.lineWidth = 3; c.strokeStyle = '#2e2218';
    ch(-r*0.25, -r*0.10, 1.0);
    ch(0, 0, 1.2);
    // Rune marks around circle (ticks)
    c.lineWidth = 2; c.strokeStyle = '#3b2b1f';
    for (let i=0;i<6;i++) {
      const ang = i*Math.PI/3;
      const x1 = Math.cos(ang)*r*0.86, y1 = Math.sin(ang)*r*0.86;
      const x2 = Math.cos(ang)*r*0.98, y2 = Math.sin(ang)*r*0.98;
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    }
    c.restore();
  }

  private drawIconHover(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y);
    // Golden glow
    const g = c.createRadialGradient(0,0, r*0.6, 0,0, r*1.6);
    g.addColorStop(0, `rgba(255,215,0,0.35)`);
    g.addColorStop(1, `rgba(255,215,0,0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0,0, r*1.5, 0, Math.PI*2); c.fill();
    // Gold ring
    c.lineWidth = 3; c.strokeStyle = '#ffd700';
    c.beginPath(); c.arc(0,0, r*1.05, 0, Math.PI*2); c.stroke();
    // Subtle sparkles orbiting
    const sparkCount = 10; const t = this.t;
    for (let i=0;i<sparkCount;i++) {
      const ang = (i/sparkCount)*Math.PI*2 + t*0.9;
      const rr = r*1.2 + Math.sin(t*1.7 + i)*4;
      const sx = Math.cos(ang)*rr; const sy = Math.sin(ang)*rr;
      c.fillStyle = 'rgba(255,230,120,0.85)';
      c.beginPath(); c.arc(sx, sy, 2.2, 0, Math.PI*2); c.fill();
    }
    c.restore();
  }

  // Parchment frame behind glyphs to mask handwriting and provide a clean space
  private drawGlyphFrame(c: CanvasRenderingContext2D, cx:number, cy:number, r:number): void {
    // Frame size relative to glyph radius
    const w = r * 2.2;
    const h = r * 1.6;
    const x = Math.round(cx - w/2);
    const y = Math.round(cy - h/2);
    c.save();
    // Shadow to lift the frame slightly
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowBlur = 6;
    c.shadowOffsetX = 0; c.shadowOffsetY = 3;
    // Fill: lighter parchment
    c.fillStyle = '#f7f0d8';
    this.roundRect(c, x, y, w, h, 6);
    c.fill();
    // Border
    c.shadowColor = 'transparent';
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(60,45,35,0.55)';
    this.roundRect(c, x, y, w, h, 6);
    c.stroke();
    c.restore();
  }

  private drawScribble(c: CanvasRenderingContext2D, x1:number,y1:number, x2:number,y2:number): void {
    c.beginPath(); c.moveTo(x1,y1);
    const steps = 18 + Math.floor(Math.random()*10);
    for (let i=1;i<=steps;i++) {
      const t = i/steps;
      const nx = x1 + (x2-x1)*t + (Math.random()-0.5)*8;
      const ny = y1 + (y2-y1)*t + (Math.random()-0.5)*6;
      c.lineTo(nx, ny);
    }
    c.stroke();
  }

  private drawPentacle(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save();
    c.translate(x,y);
  // Make the pentacle taller without changing panel dimensions
  const tall = 1.75; // ~25% taller
    c.scale(1, tall);
    // Pulse factors
    const s = 1 + 0.06 * Math.sin(this.t * 2.2); // scale pulse
    const glow = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * 3.1)); // alpha pulse
    const rr = r * s;
    // Soft outer glow
    const g = c.createRadialGradient(0, 0, rr * 0.6, 0, 0, rr * 1.4);
    g.addColorStop(0, `rgba(200,0,40,${(glow*0.7).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200,0,40,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0,0, rr * 1.35, 0, Math.PI*2); c.fill();
    // Main circle and star
    c.strokeStyle = '#b00020'; // brighter crimson
    c.lineWidth = 2.2;
    c.beginPath(); c.arc(0,0, rr, 0, Math.PI*2); c.stroke();
    // star
    const pts: Array<[number,number]> = [];
    for (let i=0;i<5;i++) {
      const ang = (-Math.PI/2) + i*2*Math.PI/5;
      pts.push([Math.cos(ang)*(rr*0.85), Math.sin(ang)*(rr*0.85)]);
    }
    c.beginPath();
    const order = [0,2,4,1,3,0];
    c.moveTo(pts[order[0]][0], pts[order[0]][1]);
    for (let i=1;i<order.length;i++) c.lineTo(pts[order[i]][0], pts[order[i]][1]);
    c.closePath();
    c.stroke();
    // Inner faint fill pulsing
    c.fillStyle = `rgba(139,0,0,${(0.10 + glow*0.2).toFixed(3)})`;
    c.beginPath(); c.arc(0,0, rr*0.82, 0, Math.PI*2); c.fill();
    c.restore();
  }

  private roundRect(c: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) {
    c.beginPath();
    c.moveTo(x+r, y);
    c.lineTo(x+w-r, y);
    c.quadraticCurveTo(x+w, y, x+w, y+r);
    c.lineTo(x+w, y+h-r);
    c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    c.lineTo(x+r, y+h);
    c.quadraticCurveTo(x, y+h, x, y+h-r);
    c.lineTo(x, y+r);
    c.quadraticCurveTo(x, y, x+r, y);
    c.closePath();
  }
}
