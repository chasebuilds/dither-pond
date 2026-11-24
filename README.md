# Ridge Pond: a dithered three.js scene

[![ci](https://github.com/chasebuilds/dither-pond/actions/workflows/ci.yml/badge.svg)](https://github.com/chasebuilds/dither-pond/actions/workflows/ci.yml)
[![live demo](https://img.shields.io/badge/live%20demo-open-f2a764?style=flat-square)](https://chasebuilds.github.io/dither-pond/)

A farm pond in the hills, rendered with three.js and then passed through a full-screen dither shader. Drag the time of day from dawn to night: the sun angle, sky, water, fog and the light path on the water all blend as you go. At night the moon lays a path across the pond, a lantern comes on in the jon boat and fireflies blink over the cattails.

**Live demo: https://chasebuilds.github.io/dither-pond/**

![The slider sweeping from dawn to night](docs/sweep.gif)

| Dawn | Day | Golden | Night |
|---|---|---|---|
| ![dawn](docs/dawn.png) | ![day](docs/day.png) | ![golden](docs/golden.png) | ![night](docs/night.png) |

## Controls

- **Time slider** along the bottom, or tap Dawn, Day, Golden, Dusk or Night. Arrow keys work on the slider.
- **Drag** to orbit (one finger on a phone). The camera stays above the water and slowly drifts until you touch it.
- **Tap the water** to drop a ripple. A fish rises every few seconds on its own.
- **Dither panel:** threshold map (Bayer 4x4, Bayer 8x8, blue noise, off), pixel size 1 to 8, and palette (4-tone ramp or RGB with 3 levels per channel).
- **Debug** button or the D key: frame rate, CPU time per frame, draw calls, triangles and the scene resolution.
- **Reduced motion:** if your system asks for reduced motion, the scene starts as a still frame (no ripples, drift or swaying). The Play motion button turns it back on.

## How the dither works

1. The 3D scene renders into a small off-screen target: the screen size divided by the pixel size. At pixel size 3 on a 1280 x 720 window that is 427 x 240.
2. A second pass draws one full-screen triangle pair. Each screen cell reads one texel of that small image, so the cells come out as crisp squares.
3. The cell also reads a threshold from a tiled map: its position modulo the map size picks one value between 0 and 1.
4. **Ramp palette:** the cell's brightness is scaled to the range 0 to 3 and split into a whole part and a fraction. The whole part picks one of four tones; the cell moves up to the next tone when the fraction is above the threshold. A 30% fraction turns on about 30% of the cells in any patch, which is what makes the gradients read as dot patterns.
5. **RGB palette:** the same test runs on red, green and blue separately with 3 levels each, so color survives.

The four tones come from the time of day (sage greens at noon, rust and amber at golden hour, plum at dusk, navy and moonlight at night), so the palette changes along with the light.

**Threshold maps:**

| Bayer 4x4 | Bayer 8x8 | Blue noise 64x64 | Off |
|---|---|---|---|
| ![bayer 4x4](docs/mode-bayer4.png) | ![bayer 8x8](docs/mode-bayer8.png) | ![blue noise](docs/mode-blue.png) | ![off](docs/mode-off.png) |

- **Bayer** matrices are built by the standard recursion. They give the regular cross-hatch look. 4x4 has 16 steps of gray, 8x8 has 64.
- **Blue noise** is generated in the browser by Ulichney's void-and-cluster method on a 64 x 64 torus (about 0.1 s, once). The dots look random but never clump. In the unit test, a 50% blue-noise pattern has 1.9% of the low-frequency energy of shuffled white noise.
- **Off** shows the low-resolution scene without dithering, for comparison.

## Measured

From [`docs/MEASURED.md`](docs/MEASURED.md), 1280 x 720, pixel size 3, motion on:

| Setup | Frames per second |
|---|---:|
| RTX 5070, frame cap and vsync off | 4,900 to 6,000 |
| No GPU at all (SwiftShader software rendering on a Ryzen 5 7600X) | 51 to 52 |

The scene is 38 draw calls and about 10,250 triangles. Even software-only rendering, with no GPU, stays near 50 fps, so any phone or laptop with a working GPU should hold its display's refresh rate. Rerun with `npm run measure`.

## Tests

`npm test` runs both suites; CI runs them on every push.

- **Unit (Node):** the Bayer 4x4 matrix matches the textbook values, Bayer 8x8 is a full permutation, blue noise is a full rank map and stays under 10% of white noise's low-frequency energy, threshold bytes are evenly spaced, every time-of-day key lands exactly, and no step of the slider changes a color channel by 2% or more.
- **Smoke (headless Chromium, SwiftShader):** loads the real page with three.js from the CDN. It checks that ramp mode puts 100% of pixels on four tones, night is darker than day, each threshold map changes the image, pixel size 6 gives exact 6 x 6 cells, RGB mode uses 3 levels per channel, the scene moves with motion on and is frozen under reduced motion, the debug panel shows a frame rate, and at 375 px phone width there is no sideways scroll and the controls work by touch.

## Run it

No build step. three.js r170 loads from a pinned jsDelivr URL in the import map in `index.html`.

```sh
npm install        # only Playwright, for the tests
npm run serve      # http://localhost:4173
npm test
npm run screenshots  # rebuilds docs/*.png and docs/sweep.gif (needs ffmpeg)
```

URL options for links and screenshots: `?t=0.76` (time, 0 to 1), `&mode=bayer4|bayer8|blue|off`, `&px=1..8`, `&palette=rgb`, `&still=1`, `&debug=1`.

## Files

| File | What it does |
|---|---|
| `src/scene.js` | Builds the scene: sky dome, three ridge layers, bank and trees, pond, dock, jon boat with lantern, cattails, fireflies |
| `src/shaders.js` | Sky, water (ripples, reflections, glint path, lantern pool), fireflies, and the dither pass |
| `src/dither.js` | Bayer and void-and-cluster blue-noise threshold maps |
| `src/time.js` | Five time-of-day keys and the smoothstep blend between them |
| `src/main.js` | Renderer, render target, UI, orbit controls, frame loop, debug stats |

Everything in the scene is procedural. There are no model or texture files.

MIT license. Built by Chase Builds.
