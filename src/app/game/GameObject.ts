import { Vector3, Color } from '../types/game.types';
import { TargetType } from './types/targeting.types';

/**
 * Clase base para todos los objetos 3D del juego
 */
export abstract class GameObject {
  public id: string;
  public position: Vector3;
  public rotation: Vector3;
  public scale: Vector3;
  public velocity: Vector3;
  public angularVelocity: Vector3;
  public color: Color;
  public active: boolean;
  public visible: boolean;
  public boundingSphere: { center: Vector3; radius: number } | null = null;
  // Opacidad de renderizado (0..1). Útil para transiciones/fades.
  public renderOpacity: number = 1.0;

  // Sistema de salud básico común a todos los objetos espaciales
  protected _healthCurrent: number; // Backing field
  public healthMax: number;
  
  // Getter/setter básico para healthCurrent (puede ser overridden en subclases)
  public get healthCurrent(): number {
    return this._healthCurrent;
  }
  
  public set healthCurrent(value: number) {
    this._healthCurrent = value;
  }

  // Masa del vacío disponible para conversión (unidades hipotéticas)
  public voidMassUnits: number;

  // Matrices de transformación (se calculan automáticamente)
  public modelMatrix: Float32Array;
  public normalMatrix: Float32Array;

  // Datos de geometría
  public vertices: Float32Array;
  public indices: Uint16Array;
  public normals: Float32Array;
  public uvs: Float32Array;
  public colors: Float32Array; // Colores por vértice
  // Tipo del objeto espacial (fuente única de verdad para tipo/target)
  protected objectType: TargetType = TargetType.UNKNOWN;
  
  // Buffers WebGL (se crean una vez)
  public vertexBuffer: WebGLBuffer | null = null;
  public indexBuffer: WebGLBuffer | null = null;
  public normalBuffer: WebGLBuffer | null = null;
  public uvBuffer: WebGLBuffer | null = null;
  public colorBuffer: WebGLBuffer | null = null;

  constructor(
    id: string,
    position: Vector3 = { x: 0, y: 0, z: 0 },
    rotation: Vector3 = { x: 0, y: 0, z: 0 },
    scale: Vector3 = { x: 1, y: 1, z: 1 }
  ) {
    this.id = id;
    this.position = { ...position };
    this.rotation = { ...rotation };
    this.scale = { ...scale };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.color = { r: 1, g: 1, b: 1, a: 1 };
    this.active = true;
    this.visible = true;

  // Salud por defecto (se puede sobreescribir en subclases después de super())
  this.healthMax = 100;
  this._healthCurrent = this.healthMax;

  // Por defecto, sin masa del vacío (las subclases pueden asignar)
  this.voidMassUnits = 0;

    // Inicializar matrices
    this.modelMatrix = new Float32Array(16);
    this.normalMatrix = new Float32Array(16);

    // Inicializar geometría (debe ser implementado por subclases)
    this.vertices = new Float32Array(0);
    this.indices = new Uint16Array(0);
    this.normals = new Float32Array(0);
    this.uvs = new Float32Array(0);
    this.colors = new Float32Array(0);

    this.initGeometry();
    this.generateVertexColors(); // Generar colores basados en el color del objeto
    this.updateModelMatrix();
    this.computeBoundingSphere();
  }

  /**
   * Inicializa la geometría del objeto (implementado por subclases)
   */
  protected abstract initGeometry(): void;

  /**
   * Tipo de objeto/target unificado
   */
  public getObjectType(): TargetType { return this.objectType; }

  /**
   * Verifica si el objeto está activo (para filtering en targeting)
   */
  public isActive(): boolean { return this.active; }

  /**
   * Genera colores por vértice basados en el color del objeto
   */
  protected generateVertexColors(): void {
    const vertexCount = this.vertices.length / 3; // 3 componentes por vértice
    this.colors = new Float32Array(vertexCount * 3); // RGB por vértice
    
    for (let i = 0; i < vertexCount; i++) {
      const colorIndex = i * 3;
      this.colors[colorIndex] = this.color.r;     // R
      this.colors[colorIndex + 1] = this.color.g; // G
      this.colors[colorIndex + 2] = this.color.b; // B
    }
  }

  /**
   * Actualiza el buffer de colores cuando cambia el color del objeto
   */
  public updateVertexColors(gl: WebGLRenderingContext): void {
    this.generateVertexColors();
    if (this.colorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
    }
  }

  /**
   * Actualiza la lógica del objeto
   */
  public update(deltaTime: number): void {
    if (!this.active) return;

    // Aplicar velocidad
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.position.z += this.velocity.z * deltaTime;

    // Aplicar velocidad angular
    this.rotation.x += this.angularVelocity.x * deltaTime;
    this.rotation.y += this.angularVelocity.y * deltaTime;
    this.rotation.z += this.angularVelocity.z * deltaTime;

    // Normalizar rotaciones
    this.normalizeRotation();

    // Actualizar matrices
    this.updateModelMatrix();
    this.updateBoundingSphere();
  }

  /**
   * Inicializa los buffers WebGL
   */
  public initBuffers(gl: WebGLRenderingContext): void {
    // Buffer de vértices
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);

    // Buffer de índices
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    // Buffer de normales
    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);

    // Buffer de UVs
    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.uvs, gl.STATIC_DRAW);

    // Buffer de colores
    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
  }

  /**
   * Renderiza el objeto
   */
  public render(gl: WebGLRenderingContext, program: WebGLProgram, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.visible || !this.vertexBuffer) {
      return;
    }

    // Configurar atributos
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const normalLocation = gl.getAttribLocation(program, 'a_normal');
    const colorLocation = gl.getAttribLocation(program, 'a_color');
    const uvLocation = gl.getAttribLocation(program, 'a_uv');

    // Vértices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    // Normales
    if (normalLocation >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.enableVertexAttribArray(normalLocation);
      gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    }

    // Colores
    if (colorLocation >= 0 && this.colorBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    }

    // UVs
    if (uvLocation >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    }

    // Configurar uniforms
    this.setUniforms(gl, program, viewMatrix, projectionMatrix);

    // Dibujar
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Configura los uniforms del shader
   */
  protected setUniforms(gl: WebGLRenderingContext, program: WebGLProgram, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    // Matriz de modelo
    const modelLocation = gl.getUniformLocation(program, 'u_model');
    if (modelLocation) {
      gl.uniformMatrix4fv(modelLocation, false, this.modelMatrix);
    }

    // Matriz de vista
    const viewLocation = gl.getUniformLocation(program, 'u_view');
    if (viewLocation) {
      gl.uniformMatrix4fv(viewLocation, false, viewMatrix);
    }

    // Matriz de proyección
    const projectionLocation = gl.getUniformLocation(program, 'u_projection');
    if (projectionLocation) {
      gl.uniformMatrix4fv(projectionLocation, false, projectionMatrix);
    }

    // El color ahora se pasa como atributo de vértice, no como uniform
  }

  /**
   * Actualiza la matriz de modelo
   */
  public updateModelMatrix(): void {
    // Resetear matriz
    this.identityMatrix(this.modelMatrix);

    // 1. Trasladar al punto donde queremos que esté el objeto
    this.translate(this.modelMatrix, this.position.x, this.position.y, this.position.z);
    
    // 2. VOLVER AL SISTEMA SIMPLE Y ESTABLE
    // Aplicar rotaciones en orden estándar X→Y→Z
    this.rotateX(this.modelMatrix, this.rotation.x); // Pitch
    this.rotateY(this.modelMatrix, this.rotation.y); // Yaw  
    this.rotateZ(this.modelMatrix, this.rotation.z); // Roll
    
    // 3. Aplicar escala
    this.scaleMatrix(this.modelMatrix, this.scale.x, this.scale.y, this.scale.z);
  }

  /**
   * Calcula el bounding sphere
   */
  private computeBoundingSphere(): void {
    if (this.vertices.length === 0) return;

    let maxDistSq = 0;
    for (let i = 0; i < this.vertices.length; i += 3) {
      const x = this.vertices[i] * this.scale.x;
      const y = this.vertices[i + 1] * this.scale.y;
      const z = this.vertices[i + 2] * this.scale.z;
      const distSq = x * x + y * y + z * z;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
      }
    }

    this.boundingSphere = {
      center: { ...this.position },
      radius: Math.sqrt(maxDistSq)
    };
  }

  /**
   * Actualiza la posición del bounding sphere
   */
  private updateBoundingSphere(): void {
    if (this.boundingSphere) {
      this.boundingSphere.center = { ...this.position };
    }
  }

  /**
   * Normaliza las rotaciones entre 0 y 2π
   */
  private normalizeRotation(): void {
    this.rotation.x = this.rotation.x % (2 * Math.PI);
    this.rotation.y = this.rotation.y % (2 * Math.PI);
    this.rotation.z = this.rotation.z % (2 * Math.PI);
  }

  /**
   * Verifica colisión con otro objeto
   */
  public checkCollision(other: GameObject): boolean {
    if (!this.boundingSphere || !other.boundingSphere) return false;

    const dx = this.boundingSphere.center.x - other.boundingSphere.center.x;
    const dy = this.boundingSphere.center.y - other.boundingSphere.center.y;
    const dz = this.boundingSphere.center.z - other.boundingSphere.center.z;
    
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const radiusSum = this.boundingSphere.radius + other.boundingSphere.radius;
    
    return distanceSq <= radiusSum * radiusSum;
  }

  /**
   * Limpia los buffers WebGL
   */
  public destroy(gl: WebGLRenderingContext): void {
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    if (this.normalBuffer) gl.deleteBuffer(this.normalBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
  }

  // Funciones auxiliares para matrices (implementación básica)
  protected identityMatrix(matrix: Float32Array): void {
    matrix.fill(0);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  }

  protected translate(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[12] += x;
    matrix[13] += y;
    matrix[14] += z;
  }

  protected rotateX(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[4] = temp[4] * cos + temp[8] * sin;
    matrix[5] = temp[5] * cos + temp[9] * sin;
    matrix[6] = temp[6] * cos + temp[10] * sin;
    matrix[8] = temp[8] * cos - temp[4] * sin;
    matrix[9] = temp[9] * cos - temp[5] * sin;
    matrix[10] = temp[10] * cos - temp[6] * sin;
  }

  protected rotateY(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos - temp[8] * sin;
    matrix[1] = temp[1] * cos - temp[9] * sin;
    matrix[2] = temp[2] * cos - temp[10] * sin;
    matrix[8] = temp[0] * sin + temp[8] * cos;
    matrix[9] = temp[1] * sin + temp[9] * cos;
    matrix[10] = temp[2] * sin + temp[10] * cos;
  }

  protected rotateZ(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos + temp[4] * sin;
    matrix[1] = temp[1] * cos + temp[5] * sin;
    matrix[2] = temp[2] * cos + temp[6] * sin;
    matrix[4] = temp[4] * cos - temp[0] * sin;
    matrix[5] = temp[5] * cos - temp[1] * sin;
    matrix[6] = temp[6] * cos - temp[2] * sin;
  }

  protected scaleMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[0] *= x;
    matrix[1] *= x;
    matrix[2] *= x;
    matrix[4] *= y;
    matrix[5] *= y;
    matrix[6] *= y;
    matrix[8] *= z;
    matrix[9] *= z;
    matrix[10] *= z;
  }

  /**
   * Multiplica dos matrices 4x4: result = a * b
   */
  protected multiplyMatrix4x4(a: Float32Array, b: Float32Array, result: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i * 4 + k] * b[k * 4 + j];
        }
        result[i * 4 + j] = sum;
      }
    }
  }

  /**
   * Crea matriz de rotación aeroespacial correcta (intrinsic rotations)
   * Usa el orden Yaw-Pitch-Roll (Y-X-Z) para navegación de nave espacial
   */
  protected createRotationMatrix(result: Float32Array, pitch: number, yaw: number, roll: number): void {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    const cosZ = Math.cos(roll);
    const sinZ = Math.sin(roll);

    // Matriz de rotación compuesta para orden intrinsic Y-X-Z
    // Esta fórmula garantiza rotaciones locales correctas
    result[0] = cosY * cosZ + sinY * sinX * sinZ;
    result[1] = cosX * sinZ;
    result[2] = -sinY * cosZ + cosY * sinX * sinZ;
    result[3] = 0;

    result[4] = -cosY * sinZ + sinY * sinX * cosZ;
    result[5] = cosX * cosZ;
    result[6] = sinY * sinZ + cosY * sinX * cosZ;
    result[7] = 0;

    result[8] = sinY * cosX;
    result[9] = -sinX;
    result[10] = cosY * cosX;
    result[11] = 0;

    result[12] = 0;
    result[13] = 0;
    result[14] = 0;
    result[15] = 1;
  }
}