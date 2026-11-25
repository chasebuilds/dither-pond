import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene } from './scene.js';
import { POST_VERT, POST_FRAG } from './shaders.js';
import { MODES, thresholdRanks, toBytes } from './dither.js';
import { sample, clockLabel, clamp01, KEYS } from './time.js';
import { SUBJECTS, DEFAULT_SUBJECTS } from './subjects.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('c');

const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
if (!gl) {
  document.body.classList.add('no-webgl');
  throw new Error('WebGL2 is not available');
}

THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.info.autoReset = false;

const state = {
  t: clamp01(Number(params.get('t') ?? 0.76)),
  mode: MODES[params.get('mode')] ? params.get('mode') : 'bayer8',
  px: Math.min(8, Math.max(1, Number(params.get('px')) || 3)),
  rgb: params.get('palette') === 'rgb',
  motion: !matchMedia('(prefers-reduced-motion: reduce)').matches && params.get('still') !== '1',
  debug: params.get('debug') === '1',
  subjects: params.has('subjects')
    ? params.get('subjects').split(',').filter((id) => SUBJECTS.some((s) => s.id === id))
    : [...DEFAULT_SUBJECTS],
  wind: clamp01(Number(params.get('wind') ?? 0.3)),
  chop: clamp01(Number(params.get('chop') ?? 0.15)),
};

const world = buildScene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
camera.position.set(-2.5, 3.4, 15.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.5, 1.2, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 17;
controls.minPolarAngle = 0.95;
controls.maxPolarAngle = 1.5;
controls.autoRotateSpeed = 0.25;
const cam = params.get('cam')?.split(',').map(Number);
if (cam?.length === 6 && cam.every(Number.isFinite)) {
  camera.position.set(cam[0], cam[1], cam[2]);
  controls.target.set(cam[3], cam[4], cam[5]);
  controls.minDistance = Math.min(controls.minDistance, camera.position.distanceTo(controls.target));
}
controls.update();

// Low-res target the scene renders into; the dither pass scales it up cell by cell.
const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
const thresholds = {};
function thresholdTexture(mode) {
  if (!thresholds[mode]) {
    const ranks = thresholdRanks(mode);
    const size = MODES[mode].size;
    const tex = new THREE.DataTexture(toBytes(ranks, ranks.length), size, size, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    thresholds[mode] = tex;
  }
  return thresholds[mode];
}

const post = new THREE.ShaderMaterial({
  uniforms: {
    uScene: { value: target.texture },
    uThresh: { value: null },
    uTSize: { value: 8 },
    uCell: { value: 3 },
    uTarget: { value: new THREE.Vector2(1, 1) },
    uOff: { value: 0 },
    uRgb: { value: 0 },
    uLevels: { value: 3 },
    uContrast: { value: 1.2 },
    uExposure: { value: 1 },
    uRamp: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
  },
  vertexShader: POST_VERT,
  fragmentShader: POST_FRAG,
  depthTest: false,
  depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  const cell = state.px * dpr;
  const tw = Math.ceil((w * dpr) / cell);
  const th = Math.ceil((h * dpr) / cell);
  target.setSize(tw, th);
  post.uniforms.uCell.value = cell;
  post.uniforms.uTarget.value.set(tw, th);
  camera.aspect = w / h;
  // Portrait phones get a wider lens so the boat and both banks stay in frame.
  camera.fov = camera.aspect < 1 ? 62 : 42;
  camera.updateProjectionMatrix();
  world.setPointScale(150 * (th / 400));
}

function applyDither() {
  post.uniforms.uExposure.value = state.mode === 'off' ? 1 : look.exposure;
  post.uniforms.uOff.value = state.mode === 'off' ? 1 : 0;
  post.uniforms.uRgb.value = state.rgb ? 1 : 0;
  if (state.mode !== 'off') {
    post.uniforms.uThresh.value = thresholdTexture(state.mode);
    post.uniforms.uTSize.value = MODES[state.mode].size;
  }
}

let look = sample(state.t);
function applyTime() {
  look = sample(state.t);
  world.setLook(look);
  look.ramp.forEach((c, i) => post.uniforms.uRamp.value[i].setRGB(...c));
  post.uniforms.uExposure.value = state.mode === 'off' ? 1 : look.exposure;
  $('clock').textContent = clockLabel(look.clock);
  $('phase').textContent = look.name;
  $('time').value = Math.round(state.t * 1000);
  $('time').setAttribute('aria-valuetext', `${look.name}, ${clockLabel(look.clock)}`);
  document.documentElement.style.setProperty('--ui-tint', `rgb(${look.ramp[1].map((v) => Math.round(v * 255)).join(' ')})`);
}

// UI wiring.
const subjectBox = $('subjects');
subjectBox.innerHTML = SUBJECTS.map((s) => `<label><input type="checkbox" value="${s.id}"><span>${s.label}${s.note ? ` <small>${s.note}</small>` : ''}</span></label>`).join('')
  + '<button type="button" id="empty" class="pill">Empty</button>';
function applySubjects() {
  world.setSubjects(state.subjects);
  for (const box of subjectBox.querySelectorAll('input')) box.checked = state.subjects.includes(box.value);
}
subjectBox.addEventListener('change', () => {
  state.subjects = [...subjectBox.querySelectorAll('input:checked')].map((b) => b.value);
  applySubjects();
});
$('empty').addEventListener('click', () => { state.subjects = []; applySubjects(); });

const words = (v, names) => names[Math.min(names.length - 1, Math.floor(v * names.length))];
function applyEnv() {
  world.setWind(state.wind);
  world.setChop(state.chop);
  $('wind').value = Math.round(state.wind * 100);
  $('chop').value = Math.round(state.chop * 100);
  $('windv').textContent = words(state.wind, ['still', 'light breeze', 'breezy', 'windy', 'gusty']);
  $('chopv').textContent = words(state.chop, ['glassy', 'calm', 'rippled', 'choppy', 'rough']);
}
$('wind').addEventListener('input', (e) => { state.wind = e.target.value / 100; applyEnv(); });
$('chop').addEventListener('input', (e) => { state.chop = e.target.value / 100; applyEnv(); });
const timeInput = $('time');
timeInput.addEventListener('input', () => { state.t = timeInput.value / 1000; applyTime(); });
$('marks').innerHTML = KEYS.map((k) => `<button type="button" style="left:${k.t * 100}%" data-t="${k.t}">${k.name}</button>`).join('');
$('marks').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.t;
  if (t !== undefined) { state.t = Number(t); applyTime(); }
});

const modeBox = $('modes');
modeBox.innerHTML = Object.entries(MODES).map(([k, m]) => `<label><input type="radio" name="mode" value="${k}"${k === state.mode ? ' checked' : ''}><span>${m.label}</span></label>`).join('');
modeBox.addEventListener('change', (e) => { state.mode = e.target.value; applyDither(); });

const pxInput = $('px');
pxInput.value = state.px;
$('pxv').textContent = state.px;
pxInput.addEventListener('input', () => { state.px = Number(pxInput.value); $('pxv').textContent = state.px; resize(); });

for (const r of document.querySelectorAll('input[name=palette]')) {
  r.checked = (r.value === 'rgb') === state.rgb;
  r.addEventListener('change', () => { state.rgb = r.value === 'rgb' && r.checked; applyDither(); });
}

const motionBtn = $('motion');
function applyMotion() {
  motionBtn.setAttribute('aria-pressed', String(state.motion));
  motionBtn.textContent = state.motion ? 'Pause motion' : 'Play motion';
  controls.autoRotate = state.motion && !interacted;
}
motionBtn.addEventListener('click', () => { state.motion = !state.motion; applyMotion(); });

const debugEl = $('debug');
const debugBtn = $('debugBtn');
function applyDebug() {
  debugEl.hidden = !state.debug;
  frameNo = 9; // fill the panel on the next frame, not ten frames later
  debugBtn.setAttribute('aria-pressed', String(state.debug));
}
debugBtn.addEventListener('click', () => { state.debug = !state.debug; applyDebug(); });
window.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input[type=text]')) return;
  if (e.key === 'd' || e.key === 'D') { state.debug = !state.debug; applyDebug(); }
});

const panel = $('panel');
$('panelBtn').addEventListener('click', () => {
  const open = panel.classList.toggle('open');
  $('panelBtn').setAttribute('aria-expanded', String(open));
});
if (matchMedia('(min-width: 720px)').matches) {
  panel.classList.add('open');
  $('panelBtn').setAttribute('aria-expanded', 'true');
}

// Tap the water (a press without a drag) to drop a ripple.
let interacted = false;
let down = null;
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
canvas.addEventListener('pointerdown', (e) => {
  down = [e.clientX, e.clientY];
  interacted = true;
  controls.autoRotate = false;
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  if (ray.ray.intersectPlane(plane, hit) && world.insidePond(hit.x, hit.z)) world.drop(hit.x, hit.z, simTime, 1.2);
});

// Frame loop with a rolling one-second frame rate for the debug panel.
let simTime = 4;
let last = performance.now();
let nextFish = 2;
const frames = [];
let cpuMs = 0;
let frameNo = 0;
const stats = { fps: 0, cpuMs: 0, calls: 0, triangles: 0, target: [0, 0] };

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  frames.push(now);
  while (frames.length && frames[0] < now - 1000) frames.shift();
  if (state.motion) {
    simTime += dt;
    if (simTime > nextFish) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 8;
      world.drop(Math.cos(a) * r, Math.sin(a) * r, simTime, 0.6);
      nextFish = simTime + 2.5 + Math.random() * 4;
    }
  }
  const t0 = performance.now();
  controls.update(dt);
  world.tick(simTime);
  renderer.info.reset();
  renderer.setRenderTarget(target);
  renderer.render(world.scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1;

  stats.fps = frames.length;
  stats.cpuMs = cpuMs;
  stats.calls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  stats.target = [target.width, target.height];
  if (state.debug && ++frameNo % 10 === 0) {
    debugEl.textContent = [
      `fps        ${stats.fps}`,
      `cpu ms     ${stats.cpuMs.toFixed(2)}`,
      `draw calls ${stats.calls}`,
      `triangles  ${stats.triangles.toLocaleString('en-US')}`,
      `scene res  ${stats.target[0]} x ${stats.target[1]}`,
      `dither     ${MODES[state.mode].label}, ${state.rgb ? 'RGB' : 'ramp'}`,
      `motion     ${state.motion ? 'on' : 'off'}`,
      `subjects   ${state.subjects.join(', ') || 'none'}`,
      `wind/water ${state.wind.toFixed(2)} / ${state.chop.toFixed(2)}`,
    ].join('\n');
  }
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
resize();
applyDither();
applySubjects();
applyEnv();
applyTime();
applyMotion();
applyDebug();
requestAnimationFrame((now) => { last = now; frame(now); });

// Hooks for the smoke test and screenshots.
window.__pond = {
  ready: true,
  three: THREE.REVISION,
  state,
  stats,
  setTime(t) { state.t = clamp01(t); applyTime(); },
  setMode(m) { state.mode = m; applyDither(); },
  setPixel(p) { state.px = p; pxInput.value = p; $('pxv').textContent = p; resize(); },
  setPalette(rgb) { state.rgb = rgb; applyDither(); },
  setMotion(on) { state.motion = on; applyMotion(); },
  setSubjects(ids) { state.subjects = ids; applySubjects(); },
  setWind(w) { state.wind = clamp01(w); applyEnv(); },
  setChop(c) { state.chop = clamp01(c); applyEnv(); },
  setCamera(p, t) { camera.position.set(...p); controls.target.set(...t); controls.minDistance = Math.min(7, camera.position.distanceTo(controls.target)); interacted = true; controls.autoRotate = false; controls.update(); },
  advance(dt) { simTime += dt; },
};
