// Threshold maps for ordered dithering. Pure functions, no DOM, so Node tests can import them.

// Bayer matrix of side n (a power of two), values 0..n*n-1, built by the usual recursion.
export function bayer(n) {
  if (n === 1) return [[0]];
  const h = bayer(n / 2);
  const m = [];
  for (let y = 0; y < n; y++) {
    m.push([]);
    for (let x = 0; x < n; x++) {
      const q = [0, 2, 3, 1][(y < n / 2 ? 0 : 2) + (x < n / 2 ? 0 : 1)];
      m[y].push(4 * h[y % (n / 2)][x % (n / 2)] + q);
    }
  }
  return m;
}

// Small seeded PRNG (mulberry32) so the blue-noise tile is the same on every load.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Blue-noise rank map by Ulichney's void-and-cluster method on a torus.
// Returns Uint16Array of length size*size holding each pixel's rank 0..size*size-1.
export function blueNoise(size = 64, sigma = 1.5, seed = 7) {
  const N = size * size;
  const kern = new Float64Array(N);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - x);
      const dy = Math.min(y, size - y);
      kern[y * size + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  const on = new Uint8Array(N);
  const energy = new Float64Array(N);
  const splat = (p, sign) => {
    const px = p % size;
    const py = (p / size) | 0;
    for (let y = 0; y < size; y++) {
      const ky = ((y - py + size) % size) * size;
      const row = y * size;
      for (let x = 0; x < size; x++) energy[row + x] += sign * kern[ky + ((x - px + size) % size)];
    }
  };
  const tightest = () => {
    let best = -1;
    let bv = -Infinity;
    for (let i = 0; i < N; i++) if (on[i] && energy[i] > bv) { bv = energy[i]; best = i; }
    return best;
  };
  const voidest = () => {
    let best = -1;
    let bv = Infinity;
    for (let i = 0; i < N; i++) if (!on[i] && energy[i] < bv) { bv = energy[i]; best = i; }
    return best;
  };
  const set = (p, v) => { on[p] = v; splat(p, v ? 1 : -1); };

  // Initial pattern: 10% random points, relaxed until removing the tightest cluster and filling the largest void meet.
  const rand = rng(seed);
  const start = Math.round(N / 10);
  let placed = 0;
  while (placed < start) {
    const p = Math.floor(rand() * N);
    if (!on[p]) { set(p, 1); placed++; }
  }
  for (let guard = 0; guard < N * 4; guard++) {
    const t = tightest();
    set(t, 0);
    const v = voidest();
    if (v === t) { set(t, 1); break; }
    set(v, 1);
  }

  const rank = new Uint16Array(N);
  const proto = on.slice();
  const protoE = energy.slice();
  // Phase 1: rank the starting points by peeling off the tightest cluster.
  for (let r = start - 1; r >= 0; r--) {
    const t = tightest();
    set(t, 0);
    rank[t] = r;
  }
  // Phases 2 and 3: from the starting pattern, fill the largest void until full.
  on.set(proto);
  energy.set(protoE);
  for (let r = start; r < N; r++) {
    const v = voidest();
    set(v, 1);
    rank[v] = r;
  }
  return rank;
}

// Flatten a threshold map to bytes for an R8 texture: (rank + 0.5) / N scaled to 0..255.
export function toBytes(ranks, count) {
  const out = new Uint8Array(ranks.length);
  for (let i = 0; i < ranks.length; i++) out[i] = Math.floor(((ranks[i] + 0.5) / count) * 256);
  return out;
}

export const MODES = {
  bayer4: { label: 'Bayer 4x4', size: 4 },
  bayer8: { label: 'Bayer 8x8', size: 8 },
  blue: { label: 'Blue noise', size: 64 },
  off: { label: 'Off', size: 1 },
};

// Rank list for a mode, row-major.
export function thresholdRanks(mode) {
  if (mode === 'blue') return blueNoise(64);
  if (mode === 'off') return [0];
  return bayer(MODES[mode].size).flat();
}
