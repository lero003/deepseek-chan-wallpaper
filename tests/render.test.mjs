import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { frameAt, parseAtlas } from '../src/render/atlas.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { viewportFor } from '../src/render/viewport.ts';
import { createWorld } from '../src/world/world.ts';

const atlasData = JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8'));
const atlas = parseAtlas(atlasData);

test('the atlas assigns all sixteen frames exactly once with one foot anchor', () => {
  assert.equal(atlas.frameWidth * atlas.columns, 192);
  assert.equal(atlas.frameHeight * atlas.rows, 256);
  assert.deepEqual(atlas.anchor, { x: 24, y: 60 });
  const frames = Object.values(atlas.animations).flatMap((animation) => animation.frames);
  assert.deepEqual(frames.sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index));
});

test('frame timings and wrapping match the specification', () => {
  assert.equal(frameAt(atlas, 'idle', 0), 0);
  assert.equal(frameAt(atlas, 'idle', 0.32), 1);
  assert.equal(frameAt(atlas, 'idle', 1.28), 0);
  assert.equal(frameAt(atlas, 'walk', 0.12), 5);
  assert.equal(frameAt(atlas, 'walk', 0.60), 9);
  assert.equal(frameAt(atlas, 'turn', 0.25), 11);
  assert.equal(frameAt(atlas, 'sleep', 1.5), 15);
  assert.equal(frameAt(atlas, 'sleep', -10), 12);
});

test('corrupt atlases fail before any sprite drawing', () => {
  for (const mutate of [
    (data) => { data.anchor.x = 100; },
    (data) => { data.rows = 5; },
    (data) => { data.animations.walk.frames.pop(); },
    (data) => { data.animations.idle.frames[0] = 5; },
    (data) => { data.animations.sleep.frameDurationMs = 0; },
    (data) => { data.animations.turn.frames[0] = 16; },
  ]) {
    const copy = structuredClone(atlasData); mutate(copy);
    assert.throws(() => parseAtlas(copy));
  }
});

test('16:9, 16:10, ultra-wide, and portrait views retain the entire safe area', () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [3440, 1440], [390, 680], [280, 400]]) {
    const viewport = viewportFor(width, height);
    assert.ok(viewport.originX >= 0 && viewport.originY >= 0);
    assert.ok(viewport.originX + 480 <= viewport.width);
    assert.ok(viewport.originY + 270 <= viewport.height);
    assert.ok(Math.abs(viewport.width / viewport.height - width / height) < 0.006);
  }
  assert.deepEqual(viewportFor(0, 0), { width: 480, height: 270, originX: 0, originY: 0 });
  assert.deepEqual(viewportFor(1920, 1080), { width: 480, height: 270, originX: 0, originY: 0 });
  assert.deepEqual(viewportFor(1440, 900), { width: 480, height: 300, originX: 0, originY: 15 });
});

function fakeCanvas() {
  const calls = [];
  const context = {
    calls,
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    save(...args) { calls.push(['save', ...args]); },
    restore(...args) { calls.push(['restore', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); },
    scale(...args) { calls.push(['scale', ...args]); },
    imageSmoothingEnabled: true,
  };
  return { width: 0, height: 0, getContext: () => context, context };
}

test('rendering is replayable, pixelated, and cannot mutate a frozen world', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try {
    const canvas = fakeCanvas();
    const world = createWorld(431);
    world.actor.facing = -1;
    const original = structuredClone(world);
    Object.freeze(world.actor); Object.freeze(world.range); Object.freeze(world);
    const images = { background: { naturalWidth: 480, naturalHeight: 270 }, character: { naturalWidth: 192, naturalHeight: 256 } };
    const renderer = new SceneRenderer(canvas, images, atlas, world.seed);
    renderer.resize(viewportFor(1440, 900));
    renderer.draw(world);
    const firstPass = [...canvas.context.calls];
    canvas.context.calls.length = 0;
    renderer.draw(world);
    assert.deepEqual(canvas.context.calls, firstPass);
    assert.deepEqual(world, original);
    assert.equal(canvas.context.imageSmoothingEnabled, false);
    assert.ok(firstPass.some((call) => call[0] === 'scale' && call[1] === -1));
    assert.ok(firstPass.some((call) => call[0] === 'translate' && call[2] === 251));
  } finally { globalThis.document = previousDocument; }
});

test('background or sprite failure still allows a static fallback', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try {
    const canvas = fakeCanvas();
    const renderer = new SceneRenderer(canvas, { background: null, character: null }, atlas, 1);
    renderer.resize(viewportFor(1920, 1080));
    renderer.draw(createWorld(1), false);
    assert.equal(canvas.context.calls.filter((call) => call[0] === 'drawImage').length, 1);
    assert.throws(() => new SceneRenderer({ getContext: () => null }, { background: null, character: null }, atlas, 1));
    assert.throws(() => new SceneRenderer(canvas, { background: null, character: { naturalWidth: 1, naturalHeight: 1 } }, atlas, 1));
  } finally { globalThis.document = previousDocument; }
});
