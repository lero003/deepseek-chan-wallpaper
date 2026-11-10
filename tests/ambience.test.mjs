import assert from 'node:assert/strict';
import test from 'node:test';
import { ambienceQuads, MAX_AMBIENCE_QUADS } from '../src/render/ambience.ts';
import { motesFor } from '../src/render/scene-plan.ts';

const WATER = { left: 115, right: 349, top: 120, bottom: 158 };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SCENE = { width: 480, height: 270 };

function motes(count, seed = 0) {
  return Array.from({ length: count }, (_, index) => ({
    x: 107 + ((index * 137 + seed * 31) % 274),
    y: 75 + ((index * 61 + seed * 17) % 110),
    speed: 0.7 + ((index * 13) % 13) / 10,
    phase: ((index * 29) % 360) / 360 * Math.PI * 2,
  }));
}

/** Geometry lets the tests classify groups without duplicating the private palette. */
const isGlint = (quad) => quad.height === 1 && quad.width >= 2;
const isBirdPixel = (quad) => quad.height === 1 && quad.width === 1 && quad.alpha > 0.5;
const isLampGlow = (quad) => quad.width >= 5 && quad.height >= 3;

function assertQuadInvariants(quads, label) {
  for (const quad of quads) {
    assert.ok(Number.isInteger(quad.x), `${label}: x is not an integer`);
    assert.ok(Number.isInteger(quad.y), `${label}: y is not an integer`);
    assert.ok(Number.isInteger(quad.width), `${label}: width is not an integer`);
    assert.ok(Number.isInteger(quad.height), `${label}: height is not an integer`);
    assert.ok(quad.width >= 1 && quad.height >= 1, `${label}: non-positive size`);
    assert.ok(quad.alpha > 0 && quad.alpha <= 1, `${label}: alpha outside (0,1]`);
    assert.match(quad.color, HEX_COLOR, `${label}: color is not #rrggbb`);
    assert.ok(quad.x >= 0 && quad.x + quad.width <= SCENE.width, `${label}: quad leaves the scene horizontally`);
    assert.ok(quad.y >= 0 && quad.y + quad.height <= SCENE.height, `${label}: quad leaves the scene vertically`);
  }
}

test('the same inputs always produce deeply equal output', () => {
  const field = motesFor(20261111);
  const appearance = { water: WATER };
  const first = ambienceQuads(12.5, field, appearance);
  const second = ambienceQuads(12.5, field, appearance);
  assert.deepEqual(first, second);
  // Same values from a different array instance must not change the frame.
  assert.deepEqual(second, ambienceQuads(12.5, field.map((mote) => ({ ...mote })), { water: { ...WATER } }));
  assert.ok(first.length > 0);
});

test('motes and appearance are never mutated', () => {
  const field = Object.freeze(motes(12).map((mote) => Object.freeze(mote)));
  const appearance = Object.freeze({ water: Object.freeze({ ...WATER }) });
  const fieldBefore = structuredClone(field);
  const appearanceBefore = structuredClone(appearance);
  ambienceQuads(31.75, field, appearance);
  assert.deepEqual(field, fieldBefore);
  assert.deepEqual(appearance, appearanceBefore);
});

test('quads are integer, in-scene, hex-colored, and alpha stays within (0,1]', () => {
  const field = motesFor(4242);
  for (const seconds of [0, 0.1, 1, 2, 5, 7.25, 12, 30, 44.44, 60, 120, 3599, -3]) {
    const quads = ambienceQuads(seconds, field, { water: WATER });
    assertQuadInvariants(quads, `t=${seconds}`);
  }
});

test('never exceeds the 140 quad budget, even with a huge mote field', () => {
  const huge = motes(500);
  for (const seconds of [0, 16, 30, 60]) {
    const quads = ambienceQuads(seconds, huge, { water: WATER });
    assert.ok(quads.length <= MAX_AMBIENCE_QUADS, `t=${seconds}: ${quads.length} quads`);
    assert.equal(MAX_AMBIENCE_QUADS, 140);
  }
});

test('sea glints stay inside the water rect when one is provided', () => {
  // Push the water rect far below the lamps so the only quads in that band are glints.
  const water = { left: 10, right: 70, top: 200, bottom: 212 };
  const quads = ambienceQuads(0, [], { water });
  const glints = quads.filter((quad) => quad.y >= 190);
  assert.ok(glints.length >= 6, `expected several glints, got ${glints.length}`);
  for (const glint of glints) {
    assert.ok(isGlint(glint), 'water-band quad should be a 1px-tall glint');
    assert.ok(glint.x >= water.left && glint.x + glint.width <= water.right, 'glint escapes water x range');
    assert.ok(glint.y >= water.top && glint.y + glint.height <= water.bottom, 'glint escapes water y range');
  }
});

test('glints lean toward the painted sun column', () => {
  const glints = ambienceQuads(0, [], { water: WATER }).filter(isGlint);
  assert.ok(glints.length >= 10);
  const nearColumn = glints.filter((glint) => glint.x >= 215 && glint.x <= 325).length;
  assert.ok(nearColumn / glints.length >= 0.5, `only ${nearColumn}/${glints.length} glints near the sun path`);
});

test('the ambient field changes over time', () => {
  const field = motesFor(7);
  assert.notDeepEqual(ambienceQuads(0, field, { water: WATER }), ambienceQuads(10, field, { water: WATER }));
  assert.notDeepEqual(ambienceQuads(2, [], { water: WATER }), ambienceQuads(5, [], { water: WATER }));
});

test('no appearance or water is handled gracefully', () => {
  for (const appearance of [undefined, {}, { water: undefined }]) {
    const quads = ambienceQuads(5, [], appearance);
    assert.ok(Array.isArray(quads));
    assertQuadInvariants(quads, 'no-water');
    assert.ok(quads.every((quad) => quad.y < 150), 'no sea glints without a water rect');
    assert.ok(quads.some(isLampGlow), 'lamp glow still animates without water');
  }
});

test('weird seconds never leak NaN and non-finite seconds are stable', () => {
  const field = motesFor(99);
  const stable = ambienceQuads(0, field, { water: WATER });
  for (const seconds of [Number.NaN, Infinity, -Infinity]) {
    const quads = ambienceQuads(seconds, field, { water: WATER });
    assert.deepEqual(quads, stable, `${seconds} should behave like t=0`);
  }
  for (const seconds of [1e9, -1e9]) {
    const quads = ambienceQuads(seconds, field, { water: WATER });
    assertQuadInvariants(quads, `t=${seconds}`);
    for (const quad of quads) {
      assert.ok(Number.isFinite(quad.x) && Number.isFinite(quad.y), 'non-finite coordinate');
      assert.ok(Number.isFinite(quad.alpha), 'non-finite alpha');
    }
  }
});

test('lamp glow stays subtle and only pulses around the two lamps', () => {
  for (const seconds of [0, 2, 4, 6, 8]) {
    const glows = ambienceQuads(seconds, [], { water: WATER }).filter(isLampGlow);
    assert.ok(glows.length >= 8, `expected stacked glow around both lamps, got ${glows.length}`);
    for (const glow of glows) {
      assert.ok(glow.alpha <= 0.08, `lamp glow alpha ${glow.alpha} is not subtle`);
    }
    const hanging = glows.filter((glow) => glow.x < 240);
    const desk = glows.filter((glow) => glow.x >= 240);
    assert.ok(hanging.length >= 4 && desk.length >= 4, 'both lamps should glow');
  }
});

test('the bird is sparse, stays in the window sky, and never sits on a mullion', () => {
  const times = [];
  for (let seconds = 0; seconds < 236; seconds += 0.5) {
    const birds = ambienceQuads(seconds, [], { water: WATER }).filter(isBirdPixel);
    if (birds.length === 0) continue;
    times.push(seconds);
    for (const pixel of birds) {
      assert.ok(pixel.x >= 150 && pixel.x <= 340, `bird x=${pixel.x} left the window sky`);
      assert.ok(pixel.y >= 45 && pixel.y <= 75, `bird y=${pixel.y} left the sky band`);
      assert.ok(!(pixel.x >= 196 && pixel.x <= 201) && !(pixel.x >= 288 && pixel.x <= 293),
        `bird pixel ${pixel.x} is drawn over a window mullion`);
    }
  }
  const visibleRatio = times.length / (236 / 0.5);
  assert.ok(visibleRatio > 0.1 && visibleRatio < 0.35, `bird visible ${visibleRatio.toFixed(2)} of the time`);
  // One episode crosses while the QA still at t=30 is taken; most seconds have no bird.
  assert.ok(times.includes(30));
  assert.ok(!times.includes(5));
  assert.ok(!times.includes(120));
});

test('the calm parts stay translucent; only the tiny bird silhouette is near-opaque', () => {
  for (const seconds of [0, 3, 8, 30, 60, 120]) {
    const quads = ambienceQuads(seconds, motesFor(11), { water: WATER });
    for (const quad of quads) {
      if (isBirdPixel(quad)) continue;
      assert.ok(quad.alpha <= 0.72, `ambient quad alpha ${quad.alpha} is too strong for a calm scene`);
    }
  }
});
