import type { DrawCommand } from './render-types.ts';

/** Fixed camera-relative command writer shared by Canvas and CoreGraphics. */
export class Painter {
  readonly commands: DrawCommand[] = [];
  readonly cameraX: number;
  constructor(cameraX = 0) { this.cameraX = cameraX; }

  rect(x: number, y: number, width: number, height: number, color: string, alpha = 1, rotation = 0): void {
    const w = Math.round(width), h = Math.round(height);
    if (w < 1 || h < 1 || alpha <= .02) return;
    const command: Extract<DrawCommand, { kind: 'rect' }> = {
      kind: 'rect', x: Math.round(x - this.cameraX), y: Math.round(y), width: w, height: h,
      color, alpha: Math.round(Math.min(1, alpha) * 1000) / 1000,
    };
    if (rotation) command.rotation = Math.round(rotation * 10000) / 10000;
    this.commands.push(command);
  }
  /** Screen-space rectangle: HUD, banners, vignette. */
  screen(x: number, y: number, width: number, height: number, color: string, alpha = 1, rotation = 0): void {
    this.rect(x + this.cameraX, y, width, height, color, alpha, rotation);
  }
  text(x: number, y: number, value: string, color = '#f2e7d2', size = 8, alpha = 1): void {
    if (alpha <= .02 || !value) return;
    this.commands.push({ kind: 'text', x: Math.round(x - this.cameraX), y: Math.round(y),
      text: String(value).slice(0, 36), color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#f2e7d2',
      alpha: Math.round(Math.min(1, alpha) * 1000) / 1000, size: Math.max(5, Math.min(24, Math.round(size))) });
  }
  screenText(x: number, y: number, value: string, color = '#f2e7d2', size = 8, alpha = 1): void {
    this.text(x + this.cameraX, y, value, color, size, alpha);
  }
  /** Centre-aligned approximation; system fonts are proportional, Japanese is ~1em. */
  screenTextCentered(x: number, y: number, value: string, color = '#f2e7d2', size = 8, alpha = 1): void {
    this.screenText(x - value.length * size * .5, y, value, color, size, alpha);
  }
  sprite(x: number, y: number, frame: number, facing: number, alpha = 1, rotation = 0, scaleX = 1, scaleY = 1,
    sheet?: 'hero' | 'boss', fallback?: readonly DrawCommand[]): void {
    const command: Extract<DrawCommand, { kind: 'sprite' }> = { kind: 'sprite', x: Math.round(x - this.cameraX), y: Math.round(y), frame,
      facing: facing < 0 ? -1 : 1, alpha: Math.round(Math.min(1, alpha) * 1000) / 1000,
      rotation: Math.round(rotation * 10000) / 10000, scaleX, scaleY };
    // Preserve the original heroine command byte-shape for wallpaper parity.
    if (sheet) command.sheet = sheet;
    if (fallback) command.fallback = fallback;
    this.commands.push(command);
  }
}

/** One horizontal run; most shapes in this project are built from merged rows. */
export function span(p: Painter, x1: number, x2: number, y: number, color: string, alpha = 1): void {
  p.rect(Math.round(x1), Math.round(y), Math.round(x2 - x1), 1, color, alpha);
}

/** Organic filled ellipse with optional per-row colours; naturally pixel-stepped. */
export function ellipse(p: Painter, cx: number, cy: number, rx: number, ry: number,
  color: string | ((row: number, rows: number) => string | null), alpha = 1): void {
  const rows = Math.max(2, Math.round(ry * 2));
  for (let row = 0; row < rows; row++) {
    const t = ((row + .5) / rows) * 2 - 1;
    const half = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * rx);
    if (half < 1) continue;
    const fill = typeof color === 'string' ? color : color(row, rows);
    if (fill) p.rect(cx - half, cy - ry + row, half * 2, 1, fill, alpha);
  }
}

/** Paper-like panel with a 1px ink border and optional drop shadow. */
export function panel(p: Painter, x: number, y: number, width: number, height: number, paper: string, border: string, alpha = 1): void {
  p.rect(x, y, width, height, border, alpha);
  p.rect(x + 1, y + 1, width - 2, height - 2, paper, alpha);
}

/** Same panel for screen-space HUD coordinates. */
export function screenPanel(p: Painter, x: number, y: number, width: number, height: number, paper: string, border: string, alpha = 1): void {
  panel(p, x + p.cameraX, y, width, height, paper, border, alpha);
}
