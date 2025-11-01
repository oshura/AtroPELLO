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

  // Simple internal animation time
  private t: number = 0;
  private startTime: number = performance.now();

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('GrimoirePanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
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
    // Book frame and pages
    this.drawBook(c, W, H);
    // Occult doodles/icons
    this.drawIcons(c, W, H);
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
    // Speckles/stains
    c.globalAlpha = 0.045;
    for (let i = 0; i < 800; i++) {
      const x = Math.random()*W, y = Math.random()*H;
      const r = 0.5 + Math.random()*2.5;
      c.fillStyle = (i % 3 === 0) ? '#5a3e2b' : '#7f5f3f';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawBook(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Book outer shadow
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 40;
    c.shadowOffsetX = 0; c.shadowOffsetY = 18;
    // Hard cover
    const pad = Math.round(Math.min(W,H) * 0.06);
    c.fillStyle = '#2b2018';
    this.roundRect(c, pad, pad, W-2*pad, H-2*pad, 18);
    c.fill();
    c.restore();
    // Inner pages area
    const innerPad = pad + Math.round(Math.min(W,H) * 0.02);
    const pageW = (W - 2*innerPad);
    const pageH = (H - 2*innerPad);
    // Draw two pages
    const seamX = Math.floor(W/2);
  const left = { x: innerPad, y: innerPad, w: seamX - innerPad, h: pageH };
  // Ajuste: la página derecha debe terminar en (W - innerPad), simétrica a la izquierda
  const right = { x: seamX, y: innerPad, w: (W - innerPad) - seamX, h: pageH };
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
    c.fillStyle = seamGrad; c.fillRect(seamX-16, innerPad, 32, pageH);
    // Page wrinkles faint
    c.globalAlpha = 0.15; c.strokeStyle = 'rgba(100,80,60,0.5)';
    for (let i=0;i<8;i++) {
      const y = innerPad + (i+1)*(pageH/9) + (Math.random()-0.5)*6;
      c.beginPath();
      c.moveTo(left.x+12, y);
      for (let x = left.x+12; x < right.x+right.w-12; x+= 24) {
        const yy = y + Math.sin(x*0.03 + i)*1.5 + (Math.random()-0.5)*0.6;
        c.lineTo(x, yy);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawIcons(c: CanvasRenderingContext2D, W: number, H: number): void {
    const rand = (a:number,b:number)=> a + Math.random()*(b-a);
    // Ink color
    const ink = '#3b2b1f';
    c.strokeStyle = ink; c.fillStyle = ink;
    c.lineWidth = 2;
    // Place a few eyes, stars, tentacles on both pages
    const placements = [
      {x: W*0.3, y: H*0.3, s: 1.2},
      {x: W*0.37, y: H*0.55, s: 0.9},
      {x: W*0.7, y: H*0.34, s: 1.1},
      {x: W*0.63, y: H*0.6, s: 0.95},
    ];
    for (const p of placements) {
      // Randomly choose icon type
      const r = Math.random();
      if (r < 0.33) this.drawEye(c, p.x, p.y, 26*p.s);
      else if (r < 0.66) this.drawStarSymbol(c, p.x, p.y, 18*p.s);
      else this.drawTentacle(c, p.x, p.y, 30*p.s);
    }
    // Scribbles (illegible handwriting)
    c.strokeStyle = 'rgba(60,45,35,0.8)'; c.lineWidth = 1.4;
    for (let i=0;i<6;i++) this.drawScribble(c, rand(W*0.18,W*0.42), rand(H*0.2,H*0.8), rand(W*0.18,W*0.42), rand(H*0.2,H*0.8));
    for (let i=0;i<6;i++) this.drawScribble(c, rand(W*0.58,W*0.82), rand(H*0.2,H*0.8), rand(W*0.58,W*0.82), rand(H*0.2,H*0.8));
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

  private drawTentacle(c: CanvasRenderingContext2D, x:number,y:number, len:number): void {
    c.save(); c.translate(x,y);
    c.beginPath();
    c.moveTo(0,0);
    const waves = 3 + Math.floor(Math.random()*3);
    for (let i=1;i<=waves;i++) {
      const t = i/waves; const dx = len*t; const amp = 12*(1-t);
      const ctlx = dx - len/(waves*2);
      const ctly = (i%2===0? -1:1)*amp;
      c.quadraticCurveTo(ctlx, ctly, dx, Math.sin(i)*amp*0.3);
    }
    c.stroke();
    // suckers
    c.fillStyle = 'rgba(60,45,35,0.7)';
    for (let i=0;i<8;i++) {
      const t = i/8; const px = len*t; const py = Math.sin(t*waves*Math.PI)*6;
      c.beginPath(); c.arc(px, py, 2.2*(1-t*0.6), 0, Math.PI*2); c.fill();
    }
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
