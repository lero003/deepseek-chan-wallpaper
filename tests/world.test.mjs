import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTOR_HALF_WIDTH, advanceWorld, createWorld, SEASIDE, seedFromText, STEP_SECONDS, walkingRange, WALK_SPEED } from '../src/world/world.ts';

function simulate(seconds, fps, seed = 18327) {
  const world = createWorld(seed);
  for (let index = 0; index < seconds * fps; index += 1) advanceWorld(world, 1 / fps);
  return world;
}

function forceWalk(world, facing = 1) {
  Object.assign(world.actor, { state: 'walk', facing, stateTicks: 0, durationTicks: 1000000 });
}

test('text seeds are stable, nonzero, bounded, and meaningfully different', () => {
  assert.equal(seedFromText('seaside-v01'), seedFromText('seaside-v01'));
  assert.notEqual(seedFromText('seaside-v01'), seedFromText('seaside-v02'));
  assert.notEqual(seedFromText(''), 0);
  assert.equal(seedFromText('a'.repeat(129)), seedFromText('a'.repeat(128)));
  assert.equal(createWorld(0).seed, 1);
});

test('the 15/30/60fps schedules produce identical worlds after thirty minutes', () => {
  const low = simulate(1800, 15);
  const medium = simulate(1800, 30);
  const high = simulate(1800, 60);
  assert.deepEqual(low, medium);
  assert.deepEqual(medium, high);
  assert.equal(high.tick, 1800 * 60);
});

test('seeded replay stays identical even with irregular frame intervals', () => {
  const regular = simulate(20, 60, 71);
  const irregular = createWorld(71);
  for (let index = 0; index < 100; index += 1) {
    for (const delta of [0.011, 0.032, 0.077, 0.08]) advanceWorld(irregular, delta);
  }
  assert.equal(irregular.tick, regular.tick);
  assert.deepEqual(irregular.actor, regular.actor);
  assert.equal(irregular.randomState, regular.randomState);
});

test('walking speed is seconds-based, not render-based', () => {
  for (const fps of [15, 30, 60]) {
    const world = createWorld(10);
    forceWalk(world);
    const initial = world.actor.x;
    for (let index = 0; index < fps * 3; index += 1) advanceWorld(world, 1 / fps);
    assert.ok(Math.abs(world.actor.x - initial - WALK_SPEED * 3) < 1e-8);
  }
});

test('both ends clamp the full sprite before entering a half-second turn', () => {
  for (const facing of [-1, 1]) {
    const world = createWorld(8);
    forceWalk(world, facing);
    world.actor.x = facing === 1 ? world.range.right - 0.01 : world.range.left + 0.01;
    advanceWorld(world, STEP_SECONDS);
    assert.equal(world.actor.x, facing === 1 ? world.range.right : world.range.left);
    assert.equal(world.actor.state, 'turn');
    assert.equal(world.actor.durationTicks, 30);
    assert.equal(world.actor.facing, facing);
    advanceWorld(world, 0.25);
    assert.equal(world.actor.facing, -facing);
  }
});

test('obstacles subtract the full character footprint and select one connected floor', () => {
  assert.deepEqual(walkingRange(SEASIDE), { left: 106, right: 378 });
  const divided = { ...SEASIDE, obstacles: [{ left: 150, right: 200 }] };
  const range = walkingRange(divided);
  assert.deepEqual(range, { left: 224, right: 456 });
  assert.ok(range.left - ACTOR_HALF_WIDTH >= 200);
  assert.throws(() => walkingRange({ ...SEASIDE, width: 10 }));
  assert.throws(() => walkingRange({ ...SEASIDE, obstacles: [{ left: 0, right: 480 }] }));
  assert.throws(() => walkingRange({ ...SEASIDE, obstacles: [{ left: NaN, right: 50 }] }));
});

test('thirty-minute simulations across seeds never escape or chatter between states', () => {
  const observed = new Set();
  for (const seed of [1, 19, 42, 1987, 65535]) {
    const world = createWorld(seed);
    let previousState = world.actor.state;
    let lastTransition = 0;
    for (let index = 0; index < 1800 * 30; index += 1) {
      advanceWorld(world, 1 / 30);
      const actor = world.actor;
      observed.add(actor.state);
      assert.ok(actor.x >= world.range.left && actor.x <= world.range.right);
      assert.ok(actor.stateTicks >= 0 && actor.stateTicks <= actor.durationTicks);
      assert.ok(actor.x - ACTOR_HALF_WIDTH >= 82);
      assert.ok(actor.x + ACTOR_HALF_WIDTH <= 402);
      if (actor.state !== previousState) {
        // A boundary can shorten a walk, but turns and sleeping still hold their durations.
        if (previousState === 'turn') assert.ok(world.tick - lastTransition >= 30);
        if (previousState === 'sleep') assert.ok(world.tick - lastTransition >= 22 * 60);
        lastTransition = world.tick;
        previousState = actor.state;
      }
    }
  }
  assert.deepEqual([...observed].sort(), ['idle', 'sleep', 'turn', 'walk']);
});

test('voluntary turns never face a nearby obstacle and immediately bounce back', () => {
  let foundTurn = false;
  for (let seed = 1; seed < 100 && !foundTurn; seed += 1) {
    const middle = createWorld(seed);
    middle.actor.durationTicks = 1;
    const atEdge = structuredClone(middle);
    atEdge.actor.x = atEdge.range.left;
    atEdge.actor.facing = 1;
    advanceWorld(middle, STEP_SECONDS);
    if (middle.actor.state !== 'turn') continue;
    foundTurn = true;
    advanceWorld(atEdge, STEP_SECONDS);
    assert.equal(atEdge.actor.state, 'idle');
    assert.equal(atEdge.actor.facing, 1);
    assert.ok(atEdge.actor.durationTicks >= 2.8 * 60);
  }
  assert.equal(foundTurn, true);
});

test('randomness advances only at behavior transitions', () => {
  const world = createWorld(42);
  const initial = world.randomState;
  for (let index = 0; index < 60; index += 1) advanceWorld(world, STEP_SECONDS);
  assert.equal(world.actor.state, 'idle');
  assert.equal(world.randomState, initial);
});

test('waking from sleep enforces a cooldown and returns to idle', () => {
  const world = createWorld(4);
  Object.assign(world.actor, { state: 'sleep', stateTicks: 59, durationTicks: 60 });
  advanceWorld(world, STEP_SECONDS);
  assert.equal(world.actor.state, 'idle');
  assert.equal(world.actor.sleepAllowedAtTick, world.tick + 18 * 60);
  assert.ok(world.actor.durationTicks >= 2.8 * 60);
});

test('invalid deltas do nothing, and unexpected gaps are bounded', () => {
  const world = createWorld(55);
  const original = structuredClone(world);
  for (const delta of [0, -1, NaN, Infinity]) advanceWorld(world, delta);
  assert.deepEqual(world, original);
  advanceWorld(world, 100000);
  assert.equal(world.tick, 15);
});
