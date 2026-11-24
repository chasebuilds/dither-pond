// Pickable subjects, all built from three.js primitives in code. Each one returns
// { id, group, update(ctx) } where update moves it and returns ripple sources for the water:
// [x, z, amplitude, inner radius, wavenumber]. ctx: { time, wind, chop, night, drop(x, z, s) }.
import * as THREE from 'three';
import { rng } from './dither.js';
import { knee, headCycle, smoothstep } from './motion.js';

export const ROAD_R = 19.5;
const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const unitBar = new THREE.CylinderGeometry(1, 1, 1, 5);

// A thin cylinder stretched between two points (local space of its parent).
function bar(parent, mat, r) {
  const m = new THREE.Mesh(unitBar, mat);
  m.userData.r = r;
  parent.add(m);
  return m;
}
function placeBar(m, a, b) {
  v1.subVectors(b, a);
  const len = v1.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, v1.divideScalar(len || 1));
  m.scale.set(m.userData.r, len, m.userData.r);
}
function blob(parent, mat, r, sx, sy, sz, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// Face +z toward a world point.
const faceToward = (obj, x, z) => { obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z); };

export function boat() {
  const g = new THREE.Group();
  const paint = lambert(0x3f5a3a);
  const inside = lambert(0x8c9290);
  const metal = lambert(0x2c2f33);
  const add = (geo, mat, x, y, z, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  // Flat bottom, square stern, raked bow: a small aluminum jon boat. Local +x is the bow.
  add(new THREE.BoxGeometry(3.0, 0.08, 1.2), inside, 0, 0.02, 0);
  add(new THREE.BoxGeometry(3.0, 0.42, 0.06), paint, 0, 0.23, 0.6);
  add(new THREE.BoxGeometry(3.0, 0.42, 0.06), paint, 0, 0.23, -0.6);
  add(new THREE.BoxGeometry(0.06, 0.44, 1.26), paint, -1.5, 0.24, 0);
  add(new THREE.BoxGeometry(0.75, 0.06, 1.2), inside, 1.78, 0.24, 0, 0.62);
  add(new THREE.BoxGeometry(0.08, 0.42, 1.24), paint, 2.08, 0.46, 0, 0.62);
  add(new THREE.BoxGeometry(0.32, 0.06, 1.16), inside, 0.35, 0.34, 0);
  add(new THREE.BoxGeometry(0.32, 0.06, 1.16), inside, -0.85, 0.34, 0);
  add(new THREE.BoxGeometry(0.34, 0.36, 0.3), metal, -1.68, 0.56, 0);
  add(new THREE.BoxGeometry(0.08, 0.7, 0.08), metal, -1.72, 0.15, 0);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5), metal, 1.35, 0.7, 0.45);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const lamp = add(new THREE.SphereGeometry(0.11, 10, 8), glass, 1.35, 1.17, 0.45);
  g.position.set(1.8, 0, -1.2);
  g.rotation.y = 0.5;
  const light = new THREE.PointLight(0xffb45a, 0, 9, 1.6);
  const root = new THREE.Group();
  root.add(g, light);
  const lampWorld = new THREE.Vector3();
  return {
    id: 'boat',
    group: root,
    lampWorld,
    update({ time, wind, chop, night }) {
      const rock = 0.6 + wind * 0.9 + chop * 1.6;
      g.position.y = Math.sin(time * 1.2) * 0.03 * rock - 0.05;
      g.rotation.z = Math.sin(time * (1 + chop)) * 0.025 * rock;
      g.rotation.x = Math.sin(time * 0.8 + 1) * 0.02 * rock;
      g.rotation.y = 0.5 + Math.sin(time * 0.1) * 0.12 * wind;
      g.updateMatrixWorld();
      lamp.getWorldPosition(lampWorld);
      light.position.copy(lampWorld);
      const on = smoothstep(0.25, 0.9, night);
      light.intensity = on * 6;
      glass.color.setRGB(0.25 + 0.75 * on, 0.22 + 0.58 * on, 0.18 + 0.27 * on);
      return [[g.position.x, g.position.z, 0.05 * (1 + wind * 0.8 + chop), 1.2, 5]];
    },
    lanternOn: (night) => smoothstep(0.25, 0.9, night),
  };
}

export function heron(pondRadius) {
  const a = -0.85;
  const r = pondRadius(a) - 1.0;
  const root = new THREE.Group();
  root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  faceToward(root, 2, 0);
  const grey = lambert(0x8e98a4);
  const dark = lambert(0x3a3f48);
  const beakMat = lambert(0xc9a227);
  for (const x of [-0.07, 0.07]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 4), dark);
    leg.position.set(x, 0.2, 0);
    root.add(leg);
  }
  const body = blob(root, grey, 0.2, 0.9, 0.85, 1.7, 0, 0.72, -0.02);
  body.rotation.x = -0.35;
  blob(root, dark, 0.12, 0.8, 0.5, 1.6, 0, 0.66, -0.36); // tail feathers
  const neck = new THREE.Group();
  neck.position.set(0, 0.84, 0.22);
  root.add(neck);
  const lower = bar(neck, grey, 0.045);
  const upper = bar(neck, grey, 0.04);
  placeBar(lower, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.3, 0.1));
  placeBar(upper, new THREE.Vector3(0, 0.3, 0.1), new THREE.Vector3(0, 0.56, 0.02));
  blob(neck, grey, 0.07, 1, 0.95, 1.3, 0, 0.6, 0.04);
  blob(neck, dark, 0.03, 1, 1, 3.2, 0, 0.64, -0.06); // crest plume
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.24, 5), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.59, 0.2);
  neck.add(beak);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.59, 0.32);
  neck.add(tip);
  let struck = -1;
  return {
    id: 'heron',
    group: root,
    update({ time, drop }) {
      // Stand still, then a fast strike at the water every 7 seconds.
      const c = headCycle(time, 7, 0, 4.0, 4.35, 0.18);
      neck.rotation.x = -0.15 + c.pose * 2.35 + Math.sin(time * 0.9) * 0.03;
      const cycle = Math.floor(time / 7);
      if (c.down && struck !== cycle) {
        struck = cycle;
        root.updateMatrixWorld();
        tip.getWorldPosition(v2);
        drop(v2.x, v2.z, 1.1);
      }
      return [[root.position.x, root.position.z, 0.008, 0.15, 11]];
    },
  };
}

export function deer(pondRadius) {
  const a = -2.2;
  const r = pondRadius(a) + 0.35;
  const root = new THREE.Group();
  root.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
  faceToward(root, 0, 0);
  const coat = lambert(0x8a5a36);
  const light = lambert(0xd9c3a3);
  const dark = lambert(0x2e2118);
  blob(root, coat, 0.3, 0.85, 0.95, 2.3, 0, 0.98, -0.05);
  blob(root, light, 0.08, 1, 1.2, 0.8, 0, 1.0, -0.66); // white tail
  for (const [x, z] of [[-0.14, 0.38], [0.14, 0.38], [-0.14, -0.45], [0.14, -0.45]]) {
    const leg = bar(root, coat, 0.04);
    placeBar(leg, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.85, z));
    blob(root, dark, 0.045, 1, 0.8, 1.2, x, 0.03, z + 0.02, 5);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 1.0, 0.5);
  root.add(neck);
  const n = bar(neck, coat, 0.11);
  placeBar(n, new THREE.Vector3(0, -0.05, -0.05), new THREE.Vector3(0, 0.5, 0.2));
  const head = new THREE.Group();
  head.position.set(0, 0.54, 0.24);
  neck.add(head);
  blob(head, coat, 0.11, 1, 1, 1.9, 0, 0, 0.08);
  blob(head, dark, 0.05, 1, 0.9, 1, 0, -0.02, 0.28, 6); // nose
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), coat);
    e.position.set(s * 0.09, 0.1, -0.04);
    e.rotation.z = -s * 0.7;
    head.add(e);
    return e;
  });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.02, 0.32);
  head.add(muzzle);
  let lastLap = -1;
  return {
    id: 'deer',
    group: root,
    update({ time, drop }) {
      // Look around, lower the head, lap at the water, look up again. 11 second cycle.
      const c = headCycle(time, 11, 3, 5.0, 8.6, 1.1);
      neck.rotation.x = -0.05 + c.pose * 2.15;
      head.rotation.x = 0.1 + c.pose * 0.1;
      neck.rotation.y = (1 - c.pose) * Math.sin(time * 0.4) * 0.5;
      const flick = Math.max(0, Math.sin(time * 5.3)) ** 30;
      ears[0].rotation.x = flick * 0.6;
      ears[1].rotation.x = Math.max(0, Math.sin(time * 4.1 + 2)) ** 30 * 0.6;
      const lap = Math.floor(time / 0.7);
      if (c.down && lap !== lastLap) {
        lastLap = lap;
        root.updateMatrixWorld();
        muzzle.getWorldPosition(v2);
        drop(v2.x, v2.z, 0.45);
      }
      return [];
    },
  };
}

export function ducks() {
  const mats = {
    drakeBody: lambert(0x9a958a), drakeHead: lambert(0x1f5a3a), hen: lambert(0x7a5a3a),
    bill: lambert(0xd9a531), dark: lambert(0x2a2622), white: lambert(0xe8e4da),
  };
  const root = new THREE.Group();
  const list = [0, 1, 2, 3].map((i) => {
    const d = new THREE.Group();
    const drake = i % 2 === 0;
    blob(d, drake ? mats.drakeBody : mats.hen, 0.16, 1, 0.7, 1.65, 0, 0.06, 0);
    blob(d, drake ? mats.drakeHead : mats.hen, 0.075, 1, 1, 1.1, 0, 0.22, 0.17);
    if (drake) blob(d, mats.white, 0.08, 1, 0.25, 1, 0, 0.15, 0.15, 6); // neck ring
    blob(d, mats.dark, 0.08, 1, 0.6, 1.4, 0, 0.12, -0.24, 6);
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.1), mats.bill);
    bill.position.set(0, 0.2, 0.28);
    d.add(bill);
    root.add(d);
    return d;
  });
  const center = [-4.2, -3.2];
  return {
    id: 'ducks',
    group: root,
    update({ time, wind, chop }) {
      // A loose line paddling a slow loop, the wind pushing the loop downwind a little.
      return list.map((d, i) => {
        const ang = time * 0.16 - i * 0.32;
        const R = 2.6 + Math.sin(time * 0.05 + i) * 0.3;
        const x = center[0] + Math.cos(ang) * R + wind * 0.8;
        const z = center[1] + Math.sin(ang) * R * 0.75;
        d.position.set(x, Math.sin(time * 2 + i) * 0.015 * (1 + chop * 3) - 0.02, z);
        d.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang) * 0.75);
        d.rotation.z = Math.sin(time * 1.7 + i) * 0.06 * (0.3 + chop * 2);
        return [x, z, 0.014, 0.22, 10];
      });
    },
  };
}

export function bats() {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x121014, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0.34, 0.02, 0.02, 0.26, 0, -0.1, 0, 0, -0.06, 0.12, 0, -0.06, 0.26, 0, -0.1], 3));
  wingGeo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5]);
  wingGeo.computeVertexNormals();
  const rand = rng(41);
  const list = Array.from({ length: 6 }, () => {
    const b = new THREE.Group();
    blob(b, mat, 0.05, 1, 0.9, 1.8, 0, 0, 0, 6);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(wingGeo, mat);
      w.scale.x = s;
      b.add(w);
      return w;
    });
    b.scale.setScalar(1.3);
    root.add(b);
    return { b, wings, ph: rand() * 20, sp: 0.8 + rand() * 0.5 };
  });
  return {
    id: 'bats',
    group: root,
    update({ time, night }) {
      // Out from dusk on: erratic loops over the water hunting the same bugs the fish rise for.
      root.visible = night > 0.2;
      for (const { b, wings, ph, sp } of list) {
        const t = time * sp + ph;
        const p = (s) => [Math.sin(s * 0.7) * 6 + Math.sin(s * 2.3) * 1.2, 3.2 + Math.sin(s * 1.3) * 1.1, -2.5 + Math.sin(s * 1.1 + 1) * 4];
        const [x, y, z] = p(t);
        const [nx, ny, nz] = p(t + 0.05);
        b.position.set(x, y, z);
        b.rotation.set(-(ny - y) * 4, Math.atan2(nx - x, nz - z), 0);
        const flap = Math.sin(time * 15 + ph) * 0.9;
        wings[0].rotation.z = flap;
        wings[1].rotation.z = -flap;
      }
      return [];
    },
  };
}

export function fireflies(pondRadius, VERT, FRAG, count = 70) {
  const rand = rng(31);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = pondRadius(a) + (rand() - 0.3) * 4;
    pos.set([Math.cos(a) * r, 0.4 + rand() * 1.8, Math.sin(a) * r], i * 3);
    phase[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 160 }, uWind: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  return {
    id: 'fireflies',
    group: points,
    setScale(s) { mat.uniforms.uScale.value = s; },
    update({ time, night, wind }) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uWind.value = wind;
      mat.uniforms.uNight.value = smoothstep(0.5, 1, night);
      return [];
    },
  };
}

export function cyclist() {
  const root = new THREE.Group();
  const frameMat = lambert(0xb8452e);
  const tire = lambert(0x1a1a1c);
  const metal = lambert(0x9aa0a6);
  const shirt = lambert(0x2f6f8f);
  const pants = lambert(0x26282e);
  const skin = lambert(0xc8946e);
  const helmet = lambert(0xe8e2d4);
  const bike = new THREE.Group();
  root.add(bike);
  const wheels = [0.52, -0.5].map((z) => {
    const w = new THREE.Group();
    w.position.set(0, 0.34, z);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 5, 16), tire);
    t.rotation.y = Math.PI / 2;
    w.add(t);
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.6, 0.012), metal);
      s.rotation.x = (k * Math.PI) / 3;
      w.add(s);
    }
    bike.add(w);
    return w;
  });
  const P = (y, z) => new THREE.Vector3(0, y, z);
  const crank = P(0.34, 0.02);
  const seat = P(0.9, -0.12);
  const bars = P(0.98, 0.42);
  for (const [a, b] of [[P(0.34, -0.5), crank], [crank, seat], [P(0.34, -0.5), P(0.85, -0.1)], [crank, P(0.86, 0.36)], [P(0.86, -0.1), P(0.88, 0.36)], [P(0.34, 0.52), P(0.98, 0.4)]]) {
    placeBar(bar(bike, frameMat, 0.022), a, b);
  }
  placeBar(bar(bike, metal, 0.015), P(0.98, 0.4).setX(-0.22), P(0.98, 0.4).setX(0.22));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }));
  lamp.position.set(0, 0.92, 0.48);
  bike.add(lamp);
  // Rider. Hip sits on the saddle, torso leans to the bars, legs solve to the pedals each frame.
  const hip = P(0.98, -0.12);
  const shoulder = P(1.42, 0.22);
  placeBar(bar(bike, shirt, 0.12), hip, shoulder);
  blob(bike, skin, 0.1, 1, 1.1, 1, 0, 1.6, 0.3);
  blob(bike, helmet, 0.11, 1, 0.8, 1.15, 0, 1.66, 0.28);
  for (const x of [-0.16, 0.16]) placeBar(bar(bike, shirt, 0.04), shoulder.clone().setX(x), P(0.98, 0.4).setX(x * 1.2));
  const legs = [-0.1, 0.1].map((x) => ({ x, thigh: bar(bike, pants, 0.055), shin: bar(bike, pants, 0.045), foot: blob(bike, tire, 0.05, 1, 0.6, 1.7, 0, 0, 0, 5) }));
  const speed = 3.2;
  const BRIDGE = -Math.PI / 2;
  return {
    id: 'cyclist',
    group: root,
    update({ time, night }) {
      // Loop the road around the pond; it crosses the creek on a plank bridge behind the water.
      const ang = BRIDGE - 0.9 + time * (speed / ROAD_R);
      const da = Math.abs(Math.atan2(Math.sin(ang - BRIDGE), Math.cos(ang - BRIDGE)));
      root.position.set(Math.cos(ang) * ROAD_R, 0.07 + 0.27 * (1 - smoothstep(0.05, 0.1, da)), Math.sin(ang) * ROAD_R);
      root.rotation.y = -ang;
      const spin = (time * speed) / 0.31;
      wheels.forEach((w) => { w.rotation.x = spin; });
      const c = spin * 0.42;
      legs.forEach(({ x, thigh, shin, foot }, i) => {
        const a = c + i * Math.PI;
        const fy = crank.y + Math.sin(a) * 0.17;
        const fz = crank.z + Math.cos(a) * 0.17;
        const [ky, kz] = knee(hip.y, hip.z, fy, fz, 0.5, 0.5);
        placeBar(thigh, P(hip.y, hip.z).setX(x), P(ky, kz).setX(x));
        placeBar(shin, P(ky, kz).setX(x), P(fy, fz).setX(x));
        foot.position.set(x, fy, fz + 0.04);
      });
      lamp.material.color.setRGB(0.55 + 0.45 * night, 0.52 + 0.43 * night, 0.4 + 0.37 * night);
      return [];
    },
  };
}

export const SUBJECTS = [
  { id: 'boat', label: 'Jon boat' },
  { id: 'ducks', label: 'Ducks' },
  { id: 'heron', label: 'Heron' },
  { id: 'deer', label: 'Deer' },
  { id: 'cyclist', label: 'Cyclist' },
  { id: 'bats', label: 'Bats', note: 'dusk to night' },
  { id: 'fireflies', label: 'Fireflies', note: 'night' },
];
export const DEFAULT_SUBJECTS = ['boat', 'ducks', 'fireflies'];
