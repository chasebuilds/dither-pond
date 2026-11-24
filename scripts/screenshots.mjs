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

// One picture per subject, framed close with the cam= parameter.
const SHOTS = [
  ['boat', 0.6, 'boat', '-1,2,4,1.8,0.4,-1.2'],
  ['ducks', 0.34, 'ducks', '-4.2,1.1,-0.6,-1.4,0.15,-2.9'],
  ['heron', 0.15, 'heron', '2.4,0.82,-8.0,5.6,0.8,-6.4'],
  ['deer', 0.34, 'deer', '-1.6,1.3,-13.0,-6.8,0.9,-9.3'],
  ['cyclist', 0.38, 'cyclist', '-1.5,1.9,-13.5,-4.2,0.8,-18.9'],
  ['bats', 0.88, 'bats,boat', '-2,1.5,9,0,3,-3'],
  ['fireflies', 1, 'fireflies,boat', '-2.5,3.4,15.5,0.5,1.2,0'],
  ['empty-windy', 0.76, '', '-2.5,3.4,15.5,0.5,1.2,0', '&wind=1&chop=0.8'],
];
for (const [name, t, subjects, cam, extra = ''] of SHOTS) {
  const s = await page(480, 300, `?t=${t}&still=1&px=2&subjects=${subjects}&cam=${cam}${extra}`);
  await s.addStyleTag({ content: '.title, .timebar { display: none !important; }' });
  // The still frame lands mid-strike for the heron and mid-drink for the deer; step past so both stand tall.
  if (name === 'heron' || name === 'deer') await s.evaluate((n) => window.__pond.advance(n === 'heron' ? 2 : 5), name);
  await s.waitForTimeout(200);
  await shot(s, `subject-${name}.png`);
  await s.close();
}

const card = await page(1600, 1000, '?t=0.76&still=1&px=4&subjects=boat,ducks,heron,deer,cyclist');
await shot(card, 'preview.png');
await card.close();

// GIF: 48 frames sweeping the slider, motion running so the ripples move too.
const g = await page(640, 400, '?t=0&subjects=boat,ducks,heron,bats,fireflies');
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
