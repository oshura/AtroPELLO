import { Vector3, Color } from '../../types/game.types';
import { Planet, PlanetColorName, PlanetType } from './Planet';
import { MegaAsteroid } from './MegaAsteroid';
import { GameObjectType } from '../types/game-object.types';

/**
 * EarthSplitPlanet: two hemispheres separated along Y (horizontal cut) with layered cap (crust/mantle/core)
 * and optional mega-asteroid debris ring around the equator (XZ plane).
 */
export class EarthSplitPlanet extends Planet {
  // Feature flags
  private readonly enableCoreLightning: boolean = false; // disable simple core lightning; keep storm shell
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
  // Índices separados por semiesfera para texturizado (norte/sur)
  private topIndices: number[] = [];
  private bottomIndices: number[] = [];
  private topIndexBuffer: WebGLBuffer | null = null;
  private bottomIndexBuffer: WebGLBuffer | null = null;
  private topIndexCount: number = 0;
  private bottomIndexCount: number = 0;
  // Núcleo simple: esfera roja de 100u de diámetro (50u radio)
  private coreVB: WebGLBuffer | null = null;
  private coreCB: WebGLBuffer | null = null;
  private coreIB: WebGLBuffer | null = null;
  private coreIndexCount: number = 0;
  // Lightning on core surface: transient spark bursts state
  private lightningBursts: Array<{
    elapsed: number;       // seconds since spawn
    total: number;         // total lifetime (rise+flash+decay)
    rise: number;          // seconds to form (default 2.0)
    flash: number;         // seconds of super-bright (default 0.25)
    decay: number;         // seconds to fade (default 1.25)
    pointsObj: Array<[number, number, number]>; // points on unit sphere (object space, length≈1)
    width: number;         // base width in world units for bolt segment
    color: [number, number, number, number]; // rgba for glow shader
  }> = [];
  private lightningSpawnCooldown: number = 0; // seconds until next spawn window
  // Storm shell state (procedural cúpula alrededor del núcleo)
  private stormTime: number = 0;
  private stormFlashRemaining: number = 0; // seconds left in flash
  private stormNextFlashCooldown: number = 0; // seconds until next flash window

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3, separation: number = 300) {
    super(id, colorName, radius, initialPos);
    this.setType(GameObjectType.EARTH_SPLIT_PLANET); // Cambiar tipo de Planet a EarthSplitPlanet
    this.planetType = PlanetType.Tierra;
    // Asignar separación solicitada (initGeometry ya se ejecutó, pero volveremos a aplicar colores más abajo)
    this.separation = Math.max(0, separation);
    // Reconstruir geometría con la separación final (super() ya ejecutó initGeometry con el valor por defecto)
    this.initGeometry();
    // Reapply layered per-vertex colors overriding the uniform colors set by base constructor
    if (this.layeredColors) {
      this.colors = this.layeredColors;
    }
    // Recalcular bounding sphere acorde a la nueva geometría
    (this as any).computeBoundingSphere?.();
  }

  /** Build two hemispheres (+caps) with layered colors on the cut plane (horizontal split along Y) */
  protected override initGeometry(): void {
    // Asegura estructuras antes de cualquier uso (super() llama a initGeometry antes de inicializar campos)
    this.capRanges = [];
    // Importante: estos arrays pueden no estar inicializados aún (initGeometry se llama desde super())
    this.topIndices = [];
    this.bottomIndices = [];
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

    const pushTri = (
      v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
      uv0: [number, number], uv1: [number, number], uv2: [number, number],
      offsetYWorld: number, target: 'top' | 'bottom', tint?: { r: number; g: number; b: number }
    ) => {
  const baseIndex = vertices.length / 3;
  const offsetObj = (R > 0 ? offsetYWorld / R : 0); // convert desired world offset to object-space (unit-sphere space)
      const add = (v: [number, number, number], uv: [number, number]) => {
        const x = v[0];
        const y = v[1] + offsetObj;
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
      if (target === 'top') {
        this.topIndices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      } else {
        this.bottomIndices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      }
    };

    // Helper to add a cap ring (annulus) with inner hole to expose the core
    const addCap = (normalY: number, offsetYWorld: number, innerRadiusObj: number) => {
      const seg = 96;
      const offsetObj = (R > 0 ? offsetYWorld / R : 0);
      const inner = Math.max(0.05, Math.min(0.95, innerRadiusObj));
      const outer = 1.0;
      const baseVertIndex = vertices.length / 3;
      const ringOuterIdx: number[] = [];
      const ringInnerIdx: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * 2 * Math.PI;
        const cx = Math.cos(t), cz = Math.sin(t);
        // Outer vertex (crust - brown)
        vertices.push(cx * outer, offsetObj, cz * outer);
        normals.push(0, normalY, 0);
        uvs.push(0.5 + (cx * 0.5 * outer), 0.5 + (cz * 0.5 * outer));
        const colOuter = { r: 0.55, g: 0.35, b: 0.20 };
        colors.push(colOuter.r, colOuter.g, colOuter.b);
        ringOuterIdx.push(baseVertIndex + i * 2);
        // Inner vertex (mantle/core - reddish/yellow)
        vertices.push(cx * inner, offsetObj, cz * inner);
        normals.push(0, normalY, 0);
        uvs.push(0.5 + (cx * 0.5 * inner), 0.5 + (cz * 0.5 * inner));
        const colInner = inner < 0.6 ? { r: 1.0, g: 0.1, b: 0.0 } : { r: 1.0, g: 0.9, b: 0.2 };
        colors.push(colInner.r, colInner.g, colInner.b);
        ringInnerIdx.push(baseVertIndex + i * 2 + 1);
      }
      // Build triangles for the ring
      const startIndex = indices.length;
      for (let i = 0; i < seg; i++) {
        const iOut0 = ringOuterIdx[i];
        const iIn0 = ringInnerIdx[i];
        const iOut1 = ringOuterIdx[i + 1];
        const iIn1 = ringInnerIdx[i + 1];
        indices.push(iOut0, iIn0, iOut1);
        indices.push(iOut1, iIn0, iIn1);
      }
      const added = indices.length - startIndex;
      this.capRanges.push({ start: startIndex, count: added });
    };

    // Split triangles into top/bottom by plane y=0 (horizontal cut)
    for (let i = 0; i < baseIdx.length; i += 3) {
      const ia = baseIdx[i], ib = baseIdx[i + 1], ic = baseIdx[i + 2];
      const va = baseVerts[ia], vb = baseVerts[ib], vc = baseVerts[ic];
      const ua = baseUVs[ia], ub = baseUVs[ib], uc = baseUVs[ic];
      const avgY = (va[1] + vb[1] + vc[1]) / 3;
      if (avgY >= 0) {
        pushTri(va, vb, vc, ua, ub, uc, +sepHalf, 'top');
      } else {
        pushTri(va, vb, vc, ua, ub, uc, -sepHalf, 'bottom');
      }
    }

  // Registrar cuántos índices había antes de agregar tapas
  const surfaceIndexCountBeforeCaps = indices.length;
  // Caps as annular rings (leave a hole to see the core)
  const coreRobj = 50 / (R || 1); // core radius in object space for 100u world diameter
  const innerHole = Math.min(0.9, coreRobj * 1.25);
  addCap(+1, +sepHalf, innerHole); // top hemisphere, normal +Y
  addCap(-1, -sepHalf, innerHole); // bottom hemisphere, normal -Y
  // Guardar el conteo principal (solo superficie)
  this.mainIndexCount = surfaceIndexCountBeforeCaps;

    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
    this.layeredColors = new Float32Array(colors);
  }

  

  /** Inicializa buffers incluyendo un núcleo simple de 100u de diámetro en el centro (Y=0) */
  public override initBuffers(gl: WebGLRenderingContext): void {
    super.initBuffers(gl);
    // Crear index buffers separados para semiesferas
    if (this.topIndices.length > 0) {
      this.topIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.topIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.topIndices), gl.STATIC_DRAW);
      this.topIndexCount = this.topIndices.length;
    }
    if (this.bottomIndices.length > 0) {
      this.bottomIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bottomIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.bottomIndices), gl.STATIC_DRAW);
      this.bottomIndexCount = this.bottomIndices.length;
    }
    // Generar una esfera pequeña centrada en (0,0,0) en espacio objeto; el modelMatrix del planeta la escala
    const Rworld = (this as any).scale?.x ?? 1; // radio del planeta en mundo (escala X)
    const coreRobj = 50 / (Rworld || 1); // 50u en mundo -> radio en espacio objeto
    const latBands = 16, lonBands = 20;
    const verts: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    for (let lat = 0; lat <= latBands; lat++) {
      const theta = (lat / latBands) * Math.PI;
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      for (let lon = 0; lon <= lonBands; lon++) {
        const phi = (lon / lonBands) * 2 * Math.PI;
        const sinP = Math.sin(phi), cosP = Math.cos(phi);
        const x = cosP * sinT * coreRobj;
        const y = cosT * coreRobj; // centrado en Y=0
        const z = sinP * sinT * coreRobj;
        verts.push(x, y, z);
        cols.push(1.0, 0.1, 0.0); // rojo brillante simple
      }
    }
    for (let lat = 0; lat < latBands; lat++) {
      for (let lon = 0; lon < lonBands; lon++) {
        const first = lat * (lonBands + 1) + lon;
        const second = first + lonBands + 1;
        idx.push(first, second, first + 1);
        idx.push(second, second + 1, first + 1);
      }
    }
    this.coreIndexCount = idx.length;
    this.coreVB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coreVB);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.coreCB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coreCB);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.STATIC_DRAW);
    this.coreIB = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.coreIB);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  }

  /** Update planet plus lightning flicker state */
  public override update(deltaTime: number): void {
    super.update(deltaTime);
    // Storm time and flash scheduling
    this.stormTime += deltaTime;
    this.stormFlashRemaining = Math.max(0, this.stormFlashRemaining - deltaTime);
    this.stormNextFlashCooldown -= deltaTime;
    if (this.stormNextFlashCooldown <= 0) {
      // Sporadic flashes ~0.25s
      if (Math.random() < 0.25) {
        this.stormFlashRemaining = 0.25;
        this.stormNextFlashCooldown = 2.0 + Math.random() * 3.0; // 2..5s
      } else {
        this.stormNextFlashCooldown = 0.6 + Math.random() * 0.8; // try again soon
      }
    }
    if (this.enableCoreLightning) {
      // Update existing bursts lifetimes
      if (this.lightningBursts.length) {
        this.lightningBursts = this.lightningBursts.filter(b => {
          b.elapsed += deltaTime;
          return b.elapsed < b.total;
        });
      }
      // Spawn logic: brief windows producing 1-2 bursts
      this.lightningSpawnCooldown -= deltaTime;
      if (this.lightningSpawnCooldown <= 0) {
        // Much less frequent spawns; arcs last ~3.5s total
        const spawnNow = Math.random() < 0.25;
        if (spawnNow && this.lightningBursts.length < 4) {
          this.spawnLightningBurst();
          // Next window in 1.2..2.4s
          this.lightningSpawnCooldown = 1.2 + Math.random() * 1.2;
        } else {
          this.lightningSpawnCooldown = 0.4 + Math.random() * 0.6;
        }
      }
    } else {
      // Ensure nothing lingers if disabled
      if (this.lightningBursts.length) this.lightningBursts.length = 0;
    }
  }

  /** Create a short lightning arc along the core surface */
  private spawnLightningBurst(): void {
    // Pick a random great-circle direction
    const rndDir = (): [number, number, number] => {
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1; x /= len; y /= len; z /= len;
      return [x, y, z];
    };
    const a = rndDir();
    let b = rndDir();
    // Ensure b not parallel to a
    let dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    if (Math.abs(dot) > 0.9) b = rndDir();
    // Build an arc by SLERP over small angle range
  const steps = 14 + Math.floor(Math.random() * 10); // 14..23 points for smoother arcs
  const span = 0.8 + Math.random() * 1.2; // radians along great-circle (~45..105 deg)
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const ang = (t - 0.5) * span; // center at midpoint between a and b
      // Orthogonal basis on sphere: use a as base, u as perpendicular to a in plane of a-b
      const cross: [number, number, number] = [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
      ];
      let cl = Math.hypot(cross[0], cross[1], cross[2]);
      if (cl < 1e-5) { cross[0] = -a[1]; cross[1] = a[0]; cross[2] = 0; cl = Math.hypot(cross[0], cross[1], cross[2]) || 1; }
      cross[0] /= cl; cross[1] /= cl; cross[2] /= cl;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const x = a[0] * ca + cross[0] * sa;
      const y = a[1] * ca + cross[1] * sa;
      const z = a[2] * ca + cross[2] * sa;
      // Normalize to be safe
      const L = Math.hypot(x, y, z) || 1;
      points.push([x / L, y / L, z / L]);
    }
    // World-size and color
    const width = 5 + Math.random() * 8; // world units (segment half-width ~ width/2 visually)
    const baseAlpha = 0.14 + Math.random() * 0.16; // fairly bright (additive)
    const color: [number, number, number, number] = [1.0, 0.96, 0.9, baseAlpha];
    const rise = 2.0; const flash = 0.25; const decay = 1.25; const total = rise + flash + decay;
    this.lightningBursts.push({ elapsed: 0, total, rise, flash, decay, pointsObj: points, width, color });
  }

  /** Extract camera right/up vectors from a standard column-major view matrix */
  private extractCameraBasis(view: Float32Array): { right: {x:number;y:number;z:number}, up: {x:number;y:number;z:number} } {
    // For typical OpenGL-style view matrices, first and second columns are right and up in world space
    const right = { x: view[0], y: view[4], z: view[8] };
    const up = { x: view[1], y: view[5], z: view[9] };
    const rl = Math.hypot(right.x, right.y, right.z) || 1; right.x/=rl; right.y/=rl; right.z/=rl;
    const ul = Math.hypot(up.x, up.y, up.z) || 1; up.x/=ul; up.y/=ul; up.z/=ul;
    return { right, up };
  }

  /** Multiply model matrix by a vec3 position (object→world), w=1 */
  private objToWorld(v: [number, number, number]): { x:number;y:number;z:number } {
    const m = this.modelMatrix;
    const x = v[0], y = v[1], z = v[2];
    return {
      x: m[0]*x + m[4]*y + m[8]*z + m[12],
      y: m[1]*x + m[5]*y + m[9]*z + m[13],
      z: m[2]*x + m[6]*y + m[10]*z + m[14],
    };
  }

  private normalize(v: { x:number;y:number;z:number }): { x:number;y:number;z:number } {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
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

    // Restaurar estado GL del pase de tapas
    gl.depthMask(true);
    if (!wasBlend) gl.disable(gl.BLEND); else gl.enable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (prevProgram) gl.useProgram(prevProgram as any);

    // Núcleo: esfera roja simple (100u diámetro), con depth test habilitado para respetar oclusión.
    if (this.coreVB && this.coreCB && this.coreIB && shaderManager?.basicProgram) {
      const wasBlend2 = gl.getParameter(gl.BLEND);
      const wasDepth2 = gl.getParameter(gl.DEPTH_TEST);
      const prevProg2 = gl.getParameter(gl.CURRENT_PROGRAM);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.enable(gl.DEPTH_TEST);
  // Important: write depth for the core so distant billboards behind it get occluded.
  // Previously we left depthMask(false) which caused sprites to draw over the core through the hole.
  gl.depthMask(true);
      const wasCull2 = (gl as any).isEnabled ? (gl as any).isEnabled(gl.CULL_FACE) : false;
      gl.disable(gl.CULL_FACE);

      const program: WebGLProgram = shaderManager.basicProgram;
      gl.useProgram(program);
      if (shaderManager.setBasicMatrices) shaderManager.setBasicMatrices(this.modelMatrix, viewMatrix, projectionMatrix);
      else {
        const uModel = gl.getUniformLocation(program, 'u_modelMatrix');
        const uView = gl.getUniformLocation(program, 'u_viewMatrix');
        const uProj = gl.getUniformLocation(program, 'u_projectionMatrix');
        if (uModel) gl.uniformMatrix4fv(uModel, false, this.modelMatrix);
        if (uView) gl.uniformMatrix4fv(uView, false, viewMatrix);
        if (uProj) gl.uniformMatrix4fv(uProj, false, projectionMatrix);
      }
      const aPos = gl.getAttribLocation(program, 'a_position');
      const aCol = gl.getAttribLocation(program, 'a_color');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.coreVB);
      if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0); }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.coreCB);
      if (aCol >= 0) { gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.coreIB);
      gl.drawElements(gl.TRIANGLES, this.coreIndexCount, gl.UNSIGNED_SHORT, 0);
      if (aPos >= 0) gl.disableVertexAttribArray(aPos);
      if (aCol >= 0) gl.disableVertexAttribArray(aCol);
      gl.depthMask(true);
      if (!wasBlend2) gl.disable(gl.BLEND); else gl.enable(gl.BLEND);
      if (wasDepth2) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
      if (wasCull2) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
      if (prevProg2) gl.useProgram(prevProg2 as any);
    }

    // Lightning sparks over core surface disabled (kept for reference behind flag)
    if (this.enableCoreLightning) {
      this.renderCoreLightning(gl as unknown as WebGL2RenderingContext, shaderManager, viewMatrix, projectionMatrix);
    }
    // Procedural storm shell around the core (procedural veins)
    this.renderStormShell(gl as unknown as WebGL2RenderingContext, shaderManager, viewMatrix, projectionMatrix);
  }

  private renderCoreLightning(gl: WebGL2RenderingContext, shaderManager: any, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.lightningBursts.length) return;
    if (!shaderManager?.glowProgram) return;
    const { right, up } = this.extractCameraBasis(viewMatrix);
    const fwd = this.normalize({
      x: up.y * right.z - up.z * right.y,
      y: up.z * right.x - up.x * right.z,
      z: up.x * right.y - up.y * right.x,
    });
    const aPos = shaderManager.glowAttributes?.['position'];
    const aUv = shaderManager.glowAttributes?.['uv'];
    const aCol = shaderManager.glowAttributes?.['color'];
    if (aPos == null || aUv == null || aCol == null) return;

    // GL state: additive glow, test depth but don't write to keep core depth
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);

  shaderManager.useGlowProgram();
  // IMPORTANT: We're building quad vertices in WORLD space, so use identity model matrix like Sun.renderGlow
  const I = new Float32Array([1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1]);
  shaderManager.setGlowMatrices(I, viewMatrix, projectionMatrix);

    // Reusable buffers allocated once per draw-call batch
    const vbo = gl.createBuffer()!;
    const ubo = gl.createBuffer()!;
    const cbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);

    for (const b of this.lightningBursts) {
      // Phase computation
      const t = b.elapsed;
      let cover = 0; // [0..1] visible portion along arc
      let flashMul = 1.0;
      if (t < b.rise) {
        // Ease-in cubic for smoother growth
        const x = Math.max(0, Math.min(1, t / b.rise));
        cover = x * x * (3 - 2 * x);
      } else if (t < b.rise + b.flash) {
        cover = 1.0;
        flashMul = 2.2; // super-bright window
      } else {
        cover = 1.0;
        const td = Math.max(0, Math.min(1, (t - b.rise - b.flash) / b.decay));
        flashMul = 1.0 - 0.9 * td; // fade to ~10% of base at the end
      }

      // Slight per-burst jitter for flicker
      const intensity = Math.min(1.0, b.color[3] * flashMul * (0.9 + Math.random() * 0.25));
      const col = new Float32Array([
        b.color[0], b.color[1], b.color[2], intensity,
        b.color[0], b.color[1], b.color[2], intensity,
        b.color[0], b.color[1], b.color[2], intensity,
        b.color[0], b.color[1], b.color[2], intensity,
      ]);

      // Determine how many segments to show
      const segCount = Math.max(0, b.pointsObj.length - 1);
      const visible = Math.max(1, Math.floor(segCount * cover));
      if (visible <= 0) continue;

      // Precompute world radius and epsilon
      const Rw = (this as any).scale?.x || 1;
      const coreRobj = 50 / Rw;
      const epsObj = 1.0 / Rw; // 1u outward

      for (let i = 0; i < visible; i++) {
        const pa = b.pointsObj[i];
        const pb = b.pointsObj[i + 1];
        const aObj: [number, number, number] = [pa[0] * (coreRobj + epsObj), pa[1] * (coreRobj + epsObj), pa[2] * (coreRobj + epsObj)];
        const bObj: [number, number, number] = [pb[0] * (coreRobj + epsObj), pb[1] * (coreRobj + epsObj), pb[2] * (coreRobj + epsObj)];
        const aw = this.objToWorld(aObj);
        const bw = this.objToWorld(bObj);
        // Segment basis
        const dir = this.normalize({ x: bw.x - aw.x, y: bw.y - aw.y, z: bw.z - aw.z });
        let side = this.normalize({ x: dir.y * fwd.z - dir.z * fwd.y, y: dir.z * fwd.x - dir.x * fwd.z, z: dir.x * fwd.y - dir.y * fwd.x });
        // Guard against degenerate side
        if (Math.hypot(side.x, side.y, side.z) < 1e-4) side = { ...up };
        const halfLen = 0.5 * Math.hypot(bw.x - aw.x, bw.y - aw.y, bw.z - aw.z) * 1.02; // slight overshoot
        const halfWid = Math.max(0.5, b.width * 0.5);
        const cx = (aw.x + bw.x) * 0.5, cy = (aw.y + bw.y) * 0.5, cz = (aw.z + bw.z) * 0.5;
        const tl = { x: cx - dir.x * halfLen + side.x * halfWid, y: cy - dir.y * halfLen + side.y * halfWid, z: cz - dir.z * halfLen + side.z * halfWid };
        const tr = { x: cx + dir.x * halfLen + side.x * halfWid, y: cy + dir.y * halfLen + side.y * halfWid, z: cz + dir.z * halfLen + side.z * halfWid };
        const br = { x: cx + dir.x * halfLen - side.x * halfWid, y: cy + dir.y * halfLen - side.y * halfWid, z: cz + dir.z * halfLen - side.z * halfWid };
        const bl = { x: cx - dir.x * halfLen - side.x * halfWid, y: cy - dir.y * halfLen - side.y * halfWid, z: cz - dir.z * halfLen - side.z * halfWid };

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
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, ubo);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
        gl.bufferData(gl.ARRAY_BUFFER, col, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(aCol);
        gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }
    }

    // Restore state and cleanup
  gl.depthMask(true);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (prevProg) gl.useProgram(prevProg as any);
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

  private renderStormShell(gl: WebGL2RenderingContext, shaderManager: any, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.coreVB || !this.coreIB || !shaderManager?.stormShellProgram) return;
    // GL state: additive blending, depth test on, no depth writes; draw both sides
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const wasCull = gl.isEnabled(gl.CULL_FACE);
    const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    shaderManager.useStormShellProgram();
    shaderManager.setStormShellMatrices(this.modelMatrix, viewMatrix, projectionMatrix);
    // Parameters
    const time = this.stormTime;
    const intensity = 1.0; // base intensity
    // Smooth flash strength (ease out)
    const fr = this.stormFlashRemaining;
    const flash = fr > 0 ? Math.min(1.0, fr / 0.25) : 0.0;
    // Colors: base lava-ish, vein bright
    const base = new Float32Array([1.0, 0.35, 0.08]);
    const vein = new Float32Array([1.0, 0.95, 0.85]);
    const shellScale = 1.08; // 54u world if core is 50u
    shaderManager.setStormShellParams(time, intensity, flash, shellScale, base, vein);

    // Bind buffers and draw
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coreVB);
    const aPos = shaderManager.stormShellAttributes['position'];
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.coreIB);
    gl.drawElements(gl.TRIANGLES, this.coreIndexCount, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(aPos);

    // Restore state
    gl.depthMask(true);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if (prevProg) gl.useProgram(prevProg as any);
  }

  // --- Gestión de texturas de hemisferio (cargadas on-demand) ---
  // Texturas de hemisferios: se retiró el camino de renderizado directo unlit para estabilidad.

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
    const nNear = Math.max(0, Math.round(debrisCount * 0.6));
    const nMid  = Math.max(0, Math.round(debrisCount * 0.25));
    const nFar  = Math.max(0, debrisCount - nNear - nMid);

    const addBelt = (count: number, rangeMin: number, rangeMax: number, radialJitter: number, label: string, thicknessFactor: number, angleJitterFactor: number = 0.4) => {
      // Stratified angular distribution to avoid clumps (even spacing with small jitter)
      const offset = Math.random() * 2 * Math.PI;
      const step = (2 * Math.PI) / Math.max(1, count);
      for (let i = 0; i < count; i++) {
        const jitterA = (Math.random() - 0.5) * step * angleJitterFactor;
        const t = offset + (i + 0.5) * step + jitterA;
        const mul = rangeMin + Math.random() * (rangeMax - rangeMin);
        // Increase radial jitter a bit to widen spacing
        const r = R * mul * (1 + (Math.random() - 0.5) * radialJitter);
        const x = Math.cos(t) * r;
        const z = Math.sin(t) * r;
        // Dispersión vertical entre hemisferios: más grueso cerca, delgado lejos (amplitud aumentada)
        const sep = separation;
        const maxHalf = sep * 0.5; // límite natural entre hemisferios
        // Mantener los mega-asteroides lejos de intersecar semiesferas: limitar banda vertical
        const safetyMargin = Math.min(12, maxHalf * 0.08); // margen en unidades mundo
        const baseAmp = Math.max(0, Math.min(maxHalf - safetyMargin, sep * thicknessFactor));
        const amp = baseAmp * (0.65 + Math.random() * 0.5);
        const yOffset = (Math.random() < 0.5 ? -1 : 1) * (Math.random() * amp);
        const pos: Vector3 = { x: initialPos.x + x, y: initialPos.y + yOffset, z: initialPos.z + z };
        // Slightly smaller base sizes for large counts; MegaAsteroid constructor multiplies size drastically
        const size = 0.6 * (0.7 + Math.random() * 0.6);
        debris.push(new MegaAsteroid(`${id}-mega-${label}-${i}`, pos, size));
      }
    };

  // Dense inner belt hugging the cut (más disperso que antes, pero aún cercano)
  addBelt(nNear, 0.95, 1.25, 0.12, 'near', 0.45, 0.35);
  // Medium belt hinting ejection (expandido)
  addBelt(nMid, 1.5, 2.1, 0.20, 'mid', 0.30, 0.4);
  // Far scattered ejecta (más amplio)
  addBelt(nFar, 2.2, 3.2, 0.30, 'far', 0.20, 0.45);
    return { planet, debris };
  }
}
