import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COMBAT_POSES, ENEMY_POSES, parsePoseAtlas, combatPose, enemyPose } from '../src/fighters/pose-art.ts';
import { Painter } from '../src/fighters/art-kit.ts';
import { drawEnemy, drawSlime, drawPopup, drawBookSwing, drawQuillThrust, drawSpinStars, drawSlash, drawSpecialAura } from '../src/fighters/art.ts';
import { ATTACKS, ARENA } from '../src/fighters/definitions.ts';
import { newHero } from '../src/fighters/factory.ts';
import { createGame, command, setFocus, advanceGame } from '../src/fighters/game.ts';
import { enterPhase, startEpisode } from '../src/fighters/director.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { parseAtlas, frameAt } from '../src/render/atlas.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { scenePlan } from '../src/render/scene-plan.ts';
import { viewportFor } from '../src/render/viewport.ts';
import { createWorld, seedFromText } from '../src/world/world.ts';
import { PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { create as nativeBridge } from '../src/app-mac/native-bridge.ts';
import { decodePng } from './helpers/png.mjs';
import { combatArtFixtures } from '../scripts/combat-art-fixtures.mjs';

const sheets = ['combat', 'slime', 'popup'];
const combatKeys = ['idle', 'attack1', 'attack2', 'attack3', 'dodge', 'special', 'hurt', 'down'];
const enemyKeys = ['idle', 'move', 'windup', 'strike', 'hurt', 'exit'];
const keysFor = sheet => sheet === 'combat' ? combatKeys : enemyKeys;
const poseMap = keys => Object.fromEntries(keys.map((key, index) => [key, index]));
const atlases = {
  combat: { version: 1, frameWidth: 160, frameHeight: 128, columns: 4, rows: 2,
    anchor: { x: 80, y: 124 }, poses: poseMap(combatKeys) },
  slime: { version: 1, frameWidth: 96, frameHeight: 64, columns: 6, rows: 3,
    anchor: { x: 48, y: 60 }, poses: poseMap(enemyKeys), variantStride: 6 },
  popup: { version: 1, frameWidth: 96, frameHeight: 64, columns: 6, rows: 3,
    anchor: { x: 48, y: 60 }, poses: poseMap(enemyKeys), variantStride: 6 },
};
const appearance = Object.fromEntries(sheets.map(sheet => [`${sheet}Atlas`, atlases[sheet]]));
const lifeAtlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
function enemy(extra = {}) {
  return { id: 20, kind: 'slime', variant: 0, x: 1260, y: 236, facing: -1,
    hp: 3, maxHP: 3, state: 'move', age: 30, readyAt: 0, pattern: 0, hit: false,
    targetX: 1260, vx: 0, vy: 0, ...extra };
}
function arena() {
  const game = createGame(seedFromText('combat-art'));
  command(game, 'play'); setFocus(game, true); enterPhase(game, 'battle');
  game.tick = 300; game.combatTick = 300; game.phaseAge = 40;
  game.hero.x = 1140; game.hero.y = 238; game.enemies = [];
  return game;
}
function occurrences(commands, expected) {
  assert.ok(expected.length > 0, 'a comparison sequence must not be empty');
  const encoded = commands.map(item => JSON.stringify(item));
  const target = expected.map(item => JSON.stringify(item));
  return encoded.filter((_, index) => target.every((item, offset) => encoded[index + offset] === item)).length;
}

// A small Canvas recorder also models state stacks and transforms, so an inherited
// missing-sprite transform/alpha cannot hide behind superficially correct calls.
function fakeCanvas() {
  const calls = [], paints = [], stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const multiply = ([a, b, c, d, e, f], [u, v, w, z, x, y]) =>
    [a * u + c * v, b * u + d * v, a * w + c * z, b * w + d * z, a * x + c * y + e, b * x + d * y + f];
  const context = {
    calls, paints, globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: true, font: '', textBaseline: '',
    drawImage(...args) { calls.push(['drawImage', ...args]); paints.push({ kind: 'image', args, alpha: this.globalAlpha, matrix: [...matrix] }); },
    fillRect(...args) { calls.push(['fillRect', ...args]); paints.push({ kind: 'rect', args, alpha: this.globalAlpha, color: this.fillStyle, matrix: [...matrix] }); },
    fillText(...args) { calls.push(['fillText', ...args]); },
    save() { calls.push(['save']); stack.push({ matrix: [...matrix], alpha: this.globalAlpha, color: this.fillStyle }); },
    restore() { calls.push(['restore']); const saved = stack.pop(); assert.ok(saved, 'balanced Canvas state'); matrix = saved.matrix; this.globalAlpha = saved.alpha; this.fillStyle = saved.color; },
    translate(x, y) { calls.push(['translate', x, y]); matrix = multiply(matrix, [1, 0, 0, 1, x, y]); },
    scale(x, y) { calls.push(['scale', x, y]); matrix = multiply(matrix, [x, 0, 0, y, 0, 0]); },
    rotate(angle) { calls.push(['rotate', angle]); matrix = multiply(matrix, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    setTransform(...args) { calls.push(['setTransform', ...args]); matrix = [...args]; },
  };
  return { width: 0, height: 0, getContext: () => context, context };
}
function withCanvas(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas() };
  try { return run(); }
  finally { if (previous === undefined) Reflect.deleteProperty(globalThis, 'document'); else globalThis.document = previous; }
}
function images() {
  return { background: null,
    character: { naturalWidth: lifeAtlas.frameWidth * lifeAtlas.columns, naturalHeight: lifeAtlas.frameHeight * lifeAtlas.rows },
    sprites: Object.fromEntries(sheets.map(sheet => [sheet, {
      naturalWidth: atlases[sheet].frameWidth * atlases[sheet].columns,
      naturalHeight: atlases[sheet].frameHeight * atlases[sheet].rows,
    }])) };
}
function renderCommands(commands, resources, metadata = appearance, size = [480, 270]) {
  const canvas = fakeCanvas();
  const renderer = new SceneRenderer(canvas, resources, lifeAtlas, 1, metadata);
  renderer.resize(...size);
  const plan = scenePlan(createWorld(1), lifeAtlas, [], {}, false);
  plan.quads = []; plan.battle = { cameraX: 960, room: true, commands };
  canvas.context.calls.length = 0; canvas.context.paints.length = 0;
  renderer.drawPlan(plan);
  // The first image is the renderer's private room cache, whose identity is not
  // relevant when comparing the emitted actor/fallback operations.
  const start = canvas.context.calls.findIndex(call => call[0] === 'drawImage') + 1;
  return { canvas, calls: canvas.context.calls.slice(start), paints: canvas.context.paints.slice(2) };
}

for (const sheet of sheets) {
  test(`${sheet} atlas validates bounded independent geometry and unique pose slots`, () => {
    const valid = freeze(structuredClone(atlases[sheet]));
    assert.deepEqual(parsePoseAtlas(valid, sheet), valid);
    assert.deepEqual(sheet === 'combat' ? COMBAT_POSES : ENEMY_POSES, keysFor(sheet));
    assert.throws(() => parseAtlas(valid), 'the sixteen-frame life parser must not accept combat/mob metadata');
    for (const invalid of [null, [], {}, 'atlas', lifeAtlas]) assert.throws(() => parsePoseAtlas(invalid, sheet));
    const keys = keysFor(sheet);
    const mutations = [
      value => { value.version = 2; }, value => { value.version = '1'; },
      ...[0, 15, 257, 16.5, Infinity, NaN].map(width => value => { value.frameWidth = width; }),
      ...[0, 15, 257, 63.5, Infinity, NaN].map(height => value => { value.frameHeight = height; }),
      value => { value.columns = 0; }, value => { value.columns = 9; }, value => { value.columns = 2.5; },
      value => { value.rows = 0; }, value => { value.rows = 9; }, value => { value.rows += 1; },
      value => { delete value.anchor; }, value => { value.anchor = []; },
      value => { value.anchor.x = -1; }, value => { value.anchor.x = value.frameWidth + 1; },
      value => { value.anchor.x = 1.5; }, value => { value.anchor.y = NaN; },
      value => { value.anchor.y = value.frameHeight + 1; }, value => { value.anchor.y = Infinity; },
      value => { delete value.poses; }, value => { value.poses = []; },
      value => { delete value.poses[keys[0]]; }, value => { value.poses[keys[0]] = -1; },
      value => { value.poses[keys[0]] = keys.length; }, value => { value.poses[keys[0]] = 0.5; },
      value => { value.poses[keys[0]] = '0'; }, value => { value.poses[keys[0]] = NaN; },
      value => { value.poses[keys[1]] = value.poses[keys[0]]; },
      ...(sheet === 'combat'
        ? [value => { value.variantStride = 6; }, value => { value.variantStride = null; }]
        : [value => { delete value.variantStride; }, value => { value.variantStride = 5; }, value => { value.variantStride = '6'; }]),
    ];
    for (const [index, change] of mutations.entries()) {
      const invalid = structuredClone(valid); change(invalid);
      assert.throws(() => parsePoseAtlas(invalid, sheet), `${sheet} mutation ${index}`);
    }
    const reordered = structuredClone(valid);
    reordered.poses = Object.fromEntries(keys.map((key, index) => [key, keys.length - 1 - index]));
    assert.deepEqual(parsePoseAtlas(reordered, sheet), reordered, 'pose names, not their insertion order, identify frames');
    for (const dimension of [16, 256]) {
      const bounded = { ...valid, frameWidth: dimension, frameHeight: dimension, anchor: { x: dimension, y: 0 } };
      assert.deepEqual(parsePoseAtlas(bounded, sheet), bounded);
    }
  });
}

test('combat pose selection follows all combo active windows in either facing without mutation', () => {
  for (const facing of [-1, 1]) for (const combo of [1, 2, 3]) {
    const attack = ATTACKS[combo - 1];
    for (const [age, expected] of [[0, 'idle'], [attack.windup - 1, 'idle'], [attack.windup, `attack${combo}`],
      [attack.windup + attack.active - 1, `attack${combo}`], [attack.windup + attack.active, 'idle'],
      [attack.windup + attack.active + attack.recovery, 'idle']]) {
      const hero = freeze({ ...newHero(1140, 238), state: 'attack', combo, age, facing });
      assert.equal(combatPose(hero), expected, `combo ${combo}, age ${age}, facing ${facing}`);
    }
  }
  for (const state of ['idle', 'walk', 'dodge', 'special', 'hurt', 'down']) {
    assert.equal(combatPose(freeze({ ...newHero(1140), state })), state === 'walk' ? null : state);
  }
  assert.equal(combatPose({ ...newHero(1140), state: 'attack', combo: 0, age: ATTACKS[0].windup }), 'attack1');
  assert.equal(combatPose({ ...newHero(1140), state: 'attack', combo: 4, age: ATTACKS[2].windup }), 'attack3');
});

test('enemy pose selection distinguishes anticipation, attack, hurt, exit and the idle/move cycle', () => {
  for (const [state, expected] of [['enter', 'move'], ['windup', 'windup'], ['strike', 'strike'], ['stunned', 'hurt'], ['exit', 'exit']]) {
    for (const facing of [-1, 1]) assert.equal(enemyPose(freeze(enemy({ state, facing }))), expected);
  }
  for (const [age, expected] of [[0, 'idle'], [21, 'idle'], [22, 'move'], [43, 'move'], [44, 'idle']]) {
    assert.equal(enemyPose(freeze(enemy({ age }))), expected);
  }
});

for (const sheet of ['slime', 'popup']) {
  test(`${sheet} rows select all three variants with grounded integer sprites and complete original fallback`, () => {
    for (const variant of [0, 1, 2]) for (const facing of [-1, 1]) for (const state of ['enter', 'move', 'windup', 'strike', 'stunned', 'exit']) {
      const e = freeze(enemy({ kind: sheet, variant, facing, state, age: 3 }));
      const painter = new Painter(960), original = new Painter(960), invalid = new Painter(960);
      if (sheet === 'slime') drawSlime(original, e, 90); else drawPopup(original, e);
      drawEnemy(painter, e, 90, appearance);
      assert.equal(painter.commands.length, 1, 'the code body is fallback, never a second visible actor');
      const sprite = painter.commands[0];
      assert.equal(sprite.sheet, sheet); assert.equal(sprite.frame, atlases[sheet].poses[enemyPose(e)] + variant * 6);
      assert.equal(sprite.x, 300); assert.equal(sprite.y, 236); assert.equal(sprite.facing, facing);
      assert.equal(sprite.rotation, 0); assert.equal(sprite.scaleX, 1); assert.equal(sprite.scaleY, 1);
      assert.deepEqual(sprite.fallback, original.commands);
      assert.deepEqual(JSON.parse(JSON.stringify(sprite)), sprite, 'native receives the same camera-relative fallback');
      drawEnemy(invalid, e, 90, { [`${sheet}Atlas`]: { ...atlases[sheet], variantStride: 5 } });
      assert.deepEqual(invalid.commands, original.commands, 'invalid metadata preserves the original species/variant rendering');
      const absent = new Painter(960); drawEnemy(absent, e, 90);
      assert.deepEqual(absent.commands, original.commands);
    }
  });
}

for (const sheet of sheets) {
  test(`Canvas crops ${sheet} independently with its own foot anchor and facing`, () => withCanvas(() => {
    const resources = images(), atlas = atlases[sheet], frame = atlas.columns * atlas.rows - 1;
    const fallback = new Painter(960); fallback.rect(1252, 232, 7, 3, '#123456', .73);
    const painter = new Painter(960); painter.sprite(1260, 236, frame, -1, .65, 0, 1, 1, sheet, fallback.commands);
    painter.sprite(1080, 236, 0, 1);
    const { canvas, calls } = renderCommands(painter.commands, resources);
    const crops = calls.filter(call => call[0] === 'drawImage' && call[1] === resources.sprites[sheet]);
    assert.deepEqual(crops, [['drawImage', resources.sprites[sheet], frame % atlas.columns * atlas.frameWidth,
      Math.floor(frame / atlas.columns) * atlas.frameHeight, atlas.frameWidth, atlas.frameHeight,
      -atlas.anchor.x, -atlas.anchor.y, atlas.frameWidth, atlas.frameHeight]]);
    assert.equal(calls.filter(call => call[0] === 'drawImage' && call[1] === resources.character).length, 1, 'only the explicit life sprite uses heroine art');
    for (const other of sheets.filter(other => other !== sheet)) {
      assert.equal(calls.some(call => call[0] === 'drawImage' && call[1] === resources.sprites[other]), false);
    }
    assert.equal(canvas.context.paints.some(paint => paint.color === '#123456'), false, 'healthy art does not also draw its fallback');
    assert.ok(calls.some(call => call[0] === 'scale' && call[1] === -1 && call[2] === 1));
    assert.equal(canvas.context.imageSmoothingEnabled, false);
  }));

  test(`${sheet} failure is independent and fallback never inherits sprite camera, alpha or transforms`, () => withCanvas(() => {
    const faults = ['missing image', 'zero image', 'wrong width', 'wrong height', 'missing metadata', 'malformed metadata', 'duplicate pose'];
    for (const fault of faults) {
      const resources = images(), metadata = structuredClone(appearance);
      if (fault === 'missing image') resources.sprites[sheet] = null;
      if (fault === 'zero image') resources.sprites[sheet] = { naturalWidth: 0, naturalHeight: 0 };
      if (fault === 'wrong width') resources.sprites[sheet].naturalWidth += 1;
      if (fault === 'wrong height') resources.sprites[sheet].naturalHeight += 1;
      if (fault === 'missing metadata') delete metadata[`${sheet}Atlas`];
      if (fault === 'malformed metadata') metadata[`${sheet}Atlas`].anchor = null;
      if (fault === 'duplicate pose') metadata[`${sheet}Atlas`].poses[keysFor(sheet)[1]] = 0;
      const painter = new Painter(960), expected = new Painter(960);
      for (const current of sheets) {
        const fallback = new Painter(960); fallback.rect(1113, 223, 7, 3, '#123456', .73);
        painter.sprite(1260, 236, 1, -1, .27, .81, 1.5, .8, current, fallback.commands);
        if (current === sheet) expected.commands.push(...fallback.commands);
        else expected.sprite(1260, 236, 1, -1, .27, .81, 1.5, .8, current, fallback.commands);
      }
      painter.sprite(1080, 236, 0, 1); expected.sprite(1080, 236, 0, 1);
      const result = renderCommands(painter.commands, resources, metadata, [2048, 864]);
      const baseline = renderCommands(expected.commands, resources, metadata, [2048, 864]);
      assert.deepEqual(result.calls, baseline.calls, `${sheet}: ${fault}: no transform before recursive fallback`);
      assert.deepEqual(result.paints, baseline.paints, `${sheet}: ${fault}: fallback state matches direct drawing`);
      assert.equal(result.calls.some(call => call[0] === 'drawImage' && call[1] === resources.sprites[sheet]), false, fault);
      assert.equal(result.calls.filter(call => call[0] === 'drawImage' && call[1] === resources.character).length, 1, `${fault}: no heroine substitution`);
      for (const other of sheets.filter(other => other !== sheet)) {
        assert.equal(result.calls.filter(call => call[0] === 'drawImage' && call[1] === resources.sprites[other]).length, 1, `${fault}: ${other} remains usable`);
      }
      const fallbackPaint = result.paints.find(paint => paint.color === '#123456');
      const viewport = viewportFor(2048, 864);
      assert.equal(fallbackPaint.alpha, .73);
      assert.deepEqual(fallbackPaint.matrix, [3, 0, 0, 3,
        viewport.offsetX + 3 * (viewport.originX + 153), viewport.offsetY + 3 * (viewport.originY + 223)]);
    }
  }));

  test(`invalid ${sheet} command frame uses fallback rather than a different sheet`, () => withCanvas(() => {
    for (const frame of [-1, atlases[sheet].columns * atlases[sheet].rows, 1.5, NaN, Infinity]) {
      const resources = images(), fallback = new Painter(960), painter = new Painter(960);
      fallback.rect(1113, 223, 7, 3, '#123456', .73);
      painter.sprite(1260, 236, frame, -1, .27, .81, 1.5, .8, sheet, fallback.commands);
      const result = renderCommands(painter.commands, resources);
      const expected = renderCommands(fallback.commands, resources);
      assert.deepEqual(result.calls, expected.calls, `${sheet} frame ${frame}`);
      assert.deepEqual(result.paints, expected.paints);
      assert.equal(result.calls.some(call => call[0] === 'drawImage'), false, 'neither heroine nor another optional image substitutes for an invalid frame');
    }
  }));
}

test('arena hero poses keep both facings and phase timing while walking/victory use the unchanged life atlas', () => {
  for (const facing of [-1, 1]) for (const combo of [1, 2, 3]) {
    const attack = ATTACKS[combo - 1];
    for (const age of [0, attack.windup - 1, attack.windup, attack.windup + attack.active - 1, attack.windup + attack.active]) {
      const game = arena(); Object.assign(game.hero, { state: 'attack', combo, age, facing });
      const before = structuredClone(game), plan = gamePlan(freeze(game), lifeAtlas, appearance);
      const sprites = plan.battle.commands.filter(item => item.kind === 'sprite');
      assert.equal(sprites.length, 1); assert.equal(sprites[0].sheet, 'combat');
      assert.equal(sprites[0].frame, atlases.combat.poses[combatPose(game.hero)]);
      assert.equal(sprites[0].facing, facing); assert.equal(sprites[0].x, game.hero.x - ARENA.cameraX); assert.equal(sprites[0].y, game.hero.y);
      assert.equal(sprites[0].rotation, 0); assert.equal(sprites[0].scaleX, 1); assert.equal(sprites[0].scaleY, 1);
      assert.ok(sprites[0].fallback.some(item => item.kind === 'sprite' && item.sheet === undefined));
      assert.deepEqual(game, before, 'render selection cannot change combat timing, stats, score or clock');
    }
  }
  for (const state of ['idle', 'dodge', 'special', 'hurt', 'down']) {
    const game = arena(); Object.assign(game.hero, { state, age: 8 });
    const sprite = gamePlan(game, lifeAtlas, appearance).battle.commands.find(item => item.sheet === 'combat');
    assert.equal(sprite.frame, atlases.combat.poses[state]);
  }
  for (const facing of [-1, 1]) {
    const game = arena(); Object.assign(game.hero, { state: 'walk', age: 12, facing });
    const sprite = gamePlan(game, lifeAtlas, appearance).battle.commands.find(item => item.kind === 'sprite');
    assert.equal(sprite.sheet, undefined); assert.equal(sprite.frame, frameAt(lifeAtlas, 'walk', 12 / 60));
    assert.equal(sprite.facing, facing);
    enterPhase(game, 'victory');
    assert.equal(gamePlan(game, lifeAtlas, appearance).battle.commands.some(item => item.sheet === 'combat'), false);
  }
});

test('baked combat props are not redrawn, and shared slash/aura effects occur once outside the fallback', () => {
  for (const facing of [-1, 1]) for (const combo of [1, 2, 3]) {
    const game = arena(), attack = ATTACKS[combo - 1], age = attack.windup + 1;
    Object.assign(game.hero, { state: 'attack', combo, age, facing });
    const commands = gamePlan(game, lifeAtlas, appearance).battle.commands;
    const sprite = commands.find(item => item.sheet === 'combat');
    const props = new Painter(960), slash = new Painter(960), progress = age / (attack.windup + attack.active);
    if (combo === 1) drawBookSwing(props, game.hero.x, game.hero.y, facing, progress);
    else if (combo === 2) drawQuillThrust(props, game.hero.x, game.hero.y, facing, progress);
    else drawSpinStars(props, game.hero.x, game.hero.y, facing, progress);
    drawSlash(slash, game.hero.x, game.hero.y, facing, progress, combo === 1 ? 44 : combo === 2 ? 52 : 60,
      combo === 1 ? '#f2d9a6' : combo === 2 ? '#f3e8d4' : '#fbf5e8');
    assert.equal(occurrences(commands, props.commands), 0, 'a baked weapon is not also drawn in code');
    assert.equal(occurrences(sprite.fallback, props.commands), 1, 'failed art restores the complete original props');
    assert.equal(occurrences(commands, slash.commands), 1, 'the intentional slash remains visible once');
    assert.equal(occurrences(sprite.fallback, slash.commands), 0, 'fallback does not repeat shared slash effects');
  }
  const game = arena(); Object.assign(game.hero, { state: 'special', age: 8 });
  const commands = gamePlan(game, lifeAtlas, appearance).battle.commands;
  const aura = new Painter(960); drawSpecialAura(aura, game.hero.x, game.hero.y, 8 / 26, game.effectsLow);
  const sprite = commands.find(item => item.sheet === 'combat');
  assert.equal(occurrences(commands, aura.commands), 1);
  assert.equal(occurrences(sprite.fallback, aura.commands), 0);
});

test('each optional arena species is selected without changing quiet room, legacy or passive-wallpaper commands', () => {
  const quiet = createGame(seedFromText('combat-isolation'));
  assert.deepEqual(gamePlan(quiet, lifeAtlas, appearance), gamePlan(quiet, lifeAtlas));
  const manual = arena(); manual.enemies = [enemy(), enemy({ id: 21, kind: 'popup', variant: 2, y: 246 })];
  const selected = gamePlan(manual, lifeAtlas, appearance);
  for (const sheet of sheets) assert.ok(selected.battle.commands.some(item => item.sheet === sheet));
  assert.deepEqual(gamePlan(manual, lifeAtlas, appearance, true, 'wallpaper'), gamePlan(manual, lifeAtlas, {}, true, 'wallpaper'));
  assert.equal(gamePlan(manual, lifeAtlas, appearance, true, 'wallpaper').battle, undefined);
  for (const route of ['room', 'short', 'skirmish', 'auto', 'full']) {
    const game = createGame(seedFromText('combat-isolation'));
    startEpisode(game, route); enterPhase(game, 'battle');
    const room = route === 'room'; game.cameraX = room ? 0 : 960;
    game.hero.x = room ? 230 : 1140;
    game.enemies = [enemy({ x: room ? 270 : 1260 }), enemy({ id: 21, kind: 'popup', x: room ? 300 : 1290 })];
    const before = structuredClone(game);
    const original = gamePlan(freeze(game), lifeAtlas);
    const withArt = gamePlan(game, lifeAtlas, appearance);
    assert.deepEqual(withArt, original, `${route} keeps the exact old command stream`);
    assert.equal(withArt.battle.commands.some(item => sheets.includes(item.sheet)), false);
    if (room) {
      assert.equal(withArt.battle.room, true); assert.equal(withArt.battle.cameraX, 0);
      assert.equal(withArt.battle.commands.some(item => item.kind === 'text'), false, 'room incident stays HUD/banner-free');
      assert.equal(game.enemies.some(item => item.kind === 'boss'), false);
    }
    assert.deepEqual(game, before, `${route} presentation never earns score, spends clock, or mutates diagnostics`);
  }
});

test('invalid arena pose metadata restores each original command stream without blocking other sheets', () => {
  const game = arena(); game.enemies = [enemy(), enemy({ id: 21, kind: 'popup' })];
  for (const sheet of sheets) {
    const invalid = { ...appearance, [`${sheet}Atlas`]: { ...atlases[sheet], anchor: { x: -1, y: 0 } } };
    const plan = gamePlan(game, lifeAtlas, invalid);
    assert.equal(plan.battle.commands.some(item => item.sheet === sheet), false);
    for (const other of sheets.filter(other => other !== sheet)) assert.ok(plan.battle.commands.some(item => item.sheet === other));
    const without = { ...appearance }; delete without[`${sheet}Atlas`];
    assert.deepEqual(plan, gamePlan(game, lifeAtlas, without));
  }
});

test('native bridge serializes the same optional arena poses and fallbacks as the direct Web core', () => {
  const seed = 'combat-bridge', layout = { ...PLACEHOLDER_LAYOUT, ...appearance };
  const bridge = nativeBridge(JSON.stringify({ atlas: lifeAtlas, layout }), seed);
  const game = createGame(seedFromText(seed), PLACEHOLDER_LAYOUT.scene);
  bridge.commandJSON('play'); command(game, 'play'); bridge.focusJSON(true); setFocus(game, true);
  for (let index = 0; index < ARENA.introTicks; index++) { bridge.advanceGameJSON(1 / 60); advanceGame(game, 1 / 60); }
  bridge.commandJSON('attack'); command(game, 'attack');
  for (let index = 0; index < ATTACKS[0].windup + 1; index++) { bridge.advanceGameJSON(1 / 60); advanceGame(game, 1 / 60); }
  const snapshot = JSON.parse(bridge.gameSnapshotJSON());
  for (const sheet of sheets) assert.ok(snapshot.battle.commands.some(item => item.sheet === sheet));
  assert.deepEqual(snapshot, gamePlan(game, lifeAtlas, layout));
  assert.deepEqual(JSON.parse(bridge.gameSnapshotJSON(true, 'wallpaper')), gamePlan(game, lifeAtlas, layout, true, 'wallpaper'));
  assert.deepEqual(JSON.parse(bridge.gameJSON()), game);
});

test('native QA fixtures support every subset of optional sheets, including older local profiles', () => {
  for (let mask = 0; mask < 8; mask++) {
    const present = sheets.filter((_, index) => mask & (1 << index));
    const layout = { ...PLACEHOLDER_LAYOUT, ...Object.fromEntries(present.map(key => [`${key}Atlas`, atlases[key]])) };
    const samples = combatArtFixtures(lifeAtlas, freeze(layout), false);
    assert.equal(samples.length, present.reduce((sum, key) => sum + (key === 'combat' ? 8 : 18), 0));
    assert.deepEqual([...new Set(samples.map(sample => sample.sheet))].sort(), [...present].sort());
    for (const sample of samples) {
      assert.ok(sample.plan.battle.commands.some(command => command.sheet === sample.sheet));
      assert.equal(sample.plan.game.focused, true, 'QA must not be obscured by the unfocused-preview overlay');
    }
    assert.deepEqual(samples, combatArtFixtures(lifeAtlas, layout, false), 'saved QA plans are deterministic');
  }
});

const local = new URL('../private-art/runtime/', import.meta.url);
const localPaths = { combat: 'character/combat', slime: 'fighters/slime', popup: 'fighters/popup' };
for (const sheet of sheets) {
  const directory = localPaths[sheet], present = existsSync(new URL(`${directory}/sheet.png`, local));
  test(`local ${sheet} frames have binary alpha, transparent gutters, one 80-color palette, distinct poses and aligned feet`, { skip: !present }, async () => {
    const atlas = parsePoseAtlas(JSON.parse(await readFile(new URL(`${directory}/atlas.json`, local), 'utf8')), sheet);
    assert.deepEqual(atlas, atlases[sheet]);
    const image = decodePng(await readFile(new URL(`${directory}/sheet.png`, local)));
    assert.equal(image.width, atlas.frameWidth * atlas.columns); assert.equal(image.height, atlas.frameHeight * atlas.rows);
    const colors = new Set(), hashes = [];
    for (let frame = 0; frame < atlas.columns * atlas.rows; frame++) {
      const bytes = Buffer.alloc(atlas.frameWidth * atlas.frameHeight * 4);
      const x0 = frame % atlas.columns * atlas.frameWidth, y0 = Math.floor(frame / atlas.columns) * atlas.frameHeight;
      let bottom = -1, visible = 0;
      for (let y = 0; y < atlas.frameHeight; y++) for (let x = 0; x < atlas.frameWidth; x++) {
        const index = ((y0 + y) * image.width + x0 + x) * 4, alpha = image.data[index + 3];
        const destination = (y * atlas.frameWidth + x) * 4;
        image.data.copy(bytes, destination, index, index + 4);
        assert.ok(alpha === 0 || alpha === 255, `${sheet} frame ${frame}: no translucent keying halo`);
        if (x === 0 || x === atlas.frameWidth - 1 || y === 0 || y === atlas.frameHeight - 1) assert.equal(alpha, 0, `${sheet} frame ${frame}: transparent frame edge`);
        if (alpha) {
          visible++; bottom = Math.max(bottom, y);
          colors.add((image.data[index] << 16) | (image.data[index + 1] << 8) | image.data[index + 2]);
        } else assert.equal(image.data[index] | image.data[index + 1] | image.data[index + 2], 0, 'transparent pixels carry no hidden matte RGB');
      }
      assert.ok(visible > 100, `${sheet} frame ${frame}: visible subject, not an empty sprite`);
      assert.equal(bottom, atlas.anchor.y - 1, `${sheet} frame ${frame}: ground contact stays aligned`);
      hashes.push(hash(bytes));
    }
    assert.ok(colors.size <= 80, `${sheet}: one palette across all poses and variants`);
    assert.equal(new Set(hashes).size, atlas.columns * atlas.rows, `${sheet}: no duplicate pose/variant frames`);
  });
}

test('new local art ledger matches its bytes, remains pending, and preserves all eight approved asset hashes', {
  skip: !sheets.some(sheet => existsSync(new URL(`${localPaths[sheet]}/sheet.png`, local))),
}, async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', local), 'utf8'));
  for (const sheet of sheets) {
    if (!existsSync(new URL(`${localPaths[sheet]}/sheet.png`, local))) continue;
    for (const suffix of ['sheet.png', 'atlas.json']) {
      const name = `${localPaths[sheet]}/${suffix}`, entries = manifest.assets.filter(asset => asset.path === name);
      assert.equal(entries.length, 1, `${name}: exactly one provenance entry`);
      const entry = entries[0];
      assert.equal(entry.sha256, hash(await readFile(new URL(name, local))), name);
      assert.ok(entry.author && entry.source && entry.license, `${name}: attribution and processing provenance`);
      assert.match(entry.permission.status, /^pending-/);
      for (const permission of ['webPublication', 'sourceRedistribution', 'macAppBundling']) assert.equal(entry.permission[permission], false, `${name}: ${permission}`);
    }
  }
  const protectedHashes = {
    'character/sheet.png': 'ea176098157c004280d3ac7a7053d859aeeca49df4b94146e828fc2994921ea3',
    'character/atlas.json': 'e788e8c551bc7b6a3477da256a966db5e5a23e94f4df32013f1747e16b5ddaa4',
    'scene/seaside-room.png': 'b37f2090cef1a0437edd05c6e4caf81d456ffde7624fdc47a95b8a74cee1fb94',
    'scene/seaside-room-matte.png': '22ecd06ca792ff4dffe48f90d804f9be22ff6d1b979cccb1fab6acc5bc175250',
    'scene/variants/night/scene.png': '54ba9d3796e37444fd6e5ab445b30afd0381b3987bf356009da1a3113aef42da',
    'scene/variants/night/matte.png': '422f6f7241cbc23792f82d7e3da50736e1c0628fe1a449d247df0278a8b15a9b',
    'scene/variants/rain/scene.png': '21d700bd959546be196bef1cd0d97c2552bc0201d3d7e7f3557c9d56fd192c2a',
    'scene/variants/rain/matte.png': 'd7b7d38e32501664517ec5676514acfd6f71160188966f9d4abcf9dd830b745c',
  };
  for (const [name, expected] of Object.entries(protectedHashes)) assert.equal(hash(await readFile(new URL(name, local))), expected, name);
});
