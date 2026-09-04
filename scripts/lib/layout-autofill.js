/** Seeded layout autofill — same id ⇒ same layout every build. */

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATIOS = [0.72, 0.8, 1, 1.25, 1.4];
const MIN_GAP = 300;

function wrapDist(a, b, span) {
  let d = Math.abs(a - b);
  return Math.min(d, span - d);
}

export function autofillLayouts(certificates, tile = { w: 5200, h: 3600 }) {
  const placed = [];
  return certificates.map((c) => {
    const layout = { ...(c.layout || {}) };
    const rng = mulberry32(hashString(c.id));
    const rand = (a, b) => a + rng() * (b - a);

    if (layout.width == null || layout.height == null) {
      const ratio = RATIOS[(rng() * RATIOS.length) | 0];
      const base = rand(300, 430);
      layout.width = ratio >= 1 ? base * ratio : base;
      layout.height = ratio >= 1 ? base : base / ratio;
    }
    if (layout.angle == null) layout.angle = rand(-1.4, 1.4);
    if (layout.depth == null) {
      const area = layout.width * layout.height;
      layout.depth = area > 175000 ? 2 : area > 120000 ? 1 : 0;
    }

    if (layout.x == null || layout.y == null) {
      let x = 0, y = 0, ok = false;
      for (let attempt = 0; attempt < 400; attempt++) {
        x = rand(0, tile.w);
        y = rand(0, tile.h);
        ok = placed.every((p) => {
          const dx = wrapDist(p.x, x, tile.w);
          const dy = wrapDist(p.y, y, tile.h);
          return Math.hypot(dx, dy) > MIN_GAP;
        });
        if (ok) break;
      }
      layout.x = x;
      layout.y = y;
    }

    placed.push({ x: layout.x, y: layout.y });
    return { ...c, layout };
  });
}
