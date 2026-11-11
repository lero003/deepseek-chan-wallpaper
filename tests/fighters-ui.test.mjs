import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { FightersUI } from '../src/app-web/fighters-ui.ts';
import { createGame, advanceGame } from '../src/fighters/game.ts';
import { ARENA } from '../src/fighters/definitions.ts';
import { enterPhase } from '../src/fighters/director.ts';

function withControls(run) {
  const saved = new Map(['document', 'window', 'Element'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FakeElement extends EventTarget {
    dataset = {}; hidden = false; disabled = false; textContent = ''; attributes = {};
    closest() { return this; }
    focus() { document.activeElement = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const ids = ['scene', 'world', 'play-button', 'demo-button', 'game-home', 'game-retry', 'game-attack', 'game-dodge',
    'game-special', 'game-pause', 'frequency-setting', 'effects-setting', 'game-controls', 'game-round', 'game-health',
    'game-instruction', 'game-announcement', 'scene-thought'];
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
  get('play-button').dispatchEvent(new Event('click'));
  assert.equal(game.phase, 'intro'); assert.equal(game.focused, true);
  assert.equal(get('play-button').hidden, true);
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
