import { WALL_JSON, TILE } from "./config.js";

export async function loadWall(url = WALL_JSON) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const data = await res.json();
  const tile = data.tile || { ...TILE };
  const pieces = (data.certificates || []).map((c) => {
    const layout = c.layout || {};
    const width = layout.width ?? 360;
    const height = layout.height ?? 420;
    return {
      id: c.id,
      title: c.title,
      issuer: c.issuer,
      year: c.year,
      summary: c.summary,
      credentialId: c.credentialId,
      verifyUrl: c.verifyUrl,
      tags: c.tags || [],
      image: c.image || "",
      mat: c.mat || null,
      accent: c.accent || null,
      x: layout.x ?? 0,
      y: layout.y ?? 0,
      width,
      height,
      angle: layout.angle ?? 0,
      depth: layout.depth ?? 1,
      hw: width / 2,
      hh: height / 2,
    };
  });
  return { tile, pieces, generatedAt: data.generatedAt };
}
