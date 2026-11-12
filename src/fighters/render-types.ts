import type { BossId, GameUI, StageId } from './types.ts';

export type BossPose = 'idle' | 'move' | 'windup' | 'strike' | 'cast' | 'recover' | 'hurt' | 'exit';
export interface BossAtlas {
  readonly version: 1;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly poses: Readonly<Record<BossPose, number>>;
}

/** Separate from the approved heroine's sixteen-frame behavior atlas. */
export function parseBossAtlas(value: unknown): BossAtlas {
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const integer = (item: unknown, min: number, max: number): item is number => Number.isSafeInteger(item) && Number(item) >= min && Number(item) <= max;
  if (!record(value) || value.version !== 1 || !integer(value.frameWidth, 16, 256) || !integer(value.frameHeight, 16, 256)
    || !integer(value.columns, 1, 8) || !integer(value.rows, 1, 8) || !record(value.anchor) || !record(value.poses)) {
    throw new Error('Invalid optional boss atlas header.');
  }
  const count = value.columns * value.rows;
  if (count < 6 || count > 8 || !integer(value.anchor.x, 0, value.frameWidth) || !integer(value.anchor.y, 0, value.frameHeight)) {
    throw new Error('Invalid optional boss atlas geometry.');
  }
  for (const pose of ['idle', 'move', 'windup', 'strike', 'cast', 'recover', 'hurt', 'exit'] as const) {
    if (!integer(value.poses[pose], 0, count - 1)) throw new Error(`Invalid optional boss pose: ${pose}.`);
  }
  return value as unknown as BossAtlas;
}

export type DrawCommand =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; color: string; alpha: number; rotation?: number }
  | { kind: 'sprite'; x: number; y: number; frame: number; facing: number; alpha: number; rotation: number; scaleX: number; scaleY: number;
      /** Omitted means the unchanged heroine sheet. */
      bossId?: BossId;
      sheet?: 'hero' | 'boss' | 'combat' | 'slime' | 'popup';
      /** Camera-relative commands used only when the optional sheet is unavailable. */
      fallback?: readonly DrawCommand[] }
  | { kind: 'text'; x: number; y: number; text: string; color: string; alpha: number; size: number };
export interface BattleFrame {
  cameraX: number;
  commands: DrawCommand[];
  /**
   * True for the short automatic incident inside the study room: the renderer keeps
   * the wallpaper backdrop (room + wide matte) instead of the scrolling stage.
   */
  room?: boolean;
  /**
   * True for the fixed manual terrace arena. When a local arena backdrop image is
   * available the renderer paints it instead of the code-drawn scrolling stage;
   * otherwise it falls back to that stage. The passive wallpaper never sets this.
   */
  arena?: boolean;
  stageId?: StageId;
}
export interface GamePresentation { game?: GameUI; battle?: BattleFrame; overlay?: DrawCommand[] }
