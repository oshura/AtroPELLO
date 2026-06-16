/**
 * FUENTE ÚNICA de helpers de matrices 4x4 en column-major (docs/ARQUITECTURA.md Fase 5.8).
 * Mutan la matriz recibida in-place. Implementaciones idénticas a las que tenía GameEngine.
 */

export function identityMatrix(matrix: Float32Array): void {
  matrix[0] = 1; matrix[1] = 0; matrix[2] = 0; matrix[3] = 0;
  matrix[4] = 0; matrix[5] = 1; matrix[6] = 0; matrix[7] = 0;
  matrix[8] = 0; matrix[9] = 0; matrix[10] = 1; matrix[11] = 0;
  matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
}

/** Traslación (post-multiplica). */
export function translateMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
  matrix[12] += matrix[0] * x + matrix[4] * y + matrix[8] * z;
  matrix[13] += matrix[1] * x + matrix[5] * y + matrix[9] * z;
  matrix[14] += matrix[2] * x + matrix[6] * y + matrix[10] * z;
}

export function rotateXMatrix(matrix: Float32Array, angle: number): void {
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

export function rotateYMatrix(matrix: Float32Array, angle: number): void {
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

export function rotateZMatrix(matrix: Float32Array, angle: number): void {
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

export function scaleMatrixUniform(matrix: Float32Array, factor: number): void {
  matrix[0] *= factor;
  matrix[1] *= factor;
  matrix[2] *= factor;
  matrix[4] *= factor;
  matrix[5] *= factor;
  matrix[6] *= factor;
  matrix[8] *= factor;
  matrix[9] *= factor;
  matrix[10] *= factor;
}
