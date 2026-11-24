// README images: four times of day, the threshold maps side by side, a preview card, and a
// GIF of the slider sweeping dawn to night (needs ffmpeg on PATH for the GIF).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from './preview.mjs';

const docs = new URL('../docs/', import.meta.url);
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function page(w, h, query, hideUi = true) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(base + query);
  await p.waitForFunction(() => window.__pond?.ready);
  if (hideUi) await p.addStyleTag({ content: '.panel, .panel-btn, .debug { display: none !important; }' });
  await p.waitForTimeout(500);
  return p;
}

const shot = (p, name) => p.screenshot({ path: path.join(docs.pathname.replace(/^\/(\w:)/, '$1'), name) });

const p = await page(960, 600, '?t=0&still=1');
for (const [t, name] of [[0, 'dawn'], [0.34, 'day'], [0.6, 'golden'], [1, 'night']]) {
  await p.evaluate((v) => window.__pond.setTime(v), t);
  await p.waitForTimeout(200);
  await shot(p, `${name}.png`);
}
await p.close();

const m = await page(480, 300, '?t=0.6&still=1&px=4');
await m.addStyleTag({ content: '.title, .timebar { display: none !important; }' });
for (const mode of ['bayer4', 'bayer8', 'blue', 'off']) {
  await m.evaluate((v) => window.__pond.setMode(v), mode);
  await m.waitForTimeout(200);
  await shot(m, `mode-${mode}.png`);
}
await m.close();

const card = await page(1600, 1000, '?t=0.76&still=1&px=4');
await shot(card, 'preview.png');
await card.close();

// GIF: 48 frames sweeping the slider, motion running so the ripples move too.
const g = await page(640, 400, '?t=0');
await g.addStyleTag({ content: '.title { display: none !important; }' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pond-'));
for (let i = 0; i < 48; i++) {
  await g.evaluate((v) => window.__pond.setTime(v), i / 47);
  await g.waitForTimeout(90);
  await g.screenshot({ path: path.join(tmp, `f${String(i).padStart(3, '0')}.png`) });
}
await g.close();
await browser.close();
server.close();

const out = path.join(docs.pathname.replace(/^\/(\w:)/, '$1'), 'sweep.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', path.join(tmp, 'f%03d.png'),
  '-vf', 'split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', out]);
fs.rmSync(tmp, { recursive: true });
console.log('screenshots and sweep.gif written to docs/');
