import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, resolve, basename, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { finished } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pdfDir = resolve(root, "source-pdfs");
const outDir = resolve(root, "public/assets");
const PDF_DPI = 220;
const PNG_MAX_EDGE = 1600;

await mkdir(outDir, { recursive: true });

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function renderOne(pdfPath) {
  const id = basename(pdfPath, extname(pdfPath));
  const outPath = join(outDir, `${id}.png`);
  try {
    const pdfStat = await stat(pdfPath);
    try {
      const outStat = await stat(outPath);
      if (outStat.mtimeMs >= pdfStat.mtimeMs) {
        console.log(`skip ${id} (up-to-date)`);
        return;
      }
    } catch {
      /* missing output */
    }

    const data = new Uint8Array(await (await import("node:fs/promises")).readFile(pdfPath));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = PDF_DPI / 72;
    let viewport = page.getViewport({ scale });
    const maxEdge = Math.max(viewport.width, viewport.height);
    if (maxEdge > PNG_MAX_EDGE) {
      viewport = page.getViewport({ scale: scale * (PNG_MAX_EDGE / maxEdge) });
    }

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const buf = canvas.toBuffer("image/png");
    await writeFile(outPath, buf);
    console.log(`✓ ${id}.png (${Math.ceil(viewport.width)}×${Math.ceil(viewport.height)})`);
    await doc.destroy();
  } catch (err) {
    console.error(`✗ ${id}:`, err.message);
    throw err;
  }
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let failed = 0;

if (args.length) {
  for (const a of args) {
    try {
      await renderOne(resolve(a));
    } catch {
      failed++;
    }
  }
} else {
  let entries = [];
  try {
    entries = (await readdir(pdfDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  } catch {
    console.log("source-pdfs/ missing or empty — nothing to render");
    process.exit(0);
  }
  if (!entries.length) {
    console.log("No PDFs in source-pdfs/ — skip");
    process.exit(0);
  }
  for (const f of entries) {
    try {
      await renderOne(join(pdfDir, f));
    } catch {
      failed++;
    }
  }
}

if (failed) process.exit(1);
