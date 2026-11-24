// Builds the ridge pond: sky, three ridge layers, bank with trees, pond water, a dock,
// a jon boat with a lantern, cattails and fireflies. Everything is procedural; no model files.
import * as THREE from 'three';
import { rng } from './dither.js';
import { SKY_VERT, SKY_FRAG, WATER_VERT, WATER_FRAG, FIREFLY_VERT, FIREFLY_FRAG } from './shaders.js';

export const FOG = { near: 14, far: 120 };
const DROPS = 6;

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

function trees(mat) {
  const rand = rng(11);
  const count = 90;
  const cone = new THREE.ConeGeometry(1, 1, 6);
  cone.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(cone, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 27 + rand() * 24;
    const h = 1.6 + rand() * 2.6;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(h * 0.28, h, h * 0.28));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

function dock(woodMat) {
  const g = new THREE.Group();
  const a = Math.PI;
  const shore = pondRadius(a);
  const len = 5.2;
  const x0 = -shore - 1.2;
  const z = 0;
  for (let i = 0; i < 14; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 1.5), woodMat);
    plank.position.set(x0 + 0.2 + i * ((len + 1.2) / 14), 0.42, z);
    plank.rotation.y = (i % 3 - 1) * 0.015;
    g.add(plank);
  }
  for (const [dx, dz] of [[0.3, -0.7], [0.3, 0.7], [len * 0.55, -0.7], [len * 0.55, 0.7], [len + 1, -0.7], [len + 1, 0.7]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), woodMat);
    post.position.set(x0 + dx, 0.05, z + dz);
    g.add(post);
  }
  return g;
}

function jonBoat(paint, inside, metal) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    g.add(m);
    return m;
  };
  // Flat bottom, square stern, raked bow: the shape of a small aluminum jon boat.
  add(new THREE.BoxGeometry(3.0, 0.08, 1.2), inside, 0, 0.02, 0);
  add(new THREE.BoxGeometry(3.0, 0.42, 0.06), paint, 0, 0.23, 0.6);
  add(new THREE.BoxGeometry(3.0, 0.42, 0.06), paint, 0, 0.23, -0.6);
  add(new THREE.BoxGeometry(0.06, 0.44, 1.26), paint, -1.5, 0.24, 0);
  add(new THREE.BoxGeometry(0.75, 0.06, 1.2), inside, 1.78, 0.24, 0, 0, 0.62);
  add(new THREE.BoxGeometry(0.08, 0.42, 1.24), paint, 2.08, 0.46, 0, 0, 0.62);
  add(new THREE.BoxGeometry(0.32, 0.06, 1.16), inside, 0.35, 0.34, 0);
  add(new THREE.BoxGeometry(0.32, 0.06, 1.16), inside, -0.85, 0.34, 0);
  // Outboard motor on the transom.
  add(new THREE.BoxGeometry(0.34, 0.36, 0.3), metal, -1.68, 0.56, 0);
  add(new THREE.BoxGeometry(0.08, 0.7, 0.08), metal, -1.72, 0.15, 0);
  // Lantern on a short pole at the bow.
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5), metal, 1.35, 0.7, 0.45);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const lamp = add(new THREE.SphereGeometry(0.11, 10, 8), glassMat, 1.35, 1.17, 0.45);
  return { group: g, lamp, glassMat };
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
  cluster(-2.2, -1.6, 26, 1.0);
  const stalkGeo = new THREE.CylinderGeometry(0.018, 0.026, 1, 4);
  stalkGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6);
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const up = new THREE.Vector3();
  const update = (time) => {
    spots.forEach((s, i) => {
      const sway = s.lean + Math.sin(time * 1.1 + s.ph) * 0.045;
      q.setFromEuler(e.set(sway * 0.6, 0, sway));
      m.compose(new THREE.Vector3(s.x, -0.1, s.z), q, new THREE.Vector3(1, s.h, 1));
      stalks.setMatrixAt(i, m);
      up.set(0, s.h * 0.82, 0).applyQuaternion(q);
      m.compose(new THREE.Vector3(s.x + up.x, -0.1 + up.y, s.z + up.z), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m);
    });
    stalks.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { stalks, heads, update };
}

function fireflies(count = 70) {
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
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 160 } },
    vertexShader: FIREFLY_VERT,
    fragmentShader: FIREFLY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, mat);
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

  const groundMat = new THREE.MeshLambertMaterial();
  const treeMat = new THREE.MeshLambertMaterial({ flatShading: true });
  scene.add(ground(groundMat), trees(treeMat));

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShaderMaterial({
      uniforms: {
        ...skyUniforms,
        uTime: { value: 0 },
        uBoat: { value: new THREE.Vector2() },
        uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, -99, 0)) },
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
    }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  scene.add(dock(woodMat));

  const paint = new THREE.MeshLambertMaterial({ color: 0x3f5a3a });
  const inside = new THREE.MeshLambertMaterial({ color: 0x8c9290 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const boat = jonBoat(paint, inside, metal);
  boat.group.position.set(1.8, 0, -1.2);
  boat.group.rotation.y = 0.5;
  scene.add(boat.group);
  const lantern = new THREE.PointLight(0xffb45a, 0, 9, 1.6);
  scene.add(lantern);

  const reeds = cattails(new THREE.MeshLambertMaterial({ color: 0x5d7a3a }), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  scene.add(reeds.stalks, reeds.heads);

  const flies = fireflies();
  scene.add(flies);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sun);

  const drops = water.material.uniforms.uDrops.value;
  let nextDrop = 0;
  const tmp = new THREE.Color();
  const lampWorld = new THREE.Vector3();

  return {
    scene,
    water,
    // Ripple from a tap or a fish at world (x, z).
    drop(x, z, time, strength = 1) {
      drops[nextDrop].set(x, z, time, strength);
      nextDrop = (nextDrop + 1) % DROPS;
    },
    insidePond(x, z) {
      return Math.hypot(x, z) < pondRadius(Math.atan2(z, x)) - 0.3;
    },
    // Apply one sampled time of day (see time.js) to every material and light.
    setLook(look) {
      skyUniforms.uSkyTop.value.setRGB(...look.skyTop);
      skyUniforms.uSkyHorizon.value.setRGB(...look.skyHorizon);
      skyUniforms.uLightDir.value.set(...look.light);
      skyUniforms.uLightColor.value.setRGB(...look.lightColor);
      skyUniforms.uSun.value = look.sun;
      skyUniforms.uMoon.value = look.moon;
      skyUniforms.uNight.value = look.night;
      scene.fog.color.setRGB(...look.fog);
      const u = water.material.uniforms;
      u.uWater.value.setRGB(...look.water);
      u.uFog.value.setRGB(...look.fog);
      tmp.setRGB(...look.ridge).lerp(scene.fog.color, 0.35);
      u.uRidgeRefl.value.copy(tmp);
      ridgeMats.forEach((m, i) => m.color.setRGB(...look.ridge).lerp(scene.fog.color, 0.12 + i * 0.12));
      groundMat.color.setRGB(...look.ground);
      treeMat.color.setRGB(...look.ground).multiplyScalar(0.7);
      hemi.color.setRGB(...look.skyTop);
      hemi.groundColor.setRGB(...look.ground);
      hemi.intensity = look.ambient * 2.2;
      sun.color.setRGB(...look.lightColor);
      sun.intensity = look.intensity;
      sun.position.set(...look.light).multiplyScalar(50);
      const lampOn = THREE.MathUtils.smoothstep(look.night, 0.25, 0.9);
      lantern.intensity = lampOn * 6;
      u.uLanternOn.value = lampOn;
      boat.glassMat.color.setRGB(0.25, 0.22, 0.18).lerp(tmp.setRGB(1, 0.8, 0.45), lampOn);
      flies.material.uniforms.uNight.value = THREE.MathUtils.smoothstep(look.night, 0.5, 1);
    },
    // Advance animation to `time` seconds (frozen when motion is off).
    tick(time) {
      const b = boat.group;
      b.position.y = Math.sin(time * 1.2) * 0.035 - 0.05;
      b.rotation.z = Math.sin(time * 1.0) * 0.03;
      b.rotation.x = Math.sin(time * 0.8 + 1) * 0.02;
      b.updateMatrixWorld();
      boat.lamp.getWorldPosition(lampWorld);
      lantern.position.copy(lampWorld);
      const u = water.material.uniforms;
      u.uTime.value = time;
      u.uBoat.value.set(b.position.x, b.position.z);
      u.uLantern.value.copy(lampWorld);
      flies.material.uniforms.uTime.value = time;
      reeds.update(time);
    },
    setPointScale(s) {
      flies.material.uniforms.uScale.value = s;
    },
  };
}
