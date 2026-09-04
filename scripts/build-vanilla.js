import { mkdir, copyFile, writeFile, readFile, rm, readdir, cp } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const source = resolve(root, "vanilla");
const target = resolve(root, "site");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of ["index.html", "styles.css", "main.js"]) {
  await copyFile(resolve(source, file), resolve(target, file));
}

await cp(resolve(source, "engine"), resolve(target, "engine"), { recursive: true });

const fontsSrc = resolve(root, "public/fonts");
try {
  await cp(fontsSrc, resolve(target, "fonts"), { recursive: true });
} catch {
  console.warn("⚠ public/fonts missing");
}

const assetsSrc = resolve(root, "public/assets");
try {
  await mkdir(resolve(target, "assets"), { recursive: true });
  for (const entry of await readdir(assetsSrc)) {
    if (entry === ".gitkeep") continue;
    await copyFile(join(assetsSrc, entry), join(target, "assets", entry));
  }
} catch {
  await mkdir(resolve(target, "assets"), { recursive: true });
}

const wallSrc = resolve(root, "generated/wall.json");
const jsonldSrc = resolve(root, "generated/jsonld.json");
await mkdir(resolve(target, "data"), { recursive: true });
await copyFile(wallSrc, resolve(target, "data/wall.json"));

const buildId = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
let html = await readFile(resolve(target, "index.html"), "utf8");
html = html
  .replace('href="./styles.css"', `href="./styles.css?v=${buildId}"`)
  .replace('src="./main.js"', `src="./main.js?v=${buildId}"`);

try {
  const jsonld = await readFile(jsonldSrc, "utf8");
  const wall = JSON.parse(await readFile(wallSrc, "utf8"));
  const count = wall.certificates?.length ?? 0;
  const desc = `Inspectable credentials — ${count} proof records of technical execution. Not ornaments.`;
  const ldTag = `<script type="application/ld+json">${jsonld}</script>`;
  const meta = [
    `<meta name="description" content="${desc.replace(/"/g, "&quot;")}" />`,
    `<link rel="canonical" href="https://kartavya.tech/certifications/" />`,
    `<meta property="og:title" content="Certificate Wall · Kartavya Jharwal" />`,
    `<meta property="og:description" content="${desc.replace(/"/g, "&quot;")}" />`,
    `<meta property="og:url" content="https://kartavya.tech/certifications/" />`,
  ].join("\n    ");
  if (html.includes("<!-- SEO_INJECT -->")) {
    html = html.replace("<!-- SEO_INJECT -->", `${meta}\n    ${ldTag}`);
  } else {
    html = html.replace("</head>", `    <!-- SEO_INJECT -->\n    ${meta}\n    ${ldTag}\n  </head>`);
  }
} catch (err) {
  console.warn("⚠ SEO inject skipped:", err.message);
}

await writeFile(resolve(target, "index.html"), html);
await writeFile(resolve(target, ".nojekyll"), "");

console.log(`✓ site/ ready (build ${buildId})`);
