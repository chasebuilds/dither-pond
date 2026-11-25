// Headless smoke test in Chromium (SwiftShader WebGL2, so it runs on CI machines without a GPU).
// Loads the real page with three.js from the pinned CDN and checks what ends up on the canvas.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/preview.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const failures = [];
const check = (ok, label) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

async function open(query = '', options = {}) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + query);
  await page.waitForFunction(() => window.__pond?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { page, errors, context };
}

// Canvas pixels with the UI hidden, as {w, h, data}.
async function pixels(page) {
  await page.addStyleTag({ content: 'body > :not(canvas) { visibility: hidden !important; }' });
  await page.waitForTimeout(150);
  const png = (await page.locator('#c').screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) };
  }, png);
}

const lum = (img) => {
  let s = 0;
  for (let i = 0; i < img.data.length; i += 4) s += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  return s / (img.data.length / 4);
};
const colors = (img) => {
  const set = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    set.set(k, (set.get(k) || 0) + 1);
  }
  return set;
};
const diff = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 6) n++;
  return n / (a.data.length / 4);
};

try {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check(/three@\d+\.\d+\.\d+\/build/.test(html) && !/three@latest/.test(html), 'three.js comes from an exact pinned CDN version');

  // 1. Loads cleanly at dusk in ramp mode, and every canvas pixel is one of the four ramp tones.
  {
    const { page, errors, context } = await open('?t=0.76&still=1');
    const rev = await page.evaluate(() => window.__pond.three);
    check(rev === html.match(/three@0\.(\d+)\./)[1], `three.js r${rev} loaded`);
    const ramp = await page.evaluate(() => window.__pond.state.mode);
    const img = await pixels(page);
    const c = colors(img);
    const top4 = [...c.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
    check(c.size >= 3, `canvas is not blank (${c.size} distinct colors)`);
    check(top4 / (img.w * img.h) > 0.999, `ramp mode (${ramp}): ${((top4 / (img.w * img.h)) * 100).toFixed(2)}% of pixels are one of 4 tones`);
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }

  // 2. Time of day, dither modes, pixel size and palette all change the output.
  {
    const { page, context } = await open('?t=0.34&still=1&px=4');
    const day = await pixels(page);
    await page.evaluate(() => window.__pond.setTime(1));
    const night = await pixels(page);
    check(lum(night) < lum(day) * 0.5, `night is darker than day (mean ${lum(night).toFixed(1)} vs ${lum(day).toFixed(1)})`);
    await page.evaluate(() => window.__pond.setTime(0.6));
    const byMode = {};
    for (const m of ['bayer4', 'bayer8', 'blue', 'off']) {
      await page.evaluate((mode) => window.__pond.setMode(mode), m);
      byMode[m] = await pixels(page);
    }
    check(diff(byMode.bayer4, byMode.bayer8) > 0.01, `Bayer 4x4 and 8x8 differ (${(diff(byMode.bayer4, byMode.bayer8) * 100).toFixed(1)}% of pixels)`);
    check(diff(byMode.bayer8, byMode.blue) > 0.05, `Bayer 8x8 and blue noise differ (${(diff(byMode.bayer8, byMode.blue) * 100).toFixed(1)}% of pixels)`);
    check(colors(byMode.off).size > 50 && colors(byMode.blue).size <= 8, `off shows the raw scene (${colors(byMode.off).size} colors), blue noise is quantized (${colors(byMode.blue).size})`);

    // Every pixel equals the top-left pixel of its 6x6 cell (cells are anchored at the canvas bottom-left).
    await page.evaluate(() => { window.__pond.setMode('bayer8'); window.__pond.setPixel(6); });
    const big = await pixels(page);
    let same = 0;
    for (let y = 0; y < big.h; y++) {
      const cy = big.h - 1 - (Math.floor((big.h - 1 - y) / 6) * 6 + 5);
      for (let x = 0; x < big.w; x++) {
        const cx = Math.floor(x / 6) * 6;
        const a = (y * big.w + x) * 4;
        const b = (Math.max(cy, 0) * big.w + cx) * 4;
        if (big.data[a] === big.data[b] && big.data[a + 1] === big.data[b + 1] && big.data[a + 2] === big.data[b + 2]) same++;
      }
    }
    check(same / (big.w * big.h) > 0.99, `pixel size 6: ${((same / (big.w * big.h)) * 100).toFixed(1)}% of pixels match their 6x6 cell`);

    await page.evaluate(() => window.__pond.setPalette(true));
    const rgb = await pixels(page);
    const allowed = new Set([0, 127, 128, 255]);
    let ok = 0;
    for (let i = 0; i < rgb.data.length; i += 4) if (allowed.has(rgb.data[i]) && allowed.has(rgb.data[i + 1]) && allowed.has(rgb.data[i + 2])) ok++;
    check(ok / (rgb.w * rgb.h) > 0.999, 'RGB palette uses 3 levels per channel');
    await context.close();
  }

  // 2b. Subjects: each one adds pixels to the still frame, Empty removes them all, and wind and water change the frame.
  {
    const { page, errors, context } = await open('?t=0.34&still=1&mode=off&px=1&subjects=');
    const empty = await pixels(page);
    const night = { bats: 0.9, fireflies: 1 };
    for (const id of ['boat', 'ducks', 'heron', 'deer', 'cyclist', 'bats', 'fireflies']) {
      await page.evaluate(([s, t]) => { window.__pond.setTime(t); window.__pond.setSubjects([]); }, [id, night[id] ?? 0.34]);
      const base = await pixels(page);
      await page.evaluate((s) => window.__pond.setSubjects([s]), id);
      const withIt = await pixels(page);
      const d = diff(base, withIt);
      check(d > 0.0004, `subject ${id} shows up (${(d * 100).toFixed(2)}% of pixels change)`);
    }
    await page.evaluate(() => { window.__pond.setTime(0.34); window.__pond.setSubjects(['boat', 'ducks', 'heron']); });
    const mixed = await pixels(page);
    // The UI is hidden for pixel reads, so press the Empty button through the DOM.
    await page.evaluate(() => document.getElementById('empty').click());
    const cleared = await pixels(page);
    check(diff(mixed, empty) > 0.001 && diff(cleared, empty) === 0, 'mixing works and Empty clears every subject');
    await page.evaluate(() => { window.__pond.setWind(0); window.__pond.setChop(0); });
    const calm = await pixels(page);
    await page.evaluate(() => window.__pond.setWind(1));
    const windy = await pixels(page);
    await page.evaluate(() => { window.__pond.setWind(0); window.__pond.setChop(1); });
    const choppy = await pixels(page);
    check(diff(calm, windy) > 0.01, `wind bends grass and ruffles water (${(diff(calm, windy) * 100).toFixed(1)}% of pixels change)`);
    check(diff(calm, choppy) > 0.01, `water slider adds chop (${(diff(calm, choppy) * 100).toFixed(1)}% of pixels change)`);
    check(errors.length === 0, 'subjects: no page errors');
    await context.close();
  }

  // 3. Motion runs by default and stops under prefers-reduced-motion.
  {
    const { page, context } = await open('?t=0.6');
    const a = await pixels(page);
    await page.waitForTimeout(900);
    const b = await pixels(page);
    check(diff(a, b) > 0.005, `scene animates (${(diff(a, b) * 100).toFixed(1)}% of pixels changed)`);
    await context.close();
  }
  {
    const { page, context } = await open('?t=0.6', { reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => window.__pond.state.motion);
    const a = await pixels(page);
    await page.waitForTimeout(900);
    const b = await pixels(page);
    check(!motion && diff(a, b) === 0, 'reduced motion: still frame, nothing moves');
    await context.close();
  }

  // 4. Debug panel shows a live frame rate.
  {
    const { page, context } = await open('?t=0.6');
    await page.keyboard.press('d');
    // Wait for the panel's first write instead of a fixed delay: under SwiftShader a frame can
    // take hundreds of ms, so a fixed 1.3 s wait could read the panel before it had any text.
    await page.waitForFunction(() => /fps\s+\d+/.test(document.querySelector('#debug')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const text = await page.locator('#debug').innerText();
    const fps = Number(text.match(/fps\s+(\d+)/)?.[1]);
    check(await page.locator('#debug').isVisible() && Number.isFinite(fps) && fps > 0, `debug panel shows fps (${fps} under SwiftShader)`);
    await context.close();
  }

  // 5. Phone: no sideways scroll, slider on screen, panel starts closed and opens.
  {
    const { page, errors, context } = await open('?t=0.76', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const m = await page.evaluate(() => {
      const r = document.querySelector('.timebar').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, w: innerWidth, left: r.left, right: r.right, bottom: r.bottom, h: innerHeight };
    });
    check(m.sw <= m.w && m.left >= 0 && m.right <= m.w && m.bottom <= m.h, `phone: fits 375 px (scrollWidth ${m.sw}), time slider on screen`);
    check(!(await page.locator('#panel').isVisible()), 'phone: dither panel starts closed');
    await page.locator('#panelBtn').tap();
    check(await page.locator('#panel').isVisible(), 'phone: Dither button opens the panel');
    await page.locator('#marks button', { hasText: 'Night' }).tap();
    check(await page.evaluate(() => window.__pond.state.t) === 1, 'phone: tapping Night moves the slider');
    check(errors.length === 0, 'phone: no page errors');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall smoke checks passed');
