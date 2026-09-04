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
      background: tokens.bg,
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
    if (app) app.renderer.background.color = tokens.bg;
  }

  function setPieces(pieces, spatialHash, tileIn) {
    piecesById = new Map(pieces.map((p) => [p.id, p]));
    hash = spatialHash;
    if (tileIn) tile = tileIn;
  }

  function setSelection(id) {
    selectedId = id;
  }

  function makeCard(piece) {
    const root = new PIXI.Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    const mat = new PIXI.Graphics();
    const pad = Math.round(Math.min(20, Math.max(10, piece.width * 0.035)));
    const matA = piece.mat?.a || tokens.matA;
    mat.roundRect(0, 0, piece.width, piece.height, 6).fill(matA);
    root.addChild(mat);

    const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    sprite.x = pad;
    sprite.y = pad;
    sprite.width = piece.width - pad * 2;
    sprite.height = piece.height - pad * 2 - 28;
    sprite.tint = 0x888888;
    root.addChild(sprite);

    const plate = new PIXI.Text({
      text: piece.title,
      style: {
        fontFamily: "Satoshi, sans-serif",
        fontSize: 13,
        fill: piece.mat?.ink || tokens.matInk,
        fontWeight: "600",
      },
    });
    plate.x = pad;
    plate.y = piece.height - 22;
    plate.label = "plate";
    root.addChild(plate);

    root._mat = mat;
    root._sprite = sprite;
    root._plate = plate;
    root._pieceId = piece.id;
    root._pad = pad;
    return root;
  }

  function acquire(piece, key) {
    let node = live.get(key);
    if (node) return node;
    node = free.pop() || makeCard(piece);
    node._pieceId = piece.id;
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
    if (!piece.image || loading.has(piece.id)) return;
    if (texturePool.has(piece.id)) {
      applyTex(piece.id);
      return;
    }
    loading.add(piece.id);
    try {
      await texturePool.acquire(piece.id, piece.image, PIXI);
      applyTex(piece.id);
    } finally {
      loading.delete(piece.id);
    }
  }

  function applyTex(id) {
    const slot = texturePool.byId.get(id);
    if (!slot) return;
    for (const node of live.values()) {
      if (node._pieceId === id && node._sprite) {
        node._sprite.texture = slot.texture;
        node._sprite.tint = 0xffffff;
      }
    }
  }

  function recolorMats() {
    for (const node of [...live.values(), ...free]) {
      const piece = piecesById.get(node._pieceId);
      if (!piece || !node._mat) continue;
      const matA = piece.mat?.a || tokens.matA;
      const ink = piece.mat?.ink || tokens.matInk;
      node._mat.clear();
      node._mat.roundRect(0, 0, piece.width, piece.height, 6).fill(matA);
      if (node._plate) node._plate.style.fill = ink;
    }
  }

  function syncCamera(cam) {
    if (!app || !world) return;
    const w = app.screen.width;
    const h = app.screen.height;
    world.position.set(w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
    world.scale.set(cam.zoom);
  }

  function draw(cam) {
    if (!app || !hash) return;
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
          node.position.set(wx, wy);
          node.rotation = (piece.angle * Math.PI) / 180;
          node.zIndex = piece.depth + (selectedId === id ? 50 : 0);
          const dim = selectedId && selectedId !== id;
          node.alpha = dim ? 0.35 : 1;
          if (node._plate) node._plate.visible = !far && !mid;
          if (
            !texturePool.has(id) &&
            sx > -halfW - LOAD_MARGIN_PX &&
            sx < w + halfW + LOAD_MARGIN_PX &&
            sy > -halfH - LOAD_MARGIN_PX &&
            sy < h + halfH + LOAD_MARGIN_PX
          ) {
            ensureTexture(piece);
          } else if (texturePool.has(id)) {
            applyTex(id);
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

    world.sortableChildren = true;
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
