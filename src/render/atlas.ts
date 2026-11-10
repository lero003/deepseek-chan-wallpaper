import type { Behavior } from '../world/world.ts';

export interface Animation {
  readonly frames: readonly number[];
  readonly frameDurationMs: number;
}
export interface SpriteAtlas {
  readonly version: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly animations: Readonly<Record<Behavior, Animation>>;
}

const counts: Record<Behavior, number> = { idle: 4, walk: 6, turn: 2, sleep: 4 };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

export function parseAtlas(value: unknown): SpriteAtlas {
  if (!record(value) || value.version !== 1 || !positiveInteger(value.frameWidth) || !positiveInteger(value.frameHeight)
    || !positiveInteger(value.columns) || !positiveInteger(value.rows) || !record(value.anchor) || !record(value.animations)) {
    throw new Error('Invalid character atlas header.');
  }
  const total = value.columns * value.rows;
  if (total !== 16 || typeof value.anchor.x !== 'number' || typeof value.anchor.y !== 'number'
    || !Number.isFinite(value.anchor.x) || !Number.isFinite(value.anchor.y)
    || value.anchor.x < 0 || value.anchor.x > value.frameWidth || value.anchor.y < 0 || value.anchor.y > value.frameHeight) {
    throw new Error('Invalid character atlas dimensions or foot anchor.');
  }
  const used = new Set<number>();
  for (const [state, count] of Object.entries(counts)) {
    const animation = value.animations[state];
    if (!record(animation) || !Array.isArray(animation.frames) || animation.frames.length !== count
      || !positiveInteger(animation.frameDurationMs)) throw new Error(`Invalid ${state} animation.`);
    for (const frame of animation.frames) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= total || used.has(frame)) throw new Error('Missing or duplicate animation frame.');
      used.add(frame);
    }
  }
  return value as unknown as SpriteAtlas;
}

export function frameAt(atlas: SpriteAtlas, state: Behavior, elapsedSeconds: number): number {
  const animation = atlas.animations[state];
  const index = Math.floor(Math.max(0, elapsedSeconds) * 1000 / animation.frameDurationMs) % animation.frames.length;
  return animation.frames[index]!;
}
