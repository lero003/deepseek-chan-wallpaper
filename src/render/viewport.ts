/** The scene art is authored in this fixed 480×270 logical safe area. */
export const SAFE_WIDTH = 480;
export const SAFE_HEIGHT = 270;

export interface Viewport {
  /** Logical width of the scene, in art pixels. */
  width: number;
  /** Logical height of the scene, in art pixels. */
  height: number;
  /** Where the 480×270 room starts inside the logical viewport. */
  originX: number;
  originY: number;
  /**
   * Pixels per art pixel when the logical scene is drawn. Whole numbers from 2x up
   * so that every source pixel becomes the same square on screen; below 2x the
   * target cannot fit the room at a whole scale, so the scene fills fractionally.
   */
  scale: number;
  /** Target drawing surface in pixels (the canvas or window backing size). */
  pixelWidth: number;
  pixelHeight: number;
  /** Translation applied after scaling so the logical scene is centred in the target. */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_VIEWPORT: Viewport = {
  width: SAFE_WIDTH,
  height: SAFE_HEIGHT,
  originX: 0,
  originY: 0,
  scale: 1,
  pixelWidth: SAFE_WIDTH,
  pixelHeight: SAFE_HEIGHT,
  offsetX: 0,
  offsetY: 0,
};

/**
 * Extend the room, not the actor. The whole 480×270 safe area stays visible.
 *
 * Wallpaper quality depends on the pixel grid: at 2x and above the scene is drawn
 * at a whole scale so one art pixel always becomes k×k physical pixels. This stops
 * the "wobbling" 3-or-4-pixel dither seen when a 480-wide scene is stretched to an
 * arbitrary window. Below 2x (small preview windows and phones) the room is fitted
 * fractionally instead, which keeps it readable rather than shrinking it to half.
 */
export function viewportFor(pixelWidth: number, pixelHeight: number): Viewport {
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    return { ...DEFAULT_VIEWPORT };
  }
  const targetWidth = Math.max(1, Math.round(pixelWidth));
  const targetHeight = Math.max(1, Math.round(pixelHeight));
  const fit = Math.min(targetWidth / SAFE_WIDTH, targetHeight / SAFE_HEIGHT);
  const scale = fit >= 2 ? Math.floor(fit) : Math.max(fit, 0.05);
  const width = Math.max(SAFE_WIDTH, Math.ceil(targetWidth / scale - 1e-7));
  const height = Math.max(SAFE_HEIGHT, Math.ceil(targetHeight / scale - 1e-7));
  return {
    width,
    height,
    originX: Math.floor((width - SAFE_WIDTH) / 2),
    originY: Math.floor((height - SAFE_HEIGHT) / 2),
    scale,
    pixelWidth: targetWidth,
    pixelHeight: targetHeight,
    offsetX: Math.floor((targetWidth - width * scale) / 2),
    offsetY: Math.floor((targetHeight - height * scale) / 2),
  };
}

/** A whole-number scale keeps the pixel grid uniform; fractional fits are only tiny views. */
export function isWholeScale(viewport: Viewport): boolean {
  return Math.abs(viewport.scale - Math.round(viewport.scale)) < 1e-9;
}
