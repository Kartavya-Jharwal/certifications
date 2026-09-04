# Data & pipeline

## Edit surface

Hand-edit **only** [`certificates.yaml`](../certificates.yaml).

Build emits:

- `generated/wall.json` → copied to `site/data/wall.json`
- JSON-LD + meta injected into `site/index.html`

## Schema

Required: `id`, `title`, `issuer`, `year`, `summary`, `credentialId`, `verifyUrl`, `tags`  
Optional: `image`, `mat`, `accent`, `layout.{x,y,width,height,angle,depth}`

Missing layout is autofilled with a seeded PRNG from `id` (stable across builds).

## PDF → PNG

```bash
npm run render:pdfs          # all source-pdfs/*.pdf
node scripts/render-pdfs.js path/to/id.pdf   # one-off
npm run watch:pdfs           # local watcher
```

- Input: `source-pdfs/<id>.pdf` (id must match catalog)
- Output: `public/assets/<id>.png` at 220 DPI, max edge 1600px
- Page 1 only (multi-page = BACKLOG-PDF-02)

If a PNG exists for an id, `build-data` prefers `./assets/<id>.png` over YAML `image` URLs.

## CI

GitHub Actions: `npm ci` → `render:pdfs` → `build:data` → `build:site` → upload `site/`.
