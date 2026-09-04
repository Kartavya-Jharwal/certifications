import { gsap } from "gsap";
import { TILE, HASH_CELL } from "./engine/config.js";
import { wrapTo } from "./engine/math.js";
import { SpatialHash, rebuildHash } from "./engine/spatial-hash.js";
import {
  createCamera,
  stepCamera,
  focusPieceInView,
  recenter,
  cancelSpring,
  zoomAt,
  panBy,
} from "./engine/camera.js";
import { attachInput } from "./engine/input.js";
import { loadWall } from "./engine/data.js";
import { createWallRenderer } from "./engine/wall-renderer.js";
import {
  applyTheme,
  applyMode,
  cycleTheme,
  cycleMode,
  readTokens,
} from "./engine/theme.js";

const $ = (id) => document.getElementById(id);
const vp = $("viewport");
const host = $("wall-host");
const board = $("board");
const zoomEl = $("zoom-readout");
const panelEl = $("selection-panel");
const titleEl = $("selection-title");
const fmtEl = $("selection-format");
const summEl = $("selection-summary");
const credEl = $("selection-credential");
const verifyEl = $("selection-verify");
const tagsEl = $("selection-tags");
const toneEl = $("selection-tone");
const swatchEl = $("selection-swatch");
const indexEl = $("selection-index");
const mmBoard = $("minimap-board");
const mmWindow = $("minimap-window");
const mmDots = $("mm-dots");
const splashEl = $("splash");
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

let cam = createCamera(TILE);
let hash = new SpatialHash(HASH_CELL);
let renderer = createWallRenderer(host);
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
  setTimeout(() => el.remove(), 2400);
}

function requestFrame() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function getViewport() {
  return { w: vp.clientWidth, h: vp.clientHeight };
}

function applyPieceDrift(dx, dy) {
  // Pointer-tied drift moves pieces slightly within TILE (wrapped)
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
  onSelect: (sx, sy) => {
    if (!renderer.inited) return;
    const hit = renderer.hitTest(sx, sy, cam);
    if (hit) selectPiece(hit.id);
    else selectPiece(null);
  },
});

function selectPiece(id) {
  state.selectedId = id;
  renderer.setSelection(id);
  updateSelectionPanel();
  if (id) {
    const piece = state.pieces.find((p) => p.id === id);
    if (piece) {
      const { w, h } = getViewport();
      focusPieceInView(cam, piece, w, h);
      announce(`Selected ${piece.title}`);
    }
  }
  requestFrame();
}

function updateSelectionPanel() {
  if (!panelEl) return;
  const piece = state.pieces.find((p) => p.id === state.selectedId);
  if (!piece) {
    panelEl.hidden = true;
    return;
  }
  panelEl.hidden = false;
  titleEl.textContent = piece.title;
  fmtEl.textContent = `${piece.issuer} · ${piece.year}`;
  summEl.textContent = piece.summary;
  if (credEl) credEl.textContent = piece.credentialId;
  if (verifyEl) {
    const ok = piece.verifyUrl && piece.verifyUrl !== "#" && /^https:/i.test(piece.verifyUrl);
    verifyEl.href = ok ? piece.verifyUrl : "#";
    verifyEl.toggleAttribute("hidden", !ok);
    verifyEl.textContent = ok ? "Verify credential" : "";
  }
  if (tagsEl) {
    tagsEl.textContent = (piece.tags || []).join(" · ");
  }
  if (toneEl) toneEl.textContent = (piece.tags && piece.tags[0]) || "Credential";
  if (swatchEl) swatchEl.style.background = piece.accent || readTokens().accent;
  const idx = state.pieces.findIndex((p) => p.id === piece.id);
  if (indexEl) indexEl.textContent = `${idx + 1} / ${state.pieces.length}`;
}

function cyclePiece(dir) {
  if (!state.pieces.length) return;
  let idx = state.pieces.findIndex((p) => p.id === state.selectedId);
  if (idx < 0) idx = 0;
  else idx = (idx + dir + state.pieces.length) % state.pieces.length;
  selectPiece(state.pieces[idx].id);
}

function refreshMinimap() {
  if (!mmWindow) return;
  const { w, h } = getViewport();
  const tw = state.tile.w;
  const th = state.tile.h;
  const halfW = w / 2 / cam.zoom;
  const halfH = h / 2 / cam.zoom;
  mmWindow.style.left = (wrapTo(cam.x - halfW, tw) / tw) * 100 + "%";
  mmWindow.style.top = (wrapTo(cam.y - halfH, th) / th) * 100 + "%";
  mmWindow.style.width = Math.min(100, Math.max(3, (w / cam.zoom / tw) * 100)) + "%";
  mmWindow.style.height = Math.min(100, Math.max(3, (h / cam.zoom / th) * 100)) + "%";
}

function renderMinimapDots() {
  if (!mmDots) return;
  mmDots.innerHTML = "";
  for (const p of state.pieces) {
    const d = document.createElement("i");
    d.style.left = (p.x / state.tile.w) * 100 + "%";
    d.style.top = (p.y / state.tile.h) * 100 + "%";
    mmDots.appendChild(d);
  }
}

function measureFps(now) {
  frames++;
  if (now - fpsT >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
    if (fpsDot) {
      fpsDot.dataset.grade = fps >= 50 ? "ok" : fps >= 30 ? "warn" : "bad";
      fpsDot.title = fps + " fps";
    }
  }
}

function writeChrome() {
  if (zoomEl) {
    const pct = Math.round(cam.zoom * 100);
    if (pct !== lastZoomLabel) {
      zoomEl.textContent = pct + "%";
      lastZoomLabel = pct;
    }
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

  if (state.entered && !document.hidden) {
    input.stepDrift(dt, state.pieces, applyPieceDrift);
    stepCamera(cam, dt);
    if (renderer.inited) {
      renderer.syncCamera(cam);
      renderer.draw(cam);
    }
    writeChrome();
    refreshMinimap();
    measureFps(now);
    requestFrame();
  }
}

async function enterWall() {
  if (state.entered) return;
  state.entered = true;
  if (splashEl) {
    splashEl.style.pointerEvents = "none";
    gsap.to(splashEl, {
      opacity: 0,
      duration: reduceMotion ? 0.01 : 0.45,
      onComplete: () => {
        splashEl.hidden = true;
      },
    });
  }
  await renderer.initGpu();
  renderer.setThemeTokens(readTokens());
  renderer.setPieces(state.pieces, hash, state.tile);
  renderer.resize();
  lastFrame = 0;
  requestFrame();
  announce("Entered the certificate wall");
}

function onThemeChange() {
  const t = readTokens();
  renderer.setThemeTokens(t);
  renderer.recolorMats?.();
  requestFrame();
}

function bindChrome() {
  vp.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const { w, h } = getViewport();
    if (action === "enter") enterWall();
    if (action === "zoom-in") zoomAt(cam, 1.15, w / 2, h / 2, w, h);
    if (action === "zoom-out") zoomAt(cam, 1 / 1.15, w / 2, h / 2, w, h);
    if (action === "center") recenter(cam);
    if (action === "focus" && state.selectedId) {
      const p = state.pieces.find((x) => x.id === state.selectedId);
      if (p) focusPieceInView(cam, p, w, h);
    }
    if (action === "deselect") selectPiece(null);
    if (action === "prev") cyclePiece(-1);
    if (action === "next") cyclePiece(1);
    if (action === "share") shareView();
    if (action === "fullscreen") toggleFs();
    if (action === "shortcuts") toggleShortcuts();
    if (action === "scatter") {
      // soft realign: rebuild autofill isn't available runtime — nudge randomly
      for (const p of state.pieces) {
        p.angle += (Math.random() - 0.5) * 2;
      }
      toast("Wall realigned");
    }
    requestFrame();
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
    if (e.target.matches?.("input,textarea")) return;
    const { w, h } = getViewport();
    if ((e.key === "Enter" || e.key === " ") && !state.entered) {
      e.preventDefault();
      enterWall();
    }
    if (e.key === "+" || e.key === "=") zoomAt(cam, 1.12, w / 2, h / 2, w, h);
    if (e.key === "-" || e.key === "_") zoomAt(cam, 1 / 1.12, w / 2, h / 2, w, h);
    if (e.key === "0") recenter(cam);
    if (e.key === "f" || e.key === "F") {
      const p = state.pieces.find((x) => x.id === state.selectedId);
      if (p) focusPieceInView(cam, p, w, h);
    }
    if (e.key === "Escape") {
      selectPiece(null);
      toggleShortcuts(false);
    }
    if (e.key === "ArrowLeft") cyclePiece(-1);
    if (e.key === "ArrowRight") cyclePiece(1);
    if (e.key === "t" || e.key === "T") {
      cycleTheme(announce);
      onThemeChange();
    }
    if (e.key === "m" || e.key === "M") {
      cycleMode(announce);
      onThemeChange();
    }
    if (e.key === "?" || (e.shiftKey && e.key === "/")) toggleShortcuts();
    requestFrame();
  });

  window.addEventListener("resize", () => {
    renderer.resize();
    requestFrame();
  });

  if (mmBoard) {
    mmBoard.addEventListener("click", (e) => {
      const r = mmBoard.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * state.tile.w;
      const y = ((e.clientY - r.top) / r.height) * state.tile.h;
      cancelSpring(cam);
      cam.x = x;
      cam.y = y;
      requestFrame();
    });
  }
}

function toggleShortcuts(force) {
  const el = $("shortcuts");
  if (!el) return;
  const open = force ?? el.hidden;
  el.hidden = !open;
}

function toggleFs() {
  if (!document.fullscreenElement) vp.requestFullscreen?.();
  else document.exitFullscreen?.();
}

async function shareView() {
  const tw = state.tile.w;
  const th = state.tile.h;
  const hashStr = `#x=${wrapTo(cam.x, tw).toFixed(1)}&y=${wrapTo(cam.y, th).toFixed(1)}&z=${cam.zoom.toFixed(3)}`;
  const url = location.href.split("#")[0] + hashStr;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toast(url);
  }
}

function restoreCamera() {
  const h = location.hash.slice(1);
  if (!h) return;
  const params = new URLSearchParams(h.replace(/&/g, "&"));
  // support x= y= z=
  const map = Object.fromEntries(h.split("&").map((p) => p.split("=")));
  if (map.x) cam.x = Number(map.x) || cam.x;
  if (map.y) cam.y = Number(map.y) || cam.y;
  if (map.z) cam.zoom = Number(map.z) || cam.zoom;
  void params;
}

async function boot() {
  let theme = "motif";
  let mode = "dark";
  try {
    theme = localStorage.getItem("motif-theme") || "motif";
    mode = localStorage.getItem("motif-mode") || "dark";
  } catch {
    /* */
  }
  applyTheme(theme, { silent: true });
  applyMode(mode);
  bindChrome();

  try {
    const wall = await loadWall();
    state.tile = wall.tile;
    state.pieces = wall.pieces;
    cam = createCamera(state.tile);
    hash = new SpatialHash(HASH_CELL);
    rebuildHash(hash, state.pieces, state.tile);
    renderMinimapDots();
    restoreCamera();
  } catch (err) {
    console.error(err);
    toast("Failed to load certificate data");
  }
}

boot();
