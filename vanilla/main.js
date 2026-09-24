import { TILE, HASH_CELL } from "./engine/config.js";
import { wrapTo } from "./engine/math.js";
import { SpatialHash, rebuildHash } from "./engine/spatial-hash.js";
import { createCamera, stepCamera, focusPieceInView, recenter, cancelSpring, zoomAt } from "./engine/camera.js";
import { attachInput } from "./engine/input.js";
import { loadWall } from "./engine/data.js";
import { createWallRenderer } from "./engine/wall-renderer.js";
import { applyTheme, applyMode, cycleTheme, cycleMode, readTokens } from "./engine/theme.js";

const $ = (id) => document.getElementById(id);
const vp = $("viewport");
const host = $("wall-host");
const board = $("board");
const zoomEl = $("zoom-readout");
const panelEl = $("selection-panel");
const panelBody = panelEl?.querySelector(".panel-body");
const titleEl = $("selection-title");
const bylineEl = $("selection-byline");
const summEl = $("selection-summary");
const credEl = $("selection-credential");
const yearEl = $("selection-year");
const tagsEl = $("selection-tags");
const verifyEl = $("selection-verify");
const pendingEl = $("selection-pending");
const indexEl = $("selection-index");
const mmBoard = $("minimap-board");
const mmWindow = $("minimap-window");
const mmDots = $("mm-dots");
const splashEl = $("splash");
const splashCount = $("splash-count");
const toastWrap = $("toasts");
const fpsDot = $("fps-dot");
const liveRegion = $("sr-status");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  pieces: [],
  selectedId: null,
  entered: false,
  tile: { ...TILE },
};

const cam = createCamera(TILE);
let hash = new SpatialHash(HASH_CELL);
const renderer = createWallRenderer(host);
let lastFrame = 0;
let rafId = 0;
let lastZoomLabel = -1;
let frames = 0;
let fpsT = performance.now();

function announce(msg) {
  if (liveRegion) liveRegion.textContent = msg;
}

function toast(msg) {
  if (!toastWrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2200);
}

function requestFrame() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function getViewport() {
  return { w: vp.clientWidth, h: vp.clientHeight };
}

/** Frosted focus veil — CSS owns the easing; JS only flips state. */
function setFocusVeil(on) {
  vp.dataset.focus = on ? "on" : "off";
}

function applyPieceDrift(dx, dy) {
  for (const p of state.pieces) {
    if (state.selectedId === p.id) continue;
    p.x = wrapTo(p.x + dx * 0.02, state.tile.w);
    p.y = wrapTo(p.y + dy * 0.02, state.tile.h);
  }
  rebuildHash(hash, state.pieces, state.tile);
}

const input = attachInput(vp, cam, {
  reduceMotion,
  getViewport,
  onRequestFrame: requestFrame,
  onPanStart: () => setFocusVeil(false),
  onSelect: (sx, sy) => {
    if (!renderer.inited) return;
    const hit = renderer.hitTest(sx, sy, cam);
    selectPiece(hit ? hit.id : null);
  },
});

function focusSelected() {
  const piece = state.pieces.find((p) => p.id === state.selectedId);
  if (!piece) return;
  const { w, h } = getViewport();
  // Desktop: the record card sits right, so centre the piece in the remaining stage.
  const insetRight = w > 820 && panelEl && !panelEl.hidden ? panelEl.offsetWidth + 24 : 0;
  focusPieceInView(cam, piece, w, h, { insetRight });
  setFocusVeil(true);
  requestFrame();
}

function selectPiece(id) {
  const wasOpen = !!state.selectedId;
  state.selectedId = id;
  renderer.setSelection(id);
  updateSelectionPanel(wasOpen && !!id);
  if (id) {
    focusSelected();
    const piece = state.pieces.find((p) => p.id === id);
    if (piece) announce(`${piece.title}, ${piece.issuer}`);
  } else {
    setFocusVeil(false);
  }
  requestFrame();
}

function updateSelectionPanel(swap) {
  if (!panelEl) return;
  const piece = state.pieces.find((p) => p.id === state.selectedId);
  if (!piece) {
    panelEl.hidden = true;
    return;
  }
  titleEl.textContent = piece.title;
  bylineEl.textContent = `Issued by ${piece.issuer}`;
  summEl.textContent = piece.summary;
  credEl.textContent = piece.credentialId;
  yearEl.textContent = String(piece.year);

  tagsEl.replaceChildren(
    ...(piece.tags || []).map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );

  const verifiable = typeof piece.verifyUrl === "string" && /^https:\/\//i.test(piece.verifyUrl);
  verifyEl.hidden = !verifiable;
  verifyEl.href = verifiable ? piece.verifyUrl : "#";
  pendingEl.hidden = verifiable;

  const idx = state.pieces.findIndex((p) => p.id === piece.id);
  indexEl.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(state.pieces.length).padStart(2, "0")}`;

  panelEl.hidden = false;
  // Browsing within an open card: a soft crossfade instead of a full re-entry.
  if (swap && panelBody && !reduceMotion) {
    panelBody.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
}

function cyclePiece(dir) {
  if (!state.pieces.length) return;
  let idx = state.pieces.findIndex((p) => p.id === state.selectedId);
  idx = idx < 0 ? 0 : (idx + dir + state.pieces.length) % state.pieces.length;
  selectPiece(state.pieces[idx].id);
}

function refreshMinimap() {
  if (!mmWindow) return;
  const { w, h } = getViewport();
  const tw = state.tile.w;
  const th = state.tile.h;
  mmWindow.style.left = (wrapTo(cam.x - w / 2 / cam.zoom, tw) / tw) * 100 + "%";
  mmWindow.style.top = (wrapTo(cam.y - h / 2 / cam.zoom, th) / th) * 100 + "%";
  mmWindow.style.width = Math.min(100, Math.max(3, (w / cam.zoom / tw) * 100)) + "%";
  mmWindow.style.height = Math.min(100, Math.max(3, (h / cam.zoom / th) * 100)) + "%";
}

function renderMinimapDots() {
  if (!mmDots) return;
  mmDots.replaceChildren(
    ...state.pieces.map((p) => {
      const d = document.createElement("i");
      d.style.left = (p.x / state.tile.w) * 100 + "%";
      d.style.top = (p.y / state.tile.h) * 100 + "%";
      return d;
    }),
  );
}

function measureFps(now) {
  frames++;
  if (now - fpsT < 500) return;
  const fps = Math.round((frames * 1000) / (now - fpsT));
  frames = 0;
  fpsT = now;
  if (fpsDot) {
    fpsDot.dataset.grade = fps >= 50 ? "ok" : fps >= 30 ? "warn" : "bad";
    fpsDot.title = fps + " fps";
  }
}

function writeChrome() {
  const pct = Math.round(cam.zoom * 100);
  if (zoomEl && pct !== lastZoomLabel) {
    zoomEl.textContent = pct + "%";
    lastZoomLabel = pct;
  }
  if (board) {
    const { w, h } = getViewport();
    const tx = w / 2 - cam.x * cam.zoom;
    const ty = h / 2 - cam.y * cam.zoom;
    board.style.backgroundPosition = `${tx}px ${ty}px, ${tx}px ${ty}px, 0 0`;
  }
}

function tick(now) {
  rafId = 0;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!state.entered || document.hidden) return;

  input.stepDrift(dt, state.pieces, applyPieceDrift);
  stepCamera(cam, dt);
  if (renderer.inited) {
    renderer.syncCamera(cam);
    renderer.draw(cam, dt);
  }
  writeChrome();
  refreshMinimap();
  measureFps(now);
  requestFrame();
}

async function enterWall() {
  if (state.entered) return;
  state.entered = true;

  if (splashEl) {
    splashEl.dataset.state = "leaving";
    const done = () => {
      splashEl.hidden = true;
    };
    if (reduceMotion) done();
    else splashEl.addEventListener("transitionend", done, { once: true });
  }

  // Canvas text rasterises once; make sure the editorial faces are ready first.
  await Promise.allSettled([
    document.fonts.load('700 14px "Satoshi"'),
    document.fonts.load('italic 400 13px "Newsreader"'),
  ]);
  await renderer.initGpu();
  renderer.setThemeTokens(readTokens());
  renderer.setPieces(state.pieces, hash, state.tile);
  renderer.resize();
  lastFrame = 0;
  requestFrame();
  announce("Entered the certificate wall");
}

function onThemeChange() {
  renderer.setThemeTokens(readTokens());
  renderer.recolorMats();
  requestFrame();
}

const ACTIONS = {
  enter: () => enterWall(),
  "zoom-in": ({ w, h }) => zoomAt(cam, 1.15, w / 2, h / 2, w, h),
  "zoom-out": ({ w, h }) => zoomAt(cam, 1 / 1.15, w / 2, h / 2, w, h),
  center: () => {
    setFocusVeil(false);
    recenter(cam);
  },
  focus: () => focusSelected(),
  deselect: () => selectPiece(null),
  prev: () => cyclePiece(-1),
  next: () => cyclePiece(1),
  share: () => shareView(),
  fullscreen: () => toggleFs(),
  shortcuts: () => toggleShortcuts(),
};

function bindChrome() {
  vp.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    const run = btn && ACTIONS[btn.dataset.action];
    if (!run) return;
    run(getViewport());
    requestFrame();
  });

  splashEl?.addEventListener("click", (e) => {
    if (!e.target.closest("[data-action]")) enterWall();
  });

  document.querySelectorAll("[data-theme-set]").forEach((c) => {
    c.addEventListener("click", () => {
      applyTheme(c.dataset.themeSet, { announce });
      onThemeChange();
    });
  });
  document.querySelectorAll("[data-mode-set]").forEach((c) => {
    c.addEventListener("click", () => {
      applyMode(c.dataset.modeSet, { announce });
      onThemeChange();
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.matches?.("input, textarea")) return;
    if (!state.entered) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enterWall();
      }
      return;
    }
    const v = getViewport();
    switch (e.key) {
      case "+":
      case "=":
        zoomAt(cam, 1.12, v.w / 2, v.h / 2, v.w, v.h);
        break;
      case "-":
      case "_":
        zoomAt(cam, 1 / 1.12, v.w / 2, v.h / 2, v.w, v.h);
        break;
      case "0":
        ACTIONS.center();
        break;
      case "f":
      case "F":
        focusSelected();
        break;
      case "Escape":
        if (!$("shortcuts")?.hidden) toggleShortcuts(false);
        else selectPiece(null);
        break;
      case "ArrowLeft":
        cyclePiece(-1);
        break;
      case "ArrowRight":
        cyclePiece(1);
        break;
      case "t":
      case "T":
        cycleTheme(announce);
        onThemeChange();
        break;
      case "m":
      case "M":
        cycleMode(announce);
        onThemeChange();
        break;
      case "?":
        toggleShortcuts();
        break;
      default:
        return;
    }
    requestFrame();
  });

  window.addEventListener("resize", () => {
    renderer.resize();
    requestFrame();
  });

  document.addEventListener("fullscreenchange", () => {
    document.documentElement.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  });

  mmBoard?.addEventListener("click", (e) => {
    const r = mmBoard.getBoundingClientRect();
    cancelSpring(cam);
    setFocusVeil(false);
    cam.x = ((e.clientX - r.left) / r.width) * state.tile.w;
    cam.y = ((e.clientY - r.top) / r.height) * state.tile.h;
    requestFrame();
  });
}

function toggleShortcuts(force) {
  const el = $("shortcuts");
  if (!el) return;
  el.hidden = !(force ?? el.hidden);
}

function toggleFs() {
  if (!document.fullscreenElement) vp.requestFullscreen?.();
  else document.exitFullscreen?.();
}

async function shareView() {
  const hashStr = `#x=${wrapTo(cam.x, state.tile.w).toFixed(1)}&y=${wrapTo(cam.y, state.tile.h).toFixed(1)}&z=${cam.zoom.toFixed(3)}`;
  const url = location.href.split("#")[0] + hashStr;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link to this view copied");
  } catch {
    toast(url);
  }
}

function restoreCamera() {
  const params = new URLSearchParams(location.hash.slice(1));
  const x = Number(params.get("x"));
  const y = Number(params.get("y"));
  const z = Number(params.get("z"));
  if (Number.isFinite(x) && params.has("x")) cam.x = x;
  if (Number.isFinite(y) && params.has("y")) cam.y = y;
  if (Number.isFinite(z) && z > 0) cam.zoom = z;
}

async function boot() {
  let theme = "motif";
  let mode = "dark";
  try {
    theme = localStorage.getItem("motif-theme") || "motif";
    mode = localStorage.getItem("motif-mode") || "dark";
  } catch {
    /* storage blocked */
  }
  applyTheme(theme, { silent: true });
  applyMode(mode);
  bindChrome();

  try {
    const wall = await loadWall();
    state.tile = wall.tile;
    state.pieces = wall.pieces;
    // Mutate in place — input already holds this camera reference.
    Object.assign(cam, createCamera(state.tile));
    hash = new SpatialHash(HASH_CELL);
    rebuildHash(hash, state.pieces, state.tile);
    renderMinimapDots();
    restoreCamera();
    if (splashCount) {
      const n = state.pieces.length;
      splashCount.textContent = `${String(n).padStart(2, "0")} records`;
    }
  } catch (err) {
    console.error(err);
    toast("Couldn’t load the certificate data");
  }
}

boot();
