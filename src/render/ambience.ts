/**
 * Quiet ambient life for the study wallpaper (sunset, moonlit night, rain).
 *
 * Produces pure pixel-art rectangle commands (the same commands Canvas 2D and
 * the native CoreGraphics painter consume). Everything is a deterministic
 * function of `seconds` and the floating-mote field, so both renderers stay in
 * sync and no browser/global state is touched. Quads are drawn *before* the
 * character, so they may pass behind her.
 *
 * Groups, in draw order:
 *   1. sea sparkle inside `appearance.water` (denser toward the painted sun or
 *      moon column; each glint breathes in and out of phase with the others)
 *   2. dust motes floating up through the window light, a few with a soft
 *      one-pixel tail (warm at sunset, cool moonlight/rain tones otherwise)
 *   3. low-alpha breathing glow on the hanging lamp and the desk lamp
 *   4. one tiny distant bird crossing the window sky about twice a minute
 *      (sunset only; night and rain disable it via the profile)
 *   5. optional rain: thin streaks falling inside the two window panes plus
 *      slow ripple dashes on the water (rain profile only)
 *   6. optional rare shooting star across the upper pane (night profile only)
 *
 * Design notes:
 * - Layout constants match the 480x270 study (window interior, water rect,
 *   hanging lamp at ~(143,47), desk lamp at ~(440,103)). They only place the
 *   animated overlays; the background art is never redrawn.
 * - Sea glints, the bird, rain and the shooting star are clipped out of the
 *   painted window mullions, because quads are painted on top of the backdrop
 *   and cannot be occluded by the window frame. Rain wraps inside each pane so
 *   it never crosses the painted transom; the bird fades in/out at the pane
 *   corridor edges instead of popping.
 * - Nothing flashes: alpha ramps are slow (3.5-9s per breath), motion is slow,
 *   and every rect stays translucent. Values are tuned to stay readable on a
 *   2048x864 display at the renderer's whole-pixel scale without becoming noise.
 * - Without an `ambience` profile the output is exactly the approved sunset
 *   behaviour, byte for byte; night/rain only change palette and add their own
 *   code-only groups.
 *
 * Wiring: `scenePlan()` can replace its inline mote/water decoration quads with
 * `quads.push(...ambienceQuads(seconds, motes, appearance))`.
 */

import type { Mood } from '../world/world.ts';

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
  readonly ambience?: AmbienceProfile;
}

/**
 * Per-background ambient behaviour. Every field is optional; the defaults are
 * exactly the approved sunset overlay, so existing profiles stay unchanged.
 */
export interface AmbienceProfile {
  /** Palette family. Also the world's life-rhythm mood when a variant is selected. */
  readonly mood?: Mood;
  /** Fraction across the water rect where the painted sun/moon column sits. */
  readonly waterColumn?: number;
  /** The distant bird episode; sunset only by default. */
  readonly bird?: boolean;
  /** Falling rain inside the window panes plus water ripples. */
  readonly rain?: boolean;
  /** A rare, slow shooting star across the upper pane. */
  readonly shootingStar?: boolean;
  /** Multiplier for the lamp glow alpha (night reads cozier a touch brighter). */
  readonly lampScale?: number;
}

interface Palette {
  readonly mote: string;
  readonly moteTail: string;
  readonly moteAlpha: number;
  readonly glints: readonly [string, string, string];
  readonly glintAlpha: number;
  readonly bird: string;
}

const PALETTES: Record<Mood, Palette> = {
  sunset: { mote: '#f9edcf', moteTail: '#e8d7b4', moteAlpha: 1, glints: ['#fffdf0', '#fff3d6', '#f6dfae'], glintAlpha: 1, bird: '#fef9de' },
  night: { mote: '#dfe4f2', moteTail: '#c3cbdf', moteAlpha: .85, glints: ['#eef2ff', '#d8e0f5', '#b6c2de'], glintAlpha: .9, bird: '#fef9de' },
  rain: { mote: '#d4dae4', moteTail: '#bcc4d2', moteAlpha: .8, glints: ['#dfe6ef', '#cdd7e4', '#b9c4d4'], glintAlpha: .7, bird: '#fef9de' },
};

/** Hard cap for a single frame: cheap in JavaScriptCore at up to 30fps. */
export const MAX_AMBIENCE_QUADS = 140;

const LAMP_WARM = '#ffd8a0';

/** Rain falls inside the two painted window panes, never across the transom. */
const RAIN_PANES: readonly (readonly [number, number])[] = [[32, 86], [93, 157]];
const RAIN_LEFT = 117;
const RAIN_SPAN = 228;
const RAIN_SLOTS = 14;
const RAIN_NEAR = '#d3ddea';
const RAIN_FAR = '#b9c6d8';
const RIPPLE_COLOR = '#e2eaf4';
const RIPPLE_SLOTS = 5;
const RIPPLE_CYCLE = 3.4;

/** One slow shooting star every ~7 minutes; a rare treat, never a light show. */
const STAR_PERIOD = 430;
const STAR_START = 210;
const STAR_DURATION = 1.8;
const STAR_FROM = { x: 322, y: 38 };
const STAR_TO = { x: 216, y: 74 };
const STAR_HEAD = '#f5f7ff';
const STAR_TAIL = '#dfe6fa';

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
function waterQuads(sink: Sink, t: number, water: NonNullable<AmbientAppearance['water']>, palette: Palette, columnFraction: number): void {
  const left = Math.round(water.left);
  const right = Math.round(water.right);
  const top = Math.round(water.top);
  const bottom = Math.round(water.bottom);
  const width = right - left;
  const height = bottom - top;
  if (!(width >= 8) || !(height >= 4)) return;
  const column = left + width * columnFraction;
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
    const color = palette.glints[group];
    const alpha = (group === 0 ? 0.22 + pulse * 0.5 : group === 1 ? 0.16 + pulse * 0.32 : 0.12 + pulse * 0.18) * palette.glintAlpha;
    push(sink, x, y, glintWidth, 1, color, alpha);
  }
}

/** 2. Dust motes floating up through the window light, a few with soft tails. */
function moteQuads(sink: Sink, t: number, motes: readonly AmbientMote[], palette: Palette): void {
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
    const alpha = (0.16 + twinkle * 0.16) * palette.moteAlpha;
    push(sink, drift, rise, 1, 1, palette.mote, alpha);
    if (index % 3 === 0) push(sink, drift, rise + 1, 1, 1, palette.moteTail, alpha * 0.4);
    index++;
  }
}

/** 3. Stacked, low-alpha breathing glow around a painted lamp. */
function lampGlow(
  sink: Sink, t: number, period: number, phase: number, scale: number,
  steps: readonly (readonly [number, number, number, number, number])[],
): void {
  const breathe = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * (Math.PI * 2 / period) + phase));
  for (const [x, y, width, height, alpha] of steps) push(sink, x, y, width, height, LAMP_WARM, alpha * breathe * scale);
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
function birdQuads(sink: Sink, t: number, color: string): void {
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
    if (!overlapsMullion(x + dx, 1)) push(sink, x + dx, y + dy, 1, 1, color, alpha);
  }
}

/**
 * 5a. Rain: thin 1px streaks falling inside each window pane. They wrap within
 * the pane so a streak never crosses the painted transom, and mullion columns
 * are skipped. Two depths (near brighter/faster, far dimmer) keep it gentle.
 */
function rainQuads(sink: Sink, t: number): void {
  for (let pane = 0; pane < RAIN_PANES.length; pane++) {
    const [top, bottom] = RAIN_PANES[pane]!;
    for (let index = 0; index < RAIN_SLOTS; index++) {
      const salt = pane * 31;
      const x = Math.round(RAIN_LEFT + unit(index + salt, 211) * RAIN_SPAN);
      if (overlapsMullion(x, 1)) continue;
      const near = unit(index + salt, 227) < 0.5;
      const length = near ? 5 + Math.floor(unit(index + salt, 229) * 2) : 3 + Math.floor(unit(index + salt, 229) * 2);
      const speed = near ? 96 + unit(index + salt, 223) * 46 : 66 + unit(index + salt, 223) * 30;
      const band = bottom - top - length;
      if (band < 4) continue;
      const y = top + Math.round(wrap(unit(index + salt, 233) * band + t * speed, band));
      const alpha = near ? 0.13 + unit(index + salt, 239) * 0.06 : 0.08 + unit(index + salt, 239) * 0.05;
      push(sink, x, y, 1, length, near ? RAIN_NEAR : RAIN_FAR, alpha);
    }
  }
}

/** 5b. Slow ripple dashes on the water while it rains; each grows and fades. */
function rippleQuads(sink: Sink, t: number, water: NonNullable<AmbientAppearance['water']>): void {
  const left = Math.round(water.left);
  const right = Math.round(water.right);
  const top = Math.round(water.top);
  const bottom = Math.round(water.bottom);
  const width = right - left;
  const height = bottom - top;
  if (!(width >= 12) || !(height >= 6)) return;
  for (let index = 0; index < RIPPLE_SLOTS; index++) {
    const progress = wrap(t + unit(index, 241) * RIPPLE_CYCLE, RIPPLE_CYCLE) / RIPPLE_CYCLE;
    if (progress > 0.55) continue;
    const q = progress / 0.55;
    const rippleWidth = 2 + Math.round(q * 3);
    const x = Math.round(left + 3 + unit(index, 251) * (width - rippleWidth - 6));
    if (overlapsMullion(x, rippleWidth)) continue;
    const y = top + 2 + Math.round(unit(index, 257) * (height - 4));
    push(sink, x, y, rippleWidth, 1, RIPPLE_COLOR, 0.16 * (1 - q));
  }
}

/**
 * 6. A rare shooting star across the upper pane: one bright head pixel and a
 * short fading tail, clipped out of the mullions. About 1.8s every ~7 minutes.
 */
function shootingStarQuads(sink: Sink, t: number): void {
  const since = t - STAR_START;
  if (since < 0) return;
  const episode = Math.floor(since / STAR_PERIOD);
  const local = since - episode * STAR_PERIOD;
  if (local >= STAR_DURATION) return;
  const progress = local / STAR_DURATION;
  const fade = Math.min(1, progress * 5, (1 - progress) * 5);
  if (fade <= 0.01) return;
  const dx = STAR_TO.x - STAR_FROM.x;
  const dy = STAR_TO.y - STAR_FROM.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const x = Math.round(STAR_FROM.x + dx * progress);
  const y = Math.round(STAR_FROM.y + dy * progress);
  if (!overlapsMullion(x, 1)) push(sink, x, y, 1, 1, STAR_HEAD, 0.85 * fade);
  for (let i = 1; i <= 3; i++) {
    const tailX = x - stepX * i * 2;
    const tailY = y - stepY * i;
    if (!overlapsMullion(tailX, 1)) push(sink, tailX, tailY, 1, 1, STAR_TAIL, (0.5 - i * 0.12) * fade);
  }
}

interface ResolvedProfile {
  readonly palette: Palette;
  readonly waterColumn: number;
  readonly bird: boolean;
  readonly rain: boolean;
  readonly shootingStar: boolean;
  readonly lampScale: number;
}

function resolveProfile(profile?: AmbienceProfile): ResolvedProfile {
  const mood: Mood = profile?.mood === 'night' || profile?.mood === 'rain' ? profile.mood : 'sunset';
  const column = profile?.waterColumn;
  const scale = profile?.lampScale;
  return {
    palette: PALETTES[mood],
    waterColumn: Number.isFinite(column) && column! >= 0 && column! <= 1 ? column! : WATER_SUN_FRACTION,
    bird: profile?.bird !== false,
    rain: profile?.rain === true,
    shootingStar: profile?.shootingStar === true,
    lampScale: Number.isFinite(scale) && scale! >= 0.5 && scale! <= 1.6 ? scale! : 1,
  };
}

/**
 * Ambient overlay commands for one frame of the study.
 *
 * @param seconds elapsed seconds (non-finite input is treated as t = 0 so the
 *                output is always a stable, finite frame).
 * @param motes   floating-mote field (e.g. `motesFor(seed)`); positions/phases
 *                are reused, the array is never mutated.
 * @param appearance optional layout; `water` places sea sparkle/ripples and
 *                `ambience` selects the per-background palette and episodes.
 *                Without a profile the output is the approved sunset overlay.
 */
export function ambienceQuads(
  seconds: number,
  motes: readonly AmbientMote[],
  appearance?: AmbientAppearance,
): AmbientQuad[] {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const sink: Sink = { quads: [], stopped: false };
  const resolved = resolveProfile(appearance?.ambience);
  const water = appearance?.water;
  const hasWater = Boolean(water
    && Number.isFinite(water!.left) && Number.isFinite(water!.right)
    && Number.isFinite(water!.top) && Number.isFinite(water!.bottom));
  if (hasWater) waterQuads(sink, t, water!, resolved.palette, resolved.waterColumn);
  moteQuads(sink, t, motes, resolved.palette);
  lampGlow(sink, t, 8.6, 0.9, resolved.lampScale, HANGING_LAMP_STEPS);
  lampGlow(sink, t, 11.3, 4.2, resolved.lampScale, DESK_LAMP_STEPS);
  if (resolved.bird) birdQuads(sink, t, resolved.palette.bird);
  if (resolved.rain) {
    rainQuads(sink, t);
    if (hasWater) rippleQuads(sink, t, water!);
  }
  if (resolved.shootingStar) shootingStarQuads(sink, t);
  return sink.quads;
}
