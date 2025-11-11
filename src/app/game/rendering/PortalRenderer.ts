import { Portal } from '../Portal';
import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';
import { PortalShaderService } from '../shaders/PortalShaderService';
import { EyeShaderService } from '../shaders/EyeShaderService';

/**
 * PortalRenderer: gestiona el render de todos los portales de forma encapsulada.
 * - Controla el estado GL para capas aditivas.
 * - Usa PortalShaderService para configurar shaders y uniforms.
 * - Encapsula el binding de buffers de geometría del Portal.
 */
export class PortalRenderer {
  private gl: WebGL2RenderingContext;
  private shaderSvc: PortalShaderService;
  private eyeSvc: EyeShaderService;

  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext;
    this.shaderSvc = new PortalShaderService(this.webgl, this.shaders);
    this.shaderSvc.initialize();
    this.eyeSvc = new EyeShaderService(this.webgl, this.shaders);
    this.eyeSvc.initialize();
  }

  /** Renderiza todos los portales con su halo (placeholder actual). */
  public render(portals: Portal[], viewMatrix: Float32Array, projectionMatrix: Float32Array, timeSec: number): void {
    if (!portals || portals.length === 0) return;
    const gl = this.gl;
    const state = this.shaderSvc.beginPortalBlend();
    try {
      for (const p of portals) {
        if (!p.visible || !p.vertexBuffer || !p.indexBuffer) continue;
  // HALO REMOVIDO: Se omite la pasada de halo para mostrar solo estrella y ojo
  // Diferimos el render del pentáculo al final para que quede por encima del ojo
  p.initExtraBuffers(gl);

        // Pasada final: ojo 3D (esfera) con blending alpha normal para evitar sobreexposición.
  const prevBlend = gl.isEnabled(gl.BLEND);
  const prevDepth = gl.isEnabled(gl.DEPTH_TEST);
  const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
  const wasCull = (gl as any).isEnabled ? (gl as any).isEnabled(gl.CULL_FACE) : false;
  // Esfera: habilitar depth test y escritura para evitar artefactos de "cortes"
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  // Usar alpha standard (shader es opaco, pero mantenemos consistencia)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // Dibujar ambas caras por seguridad (geometría low-poly)
  gl.disable(gl.CULL_FACE);
        // Preparar buffers del ojo
        const eye = p.getEyeBuffers();
        if (eye.v && eye.n && eye.i && eye.count > 0) {
          // Modelo ojo interno (iris/pupila/venas) con tamaño FIJO (no crece durante manifest)
          const eyeWorldScale = p.radius * 0.12;
          const modelInner = this.buildModelMatrix(p.position.x, p.position.y, p.position.z, eyeWorldScale);
          this.eyeSvc.begin();
          this.eyeSvc.setMatrices(modelInner, viewMatrix, projectionMatrix);
          const eyeDir = new Float32Array([p.eyeDir.x, p.eyeDir.y, p.eyeDir.z]);
          const baseCol = p.planetColorRef ? new Float32Array([p.planetColorRef.r, p.planetColorRef.g, p.planetColorRef.b]) : new Float32Array([0.35, 0.55, 0.65]);
          // Replica del planeta: sin iris/pupila visibles (uniforme al color del planeta)
          const iris = baseCol;
          const pupil = baseCol;
          const intensity = Math.max(0, Math.min(1, p.eyeState?.intensity ?? 0.8));
          const pupilRadius = 0.0;
          const sclera = new Float32Array([1.0, 0.96, 0.85]);
          const eyelidOpen = (p as any).eyelidOpen ?? 0;
          const bandEdge = 0.025;
          // Render inner eye (shellFactor=0)
          this.eyeSvc.setParams(timeSec, eyeDir, iris, pupil, pupilRadius, 0.0, eyelidOpen, sclera, bandEdge);
          const aPos = (this.shaders as any).eyeAttributes['position'];
          const aNrm = (this.shaders as any).eyeAttributes['normal'];
          if (aPos >= 0 && aNrm >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, eye.v); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, eye.n); gl.enableVertexAttribArray(aNrm); gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eye.i);
            gl.drawElements(gl.TRIANGLES, eye.count, gl.UNSIGNED_SHORT, 0);
            gl.disableVertexAttribArray(aNrm);
            gl.disableVertexAttribArray(aPos);
          }
          // Storm shell (venas) desactivado para clonar apariencia del planeta sin patrón rojo

          // Flame billboard (pupil flame) aditivo antes del párpado
          try {
            const flame = (p as any).getFlameBuffers?.();
            if (flame && flame.v && flame.uv && flame.i && flame.count > 0) {
              const eyeScale = eyeWorldScale;
              const offset = eyeWorldScale * 1.005;
              const cx = p.position.x + eyeDir[0] * offset;
              const cy = p.position.y + eyeDir[1] * offset;
              const cz = p.position.z + eyeDir[2] * offset;
              const intensity = Math.max(0, Math.min(1, p.eyeState?.intensity ?? 0.8));
              const height = eyeScale * (0.26 + 0.18 * intensity);
              const width = height * 0.55;
              // Extract camera right/up from view matrix (column-major): m[0..2], m[4..6]
              const rX = viewMatrix[0], rY = viewMatrix[4], rZ = viewMatrix[8];
              const uX = viewMatrix[1], uY = viewMatrix[5], uZ = viewMatrix[9];
              const rl = Math.max(1e-6, Math.hypot(rX, rY, rZ));
              const ul = Math.max(1e-6, Math.hypot(uX, uY, uZ));
              const rx = rX/rl, ry = rY/rl, rz = rZ/rl;
              const ux = uX/ul, uy = uY/ul, uz = uZ/ul;
              const modelFlame = this.buildBillboardMatrix(cx, cy, cz, rx, ry, rz, ux, uy, uz, width, height, eyeDir);
              (this.shaders as any).useFlameProgram();
              (this.shaders as any).setFlameMatrices(modelFlame, viewMatrix, projectionMatrix);
              (this.shaders as any).setFlameParams(timeSec);
              const prevDepthMask2 = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
              gl.depthMask(false);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
              const aPosF = (this.shaders as any).flameAttributes['position'];
              const aUvF = (this.shaders as any).flameAttributes['uv'];
              if (aPosF >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, flame.v); gl.enableVertexAttribArray(aPosF); gl.vertexAttribPointer(aPosF, 3, gl.FLOAT, false, 0, 0); }
              if (aUvF >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, flame.uv); gl.enableVertexAttribArray(aUvF); gl.vertexAttribPointer(aUvF, 2, gl.FLOAT, false, 0, 0); }
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, flame.i);
              gl.drawElements(gl.TRIANGLES, flame.count, gl.UNSIGNED_SHORT, 0);
              if (aUvF >= 0) gl.disableVertexAttribArray(aUvF);
              if (aPosF >= 0) gl.disableVertexAttribArray(aPosF);
              gl.depthMask(prevDepthMask2);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // restore for eyelid shell
            }
          } catch {}

          // Render eyelid shell (shellFactor=1) sobre la misma geometría pero ligeramente mayor
          const modelShell = this.buildModelMatrix(p.position.x, p.position.y, p.position.z, eyeWorldScale * 1.01);
          this.eyeSvc.setMatrices(modelShell, viewMatrix, projectionMatrix);
          this.eyeSvc.setParams(timeSec, eyeDir, iris, pupil, pupilRadius, 1.0, eyelidOpen, sclera, bandEdge);
          if (aPos >= 0 && aNrm >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, eye.v); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, eye.n); gl.enableVertexAttribArray(aNrm); gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eye.i);
            gl.drawElements(gl.TRIANGLES, eye.count, gl.UNSIGNED_SHORT, 0);
            gl.disableVertexAttribArray(aNrm);
            gl.disableVertexAttribArray(aPos);
          }
        }
        // Dibujar pentáculo/círculo al FINAL OPAQUE con depth test habilitado (no dibujar sobre la nave) y un leve offset para quedar por encima del ojo
        try {
          const prevBlendPent = gl.isEnabled(gl.BLEND);
          const prevDepthMaskPent = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(true);
          gl.disable(gl.BLEND); // sin transparencia
          // Pull a bit toward camera versus sphere to avoid Z-fight, but still fail depth against ship
          gl.enable(gl.POLYGON_OFFSET_FILL);
          gl.polygonOffset(-1.0, -2.0);
          this.shaderSvc.renderPentacle(p, viewMatrix, projectionMatrix, timeSec);
          gl.disable(gl.POLYGON_OFFSET_FILL);
          // restore
          gl.depthMask(prevDepthMaskPent);
          if (prevBlendPent) gl.enable(gl.BLEND);
        } catch {}
        // Restaurar estado GL
        if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
        gl.depthMask(prevDepthMask);
        if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
        if (prevBlend) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.disable(gl.BLEND);
      }
    } finally {
      this.shaderSvc.endPortalBlend(state);
    }
  }

  // Construye una matriz modelo simple (T * S) con escala uniforme
  private buildModelMatrix(tx: number, ty: number, tz: number, s: number): Float32Array {
    const m = new Float32Array(16);
    // identity
    for (let i=0;i<16;i++) m[i] = 0; m[0]=m[5]=m[10]=m[15]=1;
    // translate
    m[12] = tx; m[13] = ty; m[14] = tz;
    // scale uniform
    m[0] *= s; m[5] *= s; m[10] *= s;
    return m;
  }

  private buildBillboardMatrix(cx:number, cy:number, cz:number, rx:number, ry:number, rz:number, ux:number, uy:number, uz:number, w:number, h:number, forwardDir: Float32Array): Float32Array {
    const m = new Float32Array(16);
    // Right * width
    m[0] = rx * w; m[1] = ry * w; m[2] = rz * w; m[3] = 0;
    // Up * height
    m[4] = ux * h; m[5] = uy * h; m[6] = uz * h; m[7] = 0;
    // Forward tiny depth component
    const fx = forwardDir[0], fy = forwardDir[1], fz = forwardDir[2];
    const d = Math.max(w, h) * 0.001;
    m[8] = fx * d; m[9] = fy * d; m[10] = fz * d; m[11] = 0;
    // Translation
    m[12] = cx; m[13] = cy; m[14] = cz; m[15] = 1;
    return m;
  }
}
