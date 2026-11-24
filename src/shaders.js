// GLSL for the sky, the water and the dither pass. Colors are treated as display values
// (color management is off), so the dither pass quantizes what you would see.

export const SKY_CHUNK = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uSun;
uniform float uMoon;
uniform float uNight;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(h, 0.5));
  float s = max(dot(d, uLightDir), 0.0);
  // Sun: wide warm glow plus a hard disc. Moon: tight halo plus a smaller disc.
  c += uLightColor * uSun * (pow(s, 6.0) * 0.4 + smoothstep(0.9975, 0.999, s) * 1.6);
  c += uLightColor * uMoon * (pow(s, 60.0) * 0.35 + smoothstep(0.9992, 0.9996, s) * 1.4);
  if (uNight > 0.01) {
    float n = hash3(floor(d * 220.0));
    c += vec3(smoothstep(0.996, 1.0, n)) * uNight * smoothstep(0.02, 0.25, h) * 0.9;
  }
  return c;
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAG = /* glsl */ `
${SKY_CHUNK}
varying vec3 vDir;
void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }
`;

export const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const WATER_FRAG = /* glsl */ `
${SKY_CHUNK}
#define DROPS 6
#define SOURCES 6
uniform float uTime;
uniform vec4 uSrc[SOURCES];   // x, z, amplitude, inner radius
uniform float uSrcK[SOURCES]; // wavenumber
uniform vec4 uDrops[DROPS];
uniform float uWind;
uniform float uChop;
uniform vec3 uWater;
uniform vec3 uRidgeRefl;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uLantern;
uniform float uLanternOn;
varying vec3 vWorld;

float height(vec2 p) {
  float h = 0.0;
  // Rings that keep spreading from anything floating or wading: boat, ducks, heron legs.
  for (int i = 0; i < SOURCES; i++) {
    vec4 s = uSrc[i];
    if (s.z <= 0.0) continue;
    float d = length(p - s.xy);
    h += sin(d * uSrcK[i] - uTime * 2.4) * s.z * exp(-d * 0.22) * smoothstep(s.w * 0.75, s.w * 1.35, d);
  }
  // Drops (taps, fish rising, heron strikes, a deer drinking): one ring front that travels out and fades.
  for (int i = 0; i < DROPS; i++) {
    vec4 dr = uDrops[i];
    float age = uTime - dr.z;
    if (age < 0.0 || age > 9.0) continue;
    float dd = length(p - dr.xy);
    float x = dd - age * 1.9;
    h += sin(x * 7.0) * exp(-x * x * 2.2) * dr.w * 0.07 * exp(-age * 0.4);
  }
  // Wind ripples: stronger and faster with the wind.
  float wt = uTime * (0.8 + uWind * 1.6);
  h += (sin(p.x * 1.6 + wt) + sin(p.y * 2.2 - wt * 1.2) + sin((p.x + p.y) * 3.3 + wt * 1.7)) * (0.002 + uWind * 0.012);
  // Chop: short crossing waves plus a slow swell.
  float ct = uTime * 1.9;
  h += (sin(p.x * 4.1 + p.y * 1.3 + ct) + sin(p.y * 5.3 - p.x * 2.1 - ct * 1.3) + sin((p.x - p.y) * 6.7 + ct * 1.7)) * 0.011 * uChop;
  h += sin(p.x * 0.7 + p.y * 0.4 + uTime * 0.9) * 0.05 * uChop;
  return h;
}

void main() {
  vec2 p = vWorld.xz;
  float e = 0.04;
  float h = height(p);
  vec3 n = normalize(vec3(-(height(p + vec2(e, 0.0)) - h) / e, 1.0, -(height(p + vec2(0.0, e)) - h) / e));
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 r = reflect(v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);
  // The ridges sit low on the horizon, so a reflected ray that low sees hills, not sky.
  refl = mix(refl, uRidgeRefl, (1.0 - smoothstep(0.03, 0.16, r.y)) * 0.9);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  vec3 col = mix(uWater, refl, clamp(fres * 1.3 + 0.22, 0.0, 1.0));
  // Glints that line up into the sun or moon path.
  float s = max(dot(r, uLightDir), 0.0);
  col += uLightColor * (pow(s, 380.0) * 3.2 * uSun + pow(s, 700.0) * 2.2 * uMoon);
  // Lantern light pooled on the water at night.
  float ld = length(p - uLantern.xz);
  col += vec3(1.0, 0.7, 0.38) * uLanternOn * 0.55 * exp(-ld * 1.1);
  float f = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  gl_FragColor = vec4(mix(col, uFog, f), 1.0);
}
`;

export const FIREFLY_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uScale;
uniform float uWind;
varying float vGlow;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.6 + aPhase * 5.0) * 0.5;
  p.y += sin(uTime * 0.9 + aPhase * 3.0) * 0.25;
  p.z += cos(uTime * 0.5 + aPhase * 7.0) * 0.5;
  p.x += uWind * (1.2 + sin(uTime * 0.7 + aPhase * 9.0) * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Slow blink: mostly dark, then a short soft flash.
  vGlow = pow(max(sin(uTime * 1.3 + aPhase * 6.283), 0.0), 6.0);
  gl_PointSize = uScale * (0.6 + vGlow) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const FIREFLY_FRAG = /* glsl */ `
uniform float uNight;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vGlow * uNight;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * a * 1.6, 1.0);
}
`;

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Dither pass. Each screen cell (pixel size x pixel size device pixels) reads one texel of the
// low-res scene and one threshold from the tiled map, then snaps to the palette.
export const POST_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uThresh;
uniform float uTSize;
uniform float uCell;
uniform vec2 uTarget;
uniform float uOff;
uniform float uRgb;
uniform float uLevels;
uniform float uContrast;
uniform float uExposure;
uniform vec3 uRamp[4];
void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec3 c = texture2D(uScene, (cell + 0.5) / uTarget).rgb * uExposure;
  if (uOff > 0.5) { gl_FragColor = vec4(c, 1.0); return; }
  float th = texture2D(uThresh, (mod(cell, uTSize) + 0.5) / uTSize).r;
  vec3 col;
  if (uRgb > 0.5) {
    vec3 x = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0) * (uLevels - 1.0);
    vec3 b = floor(x);
    col = (b + step(vec3(th), x - b)) / (uLevels - 1.0);
  } else {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    l = clamp((l - 0.5) * uContrast + 0.5, 0.0, 0.9999);
    float x = l * 3.0;
    float b = floor(x);
    float i = min(b + step(th, x - b), 3.0);
    col = i < 0.5 ? uRamp[0] : i < 1.5 ? uRamp[1] : i < 2.5 ? uRamp[2] : uRamp[3];
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
