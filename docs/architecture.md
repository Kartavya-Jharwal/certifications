# Architecture — Certificate Wall

## Motif dark hex freeze (default — DO NOT DRIFT)

```
--bg: #121412
--bg-deep: #090a09
--surface: rgba(24,27,25,0.92)
--surface-solid: #1b1e1c
--surface-2: #262a27
--border: rgba(238,236,228,0.20)
--border-strong: rgba(238,236,228,0.38)
--text: #f4f2ea
--text-2: #cdd0c8
--text-muted: #a4a89f
--text-dim: #8a8e85
--accent: #ff9166
--accent-2: #7cc0d6
--accent-ink: #16110c
--board-a: #2b2825
--board-b: #211f1d
--board-line: rgba(255,242,228,0.055)
```

## Engine constants

| Constant | Value |
|----------|-------|
| TILE | 5200 × 3600 |
| MIN_ZOOM / MAX_ZOOM | 0.28 / 3.6 |
| DT_MAX | 0.05 s |
| FRICTION | 0.12 → `v *= (1-f)**dt` |
| SPRING_OMEGA | 9 (ζ = 1) |
| ORIGIN_SHIFT_THRESH | 1e5 |
| TEXTURE_POOL_N | 96 (48 low-end) |
| DPR_CAP | 2 (1.5 low-end) |
| PDF_DPI | 220 |
| PNG_MAX_EDGE | 1600 |
| HASH_CELL | 384 |
| PIXI | 8.14.3 (pin in package.json) |

## Physics

**Momentum:** \(v_{t+\Delta t} = v_t (1-f)^{\Delta t}\), \(p += v \Delta t\)

**Critical spring:** \(a = \omega^2(x^*-x) - 2\omega v\)

**Modulo:** \(x_r = ((x_v \bmod W)+W)\bmod W\)

## Tick order

1. Clamp `dt`
2. Pointer-drift forces
3. `camera.step(dt)` (springs, momentum, origin shift)
4. Sync renderer camera
5. Hash query → sprite pool → texture pool
6. Throttled DOM (zoom, minimap, fps)

## Cold start

Chrome paints first. Pixi initializes on splash **Enter** (or idle callback). Low-end: lower DPR, smaller pool, no antialias.

## Coordinate model

Pieces live once in TILE. Camera is infinite. Visible repeats use tile indices `(i,j)` with spatial-hash queries split across torus seams (≤4 rects).
