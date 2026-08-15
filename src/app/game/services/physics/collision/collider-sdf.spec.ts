import {
  computeShapesBoundRadius,
  evaluateShapes,
  sdfBox,
  sdfSphere,
  sdfTorus,
  torusSegmentIndex,
} from './collider-sdf';
import { BoxShape, SdfContact, SphereShape, StructuredShape, TorusShape } from './collision-shape.types';

/** Toro de la estación humana (espacio unidad): R=0.80, tubo=0.13, 48 segmentos, boquetes reales. */
const STATION_TORUS: TorusShape = {
  kind: 'torus',
  center: [0, 0, 0],
  ringRadius: 0.8,
  tubeRadius: 0.13,
  segments: 48,
  gapSegments: [6, 7, 8, 9, 30, 31],
};

function contact(): SdfContact {
  return { distance: 0, nx: 0, ny: 0, nz: 0, shapeIndex: -1 };
}

describe('collider-sdf', () => {
  describe('sdfSphere', () => {
    const s: SphereShape = { kind: 'sphere', center: [1, 0, 0], radius: 2 };

    it('mide distancia con signo desde la superficie', () => {
      expect(sdfSphere(s, 5, 0, 0)).toBeCloseTo(2, 10);   // fuera
      expect(sdfSphere(s, 3, 0, 0)).toBeCloseTo(0, 10);   // en superficie
      expect(sdfSphere(s, 1, 0, 0)).toBeCloseTo(-2, 10);  // centro
    });
  });

  describe('sdfBox', () => {
    const b: BoxShape = { kind: 'box', center: [0, 0, 0], half: [1, 2, 3] };

    it('mide caras, aristas y el interior', () => {
      expect(sdfBox(b, 5, 0, 0)).toBeCloseTo(4, 10);            // frente a cara X
      expect(sdfBox(b, 2, 3, 0)).toBeCloseTo(Math.SQRT2, 10);   // arista XY a (1,1) de distancia
      expect(sdfBox(b, 0, 0, 0)).toBeCloseTo(-1, 10);           // interior: cara más próxima X
      expect(sdfBox(b, 1, 2, 3)).toBeCloseTo(0, 10);            // vértice
    });
  });

  describe('sdfTorus (convención pushTorus: plano XZ, eje Y, ángulo atan2(z,x))', () => {
    it('mide el tubo del toro de la estación', () => {
      const t: TorusShape = { ...STATION_TORUS, gapSegments: undefined };
      expect(sdfTorus(t, 0.93, 0, 0)).toBeCloseTo(0, 10);       // borde exterior
      expect(sdfTorus(t, 0.67, 0, 0)).toBeCloseTo(0, 10);       // borde interior
      expect(sdfTorus(t, 0.8, 0.13, 0)).toBeCloseTo(0, 10);     // cima del tubo
      expect(sdfTorus(t, 0.8, 0, 0)).toBeCloseTo(-0.13, 10);    // centro del tubo
      expect(sdfTorus(t, 0, 0, 0)).toBeCloseTo(0.67, 10);       // centro de la estación
      expect(sdfTorus(t, 0, 0.5, 0)).toBeCloseTo(Math.hypot(0.8, 0.5) - 0.13, 10); // sobre el eje
    });

    it('mapea el índice de segmento como la malla', () => {
      const angleOfSeg = (i: number): number => ((i + 0.5) / 48) * Math.PI * 2;
      const a5 = angleOfSeg(5);
      expect(torusSegmentIndex(STATION_TORUS, Math.cos(a5), Math.sin(a5))).toBe(5);
      const a47 = angleOfSeg(47);
      expect(torusSegmentIndex(STATION_TORUS, Math.cos(a47), Math.sin(a47))).toBe(47);
      expect(torusSegmentIndex(STATION_TORUS, 1, -1e-9)).toBe(47); // justo bajo +X cae en el último
    });

    it('los boquetes del Incidente no tienen material; los segmentos vivos sí', () => {
      const mid = (i: number): number => ((i + 0.5) / 48) * Math.PI * 2;
      const inGap = mid(7); // vecinos 6 y 8 también destruidos → material inalcanzable
      expect(sdfTorus(STATION_TORUS, 0.8 * Math.cos(inGap), 0, 0.8 * Math.sin(inGap))).toBe(Infinity);
      const alive = mid(4);
      expect(sdfTorus(STATION_TORUS, 0.8 * Math.cos(alive), 0, 0.8 * Math.sin(alive))).toBeCloseTo(-0.13, 10);
    });

    it('desde el boquete, la tapa del corte está a la distancia del plano (I0b)', () => {
      const a = (6 / 48) * Math.PI * 2; // frontera vivo(5)↔destruido(6)
      const theta = a + 0.002;          // apenas dentro del boquete, centro del tubo
      expect(sdfTorus(STATION_TORUS, 0.8 * Math.cos(theta), 0, 0.8 * Math.sin(theta)))
        .toBeCloseTo(0.8 * Math.sin(0.002), 6);
    });

    it('la tapa manda al entrar por el corte: profundidad pequeña, no la del tubo (regresión teletransporte)', () => {
      const a = (6 / 48) * Math.PI * 2;
      const theta = a - 0.002;          // apenas dentro del material, a ras de la tapa, centro del tubo
      const out = contact();
      const p: [number, number, number] = [0.8 * Math.cos(theta), 0, 0.8 * Math.sin(theta)];
      expect(evaluateShapes([STATION_TORUS], p[0], p[1], p[2], out)).toBeTrue();
      expect(out.distance).toBeCloseTo(-0.8 * Math.sin(0.002), 6); // NO −0.13 (pared radial)
      // La normal es la del plano de corte (horizontal, hacia el boquete), no la radial del tubo.
      expect(out.nx).toBeCloseTo(-Math.sin(a), 3);
      expect(out.ny).toBeCloseTo(0, 10);
      expect(out.nz).toBeCloseTo(Math.cos(a), 3);
    });
  });

  describe('normales (salientes, unitarias)', () => {
    it('esfera: radial', () => {
      const out = contact();
      evaluateShapes([{ kind: 'sphere', center: [0, 0, 0], radius: 1 }], 0, 3, 0, out);
      expect([out.nx, out.ny, out.nz]).toEqual([0, 1, 0]);
    });

    it('caja: cara exterior y cara interior', () => {
      const shapes: StructuredShape[] = [{ kind: 'box', center: [0, 0, 0], half: [1, 2, 3] }];
      const out = contact();
      evaluateShapes(shapes, 4, 0, 0, out);
      expect([out.nx, out.ny, out.nz]).toEqual([1, 0, 0]);
      evaluateShapes(shapes, -0.5, 0, 0, out); // dentro, la cara -X es la más próxima
      expect([out.nx, out.ny, out.nz]).toEqual([-1, 0, 0]);
    });

    it('toro: bajo el anillo empuja hacia ABAJO (no hacia el centro)', () => {
      const out = contact();
      evaluateShapes([{ ...STATION_TORUS, gapSegments: undefined }], 0.8, -0.2, 0, out);
      expect(out.nx).toBeCloseTo(0, 10);
      expect(out.ny).toBeCloseTo(-1, 10);
      expect(out.nz).toBeCloseTo(0, 10);
    });
  });

  describe('evaluateShapes', () => {
    const shapes: StructuredShape[] = [
      { kind: 'sphere', center: [10, 0, 0], radius: 1 },
      { kind: 'sphere', center: [0, 0, 0], radius: 1 },
    ];

    it('elige la forma más cercana y reporta su índice', () => {
      const out = contact();
      expect(evaluateShapes(shapes, 0.5, 0, 0, out)).toBeTrue();
      expect(out.shapeIndex).toBe(1);
      expect(out.distance).toBeCloseTo(-0.5, 10);
    });

    it('ignora formas deshabilitadas y devuelve false sin candidatas', () => {
      const out = contact();
      const disabled: StructuredShape[] = [{ kind: 'sphere', center: [0, 0, 0], radius: 5, enabled: false }];
      expect(evaluateShapes(disabled, 0, 0, 0, out)).toBeFalse();
    });

    it('un punto en un boquete del toro no produce contacto', () => {
      const out = contact();
      const mid = ((7 + 0.5) / 48) * Math.PI * 2;
      expect(evaluateShapes([STATION_TORUS], 0.8 * Math.cos(mid), 0, 0.8 * Math.sin(mid), out)).toBeFalse();
    });
  });

  describe('computeShapesBoundRadius (esfera de activación autocalculada)', () => {
    it('el toro de la estación da 0.93 (×800 = 744 u de mundo)', () => {
      expect(computeShapesBoundRadius([STATION_TORUS])).toBeCloseTo(0.93, 10);
    });

    it('cubre centros desplazados y toma el máximo', () => {
      const shapes: StructuredShape[] = [
        { kind: 'sphere', center: [0, -0.28, 0], radius: 0.1 },
        { kind: 'box', center: [0.42, 0, 0], half: [0.25, 0.05, 0.05] },
      ];
      const boxBound = 0.42 + Math.sqrt(0.25 ** 2 + 0.05 ** 2 + 0.05 ** 2);
      expect(computeShapesBoundRadius(shapes)).toBeCloseTo(boxBound, 10);
    });
  });
});
