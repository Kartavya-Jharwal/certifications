# Data & pipeline (no-PDF default)

## Edit surface

Hand-edit **only** [`certificates.yaml`](../certificates.yaml).

Build emits:

- `generated/wall.json` → copied to `site/data/wall.json`
- JSON-LD + meta injected into `site/index.html`

## Schema

Required: `id`, `title`, `issuer`, `year`, `summary`, `credentialId`, `verifyUrl`, `tags`  
Optional: `image`, `mat`, `accent`, `layout.{x,y,width,height,angle,depth}`

Missing layout is autofilled with a seeded PRNG from `id` (stable across builds).

## Images (current path — no PDFs)

1. Set `image:` in YAML to a URL (e.g. Unsplash preview), **or**
2. Drop a file at `public/assets/<id>.png` (or `.jpg` / `.webp`)

`build-data` prefers a local file under `public/assets/<id>.*` over the YAML URL when present.

```bash
npm run build:data
npm run build:site
# or
npm run build
```

## CI

GitHub Actions: `npm install` → `build:data` → `build:site` → upload `site/`.  
PDF rendering is **not** part of the default deploy.

## PDF → PNG (optional / later)

Scripts remain for when you opt in:

```bash
npm install   # optionalDeps may pull pdfjs + canvas
npm run render:pdfs
npm run watch:pdfs
BUILD_PDFS=1 npm run build
```

If optional deps are missing, render scripts exit with a clear message. See BACKLOG-PDF in [`backlog.md`](./backlog.md).
