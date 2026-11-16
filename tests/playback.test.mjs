import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationLoop, FrameClock, shouldAnimate, stopNote } from '../src/app-web/playback.ts';
import { advanceWorld, createWorld } from '../src/world/world.ts';

function scheduler() {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  return {
    now: () => now,
    request(callback, delay) { const id = ++nextId; pending.set(id, { callback, at: now + delay }); return id; },
    cancel(id) { pending.delete(id); },
    count: () => pending.size,
    advance(milliseconds) {
      const target = now + milliseconds;
      let guard = 0;
      while (pending.size) {
        const [id, task] = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
        if (task.at > target + 1e-8) break;
        if (++guard > 10000) throw new Error('Unbounded timer loop.');
        pending.delete(id);
        now = task.at;
        task.callback();
      }
      now = target;
    },
    jump(milliseconds) { now += milliseconds; },
    flushNext() {
      const [id, task] = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
      pending.delete(id); task.callback();
    },
  };
}

const ready = { ready: true, paused: false, hidden: false, suspended: false, reducedMotion: false, still: false, dialogOpen: false };

test('each independent playback gate suspends animation', () => {
  assert.equal(shouldAnimate(ready), true);
  assert.equal(shouldAnimate({ ...ready, ready: false }), false);
  for (const key of ['paused', 'hidden', 'suspended', 'reducedMotion', 'still', 'dialogOpen']) {
    assert.equal(shouldAnimate({ ...ready, [key]: true }), false, key);
  }
});

test('the frame clock drops resume gaps, backwards time, and invalid time', () => {
  const clock = new FrameClock();
  assert.equal(clock.sample(100), 0);
  assert.equal(clock.sample(133), 0.033);
  assert.equal(clock.sample(3600000), 0);
  assert.equal(clock.sample(3600033), 0.033);
  assert.equal(clock.sample(3), 0);
  assert.equal(clock.sample(NaN), 0);
  assert.equal(clock.sample(5), 0);
  clock.reset();
  assert.equal(clock.sample(800), 0);
});

test('the loop owns at most one timer and cancels it on pause/dispose', () => {
  const timer = scheduler();
  const frames = [];
  const loop = new AnimationLoop(timer, (delta) => frames.push(delta));
  loop.setRunning(true);
  loop.setRunning(true);
  assert.deepEqual(frames, [0]);
  assert.equal(timer.count(), 1);
  timer.advance(1000);
  assert.ok(frames.length >= 30 && frames.length <= 31);
  assert.equal(timer.count(), 1);
  loop.setRunning(false);
  const stopped = frames.length;
  assert.equal(timer.count(), 0);
  timer.advance(3600000);
  assert.equal(frames.length, stopped);
  loop.setRunning(true);
  assert.equal(frames.at(-1), 0);
  assert.equal(timer.count(), 1);
  loop.dispose();
  assert.equal(timer.count(), 0);
});

test('15fps reduces callbacks without changing simulated seconds', () => {
  const run = (fps) => {
    const timer = scheduler();
    const world = createWorld(177);
    let count = 0;
    const loop = new AnimationLoop(timer, (delta) => { count += 1; advanceWorld(world, delta); });
    loop.setFrameRate(fps);
    loop.setRunning(true);
    timer.advance(10000);
    loop.dispose();
    return { world, count };
  };
  const low = run(15);
  const normal = run(30);
  assert.ok(Math.abs(low.world.tick - normal.world.tick) <= 4);
  assert.ok(low.count <= 151);
  assert.ok(normal.count <= 301);
  assert.ok(normal.count > low.count * 1.9);
});

test('an unreported machine sleep does not advance a sleeping world', () => {
  const timer = scheduler();
  const world = createWorld(14);
  const loop = new AnimationLoop(timer, (delta) => advanceWorld(world, delta));
  loop.setRunning(true);
  timer.advance(1000);
  const before = structuredClone(world);
  timer.jump(1800000);
  timer.flushNext();
  assert.deepEqual(world, before);
  assert.equal(timer.count(), 1);
  loop.dispose();
});

test('changing frame rate restarts a single clock, not duplicate schedules', () => {
  const timer = scheduler();
  const frames = [];
  const loop = new AnimationLoop(timer, (delta) => frames.push(delta));
  loop.setRunning(true);
  timer.advance(300);
  loop.setFrameRate(15);
  assert.equal(timer.count(), 1);
  assert.equal(frames.at(-1), 0);
  loop.setFrameRate(15);
  assert.equal(timer.count(), 1);
  loop.dispose();
});

test('a manual pause is not lost when visibility or motion preferences change', () => {
  const conditions = { ...ready, paused: true, hidden: true };
  conditions.hidden = false;
  assert.equal(shouldAnimate(conditions), false);
  conditions.reducedMotion = true;
  conditions.reducedMotion = false;
  assert.equal(shouldAnimate(conditions), false);
});

test('the stop note is honest while loading: no resume promise before ready', () => {
  // Loading with the dialog open or a remembered pause must not promise a resume
  // that the still-disabled controls cannot deliver yet.
  assert.deepEqual(stopNote({ ...ready, ready: false, dialogOpen: true }, false), { reason: '準備中', guidance: '' });
  assert.deepEqual(stopNote({ ...ready, ready: false, paused: true }, false), { reason: '準備中', guidance: '' });
  assert.deepEqual(stopNote({ ...ready, ready: false, still: true }, false), { reason: '準備中', guidance: '' });
  // Failure and the OS motion preference still outrank everything.
  assert.match(stopNote({ ...ready, ready: false }, true).reason, /静止背景/);
  assert.match(stopNote({ ...ready, ready: false, reducedMotion: true }, false).reason, /視差効果/);
  // Once ready, the user toggles explain themselves in priority order.
  assert.match(stopNote({ ...ready, still: true, paused: true }, false).reason, /静止画/);
  assert.match(stopNote({ ...ready, paused: true, dialogOpen: true }, false).reason, /ひと休み/);
  assert.match(stopNote({ ...ready, dialogOpen: true }, false).reason, /設定を開いている/);
  assert.equal(stopNote(ready, false), null);
});
