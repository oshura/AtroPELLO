import { ClipmapManager, ClipmapRingConfig } from './clipmap-manager';
import { Vector3 } from '../../../types/game.types';

describe('ClipmapManager', () => {
  const planetCenter: Vector3 = { x: 0, y: 0, z: 0 };
  const planetRadius = 1000;
  const rings: ClipmapRingConfig[] = [
    { index: 0, innerRadius: 0, outerRadius: 120, radialSegments: 4, angularSegments: 4, updateThreshold: 10 },
    { index: 1, innerRadius: 120, outerRadius: 240, radialSegments: 4, angularSegments: 4, updateThreshold: 120 },
  ];

  const cameraStart: Vector3 = { x: 0, y: planetRadius + 10, z: 0 };

  function buildManager(gl: WebGL2RenderingContext | null = null): ClipmapManager {
    return new ClipmapManager({
      gl,
      planetCenter,
      planetRadius,
      rings,
      initialCameraPosition: cameraStart,
    });
  }

  function createMockGl(): WebGL2RenderingContext {
    const noop = () => {};
    const buffer = {} as WebGLBuffer;
    return {
      ARRAY_BUFFER: 0x8892,
      ELEMENT_ARRAY_BUFFER: 0x8893,
      STATIC_DRAW: 0x88e4,
      DYNAMIC_DRAW: 0x88e8,
      createBuffer: () => buffer,
      deleteBuffer: noop,
      bindBuffer: noop,
      bufferData: noop,
    } as unknown as WebGL2RenderingContext;
  }

  it('initializes ring handles and stats without GL context', () => {
    const manager = buildManager();
    manager.flush();
    const handle = manager.getRingHandle(0);
    expect(handle).toBeTruthy();
    expect(handle!.config.index).toBe(0);
    expect(handle!.vertexCount).toBeGreaterThan(0);
    const debug = manager.getDebugSnapshot();
    expect(debug.rings.length).toBe(2);
    expect(debug.groundRadius).toBe(planetRadius);
  });

  it('marks rings dirty when origin moves beyond threshold', () => {
    const manager = buildManager();
    const farCamera: Vector3 = { x: 200, y: planetRadius + 10, z: 0 };
    const changed = manager.updateOrigin(farCamera);
    expect(changed).toBeTrue();
    const flush = manager.flush();
    expect(flush.updated.length).toBeGreaterThan(0);
  });

  it('does not flush unchanged rings when GL context is available', () => {
    const manager = buildManager(createMockGl());
    manager.flush();
    const flush = manager.flush();
    expect(flush.updated.length).toBe(0);
  });

  it('marks specific rings dirty on demand', () => {
    const manager = buildManager();
    manager.markRingDirty(1);
    const flush = manager.flush();
    const ringIndices = flush.updated.map(stat => stat.index);
    expect(ringIndices).toContain(1);
  });
});
