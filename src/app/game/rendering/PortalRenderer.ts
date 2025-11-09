import { Portal } from '../Portal';
import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';
import { PortalShaderService } from '../shaders/PortalShaderService';

/**
 * PortalRenderer: gestiona el render de todos los portales de forma encapsulada.
 * - Controla el estado GL para capas aditivas.
 * - Usa PortalShaderService para configurar shaders y uniforms.
 * - Encapsula el binding de buffers de geometría del Portal.
 */
export class PortalRenderer {
  private gl: WebGL2RenderingContext;
  private shaderSvc: PortalShaderService;

  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext;
    this.shaderSvc = new PortalShaderService(this.webgl, this.shaders);
    this.shaderSvc.initialize();
  }

  /** Renderiza todos los portales con su halo (placeholder actual). */
  public render(portals: Portal[], viewMatrix: Float32Array, projectionMatrix: Float32Array, timeSec: number): void {
    if (!portals || portals.length === 0) return;
    const gl = this.gl;
    const state = this.shaderSvc.beginPortalBlend();
    try {
      for (const p of portals) {
        if (!p.visible || !p.vertexBuffer || !p.indexBuffer) continue;
        // Configuración de shader y matrices
        this.shaderSvc.useHaloShader(p, viewMatrix, projectionMatrix, timeSec);
        // Atributos
        const aPos = this.shaderSvc.getHaloPositionAttribLocation();
        if (aPos < 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vertexBuffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.indexBuffer);
        gl.drawElements(gl.TRIANGLES, p.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(aPos);
      }
    } finally {
      this.shaderSvc.endPortalBlend(state);
    }
  }
}
