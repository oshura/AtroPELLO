import {
  identityMatrix,
  translateMatrix,
  rotateZMatrix,
  scaleMatrixUniform,
} from './matrix-math';

function makeIdentity(): Float32Array {
  const m = new Float32Array(16);
  identityMatrix(m);
  return m;
}

describe('matrix-math', () => {
  it('identityMatrix produce la identidad', () => {
    const m = makeIdentity();
    expect(Array.from(m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('translateMatrix sitúa la traslación en la columna 4', () => {
    const m = makeIdentity();
    translateMatrix(m, 5, -3, 7);
    expect(m[12]).toBe(5);
    expect(m[13]).toBe(-3);
    expect(m[14]).toBe(7);
  });

  it('scaleMatrixUniform escala la base 3x3', () => {
    const m = makeIdentity();
    scaleMatrixUniform(m, 2);
    expect(m[0]).toBe(2);
    expect(m[5]).toBe(2);
    expect(m[10]).toBe(2);
    expect(m[15]).toBe(1);
  });

  it('rotateZMatrix por 90° lleva +X a +Y (column-major)', () => {
    const m = makeIdentity();
    rotateZMatrix(m, Math.PI / 2);
    // La primera columna (eje X transformado) pasa a ~(0,1,0).
    expect(m[0]).toBeCloseTo(0, 6);
    expect(m[1]).toBeCloseTo(1, 6);
  });
});
