import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateCatalog } from "./lib/validate-catalog.js";
import { autofillLayouts } from "./lib/layout-autofill.js";
import { buildJsonLd } from "./lib/jsonld.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const raw = await readFile(resolve(root, "certificates.yaml"), "utf8");
const doc = parseYaml(raw);
const { errors, warnings } = validateCatalog(doc);
for (const w of warnings) console.warn("⚠", w);
if (errors.length) {
  for (const e of errors) console.error("✗", e);
  process.exit(1);
}

const tile = doc.tile || { w: 5200, h: 3600 };
let certificates = autofillLayouts(doc.certificates, tile);

certificates = await Promise.all(
  certificates.map(async (c) => {
    const assetsDir = resolve(root, "public/assets");
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const local = resolve(assetsDir, `${c.id}.${ext}`);
      if (await exists(local)) {
        return { ...c, image: `./assets/${c.id}.${ext}` };
      }
    }
    return c;
  }),
);

const wall = {
  version: 1,
  tile,
  generatedAt: new Date().toISOString(),
  certificates,
};

const outDir = resolve(root, "generated");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "wall.json"), JSON.stringify(wall, null, 2));
await writeFile(resolve(outDir, "jsonld.json"), JSON.stringify(buildJsonLd(certificates), null, 2));

console.log(`✓ wall.json (${certificates.length} certificates)`);
