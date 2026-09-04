import { gsap } from "gsap";

/* ═══════════════════════════════════════════════════════════════════════════
   MOTIF — INFINITE GALLERY WALL

   Coordinate model
   ────────────────
   • TILE      A finite rectangle holding every artwork exactly once.
   • World     The infinite plane made of TILE repeated in both axes.
   • Camera    { x, y } in world units, `zoom` in CSS px per world unit.

   Why tiling (and not "snap the element to the nearest repeat")
   ─────────────────────────────────────────────────────────────
   A single element per artwork can only ever be in one place. The moment the
   viewport spans a seam, that artwork must be visible on BOTH sides at once —
   impossible with one node, which is what produced the empty voids and the
   popping. So we instantiate one node per *visible (piece, tileX, tileY)*
   triple, drawn from a per-piece pool. Nodes are recycled, never rebuilt, so
   the DOM cost tracks what is on screen rather than the size of the world.
   ═══════════════════════════════════════════════════════════════════════════ */

const TILE = { w: 5200, h: 3600 };
const PIECE_COUNT = 30;

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 3.6;
const CULL_MARGIN = 320;   // px beyond the viewport a node stays alive
const LOAD_MARGIN = 620;   // px beyond the viewport we begin fetching

/* ── Motion ──────────────────────────────────────────────────────────────── */
const DRIFT_SPEED = 16;    // world units / second at rest
const DRIFT_DECAY = 0.045; // how fast a flick settles back to idle
const DRIFT_DAMP = 0.3;    // hovered / selected pieces slow down
const DRIFT_BOOST_MAX = 2.6;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = matchMedia("(pointer: coarse)").matches;

/* ── Content ─────────────────────────────────────────────────────────────── */
// Preview stand-ins from Unsplash until real certificate assets are patched in.
// Replace these URLs (or swap to local paths under ./assets/) when ready.
const IMAGES = [
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80",
];

// Each mat ships its own ink so plate text is legible on light AND dark board.
const MATS = [
  { a: "#efe9dd", b: "#ddd4c4", ink: "#241f18" },
  { a: "#e8e8e5", b: "#d2d3cf", ink: "#1f2220" },
  { a: "#1c1d1b", b: "#111211", ink: "#eceae2" },
  { a: "#eadfc9", b: "#d6c8ac", ink: "#2a2415" },
  { a: "#232a2c", b: "#161b1c", ink: "#e4eaec" },
];

const ACCENTS = ["#c25a30", "#456673", "#b8893c", "#5d7d55", "#6f5aa8"];
const TITLES = ["Certified Signal", "Verified Fragment", "Issued Passage", "Threshold Marker", "Third-Party Proof", "High-Trust Paper", "Validation Token", "Public Attestation", "Sealed Record", "Notice of Merit", "Standing Order", "Field Citation"];
const ISSUERS = ["Third-Party Ledger", "The Civic Index", "Validation Bureau", "Atlas Registry", "Signal Office", "Reference Guild"];
const MEDIA = ["Archival pigment", "Silver gelatin", "Letterpress", "Giclée", "Offset litho", "Embossed stock"];
const SUMMARIES = [
  "Signal first, proof second, reading entirely optional.",
  "Third-party trust rendered as a physical artifact.",
  "Verification you glance at, never actually read.",
  "Proof by proximity, trust through sheer repetition.",
  "A badge that signals before it explains.",
  "Stamped, sealed, filed, and quietly repeated.",
];

/* ── Utilities ───────────────────────────────────────────────────────────── */
let _id = 0;
const uid = () => ++_id;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrapTo = (v, span) => ((v % span) + span) % span;

/* ── DOM ─────────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const vp = $("viewport");
const board = $("board");
const layer = $("certificates");
const zoomEl = $("zoom-readout");
const panelEl = $("selection-panel");
const titleEl = $("selection-title");
const fmtEl = $("selection-format");
const summEl = $("selection-summary");
const toneEl = $("selection-tone");
const swatchEl = $("selection-swatch");
const indexEl = $("selection-index");
const mmBoard = $("minimap-board");
const mmWindow = $("minimap-window");
const mmDots = $("mm-dots");
const splashEl = $("splash");
const fileInput = $("file-input");
const toastWrap = $("toasts");
const fpsDot = $("fps-dot");
const liveRegion = $("sr-status");

/* ── State ───────────────────────────────────────────────────────────────── */
const state = {
  pieces: [],
  selectedId: null,
  hoveredId: null,
  cam: { x: TILE.w / 2, y: TILE.h / 2, zoom: 1 },
  vp: { w: 0, h: 0 },
  gesture: null,
  pointers: new Map(),
  entered: false,
};

let vpRect = { left: 0, top: 0, width: 0, height: 0 };
let driftDir = { x: 0, y: 0 };
let driftBoost = 1;
{
  const a = rand(0, Math.PI * 2);
  driftDir.x = Math.cos(a);
  driftDir.y = Math.sin(a);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIECES
   ═══════════════════════════════════════════════════════════════════════════ */
function makePiece(seed = {}) {
  const ratio = seed.ratio ?? pick([0.72, 0.8, 1, 1.25, 1.4]);
  const base = rand(300, 430);
  const width = seed.width || (ratio >= 1 ? base * ratio : base);
  const height = seed.height || (ratio >= 1 ? base : base / ratio);
  const id = uid();
  const area = width * height;
  const depth = area > 175000 ? 2 : area > 120000 ? 1 : 0;

  return {
    id,
    // Canonical position inside a single tile.
    x: wrapTo(seed.x ?? rand(0, TILE.w), TILE.w),
    y: wrapTo(seed.y ?? rand(0, TILE.h), TILE.h),
    width, height,
    hw: width / 2, hh: height / 2,
    depth,
    // Depth drives parallax: far pieces trail the camera, near ones lead it.
    parallax: depth === 2 ? 1.16 : depth === 1 ? 1 : 0.86,
    angle: seed.angle ?? rand(-1.4, 1.4),
    image: seed.image || IMAGES[(id - 1) % IMAGES.length],
    mat: seed.mat || pick(MATS),
    accent: seed.accent || pick(ACCENTS),
    title: seed.title || pick(TITLES),
    issuer: seed.issuer || pick(ISSUERS),
    medium: seed.medium || pick(MEDIA),
    summary: seed.summary || pick(SUMMARIES),
    serial: `No. ${String(id).padStart(3, "0")}`,
    year: 2015 + ((rand(0, 11)) | 0),
    // Idle float — every piece breathes on its own clock.
    driftSpeed: rand(0.4, 1.35),
    phaseX: rand(0, Math.PI * 2),
    phaseY: rand(0, Math.PI * 2),
    phaseR: rand(0, Math.PI * 2),
    ampX: rand(5, 13),
    ampY: rand(7, 17),
    ampR: rand(0.8, 2.1),
    freqX: rand(0.00022, 0.00046),
    freqY: rand(0.00019, 0.00041),
    freqR: rand(0.00015, 0.00032),
    loaded: false,
    // Node pool: tileKey -> element, plus a free list for recycling.
    nodes: new Map(),
    free: [],
  };
}

// Poisson-ish scatter: reject candidates that crowd an existing piece so the
// wall reads as a curated hang rather than clumps and holes.
function buildWall() {
  const pieces = [];
  const minGap = 300;
  let guard = 0;
  while (pieces.length < PIECE_COUNT && guard < PIECE_COUNT * 200) {
    guard++;
    const cand = makePiece();
    const ok = pieces.every((p) => {
      // Compare on the torus so the gap holds across the seam too.
      let dx = Math.abs(p.x - cand.x); dx = Math.min(dx, TILE.w - dx);
      let dy = Math.abs(p.y - cand.y); dy = Math.min(dy, TILE.h - dy);
      return Math.hypot(dx, dy) > minGap;
    });
    if (ok) pieces.push(cand);
    else _id--; // reclaim the id we just burned
  }
  return pieces;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECTION
   ═══════════════════════════════════════════════════════════════════════════ */
function syncVP() {
  vpRect = vp.getBoundingClientRect();
  state.vp.w = vpRect.width;
  state.vp.h = vpRect.height;
}
const s2w = (sx, sy) => ({
  x: (sx - state.vp.w / 2) / state.cam.zoom + state.cam.x,
  y: (sy - state.vp.h / 2) / state.cam.zoom + state.cam.y,
});
const sdw = (dx, dy) => ({ x: dx / state.cam.zoom, y: dy / state.cam.zoom });
const toVP = (cx, cy) => ({ x: cx - vpRect.left, y: cy - vpRect.top });

/* ═══════════════════════════════════════════════════════════════════════════
   NODE POOL
   ═══════════════════════════════════════════════════════════════════════════ */
function createNode(piece) {
  const el = document.createElement("article");
  el.className = "certificate";
  el.dataset.id = String(piece.id);
  el.dataset.depth = String(piece.depth);
  el.style.width = piece.width + "px";
  el.style.height = piece.height + "px";
  el.style.setProperty("--angle", piece.angle + "deg");
  el.style.setProperty("--mat-a", piece.mat.a);
  el.style.setProperty("--mat-b", piece.mat.b);
  el.style.setProperty("--mat-ink", piece.mat.ink);
  el.style.setProperty("--accent", piece.accent);
  el.style.setProperty("--mat-pad", Math.round(clamp(piece.width * 0.035, 10, 20)) + "px");

  el.innerHTML =
    '<figure class="frame">' +
      '<div class="frame-window">' +
        `<img alt="${escapeAttr(piece.title)} — ${escapeAttr(piece.medium)}, ${escapeAttr(piece.issuer)}, ${piece.year}" decoding="async" draggable="false" />` +
        '<span class="frame-glare" aria-hidden="true"></span>' +
      '</div>' +
      '<figcaption class="frame-plate">' +
        `<span class="plate-title">${escapeHtml(piece.title)}</span>` +
        `<span class="plate-meta">${piece.year}</span>` +
      '</figcaption>' +
      '<i class="frame-corner frame-corner-tl" aria-hidden="true"></i>' +
      '<i class="frame-corner frame-corner-tr" aria-hidden="true"></i>' +
      '<i class="frame-corner frame-corner-bl" aria-hidden="true"></i>' +
      '<i class="frame-corner frame-corner-br" aria-hidden="true"></i>' +
    '</figure>';

  el._frame = el.querySelector(".frame");
  el._img = el.querySelector("img");
  if (piece.loaded) el._img.src = piece.image;
  layer.appendChild(el);
  return el;
}

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

function acquireNode(piece, key) {
  let el = piece.nodes.get(key);
  if (el) return el;
  el = piece.free.pop() || createNode(piece);
  el.style.display = "";
  piece.nodes.set(key, el);
  return el;
}

function releaseNode(piece, key) {
  const el = piece.nodes.get(key);
  if (!el) return;
  piece.nodes.delete(key);
  el.style.display = "none";
  piece.free.push(el);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE RENDER PASS
   Walks every visible tile repeat and materialises exactly the nodes needed.
   ═══════════════════════════════════════════════════════════════════════════ */
const liveKeys = new Set();

function renderWall(now) {
  const { w, h } = state.vp;
  const { x: camX, y: camY, zoom } = state.cam;
  if (!w || !h) return;

  // Visible world rect, padded so pieces stream in before they are needed.
  const padW = (CULL_MARGIN + 260) / zoom;
  const padH = (CULL_MARGIN + 260) / zoom;
  const minX = camX - w / 2 / zoom - padW;
  const maxX = camX + w / 2 / zoom + padW;
  const minY = camY - h / 2 / zoom - padH;
  const maxY = camY + h / 2 / zoom + padH;

  // Which tile repeats intersect that rect.
  const i0 = Math.floor(minX / TILE.w), i1 = Math.floor(maxX / TILE.w);
  const j0 = Math.floor(minY / TILE.h), j1 = Math.floor(maxY / TILE.h);

  const t = now || performance.now();
  const floats = state.entered && !reduceMotion;

  for (const piece of state.pieces) {
    liveKeys.clear();

    // Idle float, computed once per piece and shared by all its repeats.
    let fx = 0, fy = 0, fr = 0;
    if (floats && state.hoveredId !== piece.id && state.selectedId !== piece.id) {
      fx = Math.sin(t * piece.freqX + piece.phaseX) * piece.ampX;
      fy = Math.cos(t * piece.freqY + piece.phaseY) * piece.ampY;
      fr = Math.sin(t * piece.freqR + piece.phaseR) * piece.ampR;
    }

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const wx = piece.x + i * TILE.w;
        const wy = piece.y + j * TILE.h;

        // Parallax is a displacement away from the camera, so it stays
        // continuous no matter how far the camera has travelled.
        const px = wx + (wx + piece.hw - camX) * (piece.parallax - 1) * 0.16;
        const py = wy + (wy + piece.hh - camY) * (piece.parallax - 1) * 0.16;

        const sx = (px + piece.hw - camX) * zoom + w / 2;
        const sy = (py + piece.hh - camY) * zoom + h / 2;
        const halfW = piece.hw * zoom, halfH = piece.hh * zoom;

        if (sx < -halfW - CULL_MARGIN || sx > w + halfW + CULL_MARGIN ||
            sy < -halfH - CULL_MARGIN || sy > h + halfH + CULL_MARGIN) continue;

        const key = i + ":" + j;
        liveKeys.add(key);

        const el = acquireNode(piece, key);
        // One transform write per node per frame — position, float, tilt.
        el.style.transform =
          `translate3d(${(px + fx).toFixed(1)}px, ${(py + fy).toFixed(1)}px, 0)` +
          ` rotate(${(piece.angle + fr).toFixed(2)}deg)`;

        // Fetch when the piece is genuinely close to the viewport.
        if (!piece.loaded &&
            sx > -halfW - LOAD_MARGIN && sx < w + halfW + LOAD_MARGIN &&
            sy > -halfH - LOAD_MARGIN && sy < h + halfH + LOAD_MARGIN) {
          loadPiece(piece);
        }
      }
    }

    // Retire repeats that scrolled away.
    for (const key of piece.nodes.keys()) {
      if (!liveKeys.has(key)) releaseNode(piece, key);
    }
  }
}

function loadPiece(piece) {
  if (piece.loaded) return;
  piece.loaded = true;
  for (const el of piece.nodes.values()) if (el._img && !el._img.src) el._img.src = piece.image;
  for (const el of piece.free) if (el._img && !el._img.src) el._img.src = piece.image;
  const dot = dotEls.get(piece.id);
  if (dot) dot.classList.add("is-on");
}

/* ═══════════════════════════════════════════════════════════════════════════
   FRAME LOOP
   ═══════════════════════════════════════════════════════════════════════════ */
let rafId = 0;
let lastFrame = 0;

function tick(now) {
  rafId = 0;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;

  if (state.entered && !reduceMotion && !document.hidden && !state.gesture) {
    // Casual drift — the whole wall eases in the direction you last moved.
    for (const p of state.pieces) {
      let s = p.driftSpeed;
      if (state.hoveredId === p.id || state.selectedId === p.id) s *= DRIFT_DAMP;
      p.x = wrapTo(p.x + driftDir.x * s * dt * DRIFT_SPEED * driftBoost, TILE.w);
      p.y = wrapTo(p.y + driftDir.y * s * dt * DRIFT_SPEED * driftBoost, TILE.h);
    }
    driftBoost += (1 - driftBoost) * DRIFT_DECAY;
  }

  writeCamera();
  renderWall(now);
  refreshMinimap();
  measureFps(now);

  // Keep animating while the wall is alive; otherwise sleep until input.
  if (state.entered && !reduceMotion && !document.hidden) requestFrame();
}

function requestFrame() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

let lastZoomLabel = -1;
function writeCamera() {
  const { w, h } = state.vp, { x, y, zoom } = state.cam;
  const tx = w / 2 - x * zoom, ty = h / 2 - y * zoom;
  layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`;
  // The board is a fixed viewport fill; only its texture scrolls, so there is
  // never a rectangular edge to run past.
  if (board) board.style.backgroundPosition = `${tx}px ${ty}px, ${tx}px ${ty}px, 0 0`;
  if (zoomEl && !zoomLabelLocked) {
    const pct = Math.round(zoom * 100);
    if (pct !== lastZoomLabel) { zoomEl.textContent = pct + "%"; lastZoomLabel = pct; }
  }
  const far = zoom < 0.5, mid = zoom < 0.8;
  layer.classList.toggle("zoom-far", far);
  layer.classList.toggle("zoom-mid", !far && mid);
}

function refreshMinimap() {
  if (!mmWindow) return;
  const { w, h } = state.vp, { zoom } = state.cam;
  const tl = s2w(0, 0);
  mmWindow.style.left = ((wrapTo(tl.x, TILE.w) / TILE.w) * 100) + "%";
  mmWindow.style.top = ((wrapTo(tl.y, TILE.h) / TILE.h) * 100) + "%";
  mmWindow.style.width = clamp((w / zoom / TILE.w) * 100, 3, 100) + "%";
  mmWindow.style.height = clamp((h / zoom / TILE.h) * 100, 3, 100) + "%";
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMERA
   ═══════════════════════════════════════════════════════════════════════════ */
function setCamera({ x, y, zoom } = {}, { animate = false, duration = 0.7 } = {}) {
  const nz = clamp(zoom ?? state.cam.zoom, MIN_ZOOM, MAX_ZOOM);
  const nx = x ?? state.cam.x, ny = y ?? state.cam.y;
  if (animate && !reduceMotion) {
    gsap.killTweensOf(state.cam);
    gsap.to(state.cam, {
      x: nx, y: ny, zoom: nz, duration, ease: "power3.inOut",
      onUpdate: requestFrame, onComplete: persistSoon,
    });
  } else {
    state.cam.x = nx; state.cam.y = ny; state.cam.zoom = nz;
    requestFrame(); persistSoon();
  }
}

function zoomToward(factor, sx, sy, opts = {}) {
  sx = sx ?? state.vp.w / 2; sy = sy ?? state.vp.h / 2;
  const nz = clamp(state.cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (nz === state.cam.zoom) return;
  const a = s2w(sx, sy);
  setCamera({
    x: a.x - (sx - state.vp.w / 2) / nz,
    y: a.y - (sy - state.vp.h / 2) / nz,
    zoom: nz,
  }, opts);
}

// Travel to the copy of the piece nearest the camera, so focusing never
// scrolls the long way around the torus.
function focusPiece(piece) {
  const { w, h } = state.vp;
  const zoom = clamp(Math.min((w * 0.62) / piece.width, (h * 0.62) / piece.height), MIN_ZOOM, MAX_ZOOM);
  const cx = piece.x + piece.hw + Math.round((state.cam.x - piece.x - piece.hw) / TILE.w) * TILE.w;
  const cy = piece.y + piece.hh + Math.round((state.cam.y - piece.y - piece.hh) / TILE.h) * TILE.h;
  setCamera({ x: cx, y: cy, zoom }, { animate: true, duration: 0.85 });
}

const recenter = () => setCamera({ x: TILE.w / 2, y: TILE.h / 2, zoom: 1 }, { animate: true });

/* ═══════════════════════════════════════════════════════════════════════════
   SELECTION
   ═══════════════════════════════════════════════════════════════════════════ */
function updateSelection() {
  const sel = state.pieces.find((p) => p.id === state.selectedId) || null;
  layer.classList.toggle("has-selection", !!sel);

  for (const p of state.pieces) {
    const isSel = p.id === state.selectedId;
    // Every repeat of the same artwork reflects the same state.
    for (const el of p.nodes.values()) {
      el.classList.toggle("is-selected", isSel);
      el.classList.toggle("is-dimmed", !!sel && !isSel);
    }
    for (const el of p.free) {
      el.classList.toggle("is-selected", isSel);
      el.classList.toggle("is-dimmed", !!sel && !isSel);
    }
  }

  if (!sel) {
    if (!panelEl.hidden) {
      gsap.to(panelEl, {
        autoAlpha: 0, x: 14, duration: 0.2, ease: "power2.in",
        onComplete: () => { panelEl.hidden = true; },
      });
    }
    return;
  }

  panelEl.hidden = false;
  titleEl.textContent = sel.title;
  fmtEl.innerHTML = `${escapeHtml(sel.serial)} <i></i> ${sel.year}`;
  summEl.textContent = sel.summary;
  toneEl.textContent = sel.medium;
  swatchEl.style.background = sel.accent;
  const pos = state.pieces.indexOf(sel) + 1;
  indexEl.textContent = `${String(pos).padStart(2, "0")} / ${String(state.pieces.length).padStart(2, "0")}`;
  announce(`${sel.title}, ${sel.medium}, ${sel.year}. Piece ${pos} of ${state.pieces.length}.`);
  gsap.fromTo(panelEl, { autoAlpha: 0, x: 22 }, { autoAlpha: 1, x: 0, duration: 0.36, ease: "expo.out", overwrite: "auto" });
}

function cyclePiece(dir) {
  if (!state.pieces.length) return;
  const i = state.pieces.findIndex((p) => p.id === state.selectedId);
  const next = state.pieces[(((i + dir) % state.pieces.length) + state.pieces.length) % state.pieces.length];
  state.selectedId = next.id;
  updateSelection();
  focusPiece(next);
}

/* ═══════════════════════════════════════════════════════════════════════════
   INPUT
   ═══════════════════════════════════════════════════════════════════════════ */
const centroid = (pts) => {
  let x = 0, y = 0;
  for (const p of pts) { x += p.c.x; y += p.c.y; }
  return { x: x / pts.length, y: y / pts.length };
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function beginGesture() {
  const pts = [...state.pointers.values()];
  if (!pts.length) return;
  gsap.killTweensOf(state.cam);
  state.gesture = {
    lc: centroid(pts),
    ld: pts.length > 1 ? dist(pts[0].c, pts[1].c) : 0,
    moved: false, t: performance.now(), vx: 0, vy: 0,
    selectId: pts[0].selectId,
  };
  vp.classList.add("is-panning");
}

function updateGesture() {
  const g = state.gesture;
  if (!g) return;
  const pts = [...state.pointers.values()];
  if (!pts.length) return;

  const c = centroid(pts);
  const dx = c.x - g.lc.x, dy = c.y - g.lc.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;

  const wd = sdw(-dx, -dy);
  state.cam.x += wd.x;
  state.cam.y += wd.y;

  if (pts.length > 1) {
    const d = dist(pts[0].c, pts[1].c);
    if (g.ld > 0) {
      const nz = clamp(state.cam.zoom * (d / g.ld), MIN_ZOOM, MAX_ZOOM);
      const a = s2w(c.x, c.y);
      state.cam.zoom = nz;
      state.cam.x = a.x - (c.x - state.vp.w / 2) / nz;
      state.cam.y = a.y - (c.y - state.vp.h / 2) / nz;
    }
    g.ld = d;
  }

  const now = performance.now();
  const el = Math.max(16, now - g.t);
  g.vx = (dx / el) * 16; g.vy = (dy / el) * 16;
  g.t = now; g.lc = c;

  // Steer the idle drift toward the direction of travel.
  const mag = Math.hypot(g.vx, g.vy);
  if (!reduceMotion && mag > 0.8) {
    driftBoost = clamp(0.9 + Math.hypot(dx, dy) * 0.008 + mag * 0.02, 0.9, DRIFT_BOOST_MAX);
    driftDir.x += (g.vx / mag - driftDir.x) * 0.16;
    driftDir.y += (g.vy / mag - driftDir.y) * 0.16;
    const len = Math.hypot(driftDir.x, driftDir.y) || 1;
    driftDir.x /= len; driftDir.y /= len;
  }

  markInteraction();
  requestFrame();
}

function endGesture() {
  const g = state.gesture;
  vp.classList.remove("is-panning");
  state.gesture = null;
  if (!g) return;

  if (!g.moved) {
    state.selectedId = g.selectId ?? null;
    updateSelection();
    requestFrame();
    return;
  }
  const speed = Math.hypot(g.vx, g.vy);
  if (speed > 1) {
    const wd = sdw(-g.vx * 18, -g.vy * 18);
    setCamera({ x: state.cam.x + wd.x, y: state.cam.y + wd.y }, { animate: true, duration: 0.85 });
  }
  requestFrame();
}

const CHROME = ".canvas-toolbar, .selection-panel, .minimap, .shortcuts, #splash, .toasts";

vp.addEventListener("pointerdown", (e) => {
  if (!state.entered || e.target.closest(CHROME)) return;
  const hit = e.target.closest(".certificate");
  state.pointers.set(e.pointerId, {
    c: toVP(e.clientX, e.clientY),
    selectId: hit ? Number(hit.dataset.id) : null,
  });
  try { vp.setPointerCapture(e.pointerId); } catch { /* capture unavailable */ }
  if (state.pointers.size === 1) beginGesture();
  else if (state.gesture) {
    const pts = [...state.pointers.values()];
    state.gesture.lc = centroid(pts);
    state.gesture.ld = pts.length > 1 ? dist(pts[0].c, pts[1].c) : 0;
    state.gesture.moved = true;
  }
});

vp.addEventListener("pointermove", (e) => {
  const p = state.pointers.get(e.pointerId);
  if (!p) return;
  p.c = toVP(e.clientX, e.clientY);
  updateGesture();
});

function releasePointer(e) {
  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.delete(e.pointerId);
  if (state.pointers.size === 0) endGesture();
  else if (state.gesture) {
    const pts = [...state.pointers.values()];
    state.gesture.lc = centroid(pts);
    state.gesture.ld = pts.length > 1 ? dist(pts[0].c, pts[1].c) : 0;
  }
}
vp.addEventListener("pointerup", releasePointer);
vp.addEventListener("pointercancel", releasePointer);
vp.addEventListener("lostpointercapture", releasePointer);

// Hover is delegated: nodes are recycled, so per-node listeners would leak.
vp.addEventListener("pointerover", (e) => {
  if (coarsePointer || state.gesture) return;
  const el = e.target.closest(".certificate");
  const id = el ? Number(el.dataset.id) : null;
  if (id !== state.hoveredId) { state.hoveredId = id; requestFrame(); }
});
vp.addEventListener("pointerleave", () => { state.hoveredId = null; });

vp.addEventListener("dblclick", (e) => {
  const el = e.target.closest(".certificate");
  if (!el) return;
  const piece = state.pieces.find((p) => p.id === Number(el.dataset.id));
  if (!piece) return;
  state.selectedId = piece.id;
  updateSelection();
  focusPiece(piece);
});

vp.addEventListener("wheel", (e) => {
  if (!state.entered || e.target.closest(CHROME)) return;
  e.preventDefault();
  const l = toVP(e.clientX, e.clientY);
  markInteraction();

  if (e.ctrlKey) { zoomToward(Math.exp(-e.deltaY * 0.01), l.x, l.y); return; }

  const fineScroll = e.deltaMode === 0 && Math.abs(e.deltaY) < 50;
  if (fineScroll && !e.shiftKey) {
    const wd = sdw(e.deltaX, e.deltaY);
    state.cam.x += wd.x; state.cam.y += wd.y;
    requestFrame(); persistSoon();
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    state.cam.x += sdw(e.deltaX + e.deltaY, 0).x;
    requestFrame(); persistSoon();
  } else {
    const norm = Math.abs(e.deltaY) / 100;
    zoomToward(Math.exp(-Math.sign(e.deltaY) * (0.16 + norm * 0.1)), l.x, l.y);
  }
}, { passive: false });

/* ═══════════════════════════════════════════════════════════════════════════
   THEMING
   ═══════════════════════════════════════════════════════════════════════════ */
const THEMES = ["motif", "dracula", "monokai", "tokyo-night", "catppuccin", "solara"];
const THEME_LABELS = { motif: "Motif", dracula: "Dracula", monokai: "Monokai", "tokyo-night": "Tokyo Night", catppuccin: "Catppuccin", solara: "Solara" };
const root = document.documentElement;

let shiftTimer = null;
function softShift() {
  root.classList.add("theme-shifting");
  clearTimeout(shiftTimer);
  shiftTimer = setTimeout(() => root.classList.remove("theme-shifting"), 700);
}

function applyTheme(name, { silent = false } = {}) {
  const t = THEMES.includes(name) ? name : "motif";
  const changed = root.dataset.theme !== t;
  root.dataset.theme = t;
  try { localStorage.setItem("motif-theme", t); } catch { /* storage blocked */ }
  document.querySelectorAll("[data-theme-set]").forEach((c) => {
    c.setAttribute("aria-pressed", String(c.dataset.themeSet === t));
  });
  if (changed && state.entered) {
    softShift();
    if (!silent) announce(`${THEME_LABELS[t]} theme`);
  }
  syncThemeColor();
}

function applyMode(name) {
  const m = name === "light" ? "light" : "dark";
  const changed = root.dataset.mode !== m;
  root.dataset.mode = m;
  try { localStorage.setItem("motif-mode", m); } catch { /* storage blocked */ }
  document.querySelectorAll("[data-mode-set]").forEach((o) => {
    o.setAttribute("aria-pressed", String(o.dataset.modeSet === m));
  });
  if (changed && state.entered) { softShift(); announce(`${m} mode`); }
  syncThemeColor();
}

function syncThemeColor() {
  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (meta && bg) meta.setAttribute("content", bg);
  });
}

const cycleTheme = () => applyTheme(THEMES[(THEMES.indexOf(root.dataset.theme || "motif") + 1) % THEMES.length]);
const toggleMode = () => applyMode(root.dataset.mode === "dark" ? "light" : "dark");

/* ═══════════════════════════════════════════════════════════════════════════
   ZOOM PRESETS
   ═══════════════════════════════════════════════════════════════════════════ */
const ZOOM_PRESETS = [
  { name: "OVERVIEW", z: 0.32 },
  { name: "GALLERY", z: 0.6 },
  { name: "INTIMATE", z: 1 },
  { name: "DETAIL", z: 2.2 },
];
let zoomLabelLocked = false;
let zoomLabelTimer = null;

function zoomPreset(i) {
  const p = ZOOM_PRESETS[i];
  if (!p || !zoomEl) return;
  clearTimeout(zoomLabelTimer);
  zoomLabelLocked = true;
  zoomEl.textContent = p.name;
  announce(`${p.name} zoom`);
  setCamera({ zoom: p.z }, { animate: true, duration: 0.85 });
  zoomLabelTimer = setTimeout(() => {
    zoomLabelLocked = false; lastZoomLabel = -1; writeCamera();
  }, 1100);
}
const cycleZoomPreset = () => {
  const next = ZOOM_PRESETS.find((p) => p.z > state.cam.zoom + 0.04) || ZOOM_PRESETS[0];
  zoomPreset(ZOOM_PRESETS.indexOf(next));
};

/* ═══════════════════════════════════════════════════════════════════════════
   CHROME ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */
function toggleShortcuts(force) {
  const sc = $("shortcuts");
  if (!sc) return;
  sc.hidden = force !== undefined ? !force : !sc.hidden;
  if (!sc.hidden) {
    window.lucide?.createIcons();
    sc.querySelector("button")?.focus();
  }
}

// Casual realign — pieces ease to fresh positions, no gather, no formation.
function realign() {
  if (!state.entered) return;
  toast("Realigning the wall");
  for (const p of state.pieces) {
    gsap.to(p, {
      x: rand(0, TILE.w), y: rand(0, TILE.h),
      angle: rand(-2, 2),
      duration: rand(1.3, 2.1), ease: "expo.inOut",
      onUpdate: requestFrame,
    });
  }
}

async function shareView() {
  const url = `${location.origin}${location.pathname}#${Math.round(state.cam.x)},${Math.round(state.cam.y)},${state.cam.zoom.toFixed(3)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("View link copied");
  } catch {
    toast("Copy failed — check clipboard permissions");
  }
}

document.body.addEventListener("click", (e) => {
  markInteraction();

  const chip = e.target.closest("[data-theme-set]");
  if (chip) {
    if (!reduceMotion) gsap.fromTo(chip, { scale: 0.7 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    applyTheme(chip.dataset.themeSet);
    return;
  }
  const mopt = e.target.closest("[data-mode-set]");
  if (mopt) { applyMode(mopt.dataset.modeSet); return; }

  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  switch (btn.dataset.action) {
    case "enter": enterWall(); break;
    case "zoom-in": zoomToward(1.3, undefined, undefined, { animate: true }); break;
    case "zoom-out": zoomToward(0.77, undefined, undefined, { animate: true }); break;
    case "center": recenter(); break;
    case "scatter": realign(); break;
    case "share": shareView(); break;
    case "add": fileInput?.click(); break;
    case "prev": cyclePiece(-1); break;
    case "next": cyclePiece(1); break;
    case "shortcuts": toggleShortcuts(); break;
    case "deselect": state.selectedId = null; updateSelection(); break;
    case "focus": {
      const p = state.pieces.find((x) => x.id === state.selectedId);
      if (p) focusPiece(p);
      break;
    }
    case "fullscreen":
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => toast("Fullscreen unavailable"));
      break;
  }
});

zoomEl?.addEventListener("click", () => { if (state.entered) cycleZoomPreset(); });

mmBoard?.addEventListener("click", (e) => {
  if (!state.entered) return;
  const r = mmBoard.getBoundingClientRect();
  setCamera({
    x: TILE.w * ((e.clientX - r.left) / r.width),
    y: TILE.h * ((e.clientY - r.top) / r.height),
  }, { animate: true });
});

document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  root.classList.toggle("is-fullscreen", on);
  const btn = $("fs-button");
  if (btn) {
    btn.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
    btn.dataset.tip = on ? "Exit fullscreen" : "Fullscreen";
  }
});

window.addEventListener("keydown", (e) => {
  // Never hijack keys while the visitor is typing.
  if (e.target.matches("input, textarea, [contenteditable]")) return;
  markInteraction();

  if (!state.entered) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterWall(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "0") { e.preventDefault(); recenter(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case "Escape": {
      const sc = $("shortcuts");
      if (sc && !sc.hidden) { toggleShortcuts(false); return; }
      state.selectedId = null; updateSelection(); break;
    }
    case "f": case "F": {
      const p = state.pieces.find((x) => x.id === state.selectedId);
      if (p) focusPiece(p);
      break;
    }
    case "+": case "=": zoomToward(1.25, undefined, undefined, { animate: true }); break;
    case "-": zoomToward(0.8, undefined, undefined, { animate: true }); break;
    case "ArrowLeft": e.preventDefault(); cyclePiece(-1); break;
    case "ArrowRight": e.preventDefault(); cyclePiece(1); break;
    case "t": case "T": cycleTheme(); break;
    case "m": case "M": toggleMode(); break;
    case "s": case "S": realign(); break;
    case "u": case "U": fileInput?.click(); break;
    case "?": toggleShortcuts(); break;
    default:
      if (e.key >= "1" && e.key <= "4") zoomPreset(Number(e.key) - 1);
  }
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { syncVP(); requestFrame(); }, 100);
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { gsap.globalTimeline.pause(); root.dataset.paused = "true"; }
  else { gsap.globalTimeline.play(); delete root.dataset.paused; lastFrame = 0; syncVP(); requestFrame(); }
});

window.addEventListener("hashchange", () => {
  const h = readHash();
  if (h && state.entered) setCamera(h, { animate: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════════════════════════════════════════ */
function readHash() {
  const m = location.hash.match(/^#(-?[\d.]+),(-?[\d.]+),([\d.]+)/);
  return m ? { x: +m[1], y: +m[2], zoom: clamp(+m[3], MIN_ZOOM, MAX_ZOOM) } : null;
}

let persistTimer = null;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { x, y, zoom } = state.cam;
    const hash = `#${Math.round(x)},${Math.round(y)},${zoom.toFixed(3)}`;
    if (hash !== location.hash) history.replaceState(null, "", hash);
    try { localStorage.setItem("motif-cam", JSON.stringify({ x, y, z: zoom })); } catch { /* storage blocked */ }
  }, 320);
}

function restoreCamera() {
  const h = readHash();
  if (h) { Object.assign(state.cam, { x: h.x, y: h.y, zoom: h.zoom }); return; }
  try {
    const raw = localStorage.getItem("motif-cam");
    if (!raw) return;
    const p = JSON.parse(raw);
    if (Number.isFinite(p.x)) {
      state.cam.x = p.x; state.cam.y = p.y;
      state.cam.zoom = clamp(p.z, MIN_ZOOM, MAX_ZOOM);
    }
  } catch { /* corrupt or blocked — fall back to defaults */ }
}

/* ═══════════════════════════════════════════════════════════════════════════
   IDLE DRIFT
   ═══════════════════════════════════════════════════════════════════════════ */
let lastInteract = performance.now();
let idleTween = null;
function markInteraction() {
  lastInteract = performance.now();
  if (idleTween) { idleTween.kill(); idleTween = null; delete root.dataset.idle; }
}
function idleWatch() {
  if (state.entered && !idleTween && !state.gesture && !reduceMotion &&
      performance.now() - lastInteract > 25000) {
    root.dataset.idle = "true";
    const a = rand(0, Math.PI * 2);
    idleTween = gsap.to(state.cam, {
      x: state.cam.x + Math.cos(a) * 1100,
      y: state.cam.y + Math.sin(a) * 1100,
      duration: 52, ease: "sine.inOut",
      onUpdate: requestFrame,
      onComplete: () => { idleTween = null; },
    });
  }
  setTimeout(idleWatch, 5000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEEDBACK
   ═══════════════════════════════════════════════════════════════════════════ */
function announce(msg) { if (liveRegion) liveRegion.textContent = msg; }

function toast(msg) {
  if (!toastWrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<i class="toast-dot" aria-hidden="true"></i><span></span>`;
  t.querySelector("span").textContent = msg;
  toastWrap.appendChild(t);
  announce(msg);
  gsap.fromTo(t, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power3.out" });
  setTimeout(() => {
    gsap.to(t, { autoAlpha: 0, y: -8, duration: 0.3, ease: "power2.in", onComplete: () => t.remove() });
  }, 2600);
}

let fpsSamples = [], fpsLast = 0;
function measureFps(now) {
  if (!fpsDot || !fpsLast) { fpsLast = now; return; }
  fpsSamples.push(now - fpsLast);
  fpsLast = now;
  if (fpsSamples.length > 30) fpsSamples.shift();
  if (fpsSamples.length < 20) return;
  const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  const fps = 1000 / avg;
  const grade = fps < 30 ? "bad" : fps < 48 ? "warn" : "ok";
  if (fpsDot.dataset.grade !== grade) fpsDot.dataset.grade = grade;
  fpsDot.title = `${Math.round(fps)} fps`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MINIMAP DOTS
   ═══════════════════════════════════════════════════════════════════════════ */
const dotEls = new Map();
function renderMinimapDots() {
  if (!mmDots) return;
  mmDots.textContent = "";
  dotEls.clear();
  for (const p of state.pieces) {
    const d = document.createElement("span");
    d.className = "mm-dot";
    d.style.left = ((p.x / TILE.w) * 100) + "%";
    d.style.top = ((p.y / TILE.h) * 100) + "%";
    d.style.setProperty("--dot", p.accent);
    mmDots.appendChild(d);
    dotEls.set(p.id, d);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   UPLOAD
   ═══════════════════════════════════════════════════════════════════════════ */
fileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) hangFile(file);
  e.target.value = "";
});

function hangFile(file) {
  if (!file.type.startsWith("image/")) { toast("That file is not an image"); return; }
  const url = URL.createObjectURL(file);
  const probe = new Image();
  probe.onload = () => {
    const piece = makePiece({
      image: url,
      ratio: probe.naturalWidth / probe.naturalHeight,
      x: wrapTo(state.cam.x, TILE.w),
      y: wrapTo(state.cam.y, TILE.h),
      title: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Untitled",
    });
    piece.loaded = true;
    state.pieces.push(piece);
    renderMinimapDots();
    state.selectedId = piece.id;
    updateSelection();
    requestFrame();
    toast("Hung on the wall");
  };
  probe.onerror = () => { URL.revokeObjectURL(url); toast("Could not read that image"); };
  probe.src = url;
}

["dragenter", "dragover"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    $("drop-hint")?.classList.add("is-live");
  }));
["dragleave", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    if (ev === "drop") {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) hangFile(f);
    }
    if (ev === "dragleave" && e.relatedTarget) return;
    $("drop-hint")?.classList.remove("is-live");
  }));

/* ═══════════════════════════════════════════════════════════════════════════
   ENTER
   ═══════════════════════════════════════════════════════════════════════════ */
function enterWall() {
  if (state.entered) return;
  state.entered = true;
  lastFrame = 0;

  if (splashEl) {
    gsap.to(splashEl, {
      autoAlpha: 0, duration: reduceMotion ? 0.01 : 0.45, ease: "power2.in",
      onComplete: () => { splashEl.hidden = true; },
    });
  }
  gsap.fromTo(".canvas-toolbar, .minimap",
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: reduceMotion ? 0.01 : 0.5, stagger: 0.06, ease: "power3.out", delay: 0.2 });

  requestFrame();
  idleWatch();
  announce("Gallery wall ready. Drag to roam, or press question mark for shortcuts.");
}

splashEl?.addEventListener("click", enterWall);

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════════════ */
function boot() {
  let theme = "motif", mode = null;
  try {
    theme = localStorage.getItem("motif-theme") || "motif";
    mode = localStorage.getItem("motif-mode");
  } catch { /* storage blocked */ }
  applyTheme(theme, { silent: true });
  applyMode(mode || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

  syncVP();
  state.pieces = buildWall();
  renderMinimapDots();
  restoreCamera();

  // Paint the first frame immediately so the wall is behind the splash.
  writeCamera();
  renderWall(performance.now());
  refreshMinimap();

  gsap.set(".canvas-toolbar, .minimap", { autoAlpha: 0 });
  if (!reduceMotion) {
    gsap.fromTo(".splash-word", { y: 32, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: "expo.out", delay: 0.1 });
    gsap.fromTo(".splash-kicker, .splash-summary, .splash-enter, .splash-hint",
      { y: 16, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.09, ease: "power3.out", delay: 0.35 });
  } else {
    gsap.set(".splash-word, .splash-kicker, .splash-summary, .splash-enter, .splash-hint", { autoAlpha: 1, y: 0 });
  }

  window.lucide?.createIcons();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
