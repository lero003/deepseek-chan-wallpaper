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
