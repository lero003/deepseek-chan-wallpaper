export interface Viewport {
  width: number;
  height: number;
  originX: number;
  originY: number;
}

/** Extend the room, not the actor. The entire 480×270 safe area stays visible. */
export function viewportFor(width: number, height: number): Viewport {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 480, height: 270, originX: 0, originY: 0 };
  }
  const aspect = Math.max(0.25, Math.min(5, width / height));
  const logicalWidth = Math.max(480, Math.round(270 * aspect));
  const logicalHeight = Math.max(270, Math.round(480 / aspect));
  return {
    width: logicalWidth,
    height: logicalHeight,
    originX: Math.floor((logicalWidth - 480) / 2),
    originY: Math.floor((logicalHeight - 270) / 2),
  };
}
