export const TILE = { w: 5200, h: 3600 };
export const MIN_ZOOM = 0.28;
export const MAX_ZOOM = 3.6;
export const DT_MAX = 0.05;
export const FRICTION = 0.12;
export const SPRING_OMEGA = 9;
export const ORIGIN_SHIFT_THRESH = 1e5;
export const CULL_MARGIN_PX = 320;
export const LOAD_MARGIN_PX = 620;
export const TEXTURE_POOL_N = 96;
export const TEXTURE_POOL_N_LOW = 48;
export const DPR_CAP = 2;
export const DPR_CAP_LOW = 1.5;
export const HASH_CELL = 384;
export const VELOCITY_EPS = 1e-3;

export const RECENTER_SETPOINTS = [
  { x: TILE.w * 0.5, y: TILE.h * 0.5, zoom: MIN_ZOOM * 1.15, overview: true },
  { x: TILE.w * 0.5, y: TILE.h * 0.5, zoom: 1 },
  { x: TILE.w * 0.22, y: TILE.h * 0.28, zoom: 1.1 },
  { x: TILE.w * 0.78, y: TILE.h * 0.3, zoom: 1.05 },
  { x: TILE.w * 0.25, y: TILE.h * 0.72, zoom: 1.1 },
  { x: TILE.w * 0.75, y: TILE.h * 0.7, zoom: 1.05 },
  { x: TILE.w * 0.5, y: TILE.h * 0.5, zoom: 0.72 },
];

export const WALL_JSON = "./data/wall.json";
