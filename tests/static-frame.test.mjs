import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationLoop, shouldAnimate, shouldPaintFrame } from '../src/app-web/playback.ts';

test('a hidden initial/resize gets one still paint, never a running world or background timer', () => {
  const hidden = { ready: true, paused: false, hidden: true, suspended: false, reducedMotion: false, still: false, dialogOpen: false };
  let scheduled = 0, advanced = 0, painted = 0;
  const loop = new AnimationLoop({ now: () => 0, request: () => { scheduled += 1; return 1; }, cancel: () => {} }, () => { advanced += 1; });
  loop.setRunning(shouldAnimate(hidden));
  if (shouldPaintFrame(hidden, 'resize')) painted += 1;
  assert.equal(painted, 1);
  assert.equal(scheduled, 0);
  assert.equal(advanced, 0);
  assert.equal(shouldPaintFrame(hidden, 'animation'), false);
  assert.equal(shouldPaintFrame({ ...hidden, suspended: true }, 'resize'), false);
  assert.equal(shouldPaintFrame({ ...hidden, hidden: false }, 'animation'), true);
  loop.dispose();
});

test('endless retains its run while hidden/reduced-motion/still and resumes without a sleep backlog', async () => {
  const { createGame, command, advanceGame } = await import('../src/fighters/game.ts');
  const game = createGame(42); command(game, 'endless');
  const conditions = { ready: true, paused: false, hidden: false, suspended: false, reducedMotion: false, still: false, dialogOpen: false };
  let now = 0, callback = null;
  const loop = new AnimationLoop({ now: () => now, request: fn => { callback = fn; return 1; }, cancel: () => { callback = null; } }, delta => advanceGame(game, delta));
  loop.setRunning(true); now += 100; callback();
  for (const reason of ['hidden', 'reducedMotion', 'still', 'paused', 'suspended', 'dialogOpen']) {
    conditions[reason] = true; loop.setRunning(shouldAnimate(conditions));
    command(game, 'cancelCall'); const before = structuredClone(game);
    assert.equal(callback, null); now += 3600000;
    conditions[reason] = false; loop.setRunning(shouldAnimate(conditions));
    assert.deepEqual(game, before, `${reason}: no reset or replay of the sleep delta`);
    now += 100; callback(); assert.equal(game.tick, before.tick + 6);
    assert.equal(game.mode, 'endless'); assert.equal(game.outcome, 'none');
  }
  loop.dispose();
});
