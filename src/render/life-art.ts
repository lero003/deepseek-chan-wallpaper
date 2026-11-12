import type { Emote } from '../world/world.ts';
import type { Animation } from './atlas.ts';

/** Separate from (and never a replacement for) the approved sixteen life frames. */
export const LIFE_EMOTES: readonly Emote[] = ['hop', 'giggle', 'sway', 'peek', 'stretch', 'daydream'];
export interface LifeAtlas {
  readonly version: 1;
  readonly frameWidth: 80;
  readonly frameHeight: 128;
  readonly columns: 4;
  readonly rows: 6;
  readonly anchor: { readonly x: 40; readonly y: 124 };
  readonly animations: Readonly<Record<Emote, Animation>>;
}

/** Bounded, independent metadata. Bad optional art must never prevent the room loading. */
export function parseLifeAtlas(value: unknown): LifeAtlas {
  const record = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item);
  const integer = (item: unknown, min: number, max: number): item is number => Number.isSafeInteger(item) && Number(item) >= min && Number(item) <= max;
  if (!record(value) || value.version !== 1 || value.frameWidth !== 80 || value.frameHeight !== 128
    || value.columns !== 4 || value.rows !== 6 || !record(value.anchor) || value.anchor.x !== 40 || value.anchor.y !== 124
    || !record(value.animations)) throw new Error('Invalid optional life atlas geometry.');
  const keys = Object.keys(value.animations);
  if (keys.length !== LIFE_EMOTES.length || keys.some(key => !LIFE_EMOTES.includes(key as Emote))) {
    throw new Error('Invalid optional life animation keys.');
  }
  const used = new Set<number>();
  for (const emote of LIFE_EMOTES) {
    const animation = value.animations[emote];
    if (!record(animation) || !Array.isArray(animation.frames) || animation.frames.length !== 4
      || !integer(animation.frameDurationMs, 1, 60000)) throw new Error(`Invalid optional life animation: ${emote}.`);
    if (animation.frameDurationsMs !== undefined && (!Array.isArray(animation.frameDurationsMs)
      || animation.frameDurationsMs.length !== 4 || !animation.frameDurationsMs.every(ms => integer(ms, 1, 60000)))) {
      throw new Error(`Invalid optional life timing: ${emote}.`);
    }
    for (const frame of animation.frames) {
      if (!integer(frame, 0, 23) || used.has(frame)) throw new Error('Missing or duplicate optional life frame.');
      used.add(frame);
    }
  }
  return value as unknown as LifeAtlas;
}

/**
 * Hand-timed acting, not an endlessly looping pose switch. The first/last 8% returns
 * the approved idle pose; the interior visits four actual limb/expression key poses.
 * The settled dance and laugh get one controlled reprise before the release pose.
 */
export function lifeFrameAt(atlas: LifeAtlas, emote: Emote, progress: number): number | undefined {
  if (!Number.isFinite(progress) || progress < .08 || progress >= .92) return undefined;
  const phase = (progress - .08) / .84;
  const keys: readonly number[] = emote === 'giggle' || emote === 'sway'
    ? [0, 1, 2, 1, 2, 3] : [0, 1, 2, 3];
  const weights: readonly number[] = keys.length === 6 ? [.15, .18, .18, .14, .17, .18] : [.18, .32, .28, .22];
  let elapsed = 0;
  for (let i = 0; i < keys.length; i++) {
    elapsed += weights[i]!;
    if (phase < elapsed) return atlas.animations[emote].frames[keys[i]!]!;
  }
  return atlas.animations[emote].frames[3];
}
