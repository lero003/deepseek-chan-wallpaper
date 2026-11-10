import type { World } from '../world/world.ts';
import type { SpriteAtlas } from './atlas.ts';
import type { Viewport } from './viewport.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { motesFor, scenePlan } from './scene-plan.ts';
import type { Mote, ScenePlan } from './scene-plan.ts';
import { sceneryQuads } from '../fighters/scenery.ts';
import type { DrawCommand } from '../fighters/render-types.ts';

export interface SceneImages {
  background: HTMLImageElement | null;
  character: HTMLImageElement | null;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (success: boolean) => {
      window.clearTimeout(timeout);
      image.onload = null; image.onerror = null;
      if (success && image.naturalWidth > 0) resolve(image);
      else reject(new Error(`Unable to load scene image: ${url}`));
    };
    const timeout = window.setTimeout(() => finish(false), 8000);
    image.decoding = 'async'; image.onload = () => finish(true); image.onerror = () => finish(false); image.src = url;
  });
}

/** Cached backdrop + the same pure frame commands used by the native Mac painter. */
export class SceneRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly backdrop: HTMLCanvasElement;
  private readonly backdropContext: CanvasRenderingContext2D;
  private readonly images: SceneImages;
  private readonly atlas: SpriteAtlas;
  private readonly appearance: RenderAppearance;
  private readonly motes: readonly Mote[];
  private viewport: Viewport = { width: 480, height: 270, originX: 0, originY: 0 };
  private canvas: HTMLCanvasElement;
  private wideBackdrop: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, images: SceneImages, atlas: SpriteAtlas, seed: number, appearance: RenderAppearance = {}) {
    const context = canvas.getContext('2d', { alpha: false });
    const backdrop = document.createElement('canvas');
    const backdropContext = backdrop.getContext('2d', { alpha: false });
    if (!context || !backdropContext) throw new Error('Canvas 2D is unavailable.');
    if (images.character && (images.character.naturalWidth !== atlas.frameWidth * atlas.columns
      || images.character.naturalHeight !== atlas.frameHeight * atlas.rows)) throw new Error('Character sheet size does not match the atlas.');
    if (images.background && (images.background.naturalWidth !== 480 || images.background.naturalHeight !== 270)) throw new Error('Background must be 480×270 logical pixels.');
    this.canvas = canvas; this.context = context; this.backdrop = backdrop; this.backdropContext = backdropContext;
    this.images = images; this.atlas = atlas; this.appearance = appearance; this.motes = motesFor(seed);
  }
  resize(viewport: Viewport): void {
    this.viewport = viewport;
    this.canvas.width = viewport.width; this.canvas.height = viewport.height;
    this.backdrop.width = viewport.width; this.backdrop.height = viewport.height;
    this.context.imageSmoothingEnabled = false; this.backdropContext.imageSmoothingEnabled = false;
    this.wideBackdrop = null;
    this.cacheBackground();
  }
  private cacheBackground(): void {
    const { width, height, originX, originY } = this.viewport;
    const ctx = this.backdropContext;
    ctx.fillStyle = this.appearance.ceilingColor ?? '#617e77'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = this.appearance.floorColor ?? '#8a8d75'; ctx.fillRect(0, originY + 203, width, height);
    if (this.images.background) {
      const image = this.images.background;
      if (originX > 0) {
        ctx.drawImage(image, 0, 0, 1, 270, 0, originY, originX, 270);
        ctx.drawImage(image, 479, 0, 1, 270, originX + 480, originY, width - originX - 480, 270);
      }
      if (originY > 0) {
        ctx.fillStyle = this.appearance.ceilingColor ?? '#3b5b5b'; ctx.fillRect(0, 0, width, originY);
        ctx.fillStyle = this.appearance.floorColor ?? '#5c7366'; ctx.fillRect(0, originY + 270, width, height - originY - 270);
      }
      ctx.drawImage(image, originX, originY);
    } else {
      ctx.fillStyle = '#9cb4a6'; ctx.fillRect(originX + 90, originY + 32, 300, 95);
      ctx.fillStyle = '#6c918b'; ctx.fillRect(originX + 90, originY + 127, 300, 57);
      ctx.fillStyle = '#b6b394'; ctx.fillRect(originX + 86, originY + 184, 308, 6);
      ctx.fillStyle = '#687d70'; ctx.fillRect(originX + 100, originY + 225, 294, 24);
    }
  }
  private cacheWideBackground(): HTMLCanvasElement {
    if (this.wideBackdrop) return this.wideBackdrop;
    const canvas = document.createElement('canvas');
    canvas.width = 3600; canvas.height = this.viewport.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.appearance.ceilingColor ?? '#403f4d'; ctx.fillRect(0, 0, 3600, canvas.height);
    ctx.fillStyle = this.appearance.floorColor ?? '#866077'; ctx.fillRect(0, this.viewport.originY + 195, 3600, canvas.height);
    for (const quad of sceneryQuads(this.appearance)) {
      ctx.globalAlpha = quad.alpha; ctx.fillStyle = quad.color;
      ctx.fillRect(quad.x, quad.y + this.viewport.originY, quad.width, quad.height);
    }
    ctx.globalAlpha = 1;
    if (this.images.background) ctx.drawImage(this.images.background, 120, this.viewport.originY);
    this.wideBackdrop = canvas;
    return canvas;
  }
  private drawCommands(commands: readonly DrawCommand[]): void {
    const ctx = this.context;
    const { originX, originY } = this.viewport;
    for (const command of commands) {
      ctx.save(); ctx.globalAlpha = command.alpha;
      ctx.translate(originX + command.x, originY + command.y);
      if (command.kind === 'rect') {
        ctx.fillStyle = command.color;
        if (command.rotation) { ctx.translate(command.width / 2, command.height / 2); ctx.rotate(command.rotation); ctx.fillRect(-command.width / 2, -command.height / 2, command.width, command.height); }
        else ctx.fillRect(0, 0, command.width, command.height);
      } else if (command.kind === 'text') {
        ctx.fillStyle = command.color; ctx.textBaseline = 'top';
        ctx.font = `${command.size}px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
        ctx.fillText(command.text, 0, 0);
      } else if (this.images.character) {
        ctx.rotate(command.rotation); ctx.scale(command.facing * command.scaleX, command.scaleY);
        const sx = command.frame % this.atlas.columns * this.atlas.frameWidth;
        const sy = Math.floor(command.frame / this.atlas.columns) * this.atlas.frameHeight;
        ctx.drawImage(this.images.character, sx, sy, this.atlas.frameWidth, this.atlas.frameHeight,
          -this.atlas.anchor.x, -this.atlas.anchor.y, this.atlas.frameWidth, this.atlas.frameHeight);
      }
      ctx.restore();
    }
  }
  draw(world: Readonly<World>, decorations = true): void {
    this.drawPlan(scenePlan(world, this.atlas, this.motes, this.appearance, decorations));
  }
  drawPlan(plan: ScenePlan): void {
    const ctx = this.context;
    const { originX, originY } = this.viewport;
    ctx.globalAlpha = 1; ctx.drawImage(this.backdrop, 0, 0);
    if (plan.battle) ctx.drawImage(this.cacheWideBackground(), originX - plan.battle.cameraX, 0);
    const quadCount = this.images.character || plan.battle ? plan.quads.length : plan.quads.length - 2;
    for (let index = 0; index < quadCount; index++) {
      const quad = plan.quads[index]!;
      ctx.globalAlpha = quad.alpha; ctx.fillStyle = quad.color;
      ctx.fillRect(originX + quad.x, originY + quad.y, quad.width, quad.height);
    }
    ctx.globalAlpha = 1;
    if (plan.battle) this.drawCommands(plan.battle.commands);
    else if (this.images.character) {
      const sx = plan.frame % this.atlas.columns * this.atlas.frameWidth;
      const sy = Math.floor(plan.frame / this.atlas.columns) * this.atlas.frameHeight;
      ctx.save(); ctx.translate(originX + plan.x, originY + plan.floorY); ctx.scale(plan.facing, 1);
      ctx.drawImage(this.images.character, sx, sy, this.atlas.frameWidth, this.atlas.frameHeight,
        -this.atlas.anchor.x, -this.atlas.anchor.y, this.atlas.frameWidth, this.atlas.frameHeight);
      ctx.restore();
    }
    if (plan.overlay) this.drawCommands(plan.overlay);
  }
}
