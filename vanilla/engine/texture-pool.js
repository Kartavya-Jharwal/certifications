/**
 * Fixed-size GPU texture pool — recycle slots; never unbounded allocate.
 */
export class TexturePool {
  constructor(N = 96) {
    this.N = N;
    this.free = [];
    this.lru = [];
    this.byId = new Map(); // id -> { texture, url, lastUsed }
    this.renderer = null;
    this._placeholder = null;
  }

  attach(renderer) {
    this.renderer = renderer;
  }

  async acquire(id, url, PIXI) {
    const now = performance.now();
    let slot = this.byId.get(id);
    if (slot) {
      slot.lastUsed = now;
      this._touch(id);
      return slot.texture;
    }

    if (this.byId.size >= this.N) this._evict();

    let texture;
    try {
      texture = await PIXI.Assets.load(url);
    } catch {
      texture = PIXI.Texture.WHITE;
    }
    this.byId.set(id, { texture, url, lastUsed: now });
    this.lru.push(id);
    return texture;
  }

  release(id) {
    const slot = this.byId.get(id);
    if (!slot) return;
    this.byId.delete(id);
    this.lru = this.lru.filter((x) => x !== id);
    // Keep GPU texture cached in Assets; slot count is what we bound.
  }

  _touch(id) {
    this.lru = this.lru.filter((x) => x !== id);
    this.lru.push(id);
  }

  _evict() {
    while (this.byId.size >= this.N && this.lru.length) {
      const old = this.lru.shift();
      this.byId.delete(old);
    }
  }

  has(id) {
    return this.byId.has(id);
  }

  size() {
    return this.byId.size;
  }
}
