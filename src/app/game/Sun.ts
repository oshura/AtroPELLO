import { Planet, PlanetColorName, PlanetType } from './Planet';
import { Vector3 } from '../types/game.types';

/**
 * Sun: a bright self-lit star with additive glow. Treated as a special Planet.
 */
export class Sun extends Planet {
  public glowScaleInner = 2.2;  // inner glow radius multiplier (reduced)
  public glowScaleOuter = 4.2;  // outer glow radius multiplier (reduced)
  // Warmer/yellowish core; more whitish-yellow glows with softer alpha
  public glowInnerColor: [number, number, number, number] = [1.0, 0.98, 0.80, 0.22];
  public glowOuterColor: [number, number, number, number] = [1.0, 0.95, 0.65, 0.06];

  constructor(id: string, radius: number, initialPos: Vector3) {
    // Color name isn't used for shaders here; pick a warm palette base
    super(id, 'rojo_carmesi' as PlanetColorName, radius, initialPos);
    this.planetType = PlanetType.Sun;
    this.customName = 'Sol';
    // Make the core more yellow
    (this as any).color = { r: 1.0, g: 0.92, b: 0.55, a: 1.0 };
  }

  /** Render the bright core using basic color (self-lit) */
  public override render(gl: WebGLRenderingContext, program: WebGLProgram, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    // Use base/parent render path (GameEngine chooses program), but ensure color is bright
    super.render(gl, program, viewMatrix, projectionMatrix);
  }

  /** Additive billboard glow drawn after the main planet pass */
  public renderGlow(gl: WebGL2RenderingContext, shaderManager: any, camera: any): void {
    if (!shaderManager?.glowProgram) return;

    // Build camera basis
    const camPos = camera.position;
    const fwd = this.normalize({ x: camera.target.x - camPos.x, y: camera.target.y - camPos.y, z: camera.target.z - camPos.z });
    const worldUp = camera.up;
    const right = this.normalize({ x: fwd.y * worldUp.z - fwd.z * worldUp.y, y: fwd.z * worldUp.x - fwd.x * worldUp.z, z: fwd.x * worldUp.y - fwd.y * worldUp.x });
    const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };

    const drawLayer = (scale: number, color: [number, number, number, number]) => {
      const r = this.scale.x * scale;
      const c = this.position;
      const tl = { x: c.x - right.x * r + up.x * r, y: c.y - right.y * r + up.y * r, z: c.z - right.z * r + up.z * r };
      const tr = { x: c.x + right.x * r + up.x * r, y: c.y + right.y * r + up.y * r, z: c.z + right.z * r + up.z * r };
      const br = { x: c.x + right.x * r - up.x * r, y: c.y + right.y * r - up.y * r, z: c.z + right.z * r - up.z * r };
      const bl = { x: c.x - right.x * r - up.x * r, y: c.y - right.y * r - up.y * r, z: c.z - right.z * r - up.z * r };

      const verts = new Float32Array([
        tl.x, tl.y, tl.z,
        tr.x, tr.y, tr.z,
        br.x, br.y, br.z,
        bl.x, bl.y, bl.z,
      ]);
      // Quad-local UVs in [-1,1] for radial falloff in shader
      const uvs = new Float32Array([
        -1,  1,
         1,  1,
         1, -1,
        -1, -1,
      ]);
      const cols = new Float32Array([
        color[0], color[1], color[2], color[3],
        color[0], color[1], color[2], color[3],
        color[0], color[1], color[2], color[3],
        color[0], color[1], color[2], color[3],
      ]);
      const idx = new Uint16Array([0,1,2, 0,2,3]);

      shaderManager.useGlowProgram();
      shaderManager.setGlowMatrices(this.identity(), camera.viewMatrix, camera.projectionMatrix);

      const vbo = gl.createBuffer()!;
      const ubo = gl.createBuffer()!;
      const cbo = gl.createBuffer()!;
      const ibo = gl.createBuffer()!;

      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      const aPos = shaderManager.glowAttributes['position'];
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, ubo);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
      const aUv = shaderManager.glowAttributes['uv'];
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
      gl.bufferData(gl.ARRAY_BUFFER, cols, gl.DYNAMIC_DRAW);
      const aCol = shaderManager.glowAttributes['color'];
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);

      // Additive blending on top, depth test off so it doesn't get clipped
      const wasBlend = gl.isEnabled(gl.BLEND);
      const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      if (wasDepth) gl.disable(gl.DEPTH_TEST);

      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      if (wasDepth) gl.enable(gl.DEPTH_TEST);
      if (!wasBlend) gl.disable(gl.BLEND);

      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aUv);
      gl.disableVertexAttribArray(aCol);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ubo);
      gl.deleteBuffer(cbo);
      gl.deleteBuffer(ibo);
    };

    // Two-layer glow
    drawLayer(this.glowScaleOuter, this.glowOuterColor);
    drawLayer(this.glowScaleInner, this.glowInnerColor);
  }

  /**
   * Optional screen-space ambient glow if the sun is behind the camera.
   * Draws a faint centered glow to preserve the sense of presence.
   */
  public renderAmbientGlow(gl: WebGL2RenderingContext, shaderManager: any, camera: any, strength: number = 0.04): void {
    if (!shaderManager?.glowProgram || strength <= 0) return;
    const camPos = camera.position;
    const fwdDir = this.normalize({ x: camera.target.x - camPos.x, y: camera.target.y - camPos.y, z: camera.target.z - camPos.z });
    const right = this.normalize({ x: fwdDir.y * camera.up.z - fwdDir.z * camera.up.y, y: fwdDir.z * camera.up.x - fwdDir.x * camera.up.z, z: fwdDir.x * camera.up.y - fwdDir.y * camera.up.x });
    const up = this.normalize({ x: right.y * fwdDir.z - right.z * fwdDir.y, y: right.z * fwdDir.x - right.x * fwdDir.z, z: right.x * fwdDir.y - right.y * fwdDir.x });
    // Place a quad a few units in front of the camera
    const depth = 10.0;
    const center = { x: camPos.x + fwdDir.x * depth, y: camPos.y + fwdDir.y * depth, z: camPos.z + fwdDir.z * depth };
    const r = this.scale.x * 3.5; // moderate screen-size

    const tl = { x: center.x - right.x * r + up.x * r, y: center.y - right.y * r + up.y * r, z: center.z - right.z * r + up.z * r };
    const tr = { x: center.x + right.x * r + up.x * r, y: center.y + right.y * r + up.y * r, z: center.z + right.z * r + up.z * r };
    const br = { x: center.x + right.x * r - up.x * r, y: center.y + right.y * r - up.y * r, z: center.z + right.z * r - up.z * r };
    const bl = { x: center.x - right.x * r - up.x * r, y: center.y - right.y * r - up.y * r, z: center.z - right.z * r - up.z * r };

    const verts = new Float32Array([
      tl.x, tl.y, tl.z,
      tr.x, tr.y, tr.z,
      br.x, br.y, br.z,
      bl.x, bl.y, bl.z,
    ]);
    const uvs = new Float32Array([
      -1,  1,
       1,  1,
       1, -1,
      -1, -1,
    ]);
    const cols = new Float32Array([
      1.0, 0.95, 0.7, strength,
      1.0, 0.95, 0.7, strength,
      1.0, 0.95, 0.7, strength,
      1.0, 0.95, 0.7, strength,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);

    shaderManager.useGlowProgram();
    shaderManager.setGlowMatrices(this.identity(), camera.viewMatrix, camera.projectionMatrix);

    const vbo = gl.createBuffer()!;
    const ubo = gl.createBuffer()!;
    const cbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    const aPos = shaderManager.glowAttributes['position'];
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, ubo);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
    const aUv = shaderManager.glowAttributes['uv'];
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, cols, gl.DYNAMIC_DRAW);
    const aCol = shaderManager.glowAttributes['color'];
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);

    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (wasDepth) gl.disable(gl.DEPTH_TEST);

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    if (wasDepth) gl.enable(gl.DEPTH_TEST);
    if (!wasBlend) gl.disable(gl.BLEND);

    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aUv);
    gl.disableVertexAttribArray(aCol);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ubo);
    gl.deleteBuffer(cbo);
    gl.deleteBuffer(ibo);
  }

  private normalize(v: { x:number;y:number;z:number }): { x:number;y:number;z:number } { const l = Math.hypot(v.x,v.y,v.z)||1; return { x:v.x/l, y:v.y/l, z:v.z/l }; }
  private identity(): Float32Array { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
}
