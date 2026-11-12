import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, advanceGame, command, gameUI } from '../src/fighters/game.ts';
import { BOSSES, HERO } from '../src/fighters/definitions.ts';
import { VISITS } from '../src/companion/visitors.ts';
import { visitorCommands, visitorMotion } from '../src/companion/visitor-art.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { SUNSET_LAYOUT } from '../src/art/scene-profiles.ts';
import { create as native } from '../src/app-mac/native-bridge.ts';
import { seedFromText } from '../src/world/world.ts';

const atlas = parseAtlas(JSON.parse(readFileSync(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const ticks = (game, count) => { for (let tick = 0; tick < count; tick++) advanceGame(game, 1 / 60); };
const quiet = seed => { const game = createGame(seed); command(game, 'frequency', 'off'); return game; };
const arriving = (seed = 47) => { const game = quiet(seed); game.visits.nextAt = 1; ticks(game, 1); return game; };

test('quiet visitors arrive periodically, wander, pause and leave without creating a battle or earning facts', () => {
  const game = quiet(47), ids = [], states = new Set(); let last = null;
  assert.ok(game.visits.nextAt >= VISITS.firstMinTicks && game.visits.nextAt <= VISITS.firstMinTicks + VISITS.firstSpreadTicks);
  for (let tick = 0; tick < 30 * 60 * 60; tick++) {
    advanceGame(game, 1 / 60);
    const guest = game.visits.guest;
    if (guest) {
      states.add(guest.state); assert.ok(BOSSES[guest.bossId]);
      assert.ok(guest.x >= -48 && guest.x <= 528); assert.ok(guest.y >= 236 && guest.y <= 254);
      assert.ok(guest.age < VISITS.maximumTicks);
      if (last !== guest) { ids.push(guest.bossId); last = guest; }
    }
    assert.equal(game.mode, 'auto'); assert.equal(game.phase, 'rest'); assert.equal(game.enemies.length, 0);
    assert.equal(game.projectiles.length, 0); assert.equal(game.outcome, 'none'); assert.equal(game.hero.hp, HERO.hp);
  }
  assert.ok(ids.length >= 5); assert.equal(new Set(ids).size, 3);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  assert.deepEqual([...states].sort(), ['arriving', 'leaving', 'pausing', 'wandering']);
  for (const field of ['episodes', 'wins', 'losses', 'hits', 'damageTaken']) assert.equal(game.stats[field], 0);
  assert.equal(game.arcade.roundTicks, 0); assert.equal(game.arcade.score, 0);
});

test('visits reproduce at 15/30/60 fps and never perturb living-world or battle RNG', () => {
  const run = fps => {
    const game = quiet(58);
    for (let frame = 0; frame < 1800 * fps; frame++) advanceGame(game, 1 / fps);
    return game;
  };
  const expected = run(60); assert.deepEqual(run(15), expected); assert.deepEqual(run(30), expected);
  const enabled = createGame(16), disabled = createGame(16); command(disabled, 'visitors', false);
  for (let frame = 0; frame < 1800 * 30; frame++) { advanceGame(enabled, 1 / 30); advanceGame(disabled, 1 / 30); }
  assert.deepEqual({ ...enabled, visits: undefined }, { ...disabled, visits: undefined });
});

test('starting any battle cancels a guest immediately; returning home never resurrects her', () => {
  for (const name of ['play', 'demo', 'endless', 'home']) {
    const game = arriving(); assert.ok(game.visits.guest); const idleTicks = game.visits.idleTicks;
    command(game, name); assert.equal(game.visits.guest, null);
    if (name !== 'home') { ticks(game, 20); assert.equal(game.visits.idleTicks, idleTicks); }
    command(game, 'home'); assert.equal(game.visits.guest, null);
    assert.ok(game.visits.nextAt > game.visits.idleTicks);
  }
});

test('the host can suppress visitors without changing the existing encounter-frequency setting', () => {
  const game = arriving(); command(game, 'visitors', false); assert.equal(game.visits.guest, null);
  ticks(game, 12000); assert.equal(game.visits.guest, null); assert.equal(game.frequency, 'off');
  command(game, 'visitors', true); assert.ok(game.visits.nextAt > game.visits.idleTicks);
  ticks(game, VISITS.firstMinTicks + VISITS.firstSpreadTicks); assert.ok(game.visits.guest);
  assert.throws(() => command(game, 'visitors', 'true'));
});

test('preview and wallpaper draw the same peaceful guest with no HUD, and drawing never mutates the game', () => {
  const game = arriving(); ticks(game, 2000);
  const state = JSON.stringify(game), direct = visitorCommands(game, {});
  assert.match(gameUI(game).companionLine, /が遊びに来ています。/);
  assert.ok(direct.length > 100); assert.equal(direct.some(command => command.kind === 'text'), false);
  const preview = gamePlan(game, atlas), wallpaper = gamePlan(game, atlas, {}, true, 'wallpaper');
  assert.equal(preview.battle, undefined); assert.equal(wallpaper.battle, undefined);
  assert.deepEqual(preview.overlay, wallpaper.overlay); assert.ok(wallpaper.overlay.length >= direct.length);
  assert.equal(JSON.stringify(game), state);
  const still = gamePlan(game, atlas, {}, false, 'wallpaper'); assert.ok(still.overlay.length >= direct.length);
});

test('the native bridge carries the same guest and room overlay as the Web core', () => {
  const seed = 'quiet-guests', direct = createGame(seedFromText(seed), SUNSET_LAYOUT.scene);
  const engine = native(JSON.stringify({ atlas, layout: SUNSET_LAYOUT }), seed);
  command(direct, 'frequency', 'off'); engine.commandJSON('frequency', 'off');
  let tick = 0;
  while (tick < 12000 && direct.visits.guest?.state !== 'pausing') {
    ticks(direct, 1); engine.advanceGameJSON(1 / 60); tick++;
  }
  assert.ok(direct.visits.guest); assert.equal(direct.visits.guest.state, 'pausing');
  assert.deepEqual(JSON.parse(engine.gameJSON()), direct);
  const paused = gamePlan(direct, atlas, SUNSET_LAYOUT, true, 'wallpaper');
  assert.deepEqual(JSON.parse(engine.gameSnapshotJSON(true, 'wallpaper')), paused);
  // A moving guest uses the new step motion; the native bridge carries those commands too.
  while (tick < 30000 && direct.visits.guest?.state !== 'wandering') {
    ticks(direct, 1); engine.advanceGameJSON(1 / 60); tick++;
  }
  assert.ok(direct.visits.guest); assert.equal(direct.visits.guest.state, 'wandering');
  const walking = gamePlan(direct, atlas, SUNSET_LAYOUT, true, 'wallpaper');
  assert.notDeepEqual(walking.overlay, paused.overlay, 'walking commands differ from the greeting pose');
  assert.deepEqual(JSON.parse(engine.gameSnapshotJSON(true, 'wallpaper')), walking);
});

test('a guest walks a real stride, bows on arrival and keeps small idle motions instead of sliding as a statue', () => {
  const game = arriving();
  let guest = game.visits.guest;
  assert.ok(guest);
  assert.equal(guest.state, 'arriving');
  const still = JSON.stringify(guest);
  const start = visitorMotion(guest);
  assert.equal(start.walking, true); assert.ok(start.phase > 0 && start.phase < .3);
  assert.equal(JSON.stringify(guest), still, 'building motion never mutates the visit state');
  const x0 = guest.x, walked0 = guest.walked;
  ticks(game, 30);
  guest = game.visits.guest;
  const walked = guest.walked - walked0;
  assert.ok(walked >= 14 && walked <= 16, `half a second covers about 15 px, got ${walked}`);
  assert.ok(Math.abs(guest.x - x0) >= 14);
  assert.ok(visitorMotion(guest).phase > .5);
  const bobs = new Set();
  for (let tick = 0; tick < 45; tick++) { ticks(game, 1); bobs.add(visitorMotion(game.visits.guest).bob.toFixed(2)); }
  assert.ok(bobs.size >= 2, 'the step bob changes through the walk cycle');
  let guard = 0;
  while (game.visits.guest && game.visits.guest.state !== 'pausing' && guard++ < 20000) ticks(game, 1);
  guest = game.visits.guest;
  assert.equal(guest.state, 'pausing');
  assert.equal(guest.pauseKind, 'notice');
  assert.equal(visitorMotion(guest).walking, false);
  assert.equal(visitorMotion(guest).bob, 0);
  let bowed = false;
  for (let tick = 0; tick < 54; tick++) { ticks(game, 1); if (visitorMotion(game.visits.guest).bow > .9) bowed = true; }
  assert.ok(bowed, 'the first stop has a readable greeting nod');
});

test('long-lived quiet life varies its pause performances and still never starts a battle', () => {
  const game = quiet(51), kinds = new Set(), states = new Set();
  for (let tick = 0; tick < 30 * 60 * 60; tick++) {
    advanceGame(game, 1 / 60);
    const guest = game.visits.guest;
    if (!guest) continue;
    states.add(guest.state); kinds.add(guest.state === 'pausing' ? guest.pauseKind : 'walking');
    assert.equal(game.visits.guest, guest);
    assert.equal(game.enemies.length, 0); assert.equal(game.phase, 'rest');
  }
  assert.deepEqual([...states].sort(), ['arriving', 'leaving', 'pausing', 'wandering']);
  assert.ok(kinds.has('notice') && kinds.has('gaze') && kinds.has('fidget'));
  // The thirty-minute boundary can land inside an exit; let the current guest finish.
  for (let tick = 0; tick < 600 && game.visits.guest; tick++) advanceGame(game, 1 / 60);
  assert.equal(game.visits.guest, null);
});
