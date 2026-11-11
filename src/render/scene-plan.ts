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
  // A few slow sleep bubbles rise above the resting head; skipped for still frames.
  if (decorations && actor.state === 'sleep') quads.push(...sleepBubbles(seconds, x, world.floorY, actor.facing));
  const half = Math.round(atlas.frameWidth * (actor.state === 'sleep' ? .31 : .19));
  quads.push({ x: x - half, y: world.floorY - 1, width: half * 2 + 1, height: 2, color: appearance.shadowColor ?? '#314e50', alpha: .20 });
  quads.push({ x: x - half + 4, y: world.floorY - 2, width: half * 2 - 7, height: 4, color: appearance.shadowColor ?? '#314e50', alpha: .20 });
  return { tick: world.tick, state: actor.state, x, floorY: world.floorY, facing: actor.facing,
    frame: frameAt(atlas, actor.state, actor.stateTicks / TICKS_PER_SECOND), quads };
}

/**
 * Three tiny bubbles on a slow staggered loop, drifting up and fading. Pure and
 * deterministic in `seconds`; never touches the world. Kept translucent and slow
 * so a sleeping wallpaper stays calm.
 */
function sleepBubbles(seconds: number, x: number, floorY: number, facing: number): Quad[] {
  const quads: Quad[] = [];
  const color = '#dfe7f2';
  for (let index = 0; index < 3; index++) {
    const cycle = 7.5;
    const progress = ((seconds + index * 2.5) % cycle) / cycle;
    // Each bubble lives for the first 70% of its cycle, then rests invisible.
    if (progress > 0.7) continue;
    const life = progress / 0.7;
    const rise = Math.round(life * 26);
    const drift = Math.round(Math.sin(life * Math.PI + index) * 3);
    const bx = x + facing * (10 + index * 3) + drift;
    const by = floorY - 56 - rise - index * 4;
    const size = index === 0 ? 2 : 1;
    const alpha = Math.round(Math.sin(life * Math.PI) * 0.30 * 1000) / 1000;
    if (alpha <= 0) continue;
    quads.push({ x: bx, y: by, width: size, height: size, color, alpha });
  }
  return quads;
}
