import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';

/**
 * EyeShaderService
 * Envoltura ligera sobre el eyeProgram gestionado por ShaderManager.
 */
export class EyeShaderService {
  private gl: WebGL2RenderingContext | null = null;
  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext | null;
  }

  public initialize(): void { /* El programa vive en ShaderManager */ }

  public begin(): void { this.shaders.useEyeProgram(); }
  public setMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    this.shaders.setEyeMatrices(model, view, proj);
  }
  public setParams(time: number, eyeDir: Float32Array, irisColor: Float32Array, pupilColor: Float32Array, pupilRadius: number, shellFactor: number, eyelidOpen: number, scleraColor: Float32Array, bandEdge: number = 0.03): void {
    this.shaders.setEyeParams(time, eyeDir, irisColor, pupilColor, pupilRadius, shellFactor, eyelidOpen, scleraColor, bandEdge);
  }
}
