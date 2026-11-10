import { LIMITS } from './definitions.ts';
import type { Effect, FightersGame } from './types.ts';

/** A separate stream: combat decisions never perturb the original living-wallpaper world. */
export function decision(game: FightersGame): number {
  let value = game.randomState;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  game.randomState = (value >>> 0) || 1;
  return game.randomState / 4294967296;
}
export interface EffectOptions { vx?: number; vy?: number; gravity?: number; spin?: number; size?: number }
export function effect(game: FightersGame, kind: Effect['kind'], x: number, y: number, text = '', ttl = 42, options: EffectOptions = {}): void {
  const limit = game.effectsLow ? 14 : LIMITS.effects;
  while (game.effects.length >= limit) game.effects.shift();
  game.effects.push({ id: game.nextId++, kind, x, y, text: text.slice(0, 36), age: 0, ttl,
    vx: options.vx ?? 0, vy: options.vy ?? 0, gravity: options.gravity ?? 0,
    spin: options.spin ?? 0, size: options.size ?? 1 });
}
export function say(game: FightersGame, text: string, ticks = 120): void {
  game.message = text.slice(0, 60); game.messageUntil = game.tick + ticks;
}
export function clearInputs(game: FightersGame): void {
  game.input = { x: 0, y: 0 }; game.hero.attackQueue = 0; game.pendingDodge = false; game.pendingSpecial = false;
}
