import { TICKS_PER_SECOND, worldSeconds, activeEmote } from '../world/world.ts';
import type { Actor, Emote, Facing, World } from '../world/world.ts';
import { ambienceQuads } from './ambience.ts';
import { frameAt } from './atlas.ts';
import type { SpriteAtlas } from './atlas.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import type { GamePresentation } from '../fighters/render-types.ts';
import type { DrawCommand } from '../fighters/render-types.ts';
import { Painter } from '../fighters/art-kit.ts';
import { parseLifeAtlas, lifeFrameAt } from './life-art.ts';

export interface Mote { readonly x: number; readonly y: number; readonly speed: number; readonly phase: number }
export interface Quad { x: number; y: number; width: number; height: number; color: string; alpha: number }
/** Presentation-only acting transform. The pivot stays at the planted feet. */
export interface SceneMotion {
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly lift: number;
  readonly offsetX: number;
}
export interface ScenePlanOptions {
  /** False in battles and while the preview reacts to a call; the quiet life still moves. */
  readonly acting?: boolean;
}
export interface ScenePlan extends GamePresentation {
  tick: number;
  state: string;
  x: number;
  floorY: number;
  facing: number;
  frame: number;
  quads: Quad[];
  /** Optional idle/walk flourish; absent keeps the original approved pose exactly. */
  motion?: SceneMotion;
  /** Optional extra gesture cell; frame remains a valid approved-atlas fallback. */
  lifeFrame?: number;
}
const NO_MOTION: SceneMotion = { rotation: 0, scaleX: 1, scaleY: 1, lift: 0, offsetX: 0 };

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

const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const windowPulse = (progress: number, start: number, end: number): number =>
  progress <= start || progress >= end ? 0 : Math.sin((progress - start) / (end - start) * Math.PI);

interface Pose { readonly motion: SceneMotion; readonly frame?: number; readonly facing: Facing }

/** A hop with a clear anticipation, airborne arc, landing squash and settle. */
function hopPose(progress: number, facing: Facing): Pose {
  if (progress < .16) {
    const squat = easeOut(progress / .16);
    return { facing, motion: { ...NO_MOTION, scaleX: 1 + squat * .03, scaleY: 1 - squat * .07 } };
  }
  if (progress < .64) {
    const air = (progress - .16) / .48, arc = Math.sin(air * Math.PI);
    return { facing, motion: { rotation: 0, scaleX: 1 + arc * .02, scaleY: 1 + arc * .035,
      lift: Math.round(arc * 9), offsetX: 0 } };
  }
  if (progress < .8) {
    const squash = Math.sin((progress - .64) / .16 * Math.PI);
    return { facing, motion: { ...NO_MOTION, scaleX: 1 + squash * .04, scaleY: 1 - squash * .06 } };
  }
  const settle = Math.sin((progress - .8) / .2 * Math.PI);
  return { facing, motion: { ...NO_MOTION, lift: Math.round(settle * 1.4) } };
}

/** Three quick, happy bounces and a little side jitter. */
function gigglePose(progress: number, facing: Facing): Pose {
  const bounce = Math.abs(Math.sin(progress * Math.PI * 3));
  const jitter = Math.sin(progress * Math.PI * 10);
  return { facing, motion: { rotation: 0, scaleX: 1, scaleY: 1 - bounce * .018,
    lift: Math.round(bounce * 2), offsetX: Math.round(jitter * 1.2) || 0 } };
}

/** A slow, contented sway with a tiny weight shift. */
function swayPose(progress: number, facing: Facing): Pose {
  const wave = Math.sin(progress * Math.PI * 2);
  return { facing, motion: { rotation: 0, scaleX: 1, scaleY: 1,
    lift: Math.round((1 - Math.cos(progress * Math.PI * 4)) * .5), offsetX: Math.round(wave * 1.3) || 0 } };
}

/** Extra art absent: a front glance, never a sudden whole-body mirror flip. */
function peekPose(progress: number, facing: Facing, atlas: SpriteAtlas): Pose {
  const turn = atlas.animations.turn.frames;
  const front = progress >= .18 && progress < .82;
  return { facing, frame: turn[front ? 1 : 0], motion: NO_MOTION };
}

/** A long, luxurious stretch, then a soft settle. */
function stretchPose(progress: number, facing: Facing): Pose {
  const rise = progress < .4 ? easeOut(progress / .4)
    : progress < .62 ? 1 : 1 - easeOut((progress - .62) / .38);
  return { facing, motion: { rotation: 0, scaleX: 1 - rise * .018, scaleY: 1 + rise * .07,
    lift: Math.round(rise * 2), offsetX: 0 } };
}

/** A quiet daydream: a slow weight shift with barely-there breathing. */
function daydreamPose(progress: number, facing: Facing): Pose {
  return { facing, motion: { rotation: 0, scaleX: 1, scaleY: 1,
    lift: Math.round((1 + Math.sin(progress * Math.PI * 2 + 1)) * .5),
    offsetX: Math.round(Math.sin(progress * Math.PI * 2) * 1.1) || 0 } };
}

function emotePose(emote: Emote, progress: number, facing: Facing, atlas: SpriteAtlas): Pose {
  switch (emote) {
    case 'hop': return hopPose(progress, facing);
    case 'giggle': return gigglePose(progress, facing);
    case 'sway': return swayPose(progress, facing);
    case 'peek': return peekPose(progress, facing, atlas);
    case 'stretch': return stretchPose(progress, facing);
    case 'daydream': return daydreamPose(progress, facing);
  }
}

/** A skip is a light two-pixel bounce layered over the approved six-frame walk. */
function skipMotion(actor: Readonly<Actor>): SceneMotion {
  const bounce = Math.abs(Math.sin(actor.stateTicks * .22));
  return { rotation: 0, scaleX: 1, scaleY: 1 - (bounce < .18 ? .012 : 0),
    lift: Math.round(bounce * 2), offsetX: 0 };
}

// ------------------------------------------------------------------ tiny effects

const NOTE = '#f2d69a';
const HEART = '#dfa0aa';
const HEART_LIGHT = '#f8d9db';
const PAPER = '#f5e3bb';
const INK = '#3b3346';
const DUST = '#bda58a';

function tinyHeart(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x + 1, y, 2, 1, HEART, alpha); p.rect(x + 4, y, 2, 1, HEART, alpha);
  p.rect(x, y + 1, 7, 3, HEART, alpha); p.rect(x + 1, y + 4, 5, 1, HEART, alpha);
  p.rect(x + 2, y + 5, 3, 1, HEART, alpha); p.rect(x + 3, y + 6, 2, 1, HEART, alpha);
  p.rect(x + 1, y + 1, 2, 1, HEART_LIGHT, alpha * .9);
}

function tinyNote(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x, y, 3, 2, NOTE, alpha); p.rect(x + 3, y - 5, 1, 6, NOTE, alpha);
  p.rect(x + 4, y - 5, 2, 1, NOTE, alpha); p.rect(x + 5, y - 4, 1, 2, NOTE, alpha);
}

function tinySparkle(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x, y - 2, 1, 5, PAPER, alpha); p.rect(x - 2, y, 5, 1, PAPER, alpha);
  p.rect(x, y, 1, 1, '#fff8e8', alpha);
}

function tinyQuestion(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x + 1, y, 3, 1, PAPER, alpha); p.rect(x + 4, y + 1, 1, 2, PAPER, alpha);
  p.rect(x + 3, y + 3, 1, 2, PAPER, alpha); p.rect(x + 3, y + 6, 1, 1, PAPER, alpha);
  p.rect(x + 5, y + 6, 1, 1, INK, alpha * .35);
}

function bubble(p: Painter, x: number, y: number, size: number, alpha: number): void {
  p.rect(x, y, size, 1, PAPER, alpha); p.rect(x, y + 1, size, size - 2, PAPER, alpha * .55);
  p.rect(x + 1, y + size - 2, Math.max(1, size - 1), 1, PAPER, alpha);
}

function dust(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x, y - 1, 2, 1, DUST, alpha * .8);
  p.rect(x + 3, y - 2, 1, 1, DUST, alpha * .6);
  p.rect(x - 2, y, 1, 1, DUST, alpha * .45);
}

/** One or two rising notes, kept small enough for a calm wallpaper. */
function risingNote(p: Painter, x: number, y: number, progress: number, phase: number): void {
  const rise = Math.max(0, progress - phase);
  if (rise <= 0 || rise > .28) return;
  const life = rise / .28;
  const nx = Math.round(x + Math.sin(life * Math.PI) * 4 + (phase > .35 ? 5 : -2));
  const ny = Math.round(y - life * 12);
  const alpha = Math.round(Math.sin(life * Math.PI) * .85 * 1000) / 1000;
  if (alpha > .02) tinyNote(p, nx, ny, alpha);
}

function emoteEffects(actor: Readonly<Actor>, emote: Emote, progress: number, atlas: SpriteAtlas, footY: number): DrawCommand[] {
  const p = new Painter(0);
  const x = Math.round(actor.x);
  const headY = footY - Math.round(atlas.anchor.y) - 4;
  const front = actor.facing;
  switch (emote) {
    case 'hop': {
      const takeoff = windowPulse(progress, .1, .24), landing = windowPulse(progress, .6, .74);
      if (takeoff > .1) dust(p, x - 6, footY - 1, takeoff * .5);
      if (landing > .1) dust(p, x - 6, footY - 1, landing * .55);
      const apex = windowPulse(progress, .3, .52);
      if (apex > .1) tinySparkle(p, x + front * 16, headY + 4 + Math.round((1 - apex) * 4), apex * .75);
      break;
    }
    case 'giggle': {
      const first = windowPulse(progress, .12, .42), second = windowPulse(progress, .48, .78);
      if (first > .05) tinyHeart(p, x + front * 17, headY - 2 - Math.round(first * 5), first * .85);
      if (second > .05) tinyHeart(p, x + front * 9, headY - 8 - Math.round(second * 4), second * .7);
      const sparkle = windowPulse(progress, .34, .54);
      if (sparkle > .05) tinySparkle(p, x - front * 12, headY + 2, sparkle * .7);
      break;
    }
    case 'sway': {
      for (const phase of [.08, .34, .6]) risingNote(p, x + front * 13, headY + 2, progress, phase);
      break;
    }
    case 'peek': {
      const question = windowPulse(progress, .2, .56);
      if (question > .05) tinyQuestion(p, x + front * 16, headY - 2 - Math.round(question * 5), question * .8);
      const settle = windowPulse(progress, .72, .92);
      if (settle > .05) tinySparkle(p, x + front * 13, headY + 3, settle * .55);
      break;
    }
    case 'stretch': {
      const rise = windowPulse(progress, .25, .6);
      if (rise > .05) {
        tinySparkle(p, x - front * 14, headY + 1, rise * .6);
        tinySparkle(p, x + front * 15, headY + 6, rise * .45);
      }
      const yawn = windowPulse(progress, .48, .72);
      if (yawn > .05) {
        const bx = x - front * 7, by = footY - 65 - Math.round(yawn * 3);
        bubble(p, bx, by, 2, yawn * .5); bubble(p, bx - front * 4, by - 5, 1, yawn * .35);
      }
      break;
    }
    case 'daydream': {
      for (let index = 0; index < 3; index++) {
        const start = .08 + index * .2;
        const life = windowPulse(progress, start, start + .34);
        if (life <= .05) continue;
        const drift = Math.round(Math.sin(life * Math.PI + index) * 3);
        const bx = x - front * (10 + index * 5) + drift;
        const by = headY - 1 - Math.round(life * (7 + index * 2));
        bubble(p, bx, by, index === 1 ? 3 : 2, life * .32);
        if (index === 1) tinySparkle(p, bx + 1, by + 1, life * .4);
      }
      break;
    }
  }
  return p.commands;
}

function skipEffects(actor: Readonly<Actor>, footY: number): DrawCommand[] {
  const p = new Painter(0);
  const bounce = Math.abs(Math.sin(actor.stateTicks * .22));
  if (bounce > .82) dust(p, Math.round(actor.x) - actor.facing * 7, footY - 1, .32);
  return p.commands;
}

/** Pure render commands shared by Canvas and macOS CoreGraphics. No browser APIs. */
export function scenePlan(world: Readonly<World>, atlas: SpriteAtlas, motes: readonly Mote[],
  appearance: RenderAppearance = {}, decorations = true, options: ScenePlanOptions = {}): ScenePlan {
  const seconds = worldSeconds(world);
  const quads: Quad[] = [];
  // Ambient life (sea sparkle, dust motes, lamp glow, an occasional bird) lives in its own
  // pure module so Canvas and CoreGraphics stay in sync. It is skipped for still frames.
  if (decorations) quads.push(...ambienceQuads(seconds, motes, appearance));
  const actor = world.actor;
  const x = Math.round(actor.x);
  const acting = options.acting !== false;
  const performance = acting ? activeEmote(actor) : null;
  const pose = performance ? emotePose(performance.emote, performance.progress, actor.facing, atlas) : null;
  let lifeAtlas;
  try { lifeAtlas = appearance.lifeAtlas ? parseLifeAtlas(appearance.lifeAtlas) : null; } catch { lifeAtlas = null; }
  const lifeFrame = performance && lifeAtlas ? lifeFrameAt(lifeAtlas, performance.emote, performance.progress) : undefined;
  const fallbackMotion = pose?.motion ?? (acting && actor.state === 'walk' && actor.walkStyle === 'skip' ? skipMotion(actor) : undefined);
  // The generated keys move actual limbs/eyes/tail. Never stretch the whole drawing to
  // fake those actions; grounded gestures keep their exact pixel scale and foot line.
  const motion = performance && lifeAtlas ? {
    ...NO_MOTION,
    lift: performance.emote === 'hop' && performance.progress >= .23 && performance.progress < .50
      ? Math.round(Math.sin((performance.progress - .23) / .27 * Math.PI) * 8) : 0,
  } : fallbackMotion;
  const frame = lifeAtlas && performance ? frameAt(atlas, 'idle', actor.stateTicks / TICKS_PER_SECOND)
    : pose?.frame ?? frameAt(atlas, actor.state, actor.stateTicks / TICKS_PER_SECOND);
  const facing = lifeAtlas && performance ? actor.facing : pose?.facing ?? actor.facing;
  // A few slow sleep bubbles rise above the resting head; skipped for still frames.
  if (decorations && actor.state === 'sleep') quads.push(...sleepBubbles(seconds, x, world.floorY, actor.facing));
  const baseHalf = Math.round(atlas.frameWidth * (actor.state === 'sleep' ? .31 : .19));
  const lift = motion?.lift ?? 0;
  // The contact shadow tightens and fades as a hop or skip leaves the floor.
  const half = Math.max(5, Math.round(baseHalf * (1 - Math.min(.32, lift * .035))));
  const shadowAlpha = Math.round(.20 * (1 - Math.min(.55, lift * .055)) * 1000) / 1000;
  quads.push({ x: x - half, y: world.floorY - 1, width: half * 2 + 1, height: 2, color: appearance.shadowColor ?? '#314e50', alpha: shadowAlpha });
  quads.push({ x: x - half + 4, y: world.floorY - 2, width: half * 2 - 7, height: 4, color: appearance.shadowColor ?? '#314e50', alpha: shadowAlpha });
  let overlay: DrawCommand[] | undefined;
  if (decorations) {
    if (performance) overlay = emoteEffects(actor, performance.emote, performance.progress, atlas, world.floorY);
    else if (acting && actor.state === 'walk' && actor.walkStyle === 'skip') overlay = skipEffects(actor, world.floorY);
  }
  return {
    tick: world.tick, state: actor.state, x, floorY: world.floorY, facing, frame, quads,
    ...(motion ? { motion } : {}),
    ...(lifeFrame === undefined ? {} : { lifeFrame }),
    ...(overlay && overlay.length > 0 ? { overlay } : {}),
  };
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