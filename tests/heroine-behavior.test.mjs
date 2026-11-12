import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeEmote, advanceWorld, createWorld, EMOTES, EMOTE_COOLDOWN, seedFromText, STEP_SECONDS,
} from '../src/world/world.ts';
import { advanceGame, createGame } from '../src/fighters/game.ts';
import { requestCall } from '../src/companion/companion.ts';

const moods = ['sunset', 'rain', 'night'];
const seeds = [1, 7, 19, 42, 99, 1234, 65535, seedFromText('seaside-v01')];
const tick = (world, count = 1) => { for (let i = 0; i < count; i++) advanceWorld(world, STEP_SECONDS); };
const baseActor = ({ emote, emoteTicks, emoteStartStateTick, emoteAllowedAtTick, lastEmote, walkStyle, ...base }) => base;

function observe(seed, mood, seconds = 1800, fps = 60) {
  const world = createWorld(seed, undefined, mood);
  const starts = [], performances = [], awakeGaps = [], wallGaps = [];
  let awakeTicks = 0, lastAwake = null, previous = null;
  for (let i = 0; i < seconds * fps; i++) {
    // Cadence measurements use individual simulation ticks, not rendered frames.
    if (fps === 60 && world.actor.state !== 'sleep') awakeTicks++;
    advanceWorld(world, 1 / fps);
    const current = activeEmote(world.actor);
    if (current && !previous) {
      const startedTick = world.tick - (world.actor.stateTicks - world.actor.emoteStartStateTick);
      starts.push([startedTick, current.emote]);
      performances.push({ emote: current.emote, ticks: world.actor.emoteTicks });
      if (lastAwake !== null) {
        awakeGaps.push((awakeTicks - lastAwake) / 60);
        wallGaps.push((startedTick - starts.at(-2)[0]) / 60);
      }
      lastAwake = awakeTicks;
    }
    previous = current;
  }
  return { world, starts, performances, awakeGaps, wallGaps };
}

function assertClean(actor) {
  assert.equal(actor.emote, null);
  assert.equal(actor.emoteTicks, 0);
  assert.equal(actor.emoteStartStateTick, 0);
  assert.equal(activeEmote(actor), null);
}

test('six-variety bags have no starvation or adjacent repetition, including bag seams', () => {
  const expected = Object.keys(EMOTES).sort();
  for (const mood of moods) for (const seed of seeds) {
    const { starts, world } = observe(seed, mood);
    assert.ok(starts.length >= 36, `${mood}/${seed}: at least six complete bags`);
    for (let i = 0; i + 6 <= starts.length; i += 6) {
      assert.deepEqual(starts.slice(i, i + 6).map(([, id]) => id).sort(), expected, `${mood}/${seed}: bag ${i / 6}`);
    }
    for (let i = 1; i < starts.length; i++) assert.notEqual(starts[i][1], starts[i - 1][1]);
    assert.equal(new Set(world.emoteBag).size, world.emoteBag.length);
    assert.ok(world.emoteBag.length <= 5);
  }
});

test('performances and final cosmetic state reproduce at 15/30/60fps over thirty minutes', () => {
  for (const mood of moods) {
    const expected = observe(31, mood, 1800, 60);
    for (const fps of [15, 30]) {
      const actual = observe(31, mood, 1800, fps);
      assert.deepEqual(actual.starts, expected.starts, `${mood}/${fps}: exact performance start ticks`);
      assert.deepEqual(actual.performances, expected.performances, `${mood}/${fps}: fitted durations`);
      assert.deepEqual(actual.world, expected.world, `${mood}/${fps}: all simulation and cosmetic state`);
    }
  }
});

test('awake cadence is typically 10–20s, never below cooldown, without hiding walking delays', t => {
  for (const mood of moods) {
    const records = seeds.map(seed => observe(seed, mood));
    const gaps = records.flatMap(record => record.awakeGaps).sort((a, b) => a - b);
    const wall = records.flatMap(record => record.wallGaps).sort((a, b) => a - b);
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const minimum = mood === 'night' ? EMOTE_COOLDOWN.minimum * 1.2 / 60 : EMOTE_COOLDOWN.minimum / 60;
    assert.ok(gaps.every(gap => gap >= minimum), `${mood}: cooldown may never be shortened`);
    assert.ok(mean >= 10 && mean <= 20, `${mood}: mean awake gap ${mean}`);
    assert.ok(gaps[Math.floor(gaps.length * .5)] <= 20, `${mood}: median stays in the requested quiet cadence`);
    assert.ok(gaps.filter(gap => gap <= 20).length / gaps.length >= .75, `${mood}: at least 75% of awake gaps are within 20s`);
    // Existing long walks are preserved, so 20s is deliberately not an absolute bound.
    const f = number => number.toFixed(2);
    t.diagnostic(`${mood}: ${gaps.length} gaps; awake mean ${f(mean)}s, median ${f(gaps[Math.floor(gaps.length * .5)])}s, p90 ${f(gaps[Math.floor(gaps.length * .9)])}s, max ${f(gaps.at(-1))}s; wall median ${f(wall[Math.floor(wall.length * .5)])}s, p90 ${f(wall[Math.floor(wall.length * .9)])}s, max ${f(wall.at(-1))}s`);
  }
});

test('the default opening delights early while the seed7 companion idle stays exactly on schedule', () => {
  const opening = observe(seedFromText('seaside-v01'), 'sunset', 10);
  assert.equal(opening.starts[0][0], 294, 'the 6.4s opening retains a whole 1.3s act plus settling time');
  assert.equal(opening.starts[0][0] / 60, 4.9);
  assert.deepEqual(opening.performances[0], { emote: 'hop', ticks: EMOTES.hop.ticks }, 'opening chooses a naturally short full-length act');
  assert.equal(observe(42, 'sunset', 12).starts[0][0], 6 * 60);
  assert.equal(observe(7, 'sunset', 16).starts[0][0], 12.8 * 60, 'the first long walk is not interrupted');
  const game = createGame(7);
  for (let i = 0; i < 23 * 60; i++) advanceGame(game, STEP_SECONDS);
  assert.equal(game.world.actor.state, 'idle');
  assert.equal(game.world.actor.stateTicks, 143);
  assert.equal(game.world.actor.durationTicks, 405);
  assert.equal(requestCall(game), true, 'the existing 23s call regression remains meaningful');
});

test('emotes fit existing idle durations, clean up at their end, and leave the base schedule/RNG unchanged', () => {
  for (const mood of moods) {
    const world = createWorld(42, undefined, mood), quiet = createWorld(42, undefined, mood);
    quiet.actor.emoteAllowedAtTick = Infinity;
    quiet.presentationState = 12345;
    let performances = 0, cleanEnds = 0;
    for (let i = 0; i < 1800 * 60; i++) {
      const previous = world.actor.emote;
      tick(world); tick(quiet);
      if (world.actor.emote && !previous) {
        performances++;
        assert.ok(world.actor.emoteTicks >= 78);
        assert.ok(world.actor.emoteTicks >= Math.ceil(EMOTES[world.actor.emote].ticks * .75), 'authored speed floor');
        assert.ok(world.actor.emoteTicks <= EMOTES[world.actor.emote].ticks);
        assert.ok(world.actor.emoteStartStateTick + world.actor.emoteTicks + 12 <= world.actor.durationTicks);
        assert.equal(activeEmote(world.actor).progress, 0);
      }
      if (previous && !world.actor.emote) { cleanEnds++; assertClean(world.actor); }
      assert.deepEqual(baseActor(world.actor), baseActor(quiet.actor));
      assert.equal(world.randomState, quiet.randomState);
    }
    assert.ok(performances > 30 && cleanEnds > 30);
  }
});

test('sleep pauses the awake cooldown, cancels stale acts, and waking does not burst', () => {
  const world = createWorld(42);
  Object.assign(world.actor, {
    state: 'sleep', stateTicks: 0, durationTicks: 120, emote: 'hop', emoteTicks: 78,
    emoteStartStateTick: 0, emoteAllowedAtTick: 300, walkStyle: 'skip',
  });
  const presentation = world.presentationState;
  tick(world, 120);
  assert.equal(world.actor.state, 'idle');
  assertClean(world.actor);
  assert.equal(world.actor.walkStyle, 'normal');
  assert.equal(world.actor.emoteAllowedAtTick, 420);
  assert.equal(world.presentationState, presentation, 'sleep and a not-yet-due wake draw no cosmetic random values');
  // Hold this test idle open, keeping the full 300 awake ticks of remaining cooldown.
  world.actor.durationTicks = 1200;
  tick(world, 299); assertClean(world.actor);
  tick(world);
  assert.ok(activeEmote(world.actor));
  assert.equal(activeEmote(world.actor).progress, 0);
});

test('walk/turn/sleep never perform and all transitions remove stale cosmetic fields', () => {
  for (const state of ['walk', 'turn', 'sleep']) {
    const world = createWorld(7);
    Object.assign(world.actor, {
      state, stateTicks: 0, durationTicks: 120, emote: 'daydream', emoteTicks: 240,
      emoteStartStateTick: 12, emoteAllowedAtTick: 0, walkTarget: null, walkStyle: 'skip',
    });
    tick(world, 30);
    assert.equal(world.actor.state, state);
    assertClean(world.actor);
    if (state !== 'walk') assert.equal(world.actor.walkStyle, 'normal');
  }
  const gaze = createWorld(7);
  Object.assign(gaze.actor, {
    state: 'walk', stateTicks: 0, durationTicks: 120, walkTarget: gaze.actor.x,
    walkStyle: 'skip', emote: 'hop', emoteTicks: 78, emoteStartStateTick: 0, emoteAllowedAtTick: 1000,
  });
  tick(gaze);
  assert.equal(gaze.actor.state, 'idle');
  assert.equal(gaze.actor.walkStyle, 'normal');
  assertClean(gaze.actor);
});

test('due acts wait for enough idle room without drawing RNG or lengthening a short idle', () => {
  const world = createWorld(7);
  Object.assign(world.actor, { stateTicks: 100, durationTicks: 180, emoteAllowedAtTick: 0 });
  const presentation = world.presentationState, base = world.randomState;
  tick(world, 60);
  assert.equal(world.actor.durationTicks, 180);
  assert.equal(world.actor.stateTicks, 160);
  assertClean(world.actor);
  assert.equal(world.presentationState, presentation);
  assert.equal(world.randomState, base);
});

function fittingFixture(bag, availableTicks, lastEmote = null) {
  const world = createWorld(7);
  world.emoteBag = [...bag];
  Object.assign(world.actor, {
    stateTicks: 0, durationTicks: availableTicks + 12 + 1,
    emoteAllowedAtTick: 0, lastEmote,
  });
  return world;
}

test('each act respects its 75% authored duration floor and waits instead of becoming hurried', () => {
  for (const [id, definition] of Object.entries(EMOTES)) {
    const minimum = Math.max(78, Math.ceil(definition.ticks * .75));
    const tooShort = fittingFixture([id], minimum - 1);
    const random = tooShort.presentationState;
    tick(tooShort);
    assertClean(tooShort.actor);
    assert.deepEqual(tooShort.emoteBag, [id], `${id}: an unfitted act stays in this bag`);
    assert.equal(tooShort.presentationState, random, `${id}: waiting never rerolls or refills`);
    assert.equal(tooShort.actor.durationTicks, minimum + 12, `${id}: no idle extension`);
    const fitted = fittingFixture([id], minimum);
    tick(fitted);
    assert.equal(fitted.actor.emote, id);
    assert.equal(fitted.actor.emoteTicks, minimum);
    const full = fittingFixture([id], definition.ticks);
    tick(full);
    assert.equal(full.actor.emote, id);
    assert.equal(full.actor.emoteTicks, definition.ticks, `${id}: enough room preserves authored duration`);
  }
});

test('fitting prefers a full act, retains deferred long acts, and forbids repeats after reordering', () => {
  const fullPriority = fittingFixture(['daydream', 'hop'], 190);
  tick(fullPriority);
  assert.equal(fullPriority.actor.emote, 'hop', 'full hop takes precedence over a shortened daydream');
  assert.equal(fullPriority.actor.emoteTicks, EMOTES.hop.ticks);
  assert.deepEqual(fullPriority.emoteBag, ['daydream'], 'deferred daydream cannot be replaced by a fresh bag');
  const fullLong = fittingFixture(['daydream', 'hop'], 240);
  tick(fullLong);
  assert.equal(fullLong.actor.emote, 'daydream', 'the shuffled priority holds when its full act fits');
  const seam = fittingFixture(['daydream', 'hop', 'giggle'], 84, 'hop');
  tick(seam);
  assert.equal(seam.actor.emote, 'giggle', 'fitting may not choose the last act even if it fits fully');
  assert.deepEqual(seam.emoteBag, ['daydream', 'hop']);
});

test('thirty-minute speed-floor measurements cover every act and retain mostly authored durations', t => {
  for (const mood of moods) {
    const acts = seeds.flatMap(seed => observe(seed, mood).performances);
    let full = 0, minimumRatio = 1;
    for (const act of acts) {
      const authored = EMOTES[act.emote].ticks;
      assert.ok(act.ticks >= Math.ceil(authored * .75), `${mood}/${act.emote}: ${act.ticks}/${authored}`);
      if (act.ticks === authored) full++;
      minimumRatio = Math.min(minimumRatio, act.ticks / authored);
    }
    assert.equal(new Set(acts.map(act => act.emote)).size, 6);
    assert.ok(full / acts.length >= .8, `${mood}: most acts keep their full authored duration`);
    t.diagnostic(`${mood}: ${full}/${acts.length} acts full-length (${(100 * full / acts.length).toFixed(1)}%); shortest duration ${(100 * minimumRatio).toFixed(1)}% of authored`);
  }
});

test('base and presentation random streams advance only on behavior/performance transitions', () => {
  const world = createWorld(42);
  let acts = 0, styledWalks = 0;
  for (let i = 0; i < 1800 * 60; i++) {
    const { stateTicks, emote } = world.actor;
    const random = world.randomState, presentation = world.presentationState;
    tick(world);
    const transitioned = world.actor.stateTicks <= stateTicks;
    const started = !emote && world.actor.emote !== null;
    if (started) acts++;
    if (transitioned && world.actor.state === 'walk' && world.actor.walkStyle === 'skip') styledWalks++;
    if (world.randomState !== random) assert.ok(transitioned, 'base RNG is behavior-transition-only');
    if (world.presentationState !== presentation) assert.ok(transitioned || started, 'cosmetic RNG is never sampled for an ordinary tick');
  }
  assert.ok(acts > 30 && styledWalks > 0);
});

test('activeEmote progress is offset within idle and reading it is pure and random-free', () => {
  const world = createWorld(7);
  Object.assign(world.actor, { stateTicks: 310, emote: 'sway', emoteTicks: 120, emoteStartStateTick: 250 });
  const before = structuredClone(world), random = Math.random;
  try {
    Math.random = () => { throw new Error('render observation may not draw randomness'); };
    for (let i = 0; i < 100; i++) assert.deepEqual(activeEmote(world.actor), { emote: 'sway', progress: .5 });
    assert.deepEqual(world, before);
    world.actor.stateTicks = 249; assert.equal(activeEmote(world.actor), null);
    world.actor.stateTicks = 370; assert.equal(activeEmote(world.actor), null);
    world.actor.stateTicks = 310; world.actor.state = 'walk'; assert.equal(activeEmote(world.actor), null);
  } finally { Math.random = random; }
});

test('mood changes order and pace, but not six-act coverage, and night skips less often', () => {
  const sequences = moods.map(mood => observe(42, mood, 1800).starts.map(([, id]) => id));
  assert.notDeepEqual(sequences[0].slice(0, 6), sequences[1].slice(0, 6));
  assert.notDeepEqual(sequences[0].slice(0, 6), sequences[2].slice(0, 6));
  const count = mood => {
    const world = createWorld(42, undefined, mood);
    let walks = 0, skips = 0;
    for (let i = 0; i < 1800 * 60; i++) {
      const previousAge = world.actor.stateTicks;
      tick(world);
      if (world.actor.state === 'walk' && world.actor.stateTicks <= previousAge && world.actor.walkTarget === null) {
        walks++; if (world.actor.walkStyle === 'skip') skips++;
      }
    }
    return skips / walks;
  };
  assert.ok(count('night') < count('sunset'));
});
