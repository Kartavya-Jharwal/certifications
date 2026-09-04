export const wrapTo = (v, span) => ((v % span) + span) % span;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

export function wrapDist(a, b, span) {
  let d = Math.abs(a - b);
  return Math.min(d, span - d);
}

export function nearestImage(cam, pieceX, pieceY, tileW, tileH) {
  const ix = Math.round((cam.x - pieceX) / tileW);
  const iy = Math.round((cam.y - pieceY) / tileH);
  return { x: pieceX + ix * tileW, y: pieceY + iy * tileH };
}
