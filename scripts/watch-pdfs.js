import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pdfDir = resolve(root, "source-pdfs");
let timer = null;
let running = false;

function runRender(file) {
  if (running) return;
  running = true;
  const args = [resolve(root, "scripts/render-pdfs.js")];
  if (file) args.push(file);
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
  child.on("exit", () => {
    running = false;
  });
}

console.log(`watching ${pdfDir} …`);
watch(pdfDir, { recursive: false }, (_evt, filename) => {
  if (!filename || !filename.toLowerCase().endsWith(".pdf")) return;
  clearTimeout(timer);
  timer = setTimeout(() => runRender(resolve(pdfDir, filename)), 300);
});
