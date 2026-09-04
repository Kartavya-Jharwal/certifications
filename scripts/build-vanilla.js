// Assemble the GitHub Pages artifact from vanilla/.
// Run: npm run build  (or node scripts/build-vanilla.js)
import { mkdir, copyFile, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const source = resolve(root, "vanilla");
const target = resolve(root, "site");

// Always assemble a clean artifact so Pages never keeps stale assets.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of ["index.html", "styles.css", "main.js"]) {
  await copyFile(resolve(source, file), resolve(target, file));
}

// Cache-bust mutable assets so browsers pick up each deploy.
const buildId = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
const deployIndex = resolve(target, "index.html");
let deployHtml = await readFile(deployIndex, "utf8");
deployHtml = deployHtml
  .replace('href="./styles.css"', `href="./styles.css?v=${buildId}"`)
  .replace('src="./main.js"', `src="./main.js?v=${buildId}"`);
await writeFile(deployIndex, deployHtml);

// Optional: copy locally generated or hand-patched assets into the bundle.
// Drop files under public/assets/ (or generated/) and they ship with site/.
for (const dirName of ["public/assets", "generated"]) {
  const assetsSource = resolve(root, dirName);
  try {
    const entries = await readdir(assetsSource);
    const assetsTarget = resolve(target, dirName === "generated" ? "generated" : "assets");
    await mkdir(assetsTarget, { recursive: true });
    for (const entry of entries) {
      const entryPath = resolve(assetsSource, entry);
      const entryStat = await stat(entryPath);
      if (entryStat.isFile()) {
        await copyFile(entryPath, resolve(assetsTarget, entry));
      }
    }
  } catch {
    // Directory optional until you patch in real certificate assets.
  }
}

await writeFile(resolve(target, ".nojekyll"), "");

const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
console.log(`✓ Pages bundle ready in site/ (${pkg.name} ${pkg.version})`);
console.log("  Preview with: npx serve site");
