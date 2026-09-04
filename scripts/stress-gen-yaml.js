/** Dev-only: emit a large YAML catalog for stress tests. */
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const n = Number(process.argv[2] || 200);
const imgs = [
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80",
];

const lines = ["version: 1", "certificates:"];
for (let i = 1; i <= n; i++) {
  const id = `stress-${String(i).padStart(3, "0")}`;
  lines.push(`  - id: ${id}`);
  lines.push(`    title: "Stress Credential ${i}"`);
  lines.push(`    issuer: "Load Test Bureau"`);
  lines.push(`    year: ${2020 + (i % 6)}`);
  lines.push(`    summary: "Synthetic proof record for scale stress."`);
  lines.push(`    credentialId: "STRESS-${i}"`);
  lines.push(`    verifyUrl: "#"`);
  lines.push(`    tags: [stress, scale]`);
  lines.push(`    image: "${imgs[i % imgs.length]}"`);
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "certificates.stress.yaml");
await writeFile(out, lines.join("\n") + "\n");
console.log(`✓ wrote ${out} (${n} entries) — copy over certificates.yaml to stress`);
