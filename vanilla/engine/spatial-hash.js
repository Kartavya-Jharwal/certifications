export class SpatialHash {
  constructor(cell = 384) {
    this.cell = cell;
    this.map = new Map();
    this.boxes = new Map();
  }

  clear() {
    this.map.clear();
    this.boxes.clear();
  }

  _key(cx, cy) {
    return cx + ":" + cy;
  }

  _cellsFor(aabb) {
    const { cell } = this;
    const x0 = Math.floor(aabb.x / cell);
    const y0 = Math.floor(aabb.y / cell);
    const x1 = Math.floor((aabb.x + aabb.w) / cell);
    const y1 = Math.floor((aabb.y + aabb.h) / cell);
    const keys = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) keys.push(this._key(cx, cy));
    }
    return keys;
  }

  insert(id, aabb) {
    this.remove(id);
    this.boxes.set(id, aabb);
    for (const k of this._cellsFor(aabb)) {
      let set = this.map.get(k);
      if (!set) {
        set = new Set();
        this.map.set(k, set);
      }
      set.add(id);
    }
  }

  remove(id) {
    const aabb = this.boxes.get(id);
    if (!aabb) return;
    for (const k of this._cellsFor(aabb)) {
      const set = this.map.get(k);
      if (set) {
        set.delete(id);
        if (!set.size) this.map.delete(k);
      }
    }
    this.boxes.delete(id);
  }

  query(aabb) {
    const out = new Set();
    for (const k of this._cellsFor(aabb)) {
      const set = this.map.get(k);
      if (!set) continue;
      for (const id of set) {
        const b = this.boxes.get(id);
        if (!b) continue;
        if (b.x < aabb.x + aabb.w && b.x + b.w > aabb.x && b.y < aabb.y + aabb.h && b.y + b.h > aabb.y) {
          out.add(id);
        }
      }
    }
    return out;
  }
}

/** Split a world AABB into ≤4 TILE-local query rects for torus. */
export function queryToroidal(hash, worldAABB, tile) {
  const ids = new Set();
  const { x, y, w, h } = worldAABB;
  const pads = [
    { ox: 0, oy: 0 },
    { ox: -tile.w, oy: 0 },
    { ox: tile.w, oy: 0 },
    { ox: 0, oy: -tile.h },
    { ox: 0, oy: tile.h },
    { ox: -tile.w, oy: -tile.h },
    { ox: tile.w, oy: -tile.h },
    { ox: -tile.w, oy: tile.h },
    { ox: tile.w, oy: tile.h },
  ];

  const i0 = Math.floor(x / tile.w);
  const i1 = Math.floor((x + w) / tile.w);
  const j0 = Math.floor(y / tile.h);
  const j1 = Math.floor((y + h) / tile.h);

  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const local = {
        x: x - i * tile.w,
        y: y - j * tile.h,
        w,
        h,
      };
      // Clip to TILE extended slightly for pieces near edges
      const clipped = {
        x: local.x,
        y: local.y,
        w: local.w,
        h: local.h,
      };
      for (const id of hash.query(clipped)) ids.add(id);
      // Also query wrapped if rect spills outside [0,W)
      if (local.x < 0) {
        for (const id of hash.query({ x: local.x + tile.w, y: local.y, w: -local.x, h: local.h })) ids.add(id);
      }
      if (local.x + local.w > tile.w) {
        for (const id of hash.query({
          x: 0,
          y: local.y,
          w: local.x + local.w - tile.w,
          h: local.h,
        }))
          ids.add(id);
      }
      if (local.y < 0) {
        for (const id of hash.query({ x: local.x, y: local.y + tile.h, w: local.w, h: -local.y })) ids.add(id);
      }
      if (local.y + local.h > tile.h) {
        for (const id of hash.query({
          x: local.x,
          y: 0,
          w: local.w,
          h: local.y + local.h - tile.h,
        }))
          ids.add(id);
      }
    }
  }

  void pads;
  return ids;
}

export function rebuildHash(hash, pieces, tile) {
  hash.clear();
  for (const p of pieces) {
    hash.insert(p.id, {
      x: ((p.x % tile.w) + tile.w) % tile.w,
      y: ((p.y % tile.h) + tile.h) % tile.h,
      w: p.width,
      h: p.height,
    });
  }
}
