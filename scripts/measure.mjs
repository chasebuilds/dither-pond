// Frame-rate measurement. Two setups:
//   gpu:      headed Chromium on this machine's GPU, vsync and the frame cap off, so the number is throughput
//   software: headless Chromium on SwiftShader (CPU only, no GPU at all), the slowest case a browser can hit
// Each runs 6 seconds per dither mode at 1280x720 and pixel size 3, motion on. Writes docs/MEASURED.md.
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';
import { serve } from './preview.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const setups = [
  { name: 'gpu', launch: { headless: false, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist'] } },
  { name: 'software', launch: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
];
const rows = [];
for (const s of setups) {
  const browser = await chromium.launch(s.launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?t=0.76`);
  await page.waitForFunction(() => window.__pond?.ready);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  for (const mode of ['bayer4', 'bayer8', 'blue', 'off']) {
    await page.evaluate((m) => window.__pond.setMode(m), mode);
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => new Promise((done) => {
      const times = [];
      const start = performance.now();
      const step = (now) => {
        times.push(now);
        if (now - start < 6000) requestAnimationFrame(step);
        else {
          const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
          done({ fps: (times.length - 1) / ((times.at(-1) - times[0]) / 1000), p95: gaps[Math.floor(gaps.length * 0.95)], cpu: window.__pond.stats.cpuMs, tris: window.__pond.stats.triangles, calls: window.__pond.stats.calls });
        }
      };
      requestAnimationFrame(step);
    }));
    rows.push({ setup: s.name, renderer, mode, ...r });
    console.log(s.name, mode, r.fps.toFixed(0), 'fps', r.p95.toFixed(2), 'ms p95');
  }
  await browser.close();
}
server.close();

const cpu = os.cpus()[0].model.trim();
const lines = [
  '# Measured frame rate',
  '',
  `Run with \`npm run measure\` on ${new Date().toISOString().slice(0, 10)}. Window 1280 x 720, device pixel ratio 1, pixel size 3, dusk, motion on, 6 seconds per mode. CPU: ${cpu}.`,
  '',
  '| Setup | Renderer | Dither | Frames per second | 95th percentile frame time |',
  '|---|---|---|---:|---:|',
  ...rows.map((r) => `| ${r.setup === 'gpu' ? 'GPU, uncapped' : 'Software only (SwiftShader)'} | ${r.renderer.replace(/\|/g, '/')} | ${r.mode} | ${r.fps.toFixed(0)} | ${r.p95.toFixed(1)} ms |`),
  '',
  `Scene per frame: ${rows[0].calls} draw calls, ${rows[0].tris.toLocaleString('en-US')} triangles.`,
  '',
  'The software row uses no GPU at all, so any machine with a working GPU should land between the two rows.',
  '',
];
fs.writeFileSync(new URL('../docs/MEASURED.md', import.meta.url), lines.join('\n'));
console.log('wrote docs/MEASURED.md');
