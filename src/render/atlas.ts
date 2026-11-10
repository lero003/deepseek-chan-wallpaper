import type { Behavior } from '../world/world.ts';

export interface Animation {
  readonly frames: readonly number[];
  readonly frameDurationMs: number;
  readonly frameDurationsMs?: readonly number[];
}
export interface SpriteAtlas {
  readonly version: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly collisionHalfWidth?: number;
  readonly animations: Readonly<Record<Behavior, Animation>>;
}

const counts: Record<Behavior, number> = { idle: 4, walk: 6, turn: 2, sleep: 4 };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

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
  if (value.collisionHalfWidth !== undefined && (typeof value.collisionHalfWidth !== 'number'
    || !Number.isFinite(value.collisionHalfWidth) || value.collisionHalfWidth <= 0 || value.collisionHalfWidth > value.frameWidth)) {
    throw new Error('Invalid character collision width.');
  }
  const used = new Set<number>();
  for (const [state, count] of Object.entries(counts)) {
    const animation = value.animations[state];
    if (!record(animation) || !Array.isArray(animation.frames) || animation.frames.length !== count
      || !positiveInteger(animation.frameDurationMs)) throw new Error(`Invalid ${state} animation.`);
    if (animation.frameDurationsMs !== undefined && (!Array.isArray(animation.frameDurationsMs)
      || animation.frameDurationsMs.length !== count
      || !animation.frameDurationsMs.every((duration) => positiveInteger(duration) && duration <= 60000))) {
      throw new Error(`Invalid ${state} per-frame timings.`);
    }
    for (const frame of animation.frames) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= total || used.has(frame)) throw new Error('Missing or duplicate animation frame.');
      used.add(frame);
    }
  }
  return value as unknown as SpriteAtlas;
}

export function frameAt(atlas: SpriteAtlas, state: Behavior, elapsedSeconds: number): number {
  const animation = atlas.animations[state];
  const milliseconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) * 1000 : 0;
  if (animation.frameDurationsMs) {
    const cycle = animation.frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
    let phase = milliseconds % cycle;
    for (let index = 0; index < animation.frames.length; index += 1) {
      if (phase < animation.frameDurationsMs[index]!) return animation.frames[index]!;
      phase -= animation.frameDurationsMs[index]!;
    }
    return animation.frames[0]!;
  }
  const index = Math.floor(milliseconds / animation.frameDurationMs) % animation.frames.length;
  return animation.frames[index]!;
}
