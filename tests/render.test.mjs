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

test('wide screens use one whole-number pixel scale instead of a 3/4-pixel dither', () => {
  const wide = viewportFor(2048, 864); // the user's 2048×864 ultrawide display
  assert.equal(wide.scale, 3);
  assert.deepEqual([wide.width, wide.height, wide.originX, wide.originY], [683, 288, 101, 9]);
  assert.deepEqual([wide.offsetX, wide.offsetY], [-1, 0]);
  assert.ok(wide.width * wide.scale >= 2048 - 1 && wide.width * wide.scale <= 2048 + 2);

  const hd = viewportFor(1920, 1080);
  assert.deepEqual([hd.scale, hd.width, hd.height, hd.originX, hd.originY], [4, 480, 270, 0, 0]);
  const laptop = viewportFor(1512, 982);
  assert.deepEqual([laptop.scale, laptop.width, laptop.height, laptop.originX, laptop.originY], [3, 504, 328, 12, 29]);
  const hd10 = viewportFor(1440, 900);
  assert.deepEqual([hd10.scale, hd10.width, hd10.height, hd10.originX, hd10.originY], [3, 480, 300, 0, 15]);
  const ultrawide = viewportFor(3440, 1440);
  assert.deepEqual([ultrawide.scale, ultrawide.width, ultrawide.height], [5, 688, 288]);
  const preview = viewportFor(1000, 680);
  assert.deepEqual([preview.scale, preview.width, preview.height], [2, 500, 340]);
});

test('every view keeps the full 480×270 safe area and a whole scale where two pixels fit', () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [3440, 1440], [2048, 864], [1512, 982], [1000, 680], [720, 470], [390, 680], [280, 400]]) {
    const viewport = viewportFor(width, height);
    assert.ok(viewport.originX >= 0 && viewport.originY >= 0);
    assert.ok(viewport.originX + 480 <= viewport.width);
    assert.ok(viewport.originY + 270 <= viewport.height);
    assert.ok(Math.abs(viewport.width / viewport.height - width / height) < 0.006);
    assert.ok(viewport.width * viewport.scale + Math.abs(viewport.offsetX) >= width - 1);
    assert.ok(viewport.height * viewport.scale + Math.abs(viewport.offsetY) >= height - 1);
    if (width / 480 >= 2 && height / 270 >= 2) assert.equal(viewport.scale, Math.floor(Math.min(width / 480, height / 270)));
  }
  const tiny = viewportFor(720, 470);
  assert.equal(tiny.scale, 1.5, 'a small preview fits fractionally rather than shrinking the room');
  assert.deepEqual([tiny.width, tiny.height, tiny.originY, tiny.offsetY], [480, 314, 22, -1]);
  assert.deepEqual(viewportFor(0, 0), { width: 480, height: 270, originX: 0, originY: 0, scale: 1, pixelWidth: 480, pixelHeight: 270, offsetX: 0, offsetY: 0 });
});

function fakeCanvas() {
  const calls = [];
  const context = {
    calls,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillStyle: '',
    font: '',
    textBaseline: '',
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
    save(...args) { calls.push(['save', ...args]); },
    restore(...args) { calls.push(['restore', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); },
    scale(...args) { calls.push(['scale', ...args]); },
    rotate(...args) { calls.push(['rotate', ...args]); },
    setTransform(...args) { calls.push(['setTransform', ...args]); },
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
    renderer.resize(1440, 900);
    renderer.draw(world);
    const firstPass = [...canvas.context.calls];
    canvas.context.calls.length = 0;
    renderer.draw(world);
    assert.deepEqual(canvas.context.calls, firstPass);
    assert.deepEqual(world, original);
    assert.equal(canvas.context.imageSmoothingEnabled, false);
    assert.deepEqual([canvas.width, canvas.height], [1440, 900]);
    assert.ok(firstPass.some((call) => call[0] === 'scale' && call[1] === -1));
    assert.ok(firstPass.some((call) => call[0] === 'translate' && call[2] === 251));
    assert.ok(firstPass.some((call) => call[0] === 'setTransform' && call[1] === 3 && call[5] === 0), 'the accepted scene is drawn at a whole 3x scale');
  } finally { globalThis.document = previousDocument; }
});

test('background or sprite failure still allows a static fallback', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try {
    const canvas = fakeCanvas();
    const renderer = new SceneRenderer(canvas, { background: null, character: null }, atlas, 1);
    renderer.resize(1920, 1080);
    renderer.draw(createWorld(1), false);
    assert.equal(canvas.context.calls.filter((call) => call[0] === 'drawImage').length, 1);
    assert.throws(() => new SceneRenderer({ getContext: () => null }, { background: null, character: null }, atlas, 1));
    assert.throws(() => new SceneRenderer(canvas, { background: null, character: { naturalWidth: 1, naturalHeight: 1 } }, atlas, 1));
  } finally { globalThis.document = previousDocument; }
});

test('the wallpaper matte is composited at its approved room offset instead of stretching edges', () => {
  const previousDocument = globalThis.document;
  const created = [];
  globalThis.document = { createElement: () => { const canvas = fakeCanvas(); created.push(canvas); return canvas; } };
  try {
    const canvas = fakeCanvas();
    const matte = { naturalWidth: 1024, naturalHeight: 576 };
    const background = { naturalWidth: 480, naturalHeight: 270 };
    const character = { naturalWidth: 192, naturalHeight: 256 };
    const appearance = { matte: { width: 1024, height: 576, roomX: 272, roomY: 153 } };
    const renderer = new SceneRenderer(canvas, { background, character, matte }, atlas, 1, appearance);
    renderer.resize(2048, 864);
    const backdrop = created[0];
    assert.ok(backdrop, 'the renderer creates a cached backdrop canvas');
    const draw = backdrop.context.calls.find((call) => call[0] === 'drawImage' && call[1] === matte);
    assert.ok(draw, 'the wide matte is drawn into the backdrop');
    assert.deepEqual([draw[2], draw[3]], [-171, -144]);
    assert.throws(() => new SceneRenderer(fakeCanvas(), { background: null, character: null, matte }, atlas, 1,
      { matte: { width: 1024, height: 576, roomX: 560, roomY: 153 } }), 'a matte without room for the 480×270 scene is rejected');
  } finally { globalThis.document = previousDocument; }
});

test('selectable backgrounds swap the room art and its matte, not the character', () => {
  const previousDocument = globalThis.document;
  const created = [];
  globalThis.document = { createElement: () => { const canvas = fakeCanvas(); created.push(canvas); return canvas; } };
  try {
    const canvas = fakeCanvas();
    const background = { naturalWidth: 480, naturalHeight: 270 };
    const matte = { naturalWidth: 1024, naturalHeight: 576 };
    const nightBackground = { naturalWidth: 480, naturalHeight: 270 };
    const nightMatte = { naturalWidth: 1024, naturalHeight: 576 };
    const character = { naturalWidth: 192, naturalHeight: 256 };
    const appearance = { matte: { width: 1024, height: 576, roomX: 272, roomY: 153 } };
    const renderer = new SceneRenderer(canvas,
      { background, character, matte, variants: [{ background: nightBackground, matte: nightMatte }] }, atlas, 1, appearance);
    assert.equal(renderer.variantCount, 2);
    assert.equal(renderer.selectedVariant, 0);
    renderer.resize(2048, 864);
    const backdrop = created[0];
    assert.ok(backdrop.context.calls.some((call) => call[0] === 'drawImage' && call[1] === matte));
    backdrop.context.calls.length = 0;
    renderer.setVariant(1);
    assert.equal(renderer.selectedVariant, 1);
    assert.ok(backdrop.context.calls.some((call) => call[0] === 'drawImage' && call[1] === nightMatte), 'the night matte replaces the sunset matte');
    renderer.draw(createWorld(1));
    assert.throws(() => renderer.setVariant(2));
    assert.throws(() => renderer.setVariant(-1));
    const mixed = new SceneRenderer(fakeCanvas(), {
      background: null, character: null,
      variants: [{ background: { naturalWidth: 10, naturalHeight: 10 }, matte: null }],
    }, atlas, 1);
    assert.equal(mixed.variantCount, 1, 'a mis-sized background is not offered');
  } finally { globalThis.document = previousDocument; }
});
