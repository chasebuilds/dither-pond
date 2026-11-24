// Small motion helpers shared by the subjects. Pure math, no three.js, so Node tests can run them.

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Two-bone IK in a plane: hip at (hy, hz), foot at (fy, fz), bone lengths a and b.
// Returns the knee point, bending toward +z (forward), so legs pedal like legs.
export function knee(hy, hz, fy, fz, a, b) {
  const dy = fy - hy;
  const dz = fz - hz;
  const d = Math.min(Math.hypot(dy, dz), a + b - 1e-6);
  const along = (a * a - b * b + d * d) / (2 * d);
  const up = Math.sqrt(Math.max(a * a - along * along, 0));
  const ux = dy / (Math.hypot(dy, dz) || 1);
  const uz = dz / (Math.hypot(dy, dz) || 1);
  // Perpendicular that points forward.
  let py = -uz;
  let pz = ux;
  if (pz < 0) { py = -py; pz = -pz; }
  return [hy + ux * along + py * up, hz + uz * along + pz * up];
}

// Heron strike and deer drink cycles: 0 = head up, 1 = head down at the water.
// Returns { pose, hit } where hit is true on the frame band the head is at the water.
export function headCycle(time, period, phase, downFrom, downTo, ease = 0.35) {
  const t = (((time + phase) % period) + period) % period;
  let pose = 0;
  if (t > downFrom - ease && t < downTo + ease) {
    pose = Math.min(smoothstep(downFrom - ease, downFrom, t), 1 - smoothstep(downTo, downTo + ease, t));
  }
  return { pose, down: t >= downFrom && t <= downTo, t };
}

// Wind gusts: a slow wobble around the set strength, never below zero.
export const gust = (wind, time) => Math.max(0, wind * (1 + 0.35 * Math.sin(time * 0.37) * Math.sin(time * 0.13 + 1)));
