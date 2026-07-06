/**
 * Construye una malla SÓLIDA de la nave del jugador para las "réplicas atracadas" (pecios) en los puertos de
 * la estación. Fusiona los módulos reales de la nave (morro/cuerpo/cabina/tobera/alas), centra y normaliza a
 * [-1,1] y recalcula normales suaves (para que se sombree como un sólido rusty). Sin dependencia de la clase
 * Spaceship: recibe un proveedor estructural. docs/ESTACIONES.md Fase 9.
 */

interface ModuleGeometry {
  vertices: Float32Array;
  indices: Uint16Array;
}

/** Proveedor estructural: cualquier objeto que sepa generar la geometría de sus módulos (la nave del jugador). */
export interface ShipGeometrySource {
  createNoseGeometry(): ModuleGeometry;
  createBodyGeometry(): ModuleGeometry;
  createCockpitGeometry(): ModuleGeometry;
  createEngineNozzleGeometry(): ModuleGeometry;
  createWingsGeometry(): ModuleGeometry;
}

export interface WreckMesh {
  vertices: Float32Array;   // centrada y normalizada a [-1,1]
  normals: Float32Array;    // normales suaves recalculadas
  indices: Uint16Array;     // triángulos (sólido)
}

export function buildShipWreckMesh(src: ShipGeometrySource): WreckMesh {
  const modules: ModuleGeometry[] = [
    src.createNoseGeometry(),
    src.createBodyGeometry(),
    src.createCockpitGeometry(),
    src.createEngineNozzleGeometry(),
    src.createWingsGeometry(),
  ];

  const verts: number[] = [];
  const tris: number[] = [];
  let base = 0;
  for (const m of modules) {
    for (let i = 0; i < m.vertices.length; i++) {
      verts.push(m.vertices[i]);
    }
    for (let i = 0; i < m.indices.length; i++) {
      tris.push(m.indices[i] + base);
    }
    base += m.vertices.length / 3;
  }

  // Centrar por el centro de la caja englobante y normalizar (semieje mayor → 1).
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
    minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1]);
    minZ = Math.min(minZ, verts[i + 2]); maxZ = Math.max(maxZ, verts[i + 2]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const half = Math.max(maxX - cx, maxY - cy, maxZ - cz, 1e-6);
  const s = 1 / half;
  for (let i = 0; i < verts.length; i += 3) {
    verts[i] = (verts[i] - cx) * s;
    verts[i + 1] = (verts[i + 1] - cy) * s;
    verts[i + 2] = (verts[i + 2] - cz) * s;
  }

  // Normales suaves: acumular la normal de cada cara en sus vértices y normalizar.
  const normals = new Float32Array(verts.length);
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i] * 3, ib = tris[i + 1] * 3, ic = tris[i + 2] * 3;
    const ux = verts[ib] - verts[ia], uy = verts[ib + 1] - verts[ia + 1], uz = verts[ib + 2] - verts[ia + 2];
    const vx = verts[ic] - verts[ia], vy = verts[ic + 1] - verts[ia + 1], vz = verts[ic + 2] - verts[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }

  return { vertices: new Float32Array(verts), normals, indices: new Uint16Array(tris) };
}
