export const TICKS_PER_SECOND = 60;
export const STEP_SECONDS = 1 / TICKS_PER_SECOND;
export const MAX_DELTA_SECONDS = 0.25;
export const WALK_SPEED = 11;
export const ACTOR_HALF_WIDTH = 24;

export type Behavior = 'idle' | 'walk' | 'turn' | 'sleep';
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
}

export interface World {
  readonly seed: number;
  randomState: number;
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
}

/**
 * Sunset keeps the original probabilities/durations. Night leans toward longer,
 * more frequent sleep; rain leans toward standing at the window and shorter
 * walks. Gaze is a rare, cooldown-limited stroll to a scenic spot followed by a
 * longer idle, so the quiet loop gains variety without becoming busy.
 */
const MOOD_TUNING: Record<Mood, MoodTuning> = {
  sunset: { idleWalk: .56, idleTurn: .76, walkIdle: .72, turnIdle: .42, idle: [2.8, 7.2], walk: [5, 12], sleep: [22, 44], gazeChance: .16, gazeIdle: [7, 14] },
  night: { idleWalk: .44, idleTurn: .68, walkIdle: .78, turnIdle: .50, idle: [3.2, 8.5], walk: [4, 10], sleep: [30, 60], gazeChance: .10, gazeIdle: [8, 16] },
  rain: { idleWalk: .40, idleTurn: .62, walkIdle: .80, turnIdle: .55, idle: [3.5, 9], walk: [4, 9], sleep: [26, 52], gazeChance: .22, gazeIdle: [9, 18] },
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

function duration(world: World, minimum: number, maximum: number): number {
  return Math.round((minimum + random(world) * (maximum - minimum)) * TICKS_PER_SECOND);
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
  switch (state) {
    case 'idle': actor.durationTicks = duration(world, tuning.idle[0], tuning.idle[1]); break;
    case 'walk': actor.durationTicks = duration(world, tuning.walk[0], tuning.walk[1]); break;
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
  actor.durationTicks = duration(world, tuning.gazeIdle[0], tuning.gazeIdle[1]);
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
    },
  };
  enter(world, 'idle');
  return world;
}

function step(world: World): void {
  world.tick += 1;
  const actor = world.actor;
  actor.stateTicks += 1;
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
