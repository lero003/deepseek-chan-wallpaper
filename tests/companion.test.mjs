import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGame, advanceGame, command, gameUI } from '../src/fighters/game.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { create } from '../src/app-mac/native-bridge.ts';
import { PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { seedFromText } from '../src/world/world.ts';
import {
  CALL_CAPTION, CALL_COOLDOWN_TICKS, CALL_LINE_TICKS, CALL_POSE_TICKS, HOME_CAPTION, REST_CAPTION,
  advanceCompanion, callState, companionLine, lifeCaption, requestCall, settleHome,
} from '../src/companion/companion.ts';

const atlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const visual = plan => ({ ...plan, game: undefined });

test('life captions are deterministic and fold the short turn into idle', () => {
  assert.equal(lifeCaption('idle', 'sunset'), lifeCaption('turn', 'sunset'));
  assert.equal(lifeCaption('idle', 'night'), lifeCaption('turn', 'night'));
  assert.notEqual(lifeCaption('idle', 'sunset'), lifeCaption('idle', 'rain'));
  assert.equal(lifeCaption('sleep', 'night'), '月夜に、すやすや。');
  assert.match(lifeCaption('walk', 'rain'), /ひと歩き/);
});

test('a call is accepted only while idle in the quiet study and never touches world/RNG/schedule', () => {
  const game = createGame(7);
  assert.equal(game.mode, 'auto'); assert.equal(game.phase, 'rest'); assert.equal(game.world.actor.state, 'idle');
  const worldBefore = JSON.stringify(game.world);
  const nextEventAt = game.nextEventAt, randomState = game.randomState;
  assert.equal(requestCall(game), true);
  assert.ok(game.cue); assert.equal(game.cue.caption, CALL_CAPTION);
  assert.equal(JSON.stringify(game.world), worldBefore, 'the world is untouched');
  assert.equal(game.nextEventAt, nextEventAt, 'the bout schedule is untouched');
  assert.equal(game.randomState, randomState, 'no RNG is consumed');
  // Spamming during the reaction and the cooldown yields exactly one cue.
  for (let i = 0; i < 100; i++) assert.equal(requestCall(game), false);
  assert.equal(game.cue.startedTick, 0);
});

test('call acceptance reports a honest reason for each non-idle state', () => {
  const game = createGame(7);
  game.world.actor.state = 'sleep'; assert.match(callState(game).reason, /お昼寝/);
  game.world.actor.state = 'walk'; assert.match(callState(game).reason, /お散歩/);
  game.world.actor.state = 'turn'; assert.match(callState(game).reason, /振り向き/);
  game.world.actor.state = 'idle'; game.mode = 'manual'; assert.match(callState(game).reason, /対戦が終わったら/);
});

test('the cue ages out after its line and is cancelled by sleep or a bout', () => {
  const game = createGame(7);
  requestCall(game);
  for (let i = 0; i < CALL_LINE_TICKS; i++) advanceGame(game, 1 / 60);
  assert.equal(game.cue, null, 'cue expires after the line window');
  // Cooldown still blocks an immediate second call.
  assert.equal(callState(game).ready, false);
  assert.match(callState(game).reason, /少し待って/);
  for (let i = 0; i < CALL_COOLDOWN_TICKS; i++) advanceGame(game, 1 / 60);
  // A new cue is cancelled the moment the heroine leaves idle.
  requestCall(game); assert.ok(game.cue);
  game.world.actor.state = 'sleep'; advanceCompanion(game); assert.equal(game.cue, null);
});

test('companionLine prioritises call, then homecoming, then the quiet life', () => {
  const game = createGame(7);
  assert.equal(companionLine(game), lifeCaption('idle', 'sunset'));
  requestCall(game); assert.equal(companionLine(game), CALL_CAPTION);
  game.cue = null; settleHome(game, HOME_CAPTION); assert.equal(companionLine(game), HOME_CAPTION);
  game.homeLineUntil = 0; assert.equal(companionLine(game), lifeCaption(game.world.actor.state, game.world.mood));
  game.mode = 'manual'; assert.equal(companionLine(game), '');
});

test('returning home distinguishes a finished bout from an early rest', () => {
  const win = createGame(7); win.outcome = 'win'; command(win, 'home');
  assert.equal(win.homeLine, HOME_CAPTION);
  const early = createGame(7); early.outcome = 'none'; command(early, 'home');
  assert.equal(early.homeLine, REST_CAPTION);
});

test('the preview shows a brief front pose; the wallpaper drawing is byte-identical with or without a cue', () => {
  const game = createGame(7);
  const before = gamePlan(game, atlas, {}, true, 'wallpaper');
  requestCall(game);
  const preview = gamePlan(game, atlas, {}, true, 'preview');
  assert.equal(preview.frame, atlas.animations.turn.frames[1], 'preview notices you');
  assert.equal(preview.x, before.x, 'feet stay planted');
  const after = gamePlan(game, atlas, {}, true, 'wallpaper');
  assert.deepEqual(visual(after), visual(before), 'wallpaper pixels never change');
  // After the pose window the preview frame returns to the normal idle frame.
  for (let i = 0; i < CALL_POSE_TICKS; i++) advanceGame(game, 1 / 60);
  const later = gamePlan(game, atlas, {}, true, 'preview');
  assert.notEqual(later.frame, atlas.animations.turn.frames[1]);
});

test('Web and JavaScriptCore share one cue and one caption without browser APIs', () => {
  const config = { atlas, layout: PLACEHOLDER_LAYOUT };
  const engine = create(JSON.stringify(config));
  const game = createGame(seedFromText('seaside-v01'));
  const wallpaperBefore = engine.gameSnapshotJSON(true, 'wallpaper');
  command(game, 'call'); engine.commandJSON('call');
  assert.deepEqual(JSON.parse(engine.gameJSON()), game);
  assert.deepEqual(JSON.parse(engine.gameSnapshotJSON(true, 'preview')), gamePlan(game, atlas, PLACEHOLDER_LAYOUT, true, 'preview'));
  assert.equal(JSON.parse(engine.gameSnapshotJSON(true, 'preview')).frame, atlas.animations.turn.frames[1]);
  // The wallpaper's drawn output is byte-identical; only host-facing `.game` metadata
  // (the preview caption) differs, and the wallpaper painter never renders that field.
  assert.deepEqual(visual(JSON.parse(engine.gameSnapshotJSON(true, 'wallpaper'))), visual(JSON.parse(wallpaperBefore)),
    'native wallpaper drawing is unchanged');
  assert.equal(gameUI(game).callReady, false);
  assert.equal(gameUI(game).companionLine, CALL_CAPTION);
  engine.commandJSON('cancelCall'); command(game, 'cancelCall');
  assert.equal(game.cue, null);
  assert.deepEqual(JSON.parse(engine.gameJSON()), game);
});
