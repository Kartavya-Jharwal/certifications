import {
  TILE,
  MIN_ZOOM,
  MAX_ZOOM,
  DT_MAX,
  FRICTION,
  SPRING_OMEGA,
  ORIGIN_SHIFT_THRESH,
  VELOCITY_EPS,
  RECENTER_SETPOINTS,
} from "./config.js";
import { clamp, nearestImage } from "./math.js";

export function createCamera(tile = TILE) {
  return {
    tile,
    x: tile.w / 2,
    y: tile.h / 2,
    zoom: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    spring: null, // { tx, ty, tz }
    recenterIndex: 0,
    gestureBaseline: null,
  };
}

export function screenToWorld(cam, sx, sy, vpW, vpH) {
  return {
    x: (sx - vpW / 2) / cam.zoom + cam.x,
    y: (sy - vpH / 2) / cam.zoom + cam.y,
  };
}

export function worldToScreen(cam, wx, wy, vpW, vpH) {
  return {
    x: (wx - cam.x) * cam.zoom + vpW / 2,
    y: (wy - cam.y) * cam.zoom + vpH / 2,
  };
}

export function cancelSpring(cam) {
  cam.spring = null;
}

export function springTo(cam, x, y, zoom) {
  cam.spring = {
    tx: x,
    ty: y,
    tz: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
  };
  cam.vx = 0;
  cam.vy = 0;
  cam.vz = 0;
}

export function focusPiece(cam, piece) {
  const n = nearestImage(cam, piece.x + piece.width / 2, piece.y + piece.height / 2, cam.tile.w, cam.tile.h);
  const targetZoom = clamp(Math.min(vpFitZoom(piece), 1.35), MIN_ZOOM, MAX_ZOOM);
  springTo(cam, n.x, n.y, targetZoom);
}

function vpFitZoom(piece) {
  // Approximate fit — caller can refine with viewport; default intimate
  const m = Math.max(piece.width, piece.height);
  return clamp(700 / m, MIN_ZOOM, MAX_ZOOM);
}

export function focusPieceInView(cam, piece, vpW, vpH) {
  const n = nearestImage(cam, piece.x + piece.width / 2, piece.y + piece.height / 2, cam.tile.w, cam.tile.h);
  const pad = 1.25;
  const zx = vpW / (piece.width * pad);
  const zy = vpH / (piece.height * pad);
  springTo(cam, n.x, n.y, clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM));
}

export function recenter(cam) {
  const sp = RECENTER_SETPOINTS[cam.recenterIndex % RECENTER_SETPOINTS.length];
  cam.recenterIndex++;
  springTo(cam, sp.x, sp.y, sp.zoom);
}

export function fling(cam, vx, vy) {
  cam.vx = vx;
  cam.vy = vy;
  cancelSpring(cam);
}

export function panBy(cam, dxWorld, dyWorld) {
  cam.x += dxWorld;
  cam.y += dyWorld;
  cancelSpring(cam);
}

export function zoomAt(cam, factor, sx, sy, vpW, vpH) {
  const before = screenToWorld(cam, sx, sy, vpW, vpH);
  cam.zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const after = screenToWorld(cam, sx, sy, vpW, vpH);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  cancelSpring(cam);
}

function springStep(pos, vel, target, dt, omega = SPRING_OMEGA) {
  const a = omega * omega * (target - pos) - 2 * omega * vel;
  const nv = vel + a * dt;
  const np = pos + nv * dt;
  return { pos: np, vel: nv };
}

export function maybeOriginShift(cam) {
  if (Math.abs(cam.x) < ORIGIN_SHIFT_THRESH && Math.abs(cam.y) < ORIGIN_SHIFT_THRESH) return false;
  const tw = cam.tile.w;
  const th = cam.tile.h;
  const sx = Math.round(cam.x / tw) * tw;
  const sy = Math.round(cam.y / th) * th;
  if (!sx && !sy) return false;
  cam.x -= sx;
  cam.y -= sy;
  if (cam.spring) {
    cam.spring.tx -= sx;
    cam.spring.ty -= sy;
  }
  if (cam.gestureBaseline) {
    cam.gestureBaseline.x -= sx;
    cam.gestureBaseline.y -= sy;
  }
  return true;
}

export function stepCamera(cam, dtRaw) {
  const dt = Math.min(Math.max(dtRaw, 0), DT_MAX);
  if (cam.spring) {
    const sx = springStep(cam.x, cam.vx, cam.spring.tx, dt);
    const sy = springStep(cam.y, cam.vy, cam.spring.ty, dt);
    const sz = springStep(cam.zoom, cam.vz, cam.spring.tz, dt);
    cam.x = sx.pos;
    cam.vx = sx.vel;
    cam.y = sy.pos;
    cam.vy = sy.vel;
    cam.zoom = clamp(sz.pos, MIN_ZOOM, MAX_ZOOM);
    cam.vz = sz.vel;
    const dx = cam.spring.tx - cam.x;
    const dy = cam.spring.ty - cam.y;
    const dz = cam.spring.tz - cam.zoom;
    if (Math.hypot(dx, dy) < 0.5 && Math.abs(dz) < 0.002 && Math.hypot(cam.vx, cam.vy) < VELOCITY_EPS) {
      cam.x = cam.spring.tx;
      cam.y = cam.spring.ty;
      cam.zoom = cam.spring.tz;
      cam.vx = cam.vy = cam.vz = 0;
      cam.spring = null;
    }
  } else {
    const damp = (1 - FRICTION) ** dt;
    cam.vx *= damp;
    cam.vy *= damp;
    if (Math.abs(cam.vx) < VELOCITY_EPS) cam.vx = 0;
    if (Math.abs(cam.vy) < VELOCITY_EPS) cam.vy = 0;
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
  }
  maybeOriginShift(cam);
}
