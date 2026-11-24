# Measured frame rate

Run with `npm run measure` on 2026-11-24. Window 1280 x 720, device pixel ratio 1, pixel size 3, dusk, motion on, 6 seconds per mode. CPU: AMD Ryzen 5 7600X 6-Core Processor.

| Setup | Renderer | Dither | Frames per second | 95th percentile frame time |
|---|---|---|---:|---:|
| GPU, uncapped | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) | bayer4 | 4900 | 0.4 ms |
| GPU, uncapped | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) | bayer8 | 5004 | 0.4 ms |
| GPU, uncapped | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) | blue | 5595 | 0.4 ms |
| GPU, uncapped | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) | off | 6005 | 0.3 ms |
| Software only (SwiftShader) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | bayer4 | 52 | 33.3 ms |
| Software only (SwiftShader) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | bayer8 | 51 | 33.4 ms |
| Software only (SwiftShader) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | blue | 51 | 33.4 ms |
| Software only (SwiftShader) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | off | 51 | 33.4 ms |

Scene per frame: 38 draw calls, 10,250 triangles.

The software row uses no GPU at all, so any machine with a working GPU should land between the two rows.
