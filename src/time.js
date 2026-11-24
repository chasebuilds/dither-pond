// Time of day: t runs 0 (dawn) to 1 (night). Every look parameter is keyed here and blended
// with smoothstep, so the slider never jumps. Pure data and math; Node tests import it.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// ramp: four tones the dither pass picks between, dark to light.
// light: direction toward the main light (sun, then moon). sun/moon: how visible each disc is.
export const KEYS = [
  {
    t: 0, name: 'Dawn', clock: 6.2,
    ramp: ['#1d2236', '#56456a', '#cf8a78', '#f5dbb7'],
    skyTop: '#4a5a86', skyHorizon: '#f2b38e', water: '#3a3e5c', fog: '#b98d8f',
    ground: '#3c4a3a', ridge: '#5a5670', lightColor: '#ffc29a',
    light: [-0.38, 0.09, -0.92], sun: 1, moon: 0, intensity: 1.4, ambient: 0.55, night: 0, exposure: 1.05,
  },
  {
    t: 0.34, name: 'Day', clock: 12.5,
    ramp: ['#18301f', '#3c6847', '#93b98a', '#eef2d6'],
    skyTop: '#5f97c2', skyHorizon: '#cfe4dc', water: '#2f5a55', fog: '#a9c7bd',
    ground: '#4d7a3e', ridge: '#5e8a6c', lightColor: '#fff6e0',
    light: [0.15, 0.88, -0.45], sun: 1, moon: 0, intensity: 2.4, ambient: 0.9, night: 0, exposure: 0.95,
  },
  {
    t: 0.6, name: 'Golden', clock: 17.8,
    ramp: ['#261a16', '#743c22', '#d6832e', '#fbe09a'],
    skyTop: '#5d6f9e', skyHorizon: '#f4b45a', water: '#4a3c35', fog: '#d29a62',
    ground: '#5a5a2e', ridge: '#7a5a50', lightColor: '#ffb35c',
    light: [0.3, 0.2, -0.93], sun: 1, moon: 0, intensity: 1.9, ambient: 0.6, night: 0, exposure: 1,
  },
  {
    t: 0.76, name: 'Dusk', clock: 19.4,
    ramp: ['#181226', '#47283f', '#b2523a', '#f2a764'],
    skyTop: '#2b2c55', skyHorizon: '#e0704a', water: '#2a2234', fog: '#80485a',
    ground: '#2e2a2a', ridge: '#3e2c42', lightColor: '#ff8a52',
    light: [0.36, 0.05, -0.93], sun: 0.8, moon: 0.2, intensity: 1.1, ambient: 0.35, night: 0.35, exposure: 1.35,
  },
  {
    t: 1, name: 'Night', clock: 23.2,
    ramp: ['#04060d', '#0e1a33', '#2e4a73', '#c3d2e8'],
    skyTop: '#03050c', skyHorizon: '#16264a', water: '#070d1c', fog: '#0e1830',
    ground: '#0b1310', ridge: '#0a1222', lightColor: '#a9c2ff',
    light: [0.06, 0.15, -0.987], sun: 0, moon: 1, intensity: 0.75, ambient: 0.16, night: 1, exposure: 2.6,
  },
];

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'water', 'fog', 'ground', 'ridge', 'lightColor'];
const NUM_KEYS = ['sun', 'moon', 'intensity', 'ambient', 'night', 'clock', 'exposure'];

const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;
const mix3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

export const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

// Blend the two keys around t. Colors come back as [r, g, b] in 0..1, light as a unit vector.
export function sample(t) {
  const x = clamp01(t);
  let i = 0;
  while (i < KEYS.length - 2 && x > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = smooth((x - a.t) / (b.t - a.t));
  const out = { t: x, name: k < 0.5 ? a.name : b.name };
  for (const c of COLOR_KEYS) out[c] = mix3(hex(a[c]), hex(b[c]), k);
  for (const n of NUM_KEYS) out[n] = lerp(a[n], b[n], k);
  out.ramp = a.ramp.map((h, j) => mix3(hex(h), hex(b.ramp[j]), k));
  const l = mix3(a.light, b.light, k);
  const len = Math.hypot(...l);
  out.light = l.map((v) => v / len);
  return out;
}

// "6:12 am" style label for the slider readout.
export function clockLabel(hours) {
  const h = ((hours % 24) + 24) % 24;
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
  const ap = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}
