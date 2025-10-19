/// <reference lib="webworker" />

export interface TargetingSnapshot {
  vp: number[]; // 4x4 matrix, column-major
  viewport: { width: number; height: number };
  mouse: { x: number; y: number };
  positions: Float32Array; // [x,y,z,...]
  time: number;
  targetsVersion: number;
  topK?: number;
}

export interface TargetingResult {
  type: 'result';
  indices: number[]; // sorted by distance asc
  distances: number[];
  hoverIndex: number | null; // best index in positions array, or null
  bestDistance: number | null;
  time: number; // echoed
  targetsVersion: number; // echoed
}

function projectToScreen(vp: number[], x: number, y: number, z: number, width: number, height: number) {
  // vp is 16-length column-major
  const cx = vp[0] * x + vp[4] * y + vp[8]  * z + vp[12] * 1.0;
  const cy = vp[1] * x + vp[5] * y + vp[9]  * z + vp[13] * 1.0;
  const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14] * 1.0;
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15] * 1.0;
  if (cw === 0) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  // Frustum discard (optional): outside clip space
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1 || ndcZ < -1 || ndcZ > 1) {
    // Keep, but mark offscreen — still could be nearest for rough shortlist if desired
    // Here we will just return null to prefer onscreen candidates
    return null;
  }
  const sx = (ndcX * 0.5 + 0.5) * width;
  const sy = (1.0 - (ndcY * 0.5 + 0.5)) * height; // flip Y for canvas coords
  return { x: sx, y: sy };
}

addEventListener('message', (evt: MessageEvent<TargetingSnapshot>) => {
  const data = evt.data;
  if (!data || !data.positions || !data.vp) return;

  const { vp, viewport, mouse, positions, time, targetsVersion } = data;
  const width = viewport.width | 0;
  const height = viewport.height | 0;
  const topK = data.topK ?? 8;

  const n = Math.floor(positions.length / 3);
  let bestIdx: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  // Maintain a small array of topK
  const indices: number[] = [];
  const distances: number[] = [];

  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const sp = projectToScreen(vp, x, y, z, width, height);
    if (!sp) continue;
    const dx = sp.x - mouse.x;
    const dy = sp.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestIdx = i;
    }
    // Insert into topK arrays sorted
    let insertAt = distances.findIndex((val) => d2 < val);
    if (insertAt === -1) insertAt = distances.length;
    indices.splice(insertAt, 0, i);
    distances.splice(insertAt, 0, d2);
    if (indices.length > topK) {
      indices.length = topK;
      distances.length = topK;
    }
  }

  const res: TargetingResult = {
    type: 'result',
    indices,
    distances,
    hoverIndex: bestIdx,
    bestDistance: bestIdx !== null ? Math.sqrt(bestDist) : null,
    time,
    targetsVersion
  };
  (self as any).postMessage(res, []);
});

export {};
