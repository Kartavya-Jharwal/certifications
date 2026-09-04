# Certificate Wall

Inspectable credentials on an infinite Motif wall — proof for discretionary technical buyers, not a trophy gallery.

**Live:** https://kartavya.tech/certifications/

## Quick start

```bash
npm install
npm run build          # data → site/
npm run serve          # http://localhost:4173/
npm run dev            # build + serve
```

### Content

Edit **only** [`certificates.yaml`](./certificates.yaml), then rebuild.

```bash
npm run build:data
```

### PDFs → PNG

```bash
# Drop source-pdfs/<id>.pdf matching catalog ids
npm run render:pdfs
npm run watch:pdfs     # local bulk watcher
```

CI runs the same render step on every push to `main`.

## Scripts

| Script | Purpose |
|--------|---------|
| `build` | Optional PDFs (`BUILD_PDFS=1`) → data → site |
| `build:data` | YAML → `generated/wall.json` + JSON-LD |
| `build:site` | Assemble `site/` for Pages |
| `render:pdfs` / `watch:pdfs` | PDF page-1 → `public/assets/<id>.png` |
| `serve` | Static server for `site/` |
| `stress:data` | Generate large YAML for scale tests |

## Stack

- Vanilla ES modules + PixiJS 8 (WebGPU/WebGL)
- Spatial hash + modulo tiling, Δt momentum, critically damped focus springs
- GitHub Pages via Actions

## Docs

- [Architecture](./docs/architecture.md)
- [Data & pipeline](./docs/data-and-pipeline.md)
- [ICP surface map](./docs/icp-surface-map.md) (public-safe)
- [Backlog](./docs/backlog.md)
- [Attribution](./docs/attribution.md)

## License

Code: free with attribution. Personal certifications: all rights reserved — see [`LICENSE`](./LICENSE).
