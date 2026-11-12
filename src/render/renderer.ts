import { ARENA_STAGES, BOSSES } from '../fighters/definitions.ts';
import { arenaStageQuads } from '../fighters/endless-art.ts';
import type { BossId, StageId } from '../fighters/types.ts';
import type { World } from '../world/world.ts';
import type { SpriteAtlas } from './atlas.ts';
import type { Viewport } from './viewport.ts';
import { viewportFor } from './viewport.ts';
import type { RenderAppearance, VariantAppearance } from '../app-web/art-profile.ts';
import { resolveAppearance } from '../app-web/art-profile.ts';
import { ARENA_FRAME_COLOR } from '../art/scene-profiles.ts';
import { motesFor, scenePlan } from './scene-plan.ts';
import type { Mote, ScenePlan } from './scene-plan.ts';
import { sceneryQuads } from '../fighters/scenery.ts';
import type { BossAtlas, DrawCommand } from '../fighters/render-types.ts';
import { parseBossAtlas } from '../fighters/render-types.ts';
import { parsePoseAtlas } from '../fighters/pose-art.ts';
import { parseLifeAtlas } from './life-art.ts';
import type { LifeAtlas } from './life-art.ts';
import type { PoseAtlas, PoseSheet } from '../fighters/pose-art.ts';

/** One selectable background: the approved room art plus its optional wide matte. */
export interface VariantImages {
  background: HTMLImageElement;
  matte?: HTMLImageElement | null;
  appearance?: VariantAppearance;
}

export interface SceneImages {
  background: HTMLImageElement | null;
  character: HTMLImageElement | null;
  life?: HTMLImageElement | null;
  /** Optional local rival; missing/corrupt images never block the scene. */
  boss?: HTMLImageElement | null;
  bosses?: Partial<Record<BossId, HTMLImageElement | null>>;
  arenas?: Partial<Record<StageId, HTMLImageElement | null>>;
  /** Optional wallpaper matte (wide/tall continuation of the room). */
  matte?: HTMLImageElement | null;
  /** Additional backgrounds; index 0 is always the default profile background. */
  variants?: readonly VariantImages[];
  /** Optional painted terrace backdrop for the fixed manual arena (480×270). */
  arena?: HTMLImageElement | null;
  /** Independently optional combat/mob sheets; one failure never substitutes heroine art. */
  sprites?: Partial<Record<PoseSheet, HTMLImageElement | null>>;
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
  private readonly lifeSprite?: { image: HTMLImageElement; atlas: LifeAtlas };
  private readonly bossAtlas: BossAtlas | null;
  private readonly bossImage: HTMLImageElement | null;
  private readonly bosses: Partial<Record<BossId, { image: HTMLImageElement; atlas: BossAtlas }>> = {};
  private readonly arenas: Partial<Record<StageId, HTMLImageElement>> = {};
  private arenaStageId?: StageId;
  private readonly poseImages: Partial<Record<PoseSheet, { image: HTMLImageElement; atlas: PoseAtlas }>> = {};
  private readonly appearance: RenderAppearance;
  private readonly motes: readonly Mote[];
  private readonly matte: HTMLImageElement | null;
  private readonly variants: readonly VariantImages[];
  private readonly arenaImage: HTMLImageElement | null;
  private variantIndex = 0;
  private viewport: Viewport = viewportFor(480, 270);
  private readonly canvas: HTMLCanvasElement;
  private wideBackdrop: HTMLCanvasElement | null = null;
  private arenaBackdrop: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, images: SceneImages, atlas: SpriteAtlas, seed: number, appearance: RenderAppearance = {}) {
    const context = canvas.getContext('2d', { alpha: false });
    const backdrop = document.createElement('canvas');
    const backdropContext = backdrop.getContext('2d', { alpha: false });
    if (!context || !backdropContext) throw new Error('Canvas 2D is unavailable.');
    if (images.character && (images.character.naturalWidth !== atlas.frameWidth * atlas.columns
      || images.character.naturalHeight !== atlas.frameHeight * atlas.rows)) throw new Error('Character sheet size does not match the atlas.');
    if (images.background && (images.background.naturalWidth !== 480 || images.background.naturalHeight !== 270)) throw new Error('Background must be 480×270 logical pixels.');
    if (appearance.matte && (appearance.matte.width <= 0 || appearance.matte.height <= 0
      || appearance.matte.roomX < 0 || appearance.matte.roomY < 0
      || appearance.matte.roomX + 480 > appearance.matte.width || appearance.matte.roomY + 270 > appearance.matte.height)) {
      throw new Error('Wallpaper matte geometry is invalid.');
    }
    // Optional boss art is independently validated; the heroine atlas is never repurposed.
    let bossAtlas: BossAtlas | null = null;
    try { bossAtlas = appearance.bossAtlas ? parseBossAtlas(appearance.bossAtlas) : null; } catch { /* code-only rival fallback */ }
    const bossImage = images.boss && bossAtlas
      && images.boss.naturalWidth === bossAtlas.frameWidth * bossAtlas.columns
      && images.boss.naturalHeight === bossAtlas.frameHeight * bossAtlas.rows ? images.boss : null;
    // A missing or wrong-sized matte is a soft failure: the room still draws with the old fallback.
    const matte = images.matte && appearance.matte
      && images.matte.naturalWidth === appearance.matte.width && images.matte.naturalHeight === appearance.matte.height
      ? images.matte : null;
    const variants = (images.variants ?? []).filter((variant) => {
      const okBackground = variant.background.naturalWidth === 480 && variant.background.naturalHeight === 270;
      const okMatte = !variant.matte || !appearance.matte
        || (variant.matte.naturalWidth === appearance.matte.width && variant.matte.naturalHeight === appearance.matte.height);
      return okBackground && okMatte;
    });
    // A missing or wrong-sized arena backdrop is a soft failure: the manual arena
    // falls back to the code-drawn scrolling stage. It never affects the wallpaper.
    const arenaImage = images.arena && images.arena.naturalWidth === 480 && images.arena.naturalHeight === 270
      ? images.arena : null;
    this.canvas = canvas; this.context = context; this.backdrop = backdrop; this.backdropContext = backdropContext;
    this.images = images; this.atlas = atlas; this.bossAtlas = bossAtlas; this.bossImage = bossImage;
    try {
      const info = parseLifeAtlas(appearance.lifeAtlas), image = images.life;
      if (image && image.naturalWidth === info.frameWidth * info.columns && image.naturalHeight === info.frameHeight * info.rows) {
        this.lifeSprite = { image, atlas: info };
      }
    } catch { /* Optional gesture resources fail independently of the approved heroine. */ }
    this.appearance = appearance; this.motes = motesFor(seed);
    this.matte = matte; this.variants = variants; this.arenaImage = arenaImage;
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const key = BOSSES[id].atlasKey ?? id;
      try {
        const atlas = parseBossAtlas(appearance.bossAtlases?.[key] ?? (key === 'lumie' ? appearance.bossAtlas : undefined));
        const image = images.bosses?.[key] === undefined ? (key === 'lumie' ? images.boss : null) : images.bosses[key];
        if (image && image.naturalWidth === atlas.frameWidth * atlas.columns && image.naturalHeight === atlas.frameHeight * atlas.rows) this.bosses[id] = { image, atlas };
      } catch { /* Each rival falls back independently. */ }
    }
    for (const id of Object.keys(ARENA_STAGES) as StageId[]) {
      const image = images.arenas?.[id];
      if (image?.naturalWidth === 480 && image.naturalHeight === 270) this.arenas[id] = image;
    }
    for (const key of ['combat', 'slime', 'popup'] as const) {
      try {
        const atlas = parsePoseAtlas(appearance[`${key}Atlas`], key), image = images.sprites?.[key];
        if (image && image.naturalWidth === atlas.frameWidth * atlas.columns && image.naturalHeight === atlas.frameHeight * atlas.rows) {
          this.poseImages[key] = { image, atlas };
        }
      } catch { /* Optional malformed metadata/image falls back independently. */ }
    }
  }

  /** 0 = the approved sunset room; 1..n = additional backgrounds. */
  get variantCount(): number { return this.variants.length + 1; }
  get selectedVariant(): number { return this.variantIndex; }

  /** Base appearance merged with the selected background's overrides (ambient palette, water). */
  get activeAppearance(): RenderAppearance {
    const base = this.variantIndex === 0 ? this.appearance
      : resolveAppearance(this.appearance, this.variants[this.variantIndex - 1]?.appearance);
    // The painted arena backdrop is independent of the wallpaper background choice.
    return this.arenaImage ? { ...base, arenaArt: true } : base;
  }

  setVariant(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.variantCount) throw new Error('Invalid background variant.');
    if (index === this.variantIndex) return;
    this.variantIndex = index;
    this.wideBackdrop = null;
    if (this.backdrop.width > 0 && this.backdrop.height > 0) this.cacheBackground();
  }

  private activeBackground(): HTMLImageElement | null {
    if (this.variantIndex === 0) return this.images.background;
    return this.variants[this.variantIndex - 1]?.background ?? this.images.background;
  }

  private activeMatte(): HTMLImageElement | null {
    if (this.variantIndex === 0) return this.matte;
    const candidate = this.variants[this.variantIndex - 1]?.matte;
    return candidate && this.appearance.matte
      && candidate.naturalWidth === this.appearance.matte.width && candidate.naturalHeight === this.appearance.matte.height
      ? candidate : null;
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    const viewport = viewportFor(pixelWidth, pixelHeight);
    this.viewport = viewport;
    this.canvas.width = viewport.pixelWidth;
    this.canvas.height = viewport.pixelHeight;
    this.backdrop.width = viewport.width;
    this.backdrop.height = viewport.height;
    this.context.imageSmoothingEnabled = false; this.backdropContext.imageSmoothingEnabled = false;
    this.wideBackdrop = null;
    this.arenaBackdrop = null;
    this.cacheBackground();
  }

  private cacheBackground(): void {
    const { width, height, originX, originY } = this.viewport;
    const ctx = this.backdropContext;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.appearance.ceilingColor ?? '#617e77'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = this.appearance.floorColor ?? '#8a8d75'; ctx.fillRect(0, originY + 203, width, height - originY - 203);
    const matte = this.activeMatte();
    if (matte && this.appearance.matte) {
      // The matte already contains the approved room at art coordinates (roomX, roomY).
      ctx.drawImage(matte, originX - this.appearance.matte.roomX, originY - this.appearance.matte.roomY);
      return;
    }
    const background = this.activeBackground();
    if (background) {
      const image = background;
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
    const background = this.activeBackground();
    if (background) ctx.drawImage(background, 120, this.viewport.originY);
    this.wideBackdrop = canvas;
    return canvas;
  }

  /**
   * Viewport-sized painted terrace backdrop for the fixed manual arena. The 480×270 art
   * stays whole; any margins get one flat frame colour instead of a stretched edge
   * column, matching the native CoreGraphics painter.
   */
  private cacheArenaBackground(stageId?: StageId): HTMLCanvasElement | null {
    const image = stageId ? this.arenas[stageId] ?? (stageId === 'terrace' ? this.arenaImage : null) : this.arenaImage;
    if (!image && !stageId) return null;
    if (this.arenaBackdrop && this.arenaStageId === stageId) return this.arenaBackdrop;
    this.arenaStageId = stageId;
    const canvas = document.createElement('canvas');
    const { width, height, originX, originY } = this.viewport;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = stageId ? ARENA_STAGES[stageId].frameColor : this.appearance.arenaFrameColor ?? ARENA_FRAME_COLOR;
    ctx.fillRect(0, 0, width, height);
    if (image) ctx.drawImage(image, originX, originY);
    else if (stageId) {
      for (const quad of arenaStageQuads(stageId)) {
        ctx.globalAlpha = quad.alpha; ctx.fillStyle = quad.color;
        ctx.fillRect(originX + quad.x, originY + quad.y, quad.width, quad.height);
      }
      ctx.globalAlpha = 1;
    }
    this.arenaBackdrop = canvas;
    return canvas;
  }

  private drawCommands(commands: readonly DrawCommand[]): void {
    const ctx = this.context;
    const { originX, originY } = this.viewport;
    for (const command of commands) {
      const optional = command.kind === 'sprite' && command.sheet && command.sheet !== 'hero';
      const resource = command.kind === 'sprite' && optional
        ? command.sheet === 'boss' ? command.bossId ? this.bosses[command.bossId] : { image: this.bossImage, atlas: this.bossAtlas }
          : this.poseImages[command.sheet as PoseSheet] : null;
      if (command.kind === 'sprite' && optional
        && (!resource?.image || !resource.atlas || !Number.isInteger(command.frame)
          || command.frame < 0 || command.frame >= resource.atlas.columns * resource.atlas.rows)) {
        // Fallback is already camera-relative. Recurse BEFORE translating/setting alpha,
        // so it cannot inherit the failed sprite's transform or duplicate the heroine.
        this.drawCommands(command.fallback ?? []);
        continue;
      }
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
      } else {
        const image = optional ? resource?.image : this.images.character;
        const atlas = optional ? resource?.atlas : this.atlas;
        if (image && atlas && Number.isInteger(command.frame) && command.frame >= 0 && command.frame < atlas.columns * atlas.rows) {
          ctx.rotate(command.rotation); ctx.scale(command.facing * command.scaleX, command.scaleY);
          const sx = command.frame % atlas.columns * atlas.frameWidth;
          const sy = Math.floor(command.frame / atlas.columns) * atlas.frameHeight;
          ctx.drawImage(image, sx, sy, atlas.frameWidth, atlas.frameHeight,
            -atlas.anchor.x, -atlas.anchor.y, atlas.frameWidth, atlas.frameHeight);
        }
      }
      ctx.restore();
    }
  }

  draw(world: Readonly<World>, decorations = true): void {
    this.drawPlan(scenePlan(world, this.atlas, this.motes, this.activeAppearance, decorations));
  }

  drawPlan(plan: ScenePlan): void {
    if (!plan.battle) { this.wideBackdrop = null; this.arenaBackdrop = null; }
    const ctx = this.context;
    const viewport = this.viewport;
    const { originX, originY, scale, offsetX, offsetY, pixelWidth, pixelHeight } = viewport;
    // Clear letterbox pixels in the room's own colours, then draw the whole scene on a
    // uniform pixel grid. Whole-number scales keep every art pixel the same size on screen.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.appearance.ceilingColor ?? '#617e77'; ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.drawImage(this.backdrop, 0, 0);
    // Room incidents keep the study backdrop. The fixed manual arena paints its local
    // terrace backdrop when available; otherwise (and for legacy routes) scroll the stage.
    if (plan.battle && !plan.battle.room) {
      const arena = plan.battle.arena ? this.cacheArenaBackground(plan.battle.stageId) : null;
      if (arena) ctx.drawImage(arena, 0, 0);
      else ctx.drawImage(this.cacheWideBackground(), originX - plan.battle.cameraX, 0);
    }
    const quadCount = this.images.character || plan.battle ? plan.quads.length : plan.quads.length - 2;
    for (let index = 0; index < quadCount; index++) {
      const quad = plan.quads[index]!;
      ctx.globalAlpha = quad.alpha; ctx.fillStyle = quad.color;
      ctx.fillRect(originX + quad.x, originY + quad.y, quad.width, quad.height);
    }
    ctx.globalAlpha = 1;
    if (plan.battle) this.drawCommands(plan.battle.commands);
    else if (this.images.character) {
      const life = this.lifeSprite && Number.isSafeInteger(plan.lifeFrame) && plan.lifeFrame! >= 0 && plan.lifeFrame! < 24
        ? this.lifeSprite : null;
      const info = life?.atlas ?? this.atlas;
      const frame = life ? plan.lifeFrame! : plan.frame;
      const image = life?.image ?? this.images.character;
      const sx = frame % info.columns * info.frameWidth;
      const sy = Math.floor(frame / info.columns) * info.frameHeight;
      const motion = plan.motion;
      ctx.save();
      ctx.translate(originX + plan.x + (motion?.offsetX ?? 0), originY + plan.floorY - (motion?.lift ?? 0));
      if (motion?.rotation) ctx.rotate(motion.rotation);
      ctx.scale(plan.facing * (motion?.scaleX ?? 1), motion?.scaleY ?? 1);
      ctx.drawImage(image, sx, sy, info.frameWidth, info.frameHeight,
        -info.anchor.x, -info.anchor.y, info.frameWidth, info.frameHeight);
      ctx.restore();
    }
    if (plan.overlay) this.drawCommands(plan.overlay);
  }
}
