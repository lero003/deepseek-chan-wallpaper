import type { World } from '../world/world.ts';
import { TICKS_PER_SECOND, worldSeconds } from '../world/world.ts';
import type { SpriteAtlas } from './atlas.ts';
import { frameAt } from './atlas.ts';
import type { Viewport } from './viewport.ts';

export interface SceneImages {
  background: HTMLImageElement | null;
  character: HTMLImageElement | null;
}

interface Mote { x: number; y: number; speed: number; phase: number }

function motesFor(seed: number): Mote[] {
  // A separate, initialization-only stream: adding particles cannot change behavior.
  let value = seed ^ 0xa812f37b;
  const next = () => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  };
  return Array.from({ length: 12 }, () => ({
    x: 107 + next() * 274, y: 75 + next() * 110, speed: 0.7 + next() * 1.2, phase: next() * Math.PI * 2,
  }));
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (success: boolean) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (success && image.naturalWidth > 0) resolve(image);
      else reject(new Error(`Unable to load scene image: ${url}`));
    };
    const timeout = window.setTimeout(() => finish(false), 8000);
    image.decoding = 'async';
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

/** Cached static layer + tiny sprite pass. Rendering never advances world state. */
export class SceneRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly backdrop: HTMLCanvasElement;
  private readonly backdropContext: CanvasRenderingContext2D;
  private readonly images: SceneImages;
  private readonly atlas: SpriteAtlas;
  private readonly motes: readonly Mote[];
  private viewport: Viewport = { width: 480, height: 270, originX: 0, originY: 0 };
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, images: SceneImages, atlas: SpriteAtlas, seed: number) {
    const context = canvas.getContext('2d', { alpha: false });
    const backdrop = document.createElement('canvas');
    const backdropContext = backdrop.getContext('2d', { alpha: false });
    if (!context || !backdropContext) throw new Error('Canvas 2D is unavailable.');
    if (images.character && (images.character.naturalWidth !== atlas.frameWidth * atlas.columns
      || images.character.naturalHeight !== atlas.frameHeight * atlas.rows)) throw new Error('Character sheet size does not match the atlas.');
    if (images.background && (images.background.naturalWidth !== 480 || images.background.naturalHeight !== 270)) {
      throw new Error('Background must be 480×270 logical pixels.');
    }
    this.canvas = canvas;
    this.context = context;
    this.backdrop = backdrop;
    this.backdropContext = backdropContext;
    this.images = images;
    this.atlas = atlas;
    this.motes = motesFor(seed);
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.backdrop.width = viewport.width;
    this.backdrop.height = viewport.height;
    this.context.imageSmoothingEnabled = false;
    this.backdropContext.imageSmoothingEnabled = false;
    this.cacheBackground();
  }

  private cacheBackground(): void {
    const { width, height, originX, originY } = this.viewport;
    const ctx = this.backdropContext;
    ctx.fillStyle = '#617e77'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#8a8d75'; ctx.fillRect(0, originY + 203, width, height);
    // Extend actual edge pixels; all furniture stays in the central safe area.
    if (this.images.background) {
      const image = this.images.background;
      if (originX > 0) {
        ctx.drawImage(image, 0, 0, 1, 270, 0, originY, originX, 270);
        ctx.drawImage(image, 479, 0, 1, 270, originX + 480, originY, width - originX - 480, 270);
      }
      if (originY > 0) {
        ctx.fillStyle = '#3b5b5b'; ctx.fillRect(0, 0, width, originY);
        ctx.fillStyle = '#5c7366'; ctx.fillRect(0, originY + 270, width, height - originY - 270);
      }
      ctx.drawImage(image, originX, originY);
    } else {
      // A failed background still leaves a quiet, static fallback rather than a blank canvas.
      ctx.fillStyle = '#9cb4a6'; ctx.fillRect(originX + 90, originY + 32, 300, 95);
      ctx.fillStyle = '#6c918b'; ctx.fillRect(originX + 90, originY + 127, 300, 57);
      ctx.fillStyle = '#b6b394'; ctx.fillRect(originX + 86, originY + 184, 308, 6);
      ctx.fillStyle = '#687d70'; ctx.fillRect(originX + 100, originY + 225, 294, 24);
    }
  }

  draw(world: Readonly<World>, decorations = true): void {
    const ctx = this.context;
    const { originX, originY } = this.viewport;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.backdrop, 0, 0);
    const seconds = worldSeconds(world);
    if (decorations) {
      ctx.fillStyle = '#eee1be';
      for (const mote of this.motes) {
        const x = Math.round(originX + mote.x + Math.sin(seconds * 0.12 + mote.phase) * 3);
        const y = Math.round(originY + 75 + ((mote.y - 75 - seconds * mote.speed) % 110 + 110) % 110);
        ctx.globalAlpha = 0.12 + (Math.sin(seconds * 0.4 + mote.phase) + 1) * 0.12;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    if (!this.images.character) return;
    const actor = world.actor;
    const x = Math.round(originX + actor.x);
    const floorY = originY + world.floorY;
    ctx.globalAlpha = 0.21;
    ctx.fillStyle = '#314e50';
    ctx.fillRect(x - 14, floorY - 1, 29, 2);
    ctx.fillRect(x - 10, floorY - 2, 21, 4);
    ctx.globalAlpha = 1;
    const frame = frameAt(this.atlas, actor.state, actor.stateTicks / TICKS_PER_SECOND);
    const sx = (frame % this.atlas.columns) * this.atlas.frameWidth;
    const sy = Math.floor(frame / this.atlas.columns) * this.atlas.frameHeight;
    ctx.save();
    ctx.translate(x, floorY);
    ctx.scale(actor.facing, 1);
    ctx.drawImage(this.images.character, sx, sy, this.atlas.frameWidth, this.atlas.frameHeight,
      -this.atlas.anchor.x, -this.atlas.anchor.y, this.atlas.frameWidth, this.atlas.frameHeight);
    ctx.restore();
  }
}
