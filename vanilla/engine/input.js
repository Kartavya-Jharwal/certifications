import { cancelSpring, fling, panBy, zoomAt, screenToWorld } from "./camera.js";

function wheelPixels(e) {
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (e.deltaMode === 2) {
    dx *= 800;
    dy *= 800;
  }
  return { dx, dy };
}

/** Lightweight Lethargy-style: classify discrete mouse vs smooth trackpad. */
function createWheelNormalizer() {
  const recent = [];
  return (dx, dy, now) => {
    const mag = Math.hypot(dx, dy);
    recent.push({ t: now, mag });
    while (recent.length && now - recent[0].t > 120) recent.shift();
    const n = recent.length;
    const avg = recent.reduce((s, r) => s + r.mag, 0) / Math.max(1, n);
    const discrete = n <= 2 && mag > 40 && mag > avg * 1.4;
    const scale = discrete ? 0.35 : 1;
    return { dx: dx * scale, dy: dy * scale, discrete };
  };
}

export function attachInput(el, cam, hooks = {}) {
  const {
    onSelect,
    onRequestFrame,
    reduceMotion = false,
    getViewport = () => ({ w: el.clientWidth, h: el.clientHeight }),
  } = hooks;

  const pointers = new Map();
  const normalizeWheel = createWheelNormalizer();
  let lastPinchDist = 0;
  const velSamples = [];
  let driftBoost = 0; // 0..1 ease
  let lastPointerWorld = null;
  let pointerActive = false;

  const drift = {
    vx: 0,
    vy: 0,
    engaged: 0,
  };

  function vp() {
    return getViewport();
  }

  function request() {
    onRequestFrame?.();
  }

  function sampleVel(dx, dy, dt) {
    if (dt <= 0) return;
    velSamples.push({ vx: dx / dt, vy: dy / dt, t: performance.now() });
    while (velSamples.length > 5) velSamples.shift();
  }

  function meanVel() {
    if (!velSamples.length) return { vx: 0, vy: 0 };
    let sx = 0, sy = 0;
    for (const s of velSamples) {
      sx += s.vx;
      sy += s.vy;
    }
    return { vx: sx / velSamples.length, vy: sy / velSamples.length };
  }

  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const { w, h } = vp();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { dx, dy } = normalizeWheel(wheelPixels(e).dx, wheelPixels(e).dy, performance.now());
      if (e.ctrlKey) {
        const factor = Math.exp(-dy * 0.0025);
        zoomAt(cam, factor, sx, sy, w, h);
      } else {
        panBy(cam, -dx / cam.zoom, -dy / cam.zoom);
      }
      request();
    },
    { passive: false },
  );

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    cancelSpring(cam);
    velSamples.length = 0;
    pointerActive = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    request();
  });

  el.addEventListener("pointermove", (e) => {
    const rect = el.getBoundingClientRect();
    const { w, h } = vp();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(cam, sx, sy, w, h);

    if (!reduceMotion) {
      if (lastPointerWorld) {
        const ddx = world.x - lastPointerWorld.x;
        const ddy = world.y - lastPointerWorld.y;
        drift.vx += ddx * 0.15;
        drift.vy += ddy * 0.15;
        drift.engaged = Math.min(1, drift.engaged + 0.08);
      }
      lastPointerWorld = world;
      pointerActive = true;
    }

    const prev = pointers.get(e.pointerId);
    if (!prev) {
      request();
      return;
    }

    if (pointers.size === 2) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinchDist > 0) {
        const midX = (a.x + b.x) / 2 - rect.left;
        const midY = (a.y + b.y) / 2 - rect.top;
        zoomAt(cam, dist / lastPinchDist, midX, midY, w, h);
      }
      lastPinchDist = dist;
    } else if (pointers.size === 1) {
      const now = performance.now();
      const dt = Math.max(0.001, (now - prev.t) / 1000);
      const dxScreen = e.clientX - prev.x;
      const dyScreen = e.clientY - prev.y;
      const dxW = -dxScreen / cam.zoom;
      const dyW = -dyScreen / cam.zoom;
      panBy(cam, dxW, dyW);
      sampleVel(dxW, dyW, dt);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now });
    }
    request();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) {
      const v = meanVel();
      if (Math.hypot(v.vx, v.vy) > 80) fling(cam, v.vx, v.vy);
      pointerActive = false;
    }
    request();
  }

  el.addEventListener("pointerup", endPointer);
  el.addEventListener("pointercancel", endPointer);

  el.addEventListener("click", (e) => {
    if (Math.hypot(...velSamples.slice(-1).map(() => 0)) ) {/* noop */}
    const rect = el.getBoundingClientRect();
    onSelect?.(e.clientX - rect.left, e.clientY - rect.top);
  });

  /** Call each frame with dt for pointer-tied wall drift contribution. */
  function stepDrift(dt, pieces, applyDrift) {
    if (reduceMotion) {
      drift.vx = drift.vy = 0;
      drift.engaged = 0;
      return;
    }
    if (!pointerActive) {
      drift.engaged = Math.max(0, drift.engaged - dt / 0.35);
      drift.vx *= (1 - 0.2) ** dt;
      drift.vy *= (1 - 0.2) ** dt;
      lastPointerWorld = null;
    } else {
      drift.engaged = Math.min(1, drift.engaged + dt / 0.18);
    }
    const gain = drift.engaged * drift.engaged;
    if (gain > 0.01 && applyDrift) {
      applyDrift(drift.vx * gain * dt * 12, drift.vy * gain * dt * 12);
    }
    drift.vx *= (1 - 0.35) ** dt;
    drift.vy *= (1 - 0.35) ** dt;
  }

  function markPointerIdle() {
    pointerActive = false;
  }

  el.addEventListener("pointerleave", () => {
    if (pointers.size === 0) markPointerIdle();
  });

  return { stepDrift, pointers };
}
