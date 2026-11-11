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

// --- Per-background profiles (night / rain). Sunset must stay byte-identical. ---

const NIGHT = { ambience: { mood: 'night', bird: false, shootingStar: true, lampScale: 1.15 } };
const RAIN = { ambience: { mood: 'rain', bird: false, rain: true, lampScale: 1.1 } };
const isRainStreak = (quad) => quad.width === 1 && quad.height >= 3;

test('no profile and an explicit sunset profile produce identical frames', () => {
  const field = motesFor(77);
  for (const seconds of [0, 5, 30, 60, 210.9, 400]) {
    const implicit = ambienceQuads(seconds, field, { water: WATER });
    const explicit = ambienceQuads(seconds, field, { water: WATER, ambience: { mood: 'sunset' } });
    assert.deepEqual(implicit, explicit, `sunset default drifted at t=${seconds}`);
  }
});

test('night swaps to a cool palette, drops the bird, and keeps the field deterministic', () => {
  const field = motesFor(5);
  const night = ambienceQuads(30, field, { water: WATER, ...NIGHT });
  const sunset = ambienceQuads(30, field, { water: WATER });
  assert.notDeepEqual(night, sunset);
  assert.ok(night.some((quad) => quad.color === '#dfe4f2'), 'night uses cool moonlit motes');
  assert.ok(!night.some((quad) => quad.color === '#f9edcf'), 'no warm sunset motes at night');
  assert.ok(!night.some(isBirdPixel), 'the bird does not fly at night');
  assert.deepEqual(night, ambienceQuads(30, field.map((m) => ({ ...m })), { water: { ...WATER }, ...NIGHT }));
  for (const quad of night) assertQuadInvariants([quad], 'night');
});

test('the night shooting star is rare, stays in the upper pane, and avoids mullions', () => {
  const starColor = '#f5f7ff';
  const at = (seconds) => ambienceQuads(seconds, [], { water: WATER, ...NIGHT }).filter((quad) => quad.color === starColor);
  assert.ok(at(210.9).length >= 1, 'a shooting star is present mid-episode');
  assert.equal(at(100).length, 0, 'no star outside the episode');
  assert.equal(at(211.9).length, 0, 'the star has finished after 1.8s');
  let visible = 0;
  for (let seconds = 0; seconds < 860; seconds += 0.25) {
    const star = at(seconds);
    if (star.length === 0) continue;
    visible += 1;
    for (const quad of star) {
      assert.ok(quad.y >= 30 && quad.y <= 86, `star left the upper pane at y=${quad.y}`);
      assert.ok(quad.x >= 110 && quad.x <= 350, `star left the window at x=${quad.x}`);
      assert.ok(!(quad.x >= 196 && quad.x <= 201) && !(quad.x >= 288 && quad.x <= 293), 'star drawn over a mullion');
    }
  }
  const ratio = visible / (860 / 0.25);
  assert.ok(ratio < 0.02, `shooting star should be rare, visible ${ratio.toFixed(4)} of the time`);
});

test('rain falls inside the window panes, never across the transom or on a mullion', () => {
  const quads = ambienceQuads(12, motesFor(3), { water: WATER, ...RAIN });
  const streaks = quads.filter(isRainStreak);
  assert.ok(streaks.length >= 12, `expected a field of rain, got ${streaks.length}`);
  for (const streak of streaks) {
    const inUpper = streak.y >= 32 && streak.y + streak.height <= 86;
    const inLower = streak.y >= 93 && streak.y + streak.height <= 157;
    assert.ok(inUpper || inLower, `rain streak at y=${streak.y}..${streak.y + streak.height} crosses the transom`);
    assert.ok(!(streak.x >= 196 && streak.x <= 201) && !(streak.x >= 288 && streak.x <= 293), 'rain drawn over a mullion');
    assert.ok(streak.alpha <= 0.2, `rain alpha ${streak.alpha} is too heavy`);
  }
  assert.ok(!quads.some(isBirdPixel), 'the bird does not fly in the rain');
  assertQuadInvariants(quads, 'rain');
});

test('rain adds slow ripple dashes on the water and stays within the quad budget', () => {
  const withWater = ambienceQuads(7, motesFor(500), { water: WATER, ...RAIN });
  assert.ok(withWater.length <= MAX_AMBIENCE_QUADS, `rain exceeds the budget: ${withWater.length}`);
  const ripples = withWater.filter((quad) => quad.color === '#e2eaf4');
  assert.ok(ripples.length >= 1, 'ripples appear on the water while it rains');
  for (const ripple of ripples) {
    assert.ok(ripple.x >= WATER.left && ripple.x + ripple.width <= WATER.right, 'ripple escapes the water x range');
    assert.ok(ripple.y >= WATER.top && ripple.y + ripple.height <= WATER.bottom, 'ripple escapes the water y range');
  }
  // Without a water rect rain still falls, but no ripples are emitted.
  const noWater = ambienceQuads(7, [], { ...RAIN });
  assert.ok(noWater.some(isRainStreak));
  assert.ok(!noWater.some((quad) => quad.color === '#e2eaf4'));
});

test('night and rain lamp glow stay subtle even with a modest boost', () => {
  for (const [profile, cap] of [[NIGHT, 0.10], [RAIN, 0.095]]) {
    for (const seconds of [0, 2, 4, 6, 8]) {
      const glows = ambienceQuads(seconds, [], { water: WATER, ...profile }).filter(isLampGlow);
      assert.ok(glows.length >= 8);
      for (const glow of glows) assert.ok(glow.alpha <= cap, `boosted lamp glow ${glow.alpha} exceeds ${cap}`);
    }
  }
});
