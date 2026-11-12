import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LIFE_EMOTES, parseLifeAtlas, lifeFrameAt } from '../src/render/life-art.ts';
import { createWorld, EMOTES } from '../src/world/world.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { scenePlan, motesFor } from '../src/render/scene-plan.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { createGame, command } from '../src/fighters/game.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { create as native } from '../src/app-mac/native-bridge.ts';
import { PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { decodePng } from './helpers/png.mjs';

const atlas = parseAtlas(JSON.parse(readFileSync(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const life = { version: 1, frameWidth: 80, frameHeight: 128, columns: 4, rows: 6, anchor: { x: 40, y: 124 },
  animations: Object.fromEntries(LIFE_EMOTES.map((key, index) => [key,
    { frames: [0, 1, 2, 3].map(i => index * 4 + i), frameDurationMs: 180, frameDurationsMs: [160, 280, 240, 180] }])) };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function act(world, emote, progress) {
  Object.assign(world.actor, { state: 'idle', emote, emoteTicks: EMOTES[emote].ticks,
    emoteStartStateTick: 0, stateTicks: Math.round(progress * EMOTES[emote].ticks), durationTicks: 900 });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('the additional life atlas is bounded, complete and never accepted as the original sixteen frames', () => {
  assert.equal(parseLifeAtlas(life), life);
  assert.throws(() => parseAtlas(life));
  const invalid = [null, [], 0, '', atlas, ...[
    d => { d.version = 2; }, d => { d.frameWidth = 96; }, d => { d.frameHeight = 112; },
    d => { d.rows = 8; }, d => { d.anchor.x = 41; }, d => { d.anchor.y = 123; },
    d => { d.animations.hop.frames = [0, 0, 2, 3]; }, d => { d.animations.peek.frames[0] = 0; },
    d => { d.animations.hop.frames[0] = -1; }, d => { d.animations.hop.frames[0] = 24; },
    d => { d.animations.giggle.frameDurationMs = 0; }, d => { d.animations.sway.frameDurationMs = Infinity; },
    d => { d.animations.hop.frameDurationsMs[0] = 0; }, d => { d.animations.peek.frameDurationsMs = [180]; },
    d => { delete d.animations.daydream; }, d => { d.animations.stretch.frames.pop(); },
    d => { d.animations.wave = { frames: [0, 1, 2, 3], frameDurationMs: 100 }; },
  ].map(change => { const copy = structuredClone(life); change(copy); return copy; })];
  for (const data of invalid) assert.throws(() => parseLifeAtlas(data));
});

test('each act has anticipation, every actual key and a return to the approved idle, not a forever loop', () => {
  for (const emote of LIFE_EMOTES) {
    assert.equal(lifeFrameAt(life, emote, 0), undefined);
    assert.equal(lifeFrameAt(life, emote, .079), undefined);
    const observed = new Set();
    for (let tick = 0; tick < EMOTES[emote].ticks; tick++) {
      const frame = lifeFrameAt(life, emote, tick / EMOTES[emote].ticks);
      if (frame !== undefined) observed.add(frame);
    }
    assert.deepEqual([...observed].sort((a, b) => a - b), life.animations[emote].frames);
    for (const progress of [.92, 1, 2, -1, NaN, Infinity]) assert.equal(lifeFrameAt(life, emote, progress), undefined);
  }
});

test('generated keys retain exact scale, planted feet and frozen-world purity; only hop becomes airborne', () => {
  for (const emote of LIFE_EMOTES) for (const progress of [.10, .30, .45, .65, .85]) {
    const world = createWorld(91); act(world, emote, progress); freeze(world);
    const before = JSON.stringify(world);
    const plan = scenePlan(world, atlas, motesFor(world.seed), { lifeAtlas: life });
    assert.ok(life.animations[emote].frames.includes(plan.lifeFrame));
    assert.equal(plan.motion.scaleX, 1); assert.equal(plan.motion.scaleY, 1);
    assert.equal(plan.motion.rotation, 0); assert.equal(plan.motion.offsetX, 0);
    assert.equal(plan.x, Math.round(world.actor.x)); assert.equal(plan.floorY, world.floorY);
    if (emote !== 'hop') assert.equal(plan.motion.lift, 0);
    assert.ok(plan.motion.lift >= 0 && plan.motion.lift <= 8);
    assert.equal(JSON.stringify(world), before);
    const stopped = scenePlan(world, atlas, [], { lifeAtlas: life }, false);
    assert.equal(stopped.overlay, undefined, 'still frames do not spawn new effects');
  }
});

test('malformed optional life metadata keeps valid original pose and cue/manual/combat never doubles the heroine', () => {
  const game = createGame(7); act(game.world, 'peek', .4);
  for (const invalid of [null, [], 1, {}, { ...life, rows: 100 }]) {
    const plan = gamePlan(game, atlas, { lifeAtlas: invalid });
    assert.equal(plan.lifeFrame, undefined); assert.ok(plan.frame >= 0 && plan.frame < 16);
  }
  const quiet = gamePlan(game, atlas, { lifeAtlas: life }); assert.ok(quiet.lifeFrame >= 0);
  const worldBefore = JSON.stringify(game.world);
  command(game, 'call');
  const preview = gamePlan(game, atlas, { lifeAtlas: life });
  assert.equal(preview.lifeFrame, undefined); assert.equal(preview.motion, undefined);
  assert.equal(gamePlan(game, atlas, { lifeAtlas: life }, true, 'wallpaper').lifeFrame, quiet.lifeFrame);
  assert.equal(JSON.stringify(game.world), worldBefore, 'calling owns only the preview frame, not the living world');
  command(game, 'play');
  const combat = gamePlan(game, atlas, { lifeAtlas: life });
  assert.equal(combat.lifeFrame, undefined); assert.equal(combat.motion, undefined);
  assert.ok(combat.battle);
  const passive = gamePlan(game, atlas, { lifeAtlas: life }, true, 'wallpaper');
  assert.equal(passive.lifeFrame, quiet.lifeFrame, 'foreground manual combat must not turn the passive living desktop into a statue');
  assert.equal(passive.battle, undefined);
});

function canvas() {
  const calls = [];
  const ctx = { calls, drawImage: (...args) => calls.push(args), fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, fillText() {} };
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}
test('Canvas selects an independent life sheet exactly once and all resource/frame failures use original16', () => {
  const saved = globalThis.document;
  globalThis.document = { createElement: () => canvas() };
  try {
    const hero = { naturalWidth: 192, naturalHeight: 256, id: 'accepted-hero' };
    const extra = { naturalWidth: 320, naturalHeight: 768, id: 'extra-life' };
    for (const fault of ['none', 'missing-image', 'size', 'metadata', 'negative-frame', 'too-large-frame', 'fractional-frame']) {
      const surface = canvas();
      const appearance = { lifeAtlas: fault === 'metadata' ? { ...life, rows: 1 } : life };
      const renderer = new SceneRenderer(surface, { background: null, character: hero,
        life: fault === 'missing-image' ? null : fault === 'size' ? { ...extra, naturalWidth: 321 } : extra }, atlas, 7, appearance);
      const world = createWorld(7); act(world, 'giggle', .4);
      const plan = scenePlan(world, atlas, [], appearance, false);
      if (fault === 'negative-frame') plan.lifeFrame = -1;
      if (fault === 'too-large-frame') plan.lifeFrame = 24;
      if (fault === 'fractional-frame') plan.lifeFrame = .5;
      surface.ctx.calls.length = 0;
      renderer.drawPlan(plan);
      const heroineDraws = surface.ctx.calls.filter(call => call[0] === hero || call[0] === extra);
      assert.equal(heroineDraws.length, 1, `${fault}: never draw two heroines`);
      assert.equal(heroineDraws[0][0], fault === 'none' ? extra : hero, fault);
      const call = heroineDraws[0];
      assert.equal(call[5], fault === 'none' ? -40 : -24);
      assert.equal(call[6], fault === 'none' ? -124 : -60);
    }
  } finally { if (saved === undefined) delete globalThis.document; else globalThis.document = saved; }
});

test('shared native bridge renders the same six performances, including malformed optional metadata', () => {
  for (const data of [life, null, {}, { ...life, columns: 50 }]) {
    const configuration = { atlas, layout: { ...PLACEHOLDER_LAYOUT, lifeAtlas: data } };
    const engine = native(JSON.stringify(configuration), 'heroine-motion-bridge');
    engine.commandJSON('frequency', 'off');
    const seen = new Set();
    for (let i = 0; i < 60 * 60; i++) {
      engine.replayGameJSON(15, 1 / 60);
      const game = JSON.parse(engine.gameJSON());
      if (!game.world.actor.emote) continue;
      const plan = JSON.parse(engine.gameSnapshotJSON(true, 'wallpaper'));
      assert.deepEqual(plan, gamePlan(game, atlas, configuration.layout, true, 'wallpaper'));
      if (plan.lifeFrame !== undefined) seen.add(game.world.actor.emote);
      if (data === life && seen.size === 6) break;
      if (data !== life && i >= 200) break;
    }
    if (data === life) assert.equal(seen.size, 6);
    else assert.equal(seen.size, 0);
  }
});

const local = new URL('../private-art/runtime/', import.meta.url);
const hasLocal = existsSync(new URL('character/life/sheet.png', local));
test('production life keys are isolated binary 80-colour frames with real changed shapes and immutable originals', { skip: !hasLocal }, () => {
  const image = decodePng(readFileSync(new URL('character/life/sheet.png', local)));
  const info = parseLifeAtlas(JSON.parse(readFileSync(new URL('character/life/atlas.json', local), 'utf8')));
  assert.deepEqual([image.width, image.height], [320, 768]);
  const palette = new Set(), hashes = [];
  for (let frame = 0; frame < 24; frame++) {
    let pixels = 0, bottom = 0; const bytes = [];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 80; x++) {
      const offset = ((Math.floor(frame / 4) * 128 + y) * image.width + frame % 4 * 80 + x) * 4;
      const pixel = image.data.subarray(offset, offset + 4);
      bytes.push(...pixel);
      assert.ok(pixel[3] === 0 || pixel[3] === 255);
      if (pixel[3]) { pixels++; bottom = Math.max(bottom, y); palette.add(pixel.subarray(0, 3).toString('hex')); }
      else assert.deepEqual([...pixel], [0, 0, 0, 0]);
      if (x < 2 || x > 77 || y < 2 || y > 123) assert.equal(pixel[3], 0, `${frame}: transparent gutter`);
    }
    assert.ok(pixels > 2200, `${frame}: detailed character`); assert.equal(bottom, 123);
    hashes.push(hash(Buffer.from(bytes)));
  }
  assert.equal(new Set(hashes).size, 24); assert.ok(palette.size <= 80);
  assert.equal(Object.values(info.animations).flatMap(x => x.frames).length, 24);
  const protectedFiles = JSON.parse(readFileSync(new URL('../production/life/before-hashes.json', local), 'utf8'));
  for (const [path, sha] of Object.entries(protectedFiles)) assert.equal(hash(readFileSync(new URL(path, local))), sha, path);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', local), 'utf8'));
  for (const path of ['character/life/sheet.png', 'character/life/atlas.json']) {
    const entries = manifest.assets.filter(a => a.path === path); assert.equal(entries.length, 1);
    assert.equal(entries[0].sha256, hash(readFileSync(new URL(path, local))));
    assert.equal(entries[0].permission.webPublication, false);
    assert.equal(entries[0].permission.sourceRedistribution, false);
    assert.equal(entries[0].permission.macAppBundling, false);
  }
});
