import {
  CULL_MARGIN_PX,
  LOAD_MARGIN_PX,
  TEXTURE_POOL_N,
  TEXTURE_POOL_N_LOW,
  DPR_CAP,
  DPR_CAP_LOW,
} from "./config.js";
import { queryToroidal } from "./spatial-hash.js";
import { TexturePool } from "./texture-pool.js";
import { worldToScreen, screenToWorld } from "./camera.js";

function isLowEnd() {
  const cores = navigator.hardwareConcurrency || 4;
  const saveData = navigator.connection?.saveData;
  return saveData || cores <= 4;
}

export function createWallRenderer(host) {
  let app = null;
  let PIXI = null;
  let world = null;
  let pool = null;
  let texturePool = null;
  let piecesById = new Map();
  let hash = null;
  let tile = { w: 5200, h: 3600 };
  let tokens = { bg: "#121412", matA: "#2b2825", matB: "#211f1d", matInk: "#f4f2ea", accent: "#ff9166" };
  let selectedId = null;
  let live = new Map(); // key -> container
  let free = [];
  let loading = new Set();
  let inited = false;

  async function initGpu() {
    if (inited) return;
    PIXI = await import("pixi.js");
    const low = isLowEnd();
    const res = Math.min(window.devicePixelRatio || 1, low ? DPR_CAP_LOW : DPR_CAP);
    app = new PIXI.Application();
    await app.init({
      preference: "webgpu",
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
      // Transparent: the CSS board (grid + theme cross-fade) shows through.
      backgroundAlpha: 0,
      antialias: !low,
      resolution: res,
      autoDensity: true,
      powerPreference: low ? "low-power" : "high-performance",
    });
    host.innerHTML = "";
    host.appendChild(app.canvas);
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.touchAction = "none";
    world = new PIXI.Container();
    world.sortableChildren = true;
    app.stage.addChild(world);
    texturePool = new TexturePool(low ? TEXTURE_POOL_N_LOW : TEXTURE_POOL_N);
    texturePool.attach(app.renderer);
    inited = true;
    resize();
  }

  function resize() {
    if (!app) return;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    app.renderer.resize(w, h);
  }

  function setThemeTokens(t) {
    tokens = { ...tokens, ...t };
  }

  function setPieces(pieces, spatialHash, tileIn) {
    piecesById = new Map(pieces.map((p) => [p.id, p]));
    hash = spatialHash;
    if (tileIn) tile = tileIn;
  }

  function setSelection(id) {
    selectedId = id;
  }

  const PLATE_H = 46;
  const TEXT_RES = 2;

  function makeCard() {
    const root = new PIXI.Container();
    const mat = new PIXI.Graphics();
    const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    const plate = new PIXI.Text({
      text: "",
      resolution: TEXT_RES,
      style: { fontFamily: "Satoshi, sans-serif", fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
    });
    const byline = new PIXI.Text({
      text: "",
      resolution: TEXT_RES,
      style: { fontFamily: "Newsreader, Georgia, serif", fontSize: 12.5, fontStyle: "italic" },
    });
    root.addChild(mat, sprite, plate, byline);
    root._mat = mat;
    root._sprite = sprite;
    root._plate = plate;
    root._byline = byline;
    root._pieceId = null;
    root._texId = null;
    return root;
  }

  function paintMat(node, piece) {
    node._mat.clear();
    node._mat.roundRect(0, 0, piece.width, piece.height, 4).fill(piece.mat?.a || tokens.matA);
    const ink = piece.mat?.ink || tokens.matInk;
    node._plate.style.fill = ink;
    node._byline.style.fill = ink;
    node._byline.alpha = 0.72;
  }

  /** Pooled cards are generic; bind geometry and copy to the record they now show. */
  function bindCard(node, piece) {
    const pad = Math.round(Math.min(20, Math.max(10, piece.width * 0.035)));
    node._pieceId = piece.id;
    node._texId = null;
    node._pad = pad;
    node.pivot.set(piece.hw, piece.hh);
    node.alpha = selectedId && selectedId !== piece.id ? 0.32 : 1;
    node.scale.set(1);
    paintMat(node, piece);

    const s = node._sprite;
    s.texture = PIXI.Texture.WHITE;
    s.tint = PIXI.Color.shared.setValue(tokens.matB || tokens.matA).toNumber();
    s.position.set(pad, pad);
    s.width = piece.width - pad * 2;
    s.height = piece.height - pad * 2 - PLATE_H;

    node._plate.text = piece.title;
    node._plate.position.set(pad, piece.height - PLATE_H + 6);
    node._byline.text = piece.issuer ? `${piece.issuer}, ${piece.year}` : String(piece.year || "");
    node._byline.position.set(pad, piece.height - PLATE_H + 25);
  }

  function acquire(piece, key) {
    let node = live.get(key);
    if (node) return node;
    node = free.pop() || makeCard();
    bindCard(node, piece);
    node.visible = true;
    world.addChild(node);
    live.set(key, node);
    return node;
  }

  function release(key) {
    const node = live.get(key);
    if (!node) return;
    live.delete(key);
    node.visible = false;
    world.removeChild(node);
    free.push(node);
  }

  async function ensureTexture(piece) {
    if (!piece.image || loading.has(piece.id) || texturePool.has(piece.id)) return;
    loading.add(piece.id);
    try {
      // Decode via <img>: Assets.load infers parsers from file extensions, and
      // CDN URLs (query-string only) resolve to null there.
      let texture = PIXI.Texture.WHITE;
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = piece.image;
        await img.decode();
        texture = PIXI.Texture.from(img);
      } catch {
        /* keep the mat placeholder */
      }
      texturePool.byId.set(piece.id, { texture, cover: null, url: piece.image, lastUsed: performance.now() });
      texturePool.lru.push(piece.id);
    } finally {
      loading.delete(piece.id);
    }
  }

  /** Crop the source to the card window's aspect once per record — cover, not stretch. */
  function coverTexture(slot, piece, pad) {
    if (slot.cover) return slot.cover;
    const src = slot.texture;
    if (!src || src === PIXI.Texture.WHITE) return src;
    const winW = piece.width - pad * 2;
    const winH = piece.height - pad * 2 - PLATE_H;
    const tw = src.width;
    const th = src.height;
    const target = winW / winH;
    let fw = tw;
    let fh = tw / target;
    if (fh > th) {
      fh = th;
      fw = th * target;
    }
    const frame = new PIXI.Rectangle((tw - fw) / 2, (th - fh) / 2, fw, fh);
    slot.cover = new PIXI.Texture({ source: src.source, frame });
    return slot.cover;
  }

  function bindTexture(node, piece) {
    if (node._texId === piece.id) return;
    const slot = texturePool.byId.get(piece.id);
    if (!slot || !slot.texture || slot.texture === PIXI.Texture.WHITE) return;
    const s = node._sprite;
    const w = s.width;
    const h = s.height;
    s.texture = coverTexture(slot, piece, node._pad);
    s.width = w;
    s.height = h;
    s.tint = 0xffffff;
    node._texId = piece.id;
  }

  function recolorMats() {
    for (const node of live.values()) {
      const piece = piecesById.get(node._pieceId);
      if (piece) paintMat(node, piece);
    }
    // Free cards repaint on their next bind.
  }

  function syncCamera(cam) {
    if (!app || !world) return;
    const w = app.screen.width;
    const h = app.screen.height;
    world.position.set(w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
    world.scale.set(cam.zoom);
  }

  function draw(cam, dt = 1 / 60) {
    if (!app || !hash) return;
    // Frame-rate independent approach toward selection targets.
    const k = 1 - Math.exp(-dt * 9);
    const w = app.screen.width;
    const h = app.screen.height;
    const padW = (CULL_MARGIN_PX + 260) / cam.zoom;
    const padH = (CULL_MARGIN_PX + 260) / cam.zoom;
    const minX = cam.x - w / 2 / cam.zoom - padW;
    const maxX = cam.x + w / 2 / cam.zoom + padW;
    const minY = cam.y - h / 2 / cam.zoom - padH;
    const maxY = cam.y + h / 2 / cam.zoom + padH;

    const i0 = Math.floor(minX / tile.w);
    const i1 = Math.floor(maxX / tile.w);
    const j0 = Math.floor(minY / tile.h);
    const j1 = Math.floor(maxY / tile.h);

    const needed = new Set();
    const ids = queryToroidal(
      hash,
      { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      tile,
    );

    const far = cam.zoom < 0.5;
    const mid = cam.zoom < 0.8;

    for (const id of ids) {
      const piece = piecesById.get(id);
      if (!piece) continue;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const wx = piece.x + i * tile.w;
          const wy = piece.y + j * tile.h;
          const sx = (wx + piece.hw - cam.x) * cam.zoom + w / 2;
          const sy = (wy + piece.hh - cam.y) * cam.zoom + h / 2;
          const halfW = piece.hw * cam.zoom;
          const halfH = piece.hh * cam.zoom;
          if (
            sx < -halfW - CULL_MARGIN_PX ||
            sx > w + halfW + CULL_MARGIN_PX ||
            sy < -halfH - CULL_MARGIN_PX ||
            sy > h + halfH + CULL_MARGIN_PX
          ) {
            continue;
          }
          const key = id + "@" + i + ":" + j;
          needed.add(key);
          const node = acquire(piece, key);
          const isSel = selectedId === id;
          node.position.set(wx + piece.hw, wy + piece.hh);
          node.rotation = ((isSel ? piece.angle * 0.25 : piece.angle) * Math.PI) / 180;
          node.zIndex = piece.depth + (isSel ? 50 : 0);
          const targetAlpha = selectedId && !isSel ? 0.32 : 1;
          const targetScale = isSel ? 1.035 : 1;
          node.alpha += (targetAlpha - node.alpha) * k;
          node.scale.set(node.scale.x + (targetScale - node.scale.x) * k);
          node._plate.visible = !far;
          node._byline.visible = !far && !mid;
          if (texturePool.has(id)) {
            bindTexture(node, piece);
          } else if (
            sx > -halfW - LOAD_MARGIN_PX &&
            sx < w + halfW + LOAD_MARGIN_PX &&
            sy > -halfH - LOAD_MARGIN_PX &&
            sy < h + halfH + LOAD_MARGIN_PX
          ) {
            ensureTexture(piece);
          }
        }
      }
    }

    for (const key of [...live.keys()]) {
      if (!needed.has(key)) release(key);
    }

    // Unload textures for ids not visible
    const visibleIds = new Set([...needed].map((k) => k.split("@")[0]));
    for (const id of [...texturePool.byId.keys()]) {
      if (!visibleIds.has(id)) {
        // hysteresis: keep briefly — release only if pool pressured
        if (texturePool.size() > texturePool.N * 0.9) texturePool.release(id);
      }
    }
  }

  function hitTest(sx, sy, cam) {
    if (!app) return null;
    const w = app.screen.width;
    const h = app.screen.height;
    const worldPt = screenToWorld(cam, sx, sy, w, h);
    // Search nearest torus images
    let best = null;
    let bestD = Infinity;
    for (const piece of piecesById.values()) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const wx = piece.x + i * tile.w;
          const wy = piece.y + j * tile.h;
          if (
            worldPt.x >= wx &&
            worldPt.x <= wx + piece.width &&
            worldPt.y >= wy &&
            worldPt.y <= wy + piece.height
          ) {
            const d = Math.hypot(worldPt.x - (wx + piece.hw), worldPt.y - (wy + piece.hh));
            if (d < bestD) {
              bestD = d;
              best = piece;
            }
          }
        }
      }
    }
    return best;
  }

  function destroy() {
    app?.destroy(true);
    app = null;
    inited = false;
  }

  return {
    initGpu,
    resize,
    setThemeTokens,
    setPieces,
    setSelection,
    syncCamera,
    draw,
    hitTest,
    recolorMats,
    get inited() {
      return inited;
    },
    textureCount: () => texturePool?.size() ?? 0,
  };
}
