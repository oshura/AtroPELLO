import { Vector3, Color } from '../types/game.types';
import { Planet, PlanetColorName, PlanetType } from './Planet';
import { MegaAsteroid } from './MegaAsteroid';

/**
 * EarthSplitPlanet: two hemispheres separated along X with layered cap (crust/mantle/core)
 * and optional mega-asteroid debris ring in the split.
 */
export class EarthSplitPlanet extends Planet {
  // Nota: initGeometry es llamado desde el constructor de GameObject (super),
  // por lo que NUNCA dependas de campos inicializados en este constructor.
  // Usa this.scale.x para el radio y provee un valor por defecto para separation.
  public separation: number = 300; // world units between hemispheres (edge-to-edge)
  private layeredColors: Float32Array | null = null;
  // Rango de índices para dibujar las tapas del corte (emisivas)
  private capRanges: Array<{ start: number; count: number }> = [];
  // Cantidad de índices de la superficie principal (excluye tapas);
  // se usa para evitar dibujar las tapas en el pase principal
  private mainIndexCount: number = 0;

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3, separation: number = 300) {
    super(id, colorName, radius, initialPos);
    this.planetType = PlanetType.Tierra;
    // Asignar separación solicitada (initGeometry ya se ejecutó, pero volveremos a aplicar colores más abajo)
    this.separation = Math.max(0, separation);
    // Reapply layered per-vertex colors overriding the uniform colors set by base constructor
    if (this.layeredColors) {
      this.colors = this.layeredColors;
    }
  }

  /** Build two hemispheres (+caps) with layered colors on the cut plane */
  protected override initGeometry(): void {
    // Asegura estructuras antes de cualquier uso (super() llama a initGeometry antes de inicializar campos)
    this.capRanges = [];
    const latBands = 40;
    const lonBands = 40;
    // Base unit sphere vertices
    const baseVerts: Array<[number, number, number]> = [];
    const baseUVs: Array<[number, number]> = [];
    for (let lat = 0; lat <= latBands; lat++) {
      const theta = (lat * Math.PI) / latBands;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let lon = 0; lon <= lonBands; lon++) {
        const phi = (lon * 2 * Math.PI) / lonBands;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;
        baseVerts.push([x, y, z]);
        baseUVs.push([lon / lonBands, 1 - lat / latBands]);
      }
    }
    // Base indices
    const baseIdx: number[] = [];
    for (let lat = 0; lat < latBands; lat++) {
      for (let lon = 0; lon < lonBands; lon++) {
        const first = lat * (lonBands + 1) + lon;
        const second = first + lonBands + 1;
        baseIdx.push(first, second, first + 1);
        baseIdx.push(second, second + 1, first + 1);
      }
    }

  // Protecciones: separar sin depender de campos no inicializados aún
  const sepWorld = Number.isFinite(this.separation) ? this.separation : 500;
  const sepHalf = sepWorld / 2; // world units
  // Radio de escala en mundo (ya configurado por GameObject→Planet en super())
  const R = (this as any).scale?.x ?? 1;

    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const pushTri = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
                     uv0: [number, number], uv1: [number, number], uv2: [number, number],
                     offsetXWorld: number, tint?: { r: number; g: number; b: number }) => {
  const baseIndex = vertices.length / 3;
  const offsetObj = (R > 0 ? offsetXWorld / R : 0); // convert desired world offset to object-space (unit-sphere space)
      const add = (v: [number, number, number], uv: [number, number]) => {
        const x = v[0] + offsetObj;
        const y = v[1];
        const z = v[2];
        vertices.push(x, y, z);
        // normal from unit sphere vector
        const len = Math.hypot(v[0], v[1], v[2]) || 1;
        normals.push(v[0] / len, v[1] / len, v[2] / len);
        uvs.push(uv[0], uv[1]);
        // Color: base planet color tinted; if tint provided, use it
        const c = tint ?? { r: this.color.r, g: this.color.g, b: this.color.b };
        colors.push(c.r, c.g, c.b);
      };
      add(v0, uv0); add(v1, uv1); add(v2, uv2);
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    };

    // Helper to add a cap (disk) at x = 0 with normal dir +/-X for a hemisphere
    const addCap = (normalX: number, offsetXWorld: number) => {
      const seg = 64;
      const baseIndex = vertices.length / 3;
      const offsetObj = (R > 0 ? offsetXWorld / R : 0);
      // center
      vertices.push(offsetObj, 0, 0);
      normals.push(normalX, 0, 0);
      uvs.push(0.5, 0.5);
      // center color based on core (emissive red)
      const coreCol = { r: 1.0, g: 0.1, b: 0.0 };
      colors.push(coreCol.r, coreCol.g, coreCol.b);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * 2 * Math.PI;
        const y = Math.cos(t);
        const z = Math.sin(t);
        const rad = Math.hypot(y, z);
        // Layered color based on radius on the disk
        let col: { r: number; g: number; b: number };
        if (rad < 0.35) col = { r: 1.0, g: 0.1, b: 0.0 }; // core (red emissive)
        else if (rad < 0.7) col = { r: 1.0, g: 0.9, b: 0.2 }; // mantle (yellow)
        else col = { r: 0.55, g: 0.35, b: 0.20 }; // crust (brown)
        vertices.push(offsetObj, y, z);
        normals.push(normalX, 0, 0);
        uvs.push(0.5 + (y * 0.5), 0.5 + (z * 0.5));
        colors.push(col.r, col.g, col.b);
      }
      // Triangles fan
      const startIndex = indices.length; // comienzo del abanico
      for (let i = 1; i <= seg; i++) {
        const i0 = baseIndex; // center
        const i1 = baseIndex + i;
        const i2 = baseIndex + ((i % (seg)) + 1);
        indices.push(i0, i1, i2);
      }
      // Registrar rango de la tapa para renderizado posterior (emisivo)
      const added = indices.length - startIndex;
      this.capRanges.push({ start: startIndex, count: added });
    };

    // Split triangles into L/R by plane x=0
    for (let i = 0; i < baseIdx.length; i += 3) {
      const ia = baseIdx[i], ib = baseIdx[i + 1], ic = baseIdx[i + 2];
      const va = baseVerts[ia], vb = baseVerts[ib], vc = baseVerts[ic];
      const ua = baseUVs[ia], ub = baseUVs[ib], uc = baseUVs[ic];
      const avgX = (va[0] + vb[0] + vc[0]) / 3;
      if (avgX >= 0) {
        pushTri(va, vb, vc, ua, ub, uc, +sepHalf);
      } else {
        pushTri(va, vb, vc, ua, ub, uc, -sepHalf);
      }
    }

  // Registrar cuántos índices había antes de agregar tapas
  const surfaceIndexCountBeforeCaps = indices.length;
  // Caps (se agregan al final del buffer de índices)
  addCap(+1, +sepHalf); // right hemisphere, normal +X
  addCap(-1, -sepHalf); // left hemisphere, normal -X
  // Guardar el conteo principal (solo superficie)
  this.mainIndexCount = surfaceIndexCountBeforeCaps;

    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
    this.layeredColors = new Float32Array(colors);
  }

  /**
   * Render principal del planeta: dibuja solo la superficie (excluye tapas)
   * para que las tapas no reciban el shader/textura del planeta.
   * Las tapas se dibujan luego con renderCapsEmissive().
   */
  public override render(gl: WebGLRenderingContext, program: WebGLProgram, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.visible || !this.vertexBuffer) return;
    // Atributos
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const normalLocation = gl.getAttribLocation(program, 'a_normal');
    const colorLocation = gl.getAttribLocation(program, 'a_color');
    const uvLocation = gl.getAttribLocation(program, 'a_uv');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (positionLocation >= 0) {
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    }
    if (normalLocation >= 0 && this.normalBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.enableVertexAttribArray(normalLocation);
      gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    }
    if (colorLocation >= 0 && this.colorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    }
    if (uvLocation >= 0 && this.uvBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    }

    // Uniforms (matrices, etc.)
    this.setUniforms(gl, program, viewMatrix, projectionMatrix);

    // Dibujar solo la superficie (sin tapas)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    const count = this.mainIndexCount > 0 ? this.mainIndexCount : this.indices.length;
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

    if (positionLocation >= 0) gl.disableVertexAttribArray(positionLocation);
    if (normalLocation >= 0) gl.disableVertexAttribArray(normalLocation);
    if (colorLocation >= 0) gl.disableVertexAttribArray(colorLocation);
    if (uvLocation >= 0) gl.disableVertexAttribArray(uvLocation);
  }

  /**
   * Renderiza solo las tapas del corte con color per-vertex (emisivo), encima del render principal
   */
  public renderCapsEmissive(gl: WebGLRenderingContext, shaderManager: any, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.vertexBuffer || !this.indexBuffer || !this.colorBuffer) return;
    if (!shaderManager?.basicProgram) return;
    // Guardar estado previo
    const wasBlend = gl.getParameter(gl.BLEND);
    const wasDepth = gl.getParameter(gl.DEPTH_TEST);
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);

    // Configurar modo "emisivo": additive blending, sin escribir depth
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);

    const program: WebGLProgram = shaderManager.basicProgram;
    gl.useProgram(program);

    // Matrices
    if (shaderManager.setBasicMatrices) {
      shaderManager.setBasicMatrices(this.modelMatrix, viewMatrix, projectionMatrix);
    } else {
      const uModel = gl.getUniformLocation(program, 'u_modelMatrix');
      const uView = gl.getUniformLocation(program, 'u_viewMatrix');
      const uProj = gl.getUniformLocation(program, 'u_projectionMatrix');
      if (uModel) gl.uniformMatrix4fv(uModel, false, this.modelMatrix);
      if (uView) gl.uniformMatrix4fv(uView, false, viewMatrix);
      if (uProj) gl.uniformMatrix4fv(uProj, false, projectionMatrix);
    }

    // Atributos
    const aPos = gl.getAttribLocation(program, 'a_position');
    const aCol = gl.getAttribLocation(program, 'a_color');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    if (aCol >= 0) {
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    // Dibujar cada tapa
    for (const r of this.capRanges) {
      const byteOffset = r.start * 2; // UNSIGNED_SHORT → 2 bytes por índice
      gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_SHORT, byteOffset);
    }

    // Restaurar estado básico de atributos
    if (aPos >= 0) gl.disableVertexAttribArray(aPos);
    if (aCol >= 0) gl.disableVertexAttribArray(aCol);

    // Restaurar estado GL
    gl.depthMask(true);
    if (!wasBlend) gl.disable(gl.BLEND); else gl.enable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (prevProgram) gl.useProgram(prevProgram as any);
  }

  /**
   * Factory to create split planet plus debris ring of MegaAsteroids along the cut.
   */
  static createWithDebris(
    id: string,
    colorName: PlanetColorName,
    radius: number,
    initialPos: Vector3,
    separation: number = 500,
    debrisCount: number = 12
  ): { planet: EarthSplitPlanet; debris: MegaAsteroid[] } {
    const planet = new EarthSplitPlanet(id, colorName, radius, initialPos, separation);
    planet.planetType = PlanetType.Tierra;
    const debris: MegaAsteroid[] = [];
    const R = radius;
    for (let i = 0; i < debrisCount; i++) {
      const t = (i / debrisCount) * 2 * Math.PI;
      const y = Math.cos(t) * R * (0.95 + Math.random() * 0.1);
      const z = Math.sin(t) * R * (0.95 + Math.random() * 0.1);
      const pos: Vector3 = { x: initialPos.x, y: initialPos.y + y, z: initialPos.z + z };
      const size = 1.0 * (0.8 + Math.random() * 0.4); // base size; MegaAsteroid multiplies by 5
      debris.push(new MegaAsteroid(`${id}-mega-${i}`, pos, size));
    }
    return { planet, debris };
  }
}
