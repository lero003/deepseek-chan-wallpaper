export const TICKS_PER_SECOND = 60;
export const STEP_SECONDS = 1 / TICKS_PER_SECOND;
export const MAX_DELTA_SECONDS = 0.25;
export const WALK_SPEED = 11;
export const ACTOR_HALF_WIDTH = 24;

export type Behavior = 'idle' | 'walk' | 'turn' | 'sleep';
/** A short, playful solo performance played while the base state stays idle. */
export type Emote = 'hop' | 'giggle' | 'sway' | 'peek' | 'stretch' | 'daydream';
/** Roaming walks occasionally become a lighter, bouncier skip. */
export type WalkStyle = 'normal' | 'skip';
export type Facing = -1 | 1;
/** Background-linked life rhythm. Sunset keeps the original approved probabilities. */
export type Mood = 'sunset' | 'night' | 'rain';
export interface Interval { left: number; right: number }
export interface Scene {
  width: number;
  height: number;
  floorY: number;
  actorHalfWidth?: number;
  obstacles: readonly Interval[];
}

export const SEASIDE: Scene = {
  width: 480,
  height: 270,
  floorY: 236,
  // Only these two objects intersect the walking plane. The desk is behind it.
  obstacles: [{ left: 0, right: 82 }, { left: 402, right: 480 }],
};

export interface Actor {
  x: number;
  facing: Facing;
  state: Behavior;
  stateTicks: number;
  durationTicks: number;
  turnTarget: Facing;
  sleepAllowedAtTick: number;
  /** When set, the current walk heads to this scenic spot instead of roaming. */
  walkTarget: number | null;
  gazeAllowedAtTick: number;
  /** Active idle performance and its fitted duration in ticks. */
  emote: Emote | null;
  emoteTicks: number;
  /** Offset within the current idle; starting a performance never resets its clock. */
  emoteStartStateTick: number;
  emoteAllowedAtTick: number;
  lastEmote: Emote | null;
  walkStyle: WalkStyle;
}

export interface EmoteDefinition { readonly ticks: number; readonly weight: number }
export const EMOTES: Readonly<Record<Emote, EmoteDefinition>> = {
  hop: { ticks: 78, weight: 18 },
  giggle: { ticks: 84, weight: 14 },
  sway: { ticks: 190, weight: 22 },
  peek: { ticks: 160, weight: 18 },
  stretch: { ticks: 150, weight: 12 },
  daydream: { ticks: 240, weight: 16 },
} as const;

/** Target start-to-start gap in awake time; walking can defer the next eligible idle. */
export const EMOTE_COOLDOWN = { minimum: 10 * TICKS_PER_SECOND, spread: 2 * TICKS_PER_SECOND } as const;
const EMOTE_MINIMUM_TICKS = 78;
const EMOTE_MINIMUM_DURATION_RATIO = .75;
const EMOTE_SETTLE_TICKS = 12;

/** Mood affects the order, not coverage: every bag still contains all six acts. */
const EMOTE_MOOD_WEIGHTS: Record<Mood, Readonly<Record<Emote, number>>> = {
  sunset: { hop: 1.4, giggle: 1.3, sway: 1, peek: 1, stretch: .8, daydream: .8 },
  night: { hop: .35, giggle: .5, sway: 1, peek: 1.2, stretch: 1.7, daydream: 2 },
  rain: { hop: .8, giggle: .9, sway: 1.5, peek: 1.6, stretch: 1, daydream: 1.3 },
};

export interface World {
  readonly seed: number;
  randomState: number;
  /** Separate cosmetic stream: emotes/skip styles never shift the life-behavior schedule. */
  presentationState: number;
  /** Weighted shuffle without replacement, so no performance can be starved. */
  emoteBag: Emote[];
  tick: number;
  remainder: number;
  readonly floorY: number;
  readonly range: Interval;
  /** Background-linked life rhythm; sunset is the original approved tuning. */
  mood: Mood;
  actor: Actor;
}

interface MoodTuning {
  idleWalk: number; idleTurn: number; walkIdle: number; turnIdle: number;
  idle: readonly [number, number]; walk: readonly [number, number]; sleep: readonly [number, number];
  gazeChance: number; gazeIdle: readonly [number, number];
  emotePace: number; skipChance: number;
}

/**
 * Sunset keeps the original probabilities/durations. Night leans toward longer,
 * more frequent sleep; rain leans toward standing at the window and shorter
 * walks. Gaze is a rare, cooldown-limited stroll to a scenic spot followed by a
 * longer idle, so the quiet loop gains variety without becoming busy.
 */
const MOOD_TUNING: Record<Mood, MoodTuning> = {
  sunset: { idleWalk: .56, idleTurn: .76, walkIdle: .72, turnIdle: .42, idle: [2.8, 7.2], walk: [5, 12], sleep: [22, 44], gazeChance: .16, gazeIdle: [7, 14], emotePace: 1, skipChance: .22 },
  night: { idleWalk: .44, idleTurn: .68, walkIdle: .78, turnIdle: .50, idle: [3.2, 8.5], walk: [4, 10], sleep: [30, 60], gazeChance: .10, gazeIdle: [8, 16], emotePace: 1.2, skipChance: .10 },
  rain: { idleWalk: .40, idleTurn: .62, walkIdle: .80, turnIdle: .55, idle: [3.5, 9], walk: [4, 9], sleep: [26, 52], gazeChance: .22, gazeIdle: [9, 18], emotePace: 1, skipChance: .26 },
};

/** Validate and apply a background mood; unknown values fall back to sunset. */
export function applyMood(world: World, mood: unknown): void {
  world.mood = mood === 'night' || mood === 'rain' ? mood : 'sunset';
}

/** FNV-1a gives text seeds a stable, nonzero 32-bit identity. */
export function seedFromText(value: string): number {
  let hash = 2166136261;
  for (const character of value.slice(0, 128)) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

/** Subtract full sprite-width collision margins, then use one connected floor. */
export function walkingRange(scene: Scene): Interval {
  const halfWidth = scene.actorHalfWidth ?? ACTOR_HALF_WIDTH;
  if (!Number.isFinite(halfWidth) || halfWidth <= 0) throw new Error('Invalid character collision width.');
  if (!Number.isFinite(scene.floorY) || scene.floorY < 0 || scene.floorY > scene.height) throw new Error('Invalid floor position.');
  if (!Number.isFinite(scene.width) || scene.width < halfWidth * 2) {
    throw new Error('The scene is too narrow for the character.');
  }
  let segments: Interval[] = [{ left: halfWidth, right: scene.width - halfWidth }];
  for (const obstacle of scene.obstacles) {
    if (!Number.isFinite(obstacle.left) || !Number.isFinite(obstacle.right) || obstacle.left > obstacle.right) {
      throw new Error('Invalid floor obstacle.');
    }
    const left = obstacle.left - halfWidth;
    const right = obstacle.right + halfWidth;
    segments = segments.flatMap((segment) => {
      if (right <= segment.left || left >= segment.right) return [segment];
      const remaining: Interval[] = [];
      if (left > segment.left) remaining.push({ left: segment.left, right: left });
      if (right < segment.right) remaining.push({ left: right, right: segment.right });
      return remaining;
    });
  }
  const longest = segments.sort((a, b) => (b.right - b.left) - (a.right - a.left))[0];
  if (!longest || longest.right - longest.left < 2) throw new Error('No safe walking space.');
  return { ...longest };
}

// Called only while entering or choosing a behavior, never from the renderer.
function random(world: World): number {
  let next = world.randomState;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  world.randomState = next >>> 0;
  return world.randomState / 4294967296;
}

/** Cosmetic choices live on their own stream so life timing/RNG stays predictable. */
function presentationRandom(world: World): number {
  let next = world.presentationState;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  world.presentationState = next >>> 0 || 1;
  return world.presentationState / 4294967296;
}

function duration(world: World, minimum: number, maximum: number): number {
  return Math.round((minimum + random(world) * (maximum - minimum)) * TICKS_PER_SECOND);
}

/**
 * Keep unfitted acts in the current bag, rather than rushing them or drawing a new
 * bag. Prefer a full-length act; only use a shortened one at >=75% authored length.
 * Refill randomness is consumed only on a successful performance transition.
 */
function chooseEmote(world: World, availableTicks: number): Emote | null {
  if (world.emoteBag.length === 0) {
    const remaining = Object.keys(EMOTES) as Emote[];
    const weights = EMOTE_MOOD_WEIGHTS[world.mood];
    while (remaining.length > 0) {
      // A new bag may not open with the previous bag's closing act.
      const pool = remaining.filter((id) => world.emoteBag.length > 0 || id !== world.actor.lastEmote);
      const total = pool.reduce((sum, id) => sum + EMOTES[id].weight * weights[id], 0);
      let roll = presentationRandom(world) * total;
      let selected = pool[pool.length - 1]!;
      for (const id of pool) {
        roll -= EMOTES[id].weight * weights[id];
        if (roll <= 0) { selected = id; break; }
      }
      world.emoteBag.push(selected);
      remaining.splice(remaining.indexOf(selected), 1);
    }
  }
  const fits = (id: Emote, ratio: number): boolean => id !== world.actor.lastEmote
    && availableTicks >= Math.ceil(EMOTES[id].ticks * ratio);
  let index = world.emoteBag.findIndex((id) => fits(id, 1));
  if (index < 0) index = world.emoteBag.findIndex((id) => fits(id, EMOTE_MINIMUM_DURATION_RATIO));
  if (index < 0) return null;
  return world.emoteBag.splice(index, 1)[0]!;
}

function clearEmote(actor: Actor): void {
  actor.emote = null;
  actor.emoteTicks = 0;
  actor.emoteStartStateTick = 0;
}

/**
 * Eligibility checks are deterministic; random choices happen only when an act starts.
 * An overdue act waits for idle, never interrupts a walk/turn/sleep, and fits inside
 * the remaining idle with a short settling beat. Base durations/RNG stay untouched.
 */
function maybeStartEmote(world: World): void {
  const actor = world.actor;
  if (actor.state !== 'idle' || actor.emote || world.tick < actor.emoteAllowedAtTick) return;
  const available = actor.durationTicks - actor.stateTicks - EMOTE_SETTLE_TICKS;
  if (available < EMOTE_MINIMUM_TICKS) return;
  const emote = chooseEmote(world, available);
  if (!emote) return;
  actor.emote = emote;
  actor.lastEmote = emote;
  actor.emoteStartStateTick = actor.stateTicks;
  // Fitting selection above guarantees this is never below 75% authored duration.
  actor.emoteTicks = Math.min(EMOTES[emote].ticks, available);
  actor.emoteAllowedAtTick = world.tick + Math.round(MOOD_TUNING[world.mood].emotePace
    * (EMOTE_COOLDOWN.minimum + presentationRandom(world) * EMOTE_COOLDOWN.spread));
}

/** Progress of the currently playing idle performance, or null when none is active. */
export function activeEmote(actor: Readonly<Actor>): { emote: Emote; progress: number } | null {
  const elapsed = actor.stateTicks - actor.emoteStartStateTick;
  if (!actor.emote || actor.state !== 'idle' || actor.emoteTicks <= 0 || elapsed < 0 || elapsed >= actor.emoteTicks) return null;
  return { emote: actor.emote, progress: Math.max(0, Math.min(1, elapsed / actor.emoteTicks)) };
}

function enter(world: World, state: Behavior): void {
  const actor = world.actor;
  const tuning = MOOD_TUNING[world.mood];
  if (state === 'turn') {
    const roomBehind = actor.facing === 1 ? actor.x - world.range.left : world.range.right - actor.x;
    // Do not voluntarily face a wall, then immediately bounce back a frame later.
    if (roomBehind < WALK_SPEED * 2) state = 'idle';
  }
  actor.state = state;
  actor.stateTicks = 0;
  actor.walkTarget = null;
  clearEmote(actor);
  if (state !== 'walk') actor.walkStyle = 'normal';
  switch (state) {
    case 'idle':
      actor.durationTicks = duration(world, tuning.idle[0], tuning.idle[1]);
      maybeStartEmote(world);
      break;
    case 'walk':
      actor.durationTicks = duration(world, tuning.walk[0], tuning.walk[1]);
      actor.walkStyle = presentationRandom(world) < tuning.skipChance ? 'skip' : 'normal';
      break;
    case 'turn':
      actor.durationTicks = 30;
      actor.turnTarget = actor.facing === 1 ? -1 : 1;
      break;
    case 'sleep': actor.durationTicks = duration(world, tuning.sleep[0], tuning.sleep[1]); break;
  }
}

/** A stroll to a scenic spot in front of the window, then a longer quiet idle. */
function enterGazeWalk(world: World): void {
  const actor = world.actor;
  const span = world.range.right - world.range.left;
  const target = world.range.left + span * (0.35 + random(world) * 0.30);
  actor.walkTarget = target;
  actor.facing = target > actor.x ? 1 : -1;
  actor.state = 'walk';
  actor.stateTicks = 0;
  actor.walkStyle = 'normal';
  clearEmote(actor);
  const distance = Math.abs(target - actor.x);
  actor.durationTicks = Math.ceil(distance / (WALK_SPEED * STEP_SECONDS)) + 30;
  actor.gazeAllowedAtTick = world.tick + 45 * TICKS_PER_SECOND;
}

function enterGazeIdle(world: World): void {
  const actor = world.actor;
  const tuning = MOOD_TUNING[world.mood];
  actor.state = 'idle';
  actor.stateTicks = 0;
  actor.walkTarget = null;
  actor.walkStyle = 'normal';
  clearEmote(actor);
  actor.durationTicks = duration(world, tuning.gazeIdle[0], tuning.gazeIdle[1]);
  maybeStartEmote(world);
}

function chooseNext(world: World): void {
  const actor = world.actor;
  const tuning = MOOD_TUNING[world.mood];
  switch (actor.state) {
    case 'idle': {
      const roll = random(world);
      if (roll < tuning.idleWalk) {
        if (world.tick >= actor.gazeAllowedAtTick && random(world) < tuning.gazeChance) enterGazeWalk(world);
        else enter(world, 'walk');
      }
      else if (roll < tuning.idleTurn) enter(world, 'turn');
      else enter(world, world.tick >= actor.sleepAllowedAtTick ? 'sleep' : 'walk');
      break;
    }
    case 'walk': enter(world, random(world) < tuning.walkIdle ? 'idle' : 'turn'); break;
    case 'turn': enter(world, random(world) < tuning.turnIdle ? 'idle' : 'walk'); break;
    case 'sleep':
      actor.sleepAllowedAtTick = world.tick + 18 * TICKS_PER_SECOND;
      enter(world, 'idle');
      break;
  }
}

export function createWorld(seed: number = seedFromText('seaside-v01'), scene: Scene = SEASIDE, mood: Mood = 'sunset'): World {
  const normalizedSeed = (seed >>> 0) || 1;
  const range = walkingRange(scene);
  const world: World = {
    seed: normalizedSeed,
    randomState: normalizedSeed,
    presentationState: (normalizedSeed ^ 0x9e3779b9) >>> 0 || 1,
    emoteBag: [],
    tick: 0,
    remainder: 0,
    floorY: scene.floorY,
    range,
    mood: mood === 'night' || mood === 'rain' ? mood : 'sunset',
    actor: {
      x: (range.left + range.right) / 2,
      facing: 1,
      state: 'idle',
      stateTicks: 0,
      durationTicks: 0,
      turnTarget: -1,
      sleepAllowedAtTick: 0,
      walkTarget: null,
      gazeAllowedAtTick: 0,
      emote: null,
      emoteTicks: 0,
      emoteStartStateTick: 0,
      // Let the first page load settle before the first little performance.
      emoteAllowedAtTick: 6 * TICKS_PER_SECOND,
      lastEmote: null,
      walkStyle: 'normal',
    },
  };
  enter(world, 'idle');
  // The approved default opening sleeps after 6.4s. If necessary, let its first
  // delight begin slightly before 6s rather than lengthening that idle or sleep.
  const openingLatestStart = world.actor.durationTicks - EMOTE_MINIMUM_TICKS - EMOTE_SETTLE_TICKS;
  if (openingLatestStart >= 4.5 * TICKS_PER_SECOND) {
    world.actor.emoteAllowedAtTick = Math.min(world.actor.emoteAllowedAtTick, openingLatestStart);
  }
  return world;
}

function step(world: World): void {
  world.tick += 1;
  const actor = world.actor;
  actor.stateTicks += 1;
  // Sleeping does not spend the awake-time cooldown or create a backlog of acts.
  if (actor.state === 'sleep') actor.emoteAllowedAtTick += 1;
  if (actor.state !== 'idle' || (actor.emote && actor.stateTicks >= actor.emoteStartStateTick + actor.emoteTicks)) {
    clearEmote(actor);
  }
  if (actor.state !== 'walk') actor.walkStyle = 'normal';
  maybeStartEmote(world);
  if (actor.state === 'walk') {
    if (actor.walkTarget != null) {
      // A gaze stroll heads straight to its scenic spot, then settles into idle.
      const stepSize = WALK_SPEED * STEP_SECONDS;
      const remaining = actor.walkTarget - actor.x;
      if (Math.abs(remaining) <= stepSize) {
        actor.x = actor.walkTarget;
        enterGazeIdle(world);
        return;
      }
      actor.facing = remaining > 0 ? 1 : -1;
      actor.x += Math.sign(remaining) * stepSize;
    } else {
      const nextX = actor.x + actor.facing * WALK_SPEED * STEP_SECONDS;
      actor.x = Math.max(world.range.left, Math.min(world.range.right, nextX));
      if (nextX <= world.range.left || nextX >= world.range.right) {
        enter(world, 'turn');
        return;
      }
    }
  } else if (actor.state === 'turn' && actor.stateTicks >= actor.durationTicks / 2) {
    actor.facing = actor.turnTarget;
  }
  if (actor.stateTicks >= actor.durationTicks) chooseNext(world);
}

/** Fixed ticks make 15/30/60fps render schedules produce the same world. */
export function advanceWorld(world: World, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  world.remainder += Math.min(deltaSeconds, MAX_DELTA_SECONDS);
  const steps = Math.floor((world.remainder + 1e-9) / STEP_SECONDS);
  world.remainder = Math.max(0, world.remainder - steps * STEP_SECONDS);
  for (let index = 0; index < steps; index += 1) step(world);
}

export function worldSeconds(world: Readonly<World>): number {
  return world.tick / TICKS_PER_SECOND;
}
