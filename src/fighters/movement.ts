import type { Point, Stage } from './types.ts';

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export function canStand(stage: Stage, x: number, y: number): boolean {
  const b = stage.bounds;
  return Number.isFinite(x) && Number.isFinite(y) && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom
    && !stage.furniture.some(rect => x + 8 > rect.left && x - 8 < rect.right && y + 5 > rect.top && y - 5 < rect.bottom);
}
/** Separate axes slide along furniture; feet/depth stay independent of visual jump height. */
export function moveOnFloor(point: Point, dx: number, dy: number, stage: Stage): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const b = stage.bounds;
  const x = clamp(point.x + dx, b.left, b.right);
  if (canStand(stage, x, point.y)) point.x = x;
  const y = clamp(point.y + dy, b.top, b.bottom);
  if (canStand(stage, point.x, y)) point.y = y;
}
export function direction(x: number, y: number): Point {
  x = clamp(Number.isFinite(x) ? x : 0, -1, 1); y = clamp(Number.isFinite(y) ? y : 0, -1, 1);
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}
