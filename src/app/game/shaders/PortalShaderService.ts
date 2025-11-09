import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';
import { Portal } from '../Portal';

/**
 * PortalShaderService
 * Encapsula el uso de los shaders relacionados con el Portal (halo/runas, ojo, llama),
 * delegando la compilación/ubicaciones en ShaderManager y exponiendo una API clara.
 */
export class PortalShaderService {
  private gl: WebGL2RenderingContext | null = null;
  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext | null;
  }

  /** No-op por ahora: los programas viven en ShaderManager */
  public initialize(): void { /* future: validate programs/uniform locations */ }

  /** Prepara el estado de mezcla/profundidad para efectos aditivos del portal. Devuelve estado previo. */
  public beginPortalBlend(): { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null } {
    const gl = this.gl!;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    return { blend: wasBlend, depth: wasDepth, depthMask: prevDepthMask, prevProgram };
  }

  /** Restaura el estado de mezcla/profundidad anterior. */
  public endPortalBlend(state: { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null }): void {
    const gl = this.gl!;
    if (!state.blend) gl.disable(gl.BLEND);
    if (state.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthMask);
    if (state.prevProgram) gl.useProgram(state.prevProgram);
  }

  /** Configura y usa el shader de halo/runas del portal para un portal concreto. */
  public useHaloShader(portal: Portal, view: Float32Array, proj: Float32Array, timeSec: number): void {
    // Usa programa ya compilado en ShaderManager
    this.shaders.usePortalProgram();
    this.shaders.setPortalMatrices(portal.modelMatrix, view, proj);
    // Parámetros por defecto (placeholder hasta nuevas capas de símbolo/pentagrama)
    const outer = new Float32Array([0.25, 0.9, 1.15]);
    const inner = new Float32Array([0.06, 0.14, 0.25]);
    const ringInner = 0.58;
    const ringOuter = 0.995;
    const pent = new Float32Array([0.0, 0.0, 0.0]);
    const eyeDir = new Float32Array([portal.eyeDir.x, portal.eyeDir.y, portal.eyeDir.z]);
    const eyeRadius = 0.0;
    this.shaders.setPortalParams(timeSec, outer, inner, ringInner, ringOuter, pent, eyeDir, eyeRadius);
  }

  /** Devuelve la localización del atributo de posición para el shader de halo. */
  public getHaloPositionAttribLocation(): number {
    return (this.shaders as any).portalAttributes['position'] ?? -1;
  }
}
