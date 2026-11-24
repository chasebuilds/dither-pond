// Builds the ridge pond: sky, three ridge layers, bank with trees and grass, the pond and a creek,
// a road with a plank bridge, a dock and cattails, plus the pickable subjects from subjects.js.
// Everything is procedural; no model files.
import * as THREE from 'three';
import { rng } from './dither.js';
import { gust } from './motion.js';
import { SKY_VERT, SKY_FRAG, WATER_VERT, WATER_FRAG, FIREFLY_VERT, FIREFLY_FRAG } from './shaders.js';
import { boat, heron, deer, ducks, bats, fireflies, cyclist, ROAD_R } from './subjects.js';

export const FOG = { near: 14, far: 120 };
const DROPS = 6;
const SOURCES = 6;
const CREEK = -Math.PI / 2; // the creek leaves the pond straight behind it, under the bridge

// Pond outline radius at angle a: a lopsided farm pond, not a circle.
export const pondRadius = (a) => 11 + 0.9 * Math.sin(3 * a + 1) + 0.5 * Math.sin(5 * a + 2) + 0.25 * Math.sin(9 * a);

function ridge(radius, base, amp, seed, mat) {
  const rand = rng(seed);
  const waves = Array.from({ length: 6 }, (_, i) => [1 + i * 2 + Math.floor(rand() * 3), rand() * 6.28, 1 / (i + 1)]);
  const seg = 220;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let h = 0;
    for (const [f, ph, w] of waves) h += Math.sin(a * f + ph) * w;
    h = base + amp * (0.5 + 0.32 * h);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    pos.push(x, -3, z, x, h, z);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}

function ground(mat) {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, 200, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  const seg = 120;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = pondRadius(a);
    // Shape space is x/y; after rotating -90deg about x, shape y becomes world -z.
    if (i === 0) hole.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    else hole.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  outer.holes.push(hole);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(outer, 8), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

// Keep scattered things off the road, the creek and the dock.
const clear = (x, z) => {
  const r = Math.hypot(x, z);
  const onRoad = Math.abs(r - ROAD_R) < 1.1;
  const onCreek = Math.abs(x) < 1.4 && z < 0 && r > 9;
  const onDock = z > -1.6 && z < 1.6 && x < -8 && x > -15;
  return !onRoad && !onCreek && !onDock;
};

function trees(mat) {
  const rand = rng(11);
  const count = 90;
  const cone = new THREE.ConeGeometry(1, 1, 6);
  cone.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(cone, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let i = 0;
  while (i < count) {
    const a = rand() * Math.PI * 2;
    const r = 27 + rand() * 24;
    const h = 1.6 + rand() * 2.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!clear(x, z)) continue;
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(h * 0.28, h, h * 0.28));
    mesh.setMatrixAt(i++, m);
  }
  return mesh;
}

// Material whose vertices lean with the wind: bend grows with height (local y 0..1).
function windy(mat, uniforms, amount) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz;
      float bend = position.y * position.y * ${amount.toFixed(2)};
      float wave = sin(uTime * (1.4 + uWind * 3.0) + ip.x * 0.6 + ip.z * 0.45);
      transformed.x += (uWind * 0.5 + wave * (0.05 + uWind * 0.3)) * bend;
      transformed.z += sin(uTime * 1.1 + ip.z * 0.8) * 0.04 * (0.3 + uWind) * bend;`,
    );
  };
  return mat;
}

function grass(mat) {
  const rand = rng(17);
  const count = 900;
  const blade = new THREE.ConeGeometry(0.05, 1, 3);
  blade.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(blade, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let i = 0;
  while (i < count) {
    const a = rand() * Math.PI * 2;
    const r = pondRadius(a) + 0.2 + rand() ** 1.6 * 15;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!clear(x, z)) continue;
    const h = 0.25 + rand() * 0.45;
    q.setFromEuler(e.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3));
    m.compose(new THREE.Vector3(x, 0.04, z), q, new THREE.Vector3(1, h, 1));
    mesh.setMatrixAt(i++, m);
  }
  return mesh;
}

function cattails(stalkMat, headMat) {
  const rand = rng(23);
  const spots = [];
  const cluster = (a0, a1, n, inset) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + rand() * (a1 - a0);
      const r = pondRadius(a) - rand() * inset;
      spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 1.1 + rand() * 0.9, ph: rand() * 6.28, lean: (rand() - 0.5) * 0.15 });
    }
  };
  cluster(-0.55, 0.5, 70, 1.4);
  cluster(2.6, 2.95, 30, 1.0);
  cluster(3.35, 3.8, 30, 1.0);
  cluster(-1.62, -1.4, 14, 1.0);
  const stalkGeo = new THREE.CylinderGeometry(0.018, 0.026, 1, 4);
  stalkGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6);
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const up = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const size = new THREE.Vector3();
  const update = (time, wind) => {
    spots.forEach((s, i) => {
      const sway = s.lean + wind * 0.35 + Math.sin(time * (1.1 + wind * 2.5) + s.ph) * (0.03 + wind * 0.16);
      q.setFromEuler(e.set(sway * 0.3, 0, -sway));
      m.compose(pos.set(s.x, -0.1, s.z), q, size.set(1, s.h, 1));
      stalks.setMatrixAt(i, m);
      up.set(0, s.h * 0.82, 0).applyQuaternion(q);
      m.compose(pos.set(s.x + up.x, -0.1 + up.y, s.z + up.z), q, one);
      heads.setMatrixAt(i, m);
    });
    stalks.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  return { stalks, heads, update };
}

function dock(woodMat) {
  const g = new THREE.Group();
  const shore = pondRadius(Math.PI);
  const len = 5.2;
  const x0 = -shore - 1.2;
  for (let i = 0; i < 14; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 1.5), woodMat);
    plank.position.set(x0 + 0.2 + i * ((len + 1.2) / 14), 0.42, 0);
    plank.rotation.y = ((i % 3) - 1) * 0.015;
    g.add(plank);
  }
  for (const [dx, dz] of [[0.3, -0.7], [0.3, 0.7], [len * 0.55, -0.7], [len * 0.55, 0.7], [len + 1, -0.7], [len + 1, 0.7]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), woodMat);
    post.position.set(x0 + dx, 0.05, dz);
    g.add(post);
  }
  return g;
}

function road(gravel, woodMat) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(ROAD_R - 0.6, ROAD_R + 0.6, 160, 1), gravel);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.075;
  g.add(ring);
  // Plank bridge where the road crosses the creek.
  const bridge = new THREE.Group();
  bridge.position.set(0, 0, -ROAD_R);
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.5), woodMat);
    plank.position.set(-1.25 + i * 0.31, 0.32, 0);
    bridge.add(plank);
  }
  for (const z of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.06), woodMat);
    rail.position.set(0, 0.75, z);
    bridge.add(rail);
    for (const x of [-1.3, 0, 1.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), woodMat);
      post.position.set(x, 0.55, z);
      bridge.add(post);
    }
  }
  g.add(bridge);
  return g;
}

export function buildScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, FOG.near, FOG.far);

  const skyUniforms = {
    uSkyTop: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color() },
    uSun: { value: 1 },
    uMoon: { value: 0 },
    uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const ridgeMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  scene.add(ridge(62, 4, 9, 3, ridgeMats[0]), ridge(95, 7, 15, 5, ridgeMats[1]), ridge(140, 10, 24, 9, ridgeMats[2]));

  const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  const groundMat = new THREE.MeshLambertMaterial();
  const treeMat = windy(new THREE.MeshLambertMaterial({ flatShading: true }), windUniforms, 0.08);
  const grassMat = windy(new THREE.MeshLambertMaterial(), windUniforms, 1);
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const gravelMat = new THREE.MeshLambertMaterial({ color: 0x9a8f7c });
  scene.add(ground(groundMat), trees(treeMat), grass(grassMat), dock(woodMat), road(gravelMat, woodMat));

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uTime: { value: 0 },
      uSrc: { value: Array.from({ length: SOURCES }, () => new THREE.Vector4()) },
      uSrcK: { value: new Array(SOURCES).fill(5) },
      uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uWind: { value: 0.3 },
      uChop: { value: 0.2 },
      uWater: { value: new THREE.Color() },
      uRidgeRefl: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uFogNear: { value: FOG.near },
      uFogFar: { value: FOG.far },
      uLantern: { value: new THREE.Vector3() },
      uLanternOn: { value: 0 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), waterMat);
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  // The creek: a strip of the same water running from the pond out under the bridge.
  const creekStart = pondRadius(CREEK) - 0.6;
  const creek = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 34 - creekStart), waterMat);
  creek.rotation.x = -Math.PI / 2;
  creek.position.set(0, 0.07, -(creekStart + (34 - creekStart) / 2));
  scene.add(creek);

  const reeds = cattails(new THREE.MeshLambertMaterial({ color: 0x5d7a3a }), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  scene.add(reeds.stalks, reeds.heads);

  const subjects = {
    boat: boat(),
    ducks: ducks(),
    heron: heron(pondRadius),
    deer: deer(pondRadius),
    cyclist: cyclist(),
    bats: bats(),
    fireflies: fireflies(pondRadius, FIREFLY_VERT, FIREFLY_FRAG),
  };
  for (const s of Object.values(subjects)) scene.add(s.group);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sun);

  const u = waterMat.uniforms;
  let nextDrop = 0;
  const tmp = new THREE.Color();
  const env = { wind: 0.3, chop: 0.2, night: 0 };
  const active = new Set();

  const api = {
    scene,
    subjects,
    env,
    drop(x, z, time, strength = 1) {
      u.uDrops.value[nextDrop].set(x, z, time, strength);
      nextDrop = (nextDrop + 1) % DROPS;
    },
    insidePond(x, z) {
      return Math.hypot(x, z) < pondRadius(Math.atan2(z, x)) - 0.3;
    },
    setSubjects(ids) {
      active.clear();
      for (const id of ids) if (subjects[id]) active.add(id);
      for (const [id, s] of Object.entries(subjects)) s.group.visible = active.has(id);
      // Rings left by a subject that just left would hang on a frozen frame; start the water clean.
      for (const d of u.uDrops.value) d.set(0, 0, -99, 0);
    },
    setLook(look) {
      env.night = look.night;
      skyUniforms.uSkyTop.value.setRGB(...look.skyTop);
      skyUniforms.uSkyHorizon.value.setRGB(...look.skyHorizon);
      skyUniforms.uLightDir.value.set(...look.light);
      skyUniforms.uLightColor.value.setRGB(...look.lightColor);
      skyUniforms.uSun.value = look.sun;
      skyUniforms.uMoon.value = look.moon;
      skyUniforms.uNight.value = look.night;
      scene.fog.color.setRGB(...look.fog);
      u.uWater.value.setRGB(...look.water);
      u.uFog.value.setRGB(...look.fog);
      tmp.setRGB(...look.ridge).lerp(scene.fog.color, 0.35);
      u.uRidgeRefl.value.copy(tmp);
      ridgeMats.forEach((m, i) => m.color.setRGB(...look.ridge).lerp(scene.fog.color, 0.12 + i * 0.12));
      groundMat.color.setRGB(...look.ground);
      grassMat.color.setRGB(...look.ground).multiplyScalar(1.25);
      treeMat.color.setRGB(...look.ground).multiplyScalar(0.7);
      gravelMat.color.setRGB(...look.ground).lerp(tmp.setRGB(0.62, 0.58, 0.5), 0.6);
      hemi.color.setRGB(...look.skyTop);
      hemi.groundColor.setRGB(...look.ground);
      hemi.intensity = look.ambient * 2.2;
      sun.color.setRGB(...look.lightColor);
      sun.intensity = look.intensity;
      sun.position.set(...look.light).multiplyScalar(50);
    },
    setWind(w) { env.wind = w; },
    setChop(c) { env.chop = c; },
    // Advance animation to `time` seconds (frozen when motion is off).
    tick(time) {
      const wind = gust(env.wind, time);
      windUniforms.uTime.value = time;
      windUniforms.uWind.value = wind;
      u.uTime.value = time;
      u.uWind.value = wind;
      u.uChop.value = env.chop;
      reeds.update(time, wind);
      const ctx = { time, wind, chop: env.chop, night: env.night, drop: (x, z, s) => api.drop(x, z, time, s) };
      const sources = [];
      for (const id of active) sources.push(...subjects[id].update(ctx));
      for (let i = 0; i < SOURCES; i++) {
        const s = sources[i];
        if (s) { u.uSrc.value[i].set(s[0], s[1], s[2], s[3]); u.uSrcK.value[i] = s[4]; } else u.uSrc.value[i].set(0, 0, 0, 0);
      }
      const b = subjects.boat;
      u.uLantern.value.copy(b.lampWorld);
      u.uLanternOn.value = active.has('boat') ? b.lanternOn(env.night) : 0;
    },
    setPointScale(s) { subjects.fireflies.setScale(s); },
  };
  return api;
}
