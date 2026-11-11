import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { FightersUI } from '../src/app-web/fighters-ui.ts';
import { createGame, advanceGame, command, gameUI } from '../src/fighters/game.ts';
import { ARENA } from '../src/fighters/definitions.ts';
import { enterPhase } from '../src/fighters/director.ts';
import { CALL_CAPTION, CALL_COOLDOWN_TICKS, CALL_LINE_TICKS, HOME_CAPTION } from '../src/companion/companion.ts';

function withControls(run) {
  const saved = new Map(['document', 'window', 'Element'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FakeElement extends EventTarget {
    dataset = {}; hidden = false; disabled = false; textContent = ''; attributes = {};
    closest() { return this; }
    focus() { document.activeElement = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const ids = ['scene', 'world', 'play-button', 'demo-button', 'call-button', 'call-hint', 'game-home', 'game-retry',
    'game-attack', 'game-dodge', 'game-special', 'game-pause', 'frequency-setting', 'effects-setting', 'game-controls',
    'game-round', 'game-health', 'game-instruction', 'game-announcement', 'scene-thought'];
  const elements = new Map(ids.map(id => [id, new FakeElement()]));
  const doc = new EventTarget(), win = new EventTarget();
  doc.getElementById = id => elements.get(id); doc.hasFocus = () => true;
  doc.documentElement = new FakeElement(); doc.activeElement = elements.get('scene');
  Object.defineProperties(globalThis, { document: { value: doc, configurable: true }, window: { value: win, configurable: true }, Element: { value: FakeElement, configurable: true } });
  const controller = new AbortController();
  setMaxListeners(0, controller.signal);
  try { run(elements, controller.signal); }
  finally {
    controller.abort();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('Web controls present the complete bout cycle and never enable attacks during a face-off', () => withControls((elements, signal) => {
  const game = createGame(47), get = id => elements.get(id);
  const controls = new FightersUI(game, get('scene'), () => true, () => {}, signal);
  controls.sync();
  assert.equal(get('game-controls').hidden, true);
  assert.equal(get('play-button').disabled, false);
  assert.equal(get('call-button').hidden, false);
  get('play-button').dispatchEvent(new Event('click'));
  assert.equal(game.phase, 'intro'); assert.equal(game.focused, true);
  assert.equal(get('play-button').hidden, true);
  assert.equal(get('call-button').hidden, true);
  assert.equal(get('game-attack').disabled, true);
  assert.match(get('game-round').textContent, /ROUND 01 \/ 03/);
  assert.match(get('world').attributes['aria-label'], /第1ラウンド/);
  for (let i = 0; i < ARENA.introTicks; i++) advanceGame(game, 1 / 60);
  controls.sync();
  assert.equal(game.phase, 'battle'); assert.equal(get('game-attack').disabled, false);
  get('game-pause').dispatchEvent(new Event('click'));
  assert.equal(get('game-attack').disabled, true); assert.equal(get('game-pause').textContent, '再開 Esc');
  assert.match(get('game-announcement').textContent, /ポーズ中/);
  game.paused = false; enterPhase(game, 'retry'); controls.sync();
  assert.equal(get('game-retry').hidden, false);
  assert.equal(get('game-retry').textContent, 'このラウンドを再挑戦');
  assert.equal(get('game-pause').disabled, true);
  enterPhase(game, 'result'); controls.sync();
  assert.equal(get('game-retry').textContent, 'もう一戦');
  get('game-home').dispatchEvent(new Event('click'));
  assert.equal(game.phase, 'rest'); assert.equal(game.mode, 'auto');
  assert.equal(get('game-controls').hidden, true); assert.equal(get('play-button').hidden, false);
  assert.equal(get('call-button').hidden, false);
}));

test('the call button accepts one reaction, shows honest reasons, and follows the shared companion line', () => withControls((elements, signal) => {
  const game = createGame(47), get = id => elements.get(id);
  const controls = new FightersUI(game, get('scene'), () => true, () => {}, signal);
  controls.sync();
  // Quiet life: the observation line replaces the permanent bout invite.
  assert.equal(get('scene-thought').textContent, 'ただ、ここにいる。');
  assert.equal(get('call-button').disabled, false);
  assert.equal(get('call-hint').textContent, '');
  get('call-button').dispatchEvent(new Event('click'));
  assert.ok(game.cue);
  assert.equal(get('scene-thought').textContent, CALL_CAPTION);
  assert.equal(get('call-button').disabled, true);
  // Spamming the control never extends or queues the one reaction.
  const started = game.cue.startedTick;
  for (let i = 0; i < 100; i++) get('call-button').dispatchEvent(new Event('click'));
  assert.equal(game.cue.startedTick, started);
  for (let i = 0; i < CALL_LINE_TICKS; i++) advanceGame(game, 1 / 60);
  game.world.actor.state = 'idle'; controls.sync();
  assert.equal(game.cue, null);
  assert.equal(get('call-button').disabled, true);
  assert.equal(get('call-hint').textContent, '少し待ってね');
  for (let i = 0; i < CALL_COOLDOWN_TICKS; i++) advanceGame(game, 1 / 60);
  game.world.actor.state = 'idle'; controls.sync();
  assert.equal(get('call-button').disabled, false);
  // Non-idle states explain themselves right next to the disabled button.
  game.world.actor.state = 'sleep'; controls.sync();
  assert.equal(get('call-button').disabled, true);
  assert.equal(get('call-hint').textContent, 'いまはお昼寝中');
  game.world.actor.state = 'walk'; controls.sync();
  assert.equal(get('call-hint').textContent, 'いまはお散歩中');
  game.world.actor.state = 'turn'; controls.sync();
  assert.equal(get('call-hint').textContent, 'いまは振り向き中');
  game.world.actor.state = 'idle';
  // An automatic bout and a won homecoming reuse the same caption row.
  command(game, 'demo'); controls.sync();
  assert.equal(get('scene-thought').textContent, 'テラスで自動対戦。');
  assert.equal(get('call-button').disabled, true);
  assert.equal(get('call-hint').textContent, '対戦が終わったら呼べます');
  game.outcome = 'win'; command(game, 'home'); controls.sync();
  assert.equal(get('scene-thought').textContent, HOME_CAPTION);
  // Manual mode hides the call control and keeps the bout phase label.
  command(game, 'play'); controls.sync();
  assert.equal(get('call-button').hidden, true);
  assert.equal(get('scene-thought').textContent, gameUI(game).phaseLabel);
}));

test('a stop reason overrides the caption and disables the call with the reason nearby', () => withControls((elements, signal) => {
  const game = createGame(47), get = id => elements.get(id);
  let note = '';
  const controls = new FightersUI(game, get('scene'), () => note === '', () => {}, signal, () => note);
  controls.sync();
  assert.equal(get('scene-thought').textContent, 'ただ、ここにいる。');
  assert.equal(get('call-button').disabled, false);
  note = 'ひと休みしています'; controls.sync();
  assert.equal(get('scene-thought').textContent, 'ひと休みしています');
  assert.equal(get('call-button').disabled, true);
  assert.equal(get('call-hint').textContent, 'ひと休みしています');
  assert.match(get('game-instruction').textContent, /動きが停止中/);
  note = ''; controls.sync();
  assert.equal(get('scene-thought').textContent, 'ただ、ここにいる。');
  assert.equal(get('call-button').disabled, false);
  assert.equal(get('call-hint').textContent, '');
}));

test('round announcements change at boundaries, not on every health or clock update', () => withControls((elements, signal) => {
  const game = createGame(81), get = id => elements.get(id);
  let enabled = true;
  const controls = new FightersUI(game, get('scene'), () => enabled, () => {}, signal);
  get('play-button').dispatchEvent(new Event('click'));
  const first = get('game-announcement').textContent;
  game.hero.hp--; game.runTicks += 60; controls.sync();
  assert.equal(get('game-announcement').textContent, first);
  game.section = 1; controls.sync();
  assert.match(get('game-announcement').textContent, /第2ラウンド/);
  enabled = false; controls.sync();
  assert.equal(get('game-attack').disabled, true); assert.equal(get('game-pause').disabled, true);
  assert.equal(game.focused, false);
  assert.match(get('game-instruction').textContent, /動きが停止中/);
}));
