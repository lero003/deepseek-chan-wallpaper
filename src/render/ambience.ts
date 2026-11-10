/**
 * Quiet ambient life for the sunset study wallpaper.
 *
 * Produces pure pixel-art rectangle commands (the same commands Canvas 2D and
 * the native CoreGraphics painter consume). Everything is a deterministic
 * function of `seconds` and the floating-mote field, so both renderers stay in
 * sync and no browser/global state is touched. Quads are drawn *before* the
 * character, so they may pass behind her.
 *
 * Groups, in draw order:
 *   1. sea sparkle inside `appearance.water` (denser toward the sun column;
 *      each glint breathes in and out of phase with the others)
 *   2. warm dust motes floating up through the window light, a few with a
 *      soft one-pixel tail
 *   3. low-alpha breathing glow on the hanging lamp and the desk lamp
 *   4. one tiny distant bird crossing the window sky about twice a minute
 *
 * Design notes:
 * - Layout constants match the 480x270 sunset study (window interior, water
 *   rect, hanging lamp at ~(143,47), desk lamp at ~(440,103)). They only place
 *   the animated overlays; the background art is never redrawn.
 * - Sea glints and the bird are clipped out of the painted window mullions,
 *   because quads are painted on top of the backdrop and cannot be occluded by
 *   the window frame. The bird fades in/out at the pane corridor edges instead
 *   of popping.
 * - Nothing flashes: alpha ramps are slow (3.5-9s per breath), motion is slow,
 *   and every rect stays translucent. Values are tuned to stay readable on a
 *   2048x864 display at the renderer's whole-pixel scale without becoming noise.
 *
 * Wiring: `scenePlan()` can replace its inline mote/water decoration quads with
 * `quads.push(...ambienceQuads(seconds, motes, appearance))`.
 */

export interface AmbientMote {
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  readonly phase: number;
}

export interface AmbientQuad {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly alpha: number;
}

export interface AmbientAppearance {
  readonly water?: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
}

/** Hard cap for a single frame: cheap in JavaScriptCore at up to 30fps. */
export const MAX_AMBIENCE_QUADS = 140;

const MOTE_COLOR = '#f9edcf';
const MOTE_TAIL_COLOR = '#e8d7b4';
const GLINT_BRIGHT = '#fffdf0';
const GLINT_WARM = '#fff3d6';
const GLINT_DUSK = '#f6dfae';
const LAMP_WARM = '#ffd8a0';
const BIRD_COLOR = '#fef9de';

/** Motes reuse the scene-plan float band (window light, y = 75..185). */
const MOTE_BAND_TOP = 75;
const MOTE_BAND_HEIGHT = 110;
/** Never spend more than this many motes on quads, even if a caller passes more. */
const MOTE_LIMIT = 16;

/** The painted sun reflection sits at ~66% across the water rect. */
const WATER_SUN_FRACTION = 0.66;
const GLINT_SLOTS = 26;

/** Painted lamps: pendant light and the desk lamp's glow under its shade. */
const HANGING_LAMP = { x: 143, y: 47 };
const DESK_LAMP = { x: 440, y: 103 };

/**
 * Bird episode schedule: one bird crosses the window sky for BIRD_DURATION
 * seconds every BIRD_PERIOD seconds (roughly twice a minute).
 */
const BIRD_PERIOD = 118;
const BIRD_START = 16;
const BIRD_DURATION = 24;
const BIRD_FROM_X = 162;
const BIRD_TO_X = 333;
const BIRD_BASE_Y = 58;
/** Painted window mullions: quads that would sit "in front of" them are clipped. */
const MULLION_RANGES: readonly (readonly [number, number])[] = [[196, 201], [288, 293]];

/** Deterministic 32-bit hash -> [0,1). No Math.random, no shared state. */
function unit(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 0x9e3779b1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function overlapsMullion(x: number, width: number): boolean {
  for (const [from, to] of MULLION_RANGES) if (x <= to && x + width - 1 >= from) return true;
  return false;
}

interface Sink {
  quads: AmbientQuad[];
  stopped: boolean;
}

/** Push one command, rounding pixel-art geometry and dropping invisible results. */
function push(
  sink: Sink,
  x: number, y: number, width: number, height: number, color: string, alpha: number,
): void {
  if (sink.stopped) return;
  const roundedAlpha = Math.round(Math.min(1, alpha) * 1000) / 1000;
  if (!(roundedAlpha > 0)) return;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  sink.quads.push({
    x: Math.round(x), y: Math.round(y), width: w, height: h, color, alpha: roundedAlpha,
  });
  if (sink.quads.length >= MAX_AMBIENCE_QUADS) sink.stopped = true;
}

/**
 * 1. Sea sparkle: 2-3px wide 1px tall glints. A slow individual breath per
 * glint (3.5-9s) keeps the surface alive without a strobing field.
 */
function waterQuads(sink: Sink, t: number, water: NonNullable<AmbientAppearance['water']>): void {
  const left = Math.round(water.left);
  const right = Math.round(water.right);
  const top = Math.round(water.top);
  const bottom = Math.round(water.bottom);
  const width = right - left;
  const height = bottom - top;
  if (!(width >= 8) || !(height >= 4)) return;
  const column = left + width * WATER_SUN_FRACTION;
  for (let index = 0; index < GLINT_SLOTS; index++) {
    const group = index < 12 ? 0 : index < 20 ? 1 : 2;
    const spread = group === 0 ? 0.09 : group === 1 ? 0.18 : 0.45;
    const offset = (unit(index, 11) * 2 - 1) * width * spread;
    const glintWidth = group === 0 && unit(index, 53) < 0.45 ? 3 : 2;
    const x = Math.min(right - glintWidth, Math.max(left + 1, Math.round(column + offset)));
    if (overlapsMullion(x, glintWidth)) continue;
    const y = top + 1 + Math.round(unit(index, 37) * Math.max(1, height - 4));
    const pulse = 0.5 + 0.5 * Math.sin(t * (0.7 + unit(index, 89) * 0.9) + unit(index, 71) * Math.PI * 2);
    if (pulse < 0.2) continue;
    const color = group === 0 ? GLINT_BRIGHT : group === 1 ? GLINT_WARM : GLINT_DUSK;
    const alpha = group === 0 ? 0.22 + pulse * 0.5 : group === 1 ? 0.16 + pulse * 0.32 : 0.12 + pulse * 0.18;
    push(sink, x, y, glintWidth, 1, color, alpha);
  }
}

/** 2. Warm dust motes floating up through the window light, a few with soft tails. */
function moteQuads(sink: Sink, t: number, motes: readonly AmbientMote[]): void {
  let index = 0;
  for (const mote of motes) {
    if (index >= MOTE_LIMIT) break;
    const x = finite(mote.x, 0);
    const y = finite(mote.y, MOTE_BAND_TOP);
    const speed = finite(mote.speed, 1);
    const phase = finite(mote.phase, 0);
    const drift = x + Math.sin(t * 0.13 + phase) * 3.4;
    const rise = MOTE_BAND_TOP + wrap(y - MOTE_BAND_TOP - t * speed * 0.55, MOTE_BAND_HEIGHT);
    const twinkle = 0.5 + 0.5 * Math.sin(t * 0.31 + phase * 1.7);
    const alpha = 0.16 + twinkle * 0.16;
    push(sink, drift, rise, 1, 1, MOTE_COLOR, alpha);
    if (index % 3 === 0) push(sink, drift, rise + 1, 1, 1, MOTE_TAIL_COLOR, alpha * 0.4);
    index++;
  }
}

/** 3. Stacked, low-alpha breathing glow around a painted lamp. */
function lampGlow(
  sink: Sink, t: number, period: number, phase: number,
  steps: readonly (readonly [number, number, number, number, number])[],
): void {
  const breathe = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * (Math.PI * 2 / period) + phase));
  for (const [x, y, width, height, alpha] of steps) push(sink, x, y, width, height, LAMP_WARM, alpha * breathe);
}

const HANGING_LAMP_STEPS = [
  [HANGING_LAMP.x - 15, HANGING_LAMP.y - 14, 31, 26, 0.028],
  [HANGING_LAMP.x - 12, HANGING_LAMP.y - 11, 25, 20, 0.04],
  [HANGING_LAMP.x - 9, HANGING_LAMP.y - 8, 19, 15, 0.052],
  [HANGING_LAMP.x - 6, HANGING_LAMP.y - 5, 13, 10, 0.066],
  [HANGING_LAMP.x - 4, HANGING_LAMP.y - 3, 9, 7, 0.08],
] as const;

const DESK_LAMP_STEPS = [
  [DESK_LAMP.x - 14, DESK_LAMP.y - 12, 29, 26, 0.026],
  [DESK_LAMP.x - 11, DESK_LAMP.y - 9, 23, 20, 0.036],
  [DESK_LAMP.x - 8, DESK_LAMP.y - 6, 17, 14, 0.048],
  [DESK_LAMP.x - 5, DESK_LAMP.y - 4, 11, 9, 0.062],
  [DESK_LAMP.x - 3, DESK_LAMP.y - 2, 7, 5, 0.08],
] as const;

/**
 * 4. One tiny distant bird, 5px wide, crossing the window sky slowly. The wing
 * beat flips between a raised chevron and a flattened glide so it reads as a
 * bird rather than a drifting dot.
 */
function birdQuads(sink: Sink, t: number): void {
  const since = t - BIRD_START;
  if (since < 0) return;
  const episode = Math.floor(since / BIRD_PERIOD);
  const local = since - episode * BIRD_PERIOD;
  if (local >= BIRD_DURATION) return;
  const progress = local / BIRD_DURATION;
  const forward = episode % 2 === 0;
  const x = Math.round(forward
    ? BIRD_FROM_X + (BIRD_TO_X - BIRD_FROM_X) * progress
    : BIRD_TO_X - (BIRD_TO_X - BIRD_FROM_X) * progress);
  const y = Math.round(BIRD_BASE_Y + Math.sin(progress * Math.PI * 2 + episode * 1.9) * 2.2);
  const raised = Math.sin(t * Math.PI * 2 * 1.3 + episode * 0.7) > 0;
  const fade = Math.min(1, progress * 7, (1 - progress) * 7);
  const alpha = 0.95 * fade;
  if (alpha < 0.01) return;
  // A 7px chevron that flips between wing-up and wing-down: reads as a distant bird.
  const pixels: readonly (readonly [number, number])[] = raised
    ? [[-3, -2], [-2, -1], [-1, -1], [0, 0], [1, -1], [2, -1], [3, -2]]
    : [[-3, 2], [-2, 1], [-1, 1], [0, 0], [1, 1], [2, 1], [3, 2]];
  for (const [dx, dy] of pixels) {
    if (!overlapsMullion(x + dx, 1)) push(sink, x + dx, y + dy, 1, 1, BIRD_COLOR, alpha);
  }
}

/**
 * Ambient overlay commands for one frame of the sunset study.
 *
 * @param seconds elapsed seconds (non-finite input is treated as t = 0 so the
 *                output is always a stable, finite frame).
 * @param motes   floating-mote field (e.g. `motesFor(seed)`); positions/phases
 *                are reused, the array is never mutated.
 * @param appearance optional layout; only `water` is needed for sea sparkle.
 */
export function ambienceQuads(
  seconds: number,
  motes: readonly AmbientMote[],
  appearance?: AmbientAppearance,
): AmbientQuad[] {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const sink: Sink = { quads: [], stopped: false };
  const water = appearance?.water;
  if (water
    && Number.isFinite(water.left) && Number.isFinite(water.right)
    && Number.isFinite(water.top) && Number.isFinite(water.bottom)) {
    waterQuads(sink, t, water);
  }
  moteQuads(sink, t, motes);
  lampGlow(sink, t, 8.6, 0.9, HANGING_LAMP_STEPS);
  lampGlow(sink, t, 11.3, 4.2, DESK_LAMP_STEPS);
  birdQuads(sink, t);
  return sink.quads;
}
