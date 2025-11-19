import { Asteroid } from '../game-objects/Asteroid';
import { SuperAsteroid } from '../game-objects/SuperAsteroid';
import { GameObject } from '../GameObject';
import { ShaderManager } from '../ShaderManager';

/**
 * Batches and renders asteroids and super-asteroids using WebGL2 instancing.
 * - Uses the first object of each type as the shared base mesh ("model").
 * - When no instances remain for a type, its model buffers are released.
 * - Per-instance transform is provided via a_mat4 attributes (4x vec4) with divisor 1.
 * - Normals are transformed with mat3(model) which is valid for uniform scaling (our case).
 */
export class InstancedAsteroidRenderer {
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;

  // Shared model buffers per type
  private model = {
    asteroid: {
      vbo: null as WebGLBuffer | null,
      nbo: null as WebGLBuffer | null,
      ibo: null as WebGLBuffer | null,
      indexCount: 0,
      ready: false,
    },
    super: {
      vbo: null as WebGLBuffer | null,
      nbo: null as WebGLBuffer | null,
      ibo: null as WebGLBuffer | null,
      indexCount: 0,
      ready: false,
    },
  };

  // Vertex Array Objects to encapsulate attribute state per type
  private vaos: {
    asteroid: WebGLVertexArrayObject | null,
    super: WebGLVertexArrayObject | null,
  } = { asteroid: null, super: null };

  // Instance buffers per type (mat4 packed as 4x vec4)
  private instance = {
    asteroid: {
      buffer0: null as WebGLBuffer | null,
      buffer1: null as WebGLBuffer | null,
      buffer2: null as WebGLBuffer | null,
      buffer3: null as WebGLBuffer | null,
      bufferOpacity: null as WebGLBuffer | null,
      capacity: 0,
    },
    super: {
      buffer0: null as WebGLBuffer | null,
      buffer1: null as WebGLBuffer | null,
      buffer2: null as WebGLBuffer | null,
      buffer3: null as WebGLBuffer | null,
      bufferOpacity: null as WebGLBuffer | null,
      capacity: 0,
    },
  };

  constructor(gl: WebGL2RenderingContext, shaderManager: ShaderManager) {
    this.gl = gl;
    this.shaderManager = shaderManager;
  }

  // Config for near/far split to reduce popping; kept here for future tuning
  private distanceConfig = {
    far: 450.0,      // switch to flat beyond this
    near: 430.0,     // switch back to lit below this
    dwell: 0.25      // seconds to remain before switching
  };

  // Scratch buffers to avoid per-frame allocations when uploading instance matrices
  private scratch = {
    asteroid: { col0: new Float32Array(0), col1: new Float32Array(0), col2: new Float32Array(0), col3: new Float32Array(0), opacity: new Float32Array(0), count: 0 },
    super: { col0: new Float32Array(0), col1: new Float32Array(0), col2: new Float32Array(0), col3: new Float32Array(0), opacity: new Float32Array(0), count: 0 },
  };

  /** Ensure a base model exists from the first object of the list */
  private ensureModelFrom(list: GameObject[], kind: 'asteroid' | 'super'): void {
    if (this.model[kind].ready) return;
    const first = list.find(o => (kind === 'asteroid' ? (o as any) instanceof Asteroid && !((o as any) instanceof SuperAsteroid) : (o as any) instanceof SuperAsteroid));
    if (!first) return;
    // Create shared buffers from first object's geometry
    const vbo = this.gl.createBuffer();
    const nbo = this.gl.createBuffer();
    const ibo = this.gl.createBuffer();
    if (!vbo || !nbo || !ibo) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, first.vertices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, first.normals, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, ibo);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, first.indices, this.gl.STATIC_DRAW);
    this.model[kind] = { vbo, nbo, ibo, indexCount: first.indices.length, ready: true };
    // Invalidate VAO so it can be recreated with the new model buffers
    if (this.vaos[kind]) {
      this.gl.deleteVertexArray(this.vaos[kind]);
      this.vaos[kind] = null;
    }
  }

  /** Destroy model buffers if present */
  private destroyModel(kind: 'asteroid' | 'super'): void {
    const m = this.model[kind];
    if (m.vbo) this.gl.deleteBuffer(m.vbo);
    if (m.nbo) this.gl.deleteBuffer(m.nbo);
    if (m.ibo) this.gl.deleteBuffer(m.ibo);
    this.model[kind] = { vbo: null, nbo: null, ibo: null, indexCount: 0, ready: false };
    if (this.vaos[kind]) { this.gl.deleteVertexArray(this.vaos[kind]); this.vaos[kind] = null; }
  }

  /** Ensure instance buffers with capacity for count instances */
  private ensureInstanceBuffers(kind: 'asteroid' | 'super', count: number): void {
    const inst = this.instance[kind];
    if (inst.capacity >= count && inst.buffer0 && inst.buffer1 && inst.buffer2 && inst.buffer3) return;
    // Create or reallocate buffers
    const needNew = !inst.buffer0 || !inst.buffer1 || !inst.buffer2 || !inst.buffer3 || !inst.bufferOpacity;
    if (needNew) {
      inst.buffer0 = this.gl.createBuffer();
      inst.buffer1 = this.gl.createBuffer();
      inst.buffer2 = this.gl.createBuffer();
      inst.buffer3 = this.gl.createBuffer();
      inst.bufferOpacity = this.gl.createBuffer();
    }
    // Set capacity with some slack to reduce reallocs
    inst.capacity = Math.max(count, Math.floor(inst.capacity * 1.5), 16);
    // Allocate empty data stores
    const bytes = inst.capacity * 4 * 4; // 4 floats per vec4
    const empty = new Float32Array(inst.capacity * 4);
    // We'll upload real data each frame with bufferSubData; here just allocate size per column
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer0!);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, empty, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer1!);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, empty, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer2!);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, empty, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer3!);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, empty, this.gl.DYNAMIC_DRAW);
    // Opacity buffer: 1 float per instance
    const emptyOpacity = new Float32Array(inst.capacity);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.bufferOpacity!);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, emptyOpacity, this.gl.DYNAMIC_DRAW);
  }

  /** Upload instance model matrices as 4 vec4 streams */
  private uploadInstanceMatrices(kind: 'asteroid' | 'super', objects: GameObject[]): void {
    // objects[i].modelMatrix is Float32Array length 16, column-major
    const count = objects.length;
    // Prepare or grow scratch column arrays
    const sc = this.scratch[kind];
    if (sc.count < count) {
      sc.col0 = new Float32Array(count * 4);
      sc.col1 = new Float32Array(count * 4);
      sc.col2 = new Float32Array(count * 4);
      sc.col3 = new Float32Array(count * 4);
      sc.opacity = new Float32Array(count);
      sc.count = count;
    }
    const col0 = sc.col0; const col1 = sc.col1; const col2 = sc.col2; const col3 = sc.col3; const opa = sc.opacity;
    for (let i = 0; i < count; i++) {
      const m = objects[i].modelMatrix;
      // Column-major: indices 0..3, 4..7, 8..11, 12..15
      col0.set(m.subarray(0, 4), i * 4);
      col1.set(m.subarray(4, 8), i * 4);
      col2.set(m.subarray(8, 12), i * 4);
      col3.set(m.subarray(12, 16), i * 4);
      opa[i] = (objects[i] as any).renderOpacity ?? 1.0;
    }
  const inst = this.instance[kind];
    // Upload
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer0!);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, col0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer1!);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, col1);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer2!);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, col2);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer3!);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, col3);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.bufferOpacity!);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, opa);
  }

  /** Create or bind VAO, then draw */
  private drawBatch(kind: 'asteroid' | 'super', objects: GameObject[]): void {
    if (!this.model[kind].ready || objects.length === 0) return;
    const prog = this.shaderManager.instancedLitProgram;
    if (!prog) return;

    // Create VAO if missing
    if (!this.vaos[kind]) {
      const vao = this.gl.createVertexArray();
      if (!vao) return;
      this.vaos[kind] = vao;
      this.gl.bindVertexArray(vao);
      // Attribute locations
      const aPos = this.shaderManager.instancedLitAttributes['position'];
      const aNrm = this.shaderManager.instancedLitAttributes['normal'];
      const m0 = this.shaderManager.instancedLitAttributes['i_model0'];
      const m1 = this.shaderManager.instancedLitAttributes['i_model1'];
      const m2 = this.shaderManager.instancedLitAttributes['i_model2'];
      const m3 = this.shaderManager.instancedLitAttributes['i_model3'];
      const aOpacity = (this.shaderManager as any).instancedLitAttributes?.['i_opacity'] ?? -1;

      // Bind per-vertex buffers and define attribute pointers (static per model)
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.model[kind].vbo);
      this.gl.enableVertexAttribArray(aPos);
      this.gl.vertexAttribPointer(aPos, 3, this.gl.FLOAT, false, 0, 0);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.model[kind].nbo);
      if (aNrm >= 0) {
        this.gl.enableVertexAttribArray(aNrm);
        this.gl.vertexAttribPointer(aNrm, 3, this.gl.FLOAT, false, 0, 0);
      }

      // Bind index buffer
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.model[kind].ibo);

      // Instance attributes layout (only pointers and divisors; buffers will be rebound before draw)
      this.gl.enableVertexAttribArray(m0);
      this.gl.vertexAttribPointer(m0, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(m0, 1);

      this.gl.enableVertexAttribArray(m1);
      this.gl.vertexAttribPointer(m1, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(m1, 1);

      this.gl.enableVertexAttribArray(m2);
      this.gl.vertexAttribPointer(m2, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(m2, 1);

      this.gl.enableVertexAttribArray(m3);
      this.gl.vertexAttribPointer(m3, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(m3, 1);

      if (aOpacity >= 0) {
        this.gl.enableVertexAttribArray(aOpacity);
        this.gl.vertexAttribPointer(aOpacity, 1, this.gl.FLOAT, false, 0, 0);
        this.gl.vertexAttribDivisor(aOpacity, 1);
      }
    } else {
      this.gl.bindVertexArray(this.vaos[kind]);
    }

    // Rebind instance buffers to the VAO's attribute bindings. In WebGL2, the currently
    // bound ARRAY_BUFFER at gl.vertexAttribPointer time becomes part of the VAO state,
    // so we must call vertexAttribPointer again if the buffer objects change. To keep it
    // simple, we just reset the vertexAttribPointer for instance attributes with buffers.
    const m0 = this.shaderManager.instancedLitAttributes['i_model0'];
    const m1 = this.shaderManager.instancedLitAttributes['i_model1'];
    const m2 = this.shaderManager.instancedLitAttributes['i_model2'];
    const m3 = this.shaderManager.instancedLitAttributes['i_model3'];
    const aOpacity = (this.shaderManager as any).instancedLitAttributes?.['i_opacity'] ?? -1;
    const inst = this.instance[kind];
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer0!);
    this.gl.vertexAttribPointer(m0, 4, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer1!);
    this.gl.vertexAttribPointer(m1, 4, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer2!);
    this.gl.vertexAttribPointer(m2, 4, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.buffer3!);
    this.gl.vertexAttribPointer(m3, 4, this.gl.FLOAT, false, 0, 0);
    if (aOpacity >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, inst.bufferOpacity!);
      this.gl.vertexAttribPointer(aOpacity, 1, this.gl.FLOAT, false, 0, 0);
    }

    // Draw instanced
    this.gl.drawElementsInstanced(
      this.gl.TRIANGLES,
      this.model[kind].indexCount,
      this.gl.UNSIGNED_SHORT,
      0,
      objects.length
    );
    // Unbind VAO to avoid accidental state bleed
    this.gl.bindVertexArray(null);
  }

  /** Public render entry: render asteroids and supers in two instanced draws */
  renderBatches(
    asteroids: GameObject[],
    supers: GameObject[],
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    lightDirection: Float32Array,
    lightColor: Float32Array,
    ambientColor: Float32Array,
    ambientStrength: number,
    baseColor: Float32Array
  ): void {
    // Cull invisible/inactive
    const aList = asteroids.filter(o => (o as any).visible && (o as any).active);
    const sList = supers.filter(o => (o as any).visible && (o as any).active);

    // Manage model lifecycle
    if (aList.length === 0 && this.model.asteroid.ready) this.destroyModel('asteroid');
    if (sList.length === 0 && this.model.super.ready) this.destroyModel('super');
    this.ensureModelFrom(aList, 'asteroid');
    this.ensureModelFrom(sList, 'super');

    // Nothing to render
    if (aList.length === 0 && sList.length === 0) return;

    // Use program and set common uniforms
    this.shaderManager.useInstancedLitProgram();
    this.shaderManager.setInstancedMatrices(viewMatrix, projectionMatrix);
    this.shaderManager.setInstancedLighting(lightDirection, lightColor, ambientColor, ambientStrength);
    this.shaderManager.setInstancedBaseColor(baseColor);

    // Asteroids batch
    if (aList.length > 0 && this.model.asteroid.ready) {
      this.ensureInstanceBuffers('asteroid', aList.length);
      this.uploadInstanceMatrices('asteroid', aList);
      this.drawBatch('asteroid', aList);
    }

    // Super-asteroids batch
    if (sList.length > 0 && this.model.super.ready) {
      this.ensureInstanceBuffers('super', sList.length);
      this.uploadInstanceMatrices('super', sList);
      this.drawBatch('super', sList);
    }
  }

  dispose(): void {
    this.destroyModel('asteroid');
    this.destroyModel('super');
    const destroyInst = (k: 'asteroid' | 'super') => {
      const i = this.instance[k];
      if (i.buffer0) this.gl.deleteBuffer(i.buffer0);
      if (i.buffer1) this.gl.deleteBuffer(i.buffer1);
      if (i.buffer2) this.gl.deleteBuffer(i.buffer2);
      if (i.buffer3) this.gl.deleteBuffer(i.buffer3);
      if (i.bufferOpacity) this.gl.deleteBuffer(i.bufferOpacity);
      this.instance[k] = { buffer0: null, buffer1: null, buffer2: null, buffer3: null, bufferOpacity: null, capacity: 0 } as any;
    };
    destroyInst('asteroid');
    destroyInst('super');
  }
}
