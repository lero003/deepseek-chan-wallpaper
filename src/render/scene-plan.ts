import { TICKS_PER_SECOND, worldSeconds } from '../world/world.ts';
import type { World } from '../world/world.ts';
import { ambienceQuads } from './ambience.ts';
import { frameAt } from './atlas.ts';
import type { SpriteAtlas } from './atlas.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import type { GamePresentation } from '../fighters/render-types.ts';

export interface Mote { readonly x: number; readonly y: number; readonly speed: number; readonly phase: number }
export interface Quad { x: number; y: number; width: number; height: number; color: string; alpha: number }
export interface ScenePlan extends GamePresentation {
  tick: number;
  state: string;
  x: number;
  floorY: number;
  facing: number;
  frame: number;
  quads: Quad[];
}

export function motesFor(seed: number): readonly Mote[] {
  let value = seed ^ 0xa812f37b;
  const next = () => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  };
  return Array.from({ length: 12 }, () => ({ x: 107 + next() * 274, y: 75 + next() * 110, speed: .7 + next() * 1.2, phase: next() * Math.PI * 2 }));
}

/** Pure render commands shared by Canvas and macOS CoreGraphics. No browser APIs. */
export function scenePlan(world: Readonly<World>, atlas: SpriteAtlas, motes: readonly Mote[], appearance: RenderAppearance = {}, decorations = true): ScenePlan {
  const seconds = worldSeconds(world);
  const quads: Quad[] = [];
  // Ambient life (sea sparkle, dust motes, lamp glow, an occasional bird) lives in its own
  // pure module so Canvas and CoreGraphics stay in sync. It is skipped for still frames.
  if (decorations) quads.push(...ambienceQuads(seconds, motes, appearance));
  const actor = world.actor;
  const x = Math.round(actor.x);
  const half = Math.round(atlas.frameWidth * (actor.state === 'sleep' ? .31 : .19));
  quads.push({ x: x - half, y: world.floorY - 1, width: half * 2 + 1, height: 2, color: appearance.shadowColor ?? '#314e50', alpha: .20 });
  quads.push({ x: x - half + 4, y: world.floorY - 2, width: half * 2 - 7, height: 4, color: appearance.shadowColor ?? '#314e50', alpha: .20 });
  return { tick: world.tick, state: actor.state, x, floorY: world.floorY, facing: actor.facing,
    frame: frameAt(atlas, actor.state, actor.stateTicks / TICKS_PER_SECOND), quads };
}
