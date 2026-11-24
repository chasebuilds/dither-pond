import test from 'node:test';
import assert from 'node:assert/strict';
import { bayer, blueNoise, toBytes, rng } from '../src/dither.js';
import { sample, clockLabel, KEYS } from '../src/time.js';

const isPermutation = (arr, n) => {
  const seen = new Set(arr);
  return arr.length === n && seen.size === n && Math.min(...arr) === 0 && Math.max(...arr) === n - 1;
};

test('bayer 4x4 matches the textbook matrix', () => {
  assert.deepEqual(bayer(4), [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]);
});

test('bayer 8x8 is a permutation and every aligned 2x2 block spans all four quarters of the range', () => {
  const m = bayer(8);
  assert.ok(isPermutation(m.flat(), 64));
  // So a flat 25%, 50% or 75% gray turns on exactly 1, 2 or 3 pixels of every 2x2 block.
  for (let y = 0; y < 8; y += 2) {
    for (let x = 0; x < 8; x += 2) {
      const q = [m[y][x], m[y][x + 1], m[y + 1][x], m[y + 1][x + 1]].map((v) => Math.floor(v / 16)).sort();
      assert.deepEqual(q, [0, 1, 2, 3]);
    }
  }
});

// Power at low spatial frequencies (radius < 8 of 64) of a 50% threshold pattern, via a direct DFT.
function lowFreqPower(ranks, size) {
  const N = size * size;
  const bits = Array.from(ranks, (r) => (r < N / 2 ? 1 : 0) - 0.5);
  let total = 0;
  for (let v = -7; v <= 7; v++) {
    for (let u = -7; u <= 7; u++) {
      if ((u === 0 && v === 0) || u * u + v * v >= 64) continue;
      let re = 0;
      let im = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const a = (-2 * Math.PI * (u * x + v * y)) / size;
          re += bits[y * size + x] * Math.cos(a);
          im += bits[y * size + x] * Math.sin(a);
        }
      }
      total += re * re + im * im;
    }
  }
  return total;
}

test('blue noise is a full rank map with far less low-frequency energy than white noise', () => {
  const size = 64;
  const ranks = blueNoise(size);
  assert.ok(isPermutation(Array.from(ranks), size * size));
  assert.deepEqual(Array.from(blueNoise(size)), Array.from(ranks), 'same seed gives the same tile');
  const rand = rng(99);
  const white = Array.from({ length: size * size }, (_, i) => i);
  for (let i = white.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [white[i], white[j]] = [white[j], white[i]];
  }
  const ratio = lowFreqPower(ranks, size) / lowFreqPower(white, size);
  console.log(`low-frequency power, blue noise / white noise: ${(ratio * 100).toFixed(1)}%`);
  assert.ok(ratio < 0.1, `ratio ${ratio}`);
});

test('threshold bytes are evenly spread across 0..255', () => {
  const b = toBytes(bayer(8).flat(), 64);
  assert.equal(Math.min(...b), 2);
  assert.equal(Math.max(...b), 254);
  const sorted = [...b].sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i] - sorted[i - 1], 4);
});

test('time keys land exactly and the light stays a unit vector', () => {
  for (const k of KEYS) {
    const s = sample(k.t);
    assert.equal(s.name, k.name);
    assert.ok(Math.abs(s.clock - k.clock) < 1e-9);
  }
  for (let t = 0; t <= 1; t += 0.01) {
    const s = sample(t);
    assert.ok(Math.abs(Math.hypot(...s.light) - 1) < 1e-9);
    for (const c of [s.skyTop, s.water, s.fog, ...s.ramp]) for (const v of c) assert.ok(v >= 0 && v <= 1);
  }
});

test('the slider never jumps: 1000 steps change any color channel by under 2%', () => {
  let prev = sample(0);
  let worst = 0;
  for (let i = 1; i <= 1000; i++) {
    const s = sample(i / 1000);
    for (const key of ['skyTop', 'skyHorizon', 'water', 'fog', 'lightColor']) {
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(s[key][c] - prev[key][c]));
    }
    s.ramp.forEach((col, j) => col.forEach((v, c) => { worst = Math.max(worst, Math.abs(v - prev.ramp[j][c])); }));
    prev = s;
  }
  assert.ok(worst < 0.02, `largest step ${worst}`);
});

test('night is darker than day and only night shows the moon', () => {
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  assert.ok(lum(sample(1).skyTop) < lum(sample(0.34).skyTop) / 4);
  assert.equal(sample(0.34).moon, 0);
  assert.equal(sample(1).moon, 1);
  assert.equal(sample(-5).t, 0);
  assert.equal(sample(Number.NaN).t, 0);
});

test('clock labels', () => {
  assert.equal(clockLabel(6.2), '6:12 am');
  assert.equal(clockLabel(12.5), '12:30 pm');
  assert.equal(clockLabel(0), '12:00 am');
  assert.equal(clockLabel(23.999), '12:00 am');
});

test('cyclist legs keep their length through a full pedal turn', async () => {
  const { knee } = await import('../src/motion.js');
  const hip = [0.98, -0.12];
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    const foot = [0.34 + Math.sin(a) * 0.17, 0.02 + Math.cos(a) * 0.17];
    const [ky, kz] = knee(hip[0], hip[1], foot[0], foot[1], 0.5, 0.5);
    assert.ok(Math.abs(Math.hypot(ky - hip[0], kz - hip[1]) - 0.5) < 1e-6, 'thigh length');
    assert.ok(Math.abs(Math.hypot(ky - foot[0], kz - foot[1]) - 0.5) < 1e-6, 'shin length');
    assert.ok(kz > Math.min(hip[1], foot[1]), 'knee bends forward');
  }
});

test('head cycles go fully down inside the drink window and fully up outside it', async () => {
  const { headCycle, gust } = await import('../src/motion.js');
  assert.equal(headCycle(6, 11, 0, 5, 8.6, 1.1).pose, 1);
  assert.equal(headCycle(6, 11, 0, 5, 8.6, 1.1).down, true);
  assert.equal(headCycle(1, 11, 0, 5, 8.6, 1.1).pose, 0);
  assert.equal(headCycle(12, 11, 0, 5, 8.6, 1.1).pose, 0, 'wraps every period');
  for (let t = 0; t < 60; t += 0.5) assert.ok(gust(0.5, t) >= 0 && gust(0.5, t) <= 0.5 * 1.35 + 1e-9);
  assert.equal(gust(0, 10), 0, 'no wind means no gusts');
});
