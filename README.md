# Certifications — Public Certificate Wall

Infinite Motif-style wall of certificates, published on GitHub Pages:

**https://kartavya.tech/certifications/**

(also available at https://kartavya-jharwal.github.io/certifications/)

Local preview uses Unsplash stand-ins. Real certificate assets can be patched in later under `public/assets/`.

## Quick start

```bash
npm install
npm run dev          # Vite local preview → http://localhost:5173
npm run build        # Assemble site/ (same artifact CI deploys)
npm run preview:site # Optional: preview the Pages bundle
```

Requires **Node 22+** (see `.nvmrc`).

## Project layout

| Path | Role |
|------|------|
| `vanilla/` | Source of truth — HTML, CSS, JS shipped to Pages |
| `index.html` | Vite entry; loads `vanilla/` for local preview |
| `scripts/build-vanilla.js` | Builds a clean `site/` artifact |
| `public/assets/` | Drop real certificate images here (copied to `site/assets/`) |
| `.github/workflows/deploy.yml` | Builds `site/` and deploys via `actions/deploy-pages` |

`site/` and `dist/` are build outputs and are gitignored. CI always rebuilds from `vanilla/`.

## GitHub Pages

Deploy is automatic on every push to `main` (or via **Actions → Deploy certificate wall to GitHub Pages → Run workflow**).

1. Repo **Settings → Pages → Build and deployment → Source** must be **GitHub Actions** (not a branch folder).
2. The workflow uploads the `site/` artifact and publishes it.
3. Live URL: https://kartavya.tech/certifications/ (GitHub Pages + custom domain)

Asset paths are relative (`./…`), so the site works under the `/certifications/` project path.

## Replacing preview images

`vanilla/main.js` has an `IMAGES` array of Unsplash URLs for layout previews only.

When you add real certificates:

1. Put files under `public/assets/` (e.g. `cert-01.png`).
2. Point `IMAGES` (or per-piece `seed.image`) at `./assets/cert-01.png`.
3. Push to `main` — Actions rebuilds and redeploys.

## License

See [`LICENSE`](./LICENSE):

- **Code** — free to use, modify, and redistribute **with attribution**.
- **Personal certifications** — **all rights reserved**. Do not copy, forge, or use them to imitate or misrepresent the owner.

Placeholder Unsplash images remain under Unsplash’s license and are not personal certification content.

## Controls

Drag to pan · scroll/pinch to zoom · click to select · `F` focus · `0` recenter · `S` realign · `U` hang an image · `T`/`M` theme · `?` shortcuts
