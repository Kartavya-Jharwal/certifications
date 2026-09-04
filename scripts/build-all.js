import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runPdfs = process.env.BUILD_PDFS === "1" || process.argv.includes("--pdfs");

function run(script) {
  const r = spawnSync(process.execPath, [resolve(root, "scripts", script)], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (runPdfs) run("render-pdfs.js");
run("build-data.js");
run("build-vanilla.js");
