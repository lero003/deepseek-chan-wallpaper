import assert from 'node:assert/strict';
import test from 'node:test';
import { ARCADE, arcadeUI, scoreMultiplier } from '../src/fighters/arcade.ts';
import { createGame, command, advanceGame, setFocus, gameUI } from '../src/fighters/game.ts';
import { damageEnemy, damageHero } from '../src/fighters/combat.ts';
import { ARENA } from '../src/fighters/definitions.ts';

const ticks = (g, n) => { for (let i = 0; i < n; i++) advanceGame(g, 1 / 60); };
function live() {
  const g = createGame(527); command(g, 'play'); setFocus(g, true); ticks(g, ARENA.introTicks);
  assert.equal(g.phase, 'battle'); return g;
}
function clear(g) {
  for (const e of g.enemies) damageEnemy(g, e, e.hp, 0);
  g.hitstop = 0; ticks(g, 1);
}

test('the ninety-second arcade clock spends only live focused steps, including hitstop', () => {
  const g = createGame(11); command(g, 'play'); setFocus(g, true);
  ticks(g, ARENA.introTicks);
  assert.equal(gameUI(g).arcade.secondsLeft, 90); assert.equal(g.arcade.roundTicks, 0);
  g.hitstop = 6; ticks(g, 6); assert.equal(g.arcade.roundTicks, 6);
  command(g, 'pause'); ticks(g, 120); assert.equal(g.arcade.roundTicks, 6);
  command(g, 'pause'); setFocus(g, false); ticks(g, 120); assert.equal(g.arcade.roundTicks, 6);
  setFocus(g, true); ticks(g, 54); assert.equal(gameUI(g).arcade.secondsLeft, 89);
});
test('points use effective damage and one KO, not requested overkill or repeated hits on dead enemies', () => {
  const g = live(), e = g.enemies[0];
  damageEnemy(g, e, 999, 0);
  assert.equal(g.arcade.score, e.maxHP * ARCADE.hitPoints + ARCADE.visitorPoints);
  const score = g.arcade.score; damageEnemy(g, e, 999, 0); assert.equal(g.arcade.score, score);
  assert.equal(g.arcade.bestCombo, 1);
});
test('combo multipliers have explicit capped thresholds', () => {
  for (const [combo, expected] of [[0, 1], [1, 1], [5, 1], [6, 2], [11, 3], [16, 4], [10000, 4]]) {
    assert.equal(scoreMultiplier(combo), expected);
  }
  const g = live(); g.hero.hitCombo = 5; g.hero.hitComboUntil = g.combatTick + 120;
  damageEnemy(g, g.enemies[0], 1, 0);
  assert.equal(g.arcade.score, 50); assert.equal(arcadeUI(g).multiplier, 2);
});
test('round clear awards one visible bonus and freezes its timer during intermission', () => {
  const g = live(); clear(g);
  assert.equal(g.phase, 'roundClear'); assert.equal(g.arcade.lastRoundPerfect, true);
  assert.ok(g.arcade.lastRoundBonus >= ARCADE.clearPoints + ARCADE.perfectPoints);
  const score = g.arcade.score, time = g.arcade.roundTicks;
  ticks(g, ARENA.roundClearTicks - 1);
  assert.equal(g.arcade.score, score); assert.equal(g.arcade.roundTicks, time);
  ticks(g, 1); assert.equal(g.phase, 'intro'); assert.equal(g.arcade.checkpointScore, score);
  assert.equal(g.arcade.roundTicks, 0); assert.equal(g.arcade.lastRoundBonus, 0);
});
test('retries roll back the current round points and combo but keep previous clears and count continues', () => {
  const g = live(); clear(g); ticks(g, ARENA.roundClearTicks + ARENA.introTicks);
  const bank = g.arcade.score, best = g.arcade.bestCombo;
  for (let attempt = 1; attempt <= 3; attempt++) {
    damageEnemy(g, g.enemies[0], 1, 0); assert.ok(g.arcade.score > bank);
    command(g, 'retry'); assert.equal(g.arcade.score, bank); assert.equal(g.arcade.bestCombo, best);
    assert.equal(g.arcade.continues, attempt); assert.equal(g.section, 1);
    ticks(g, ARENA.introTicks);
  }
  assert.ok(g.runStats.hits > g.arcade.bestCombo, 'raw diagnostics are not reset or used as a points wallet');
});
test('time up ends the attempt on the exact boundary without a watchdog win', () => {
  const g = live(); g.arcade.roundTicks = ARCADE.roundTicks - 2; g.hero.invulnerableUntil = 1e9;
  ticks(g, 1); assert.equal(g.phase, 'battle'); assert.equal(arcadeUI(g).secondsLeft, 1);
  ticks(g, 1); assert.equal(g.phase, 'retry'); assert.equal(g.outcome, 'loss'); assert.equal(g.hero.hp, 0);
  assert.equal(arcadeUI(g).timedOut, true); assert.equal(arcadeUI(g).secondsLeft, 0);
  command(g, 'retry'); assert.equal(g.phase, 'intro'); assert.equal(arcadeUI(g).secondsLeft, 90);
  assert.equal(g.arcade.continues, 1); assert.equal(arcadeUI(g).timedOut, false);
});
test('damage removes the perfect bonus and rank accounts for damage and continues', () => {
  const g = live(); g.graceUntil = 0; damageHero(g, g.hero.x + 20);
  assert.equal(g.arcade.roundDamage, 1); clear(g); assert.equal(g.arcade.lastRoundPerfect, false);
  g.outcome = 'win'; assert.equal(arcadeUI(g).rank, 'A');
  g.arcade.continues = 1; assert.equal(arcadeUI(g).rank, 'B');
  g.arcade.continues = 2; assert.equal(arcadeUI(g).rank, 'C');
  g.arcade.continues = 0; g.runStats.damageTaken = 0; assert.equal(arcadeUI(g).rank, 'S');
});
test('new bouts reset arcade records while wallpaper incidents never earn arcade points', () => {
  const g = live(); damageEnemy(g, g.enemies[0], 1, 0); g.phase = 'result'; g.outcome = 'win';
  command(g, 'retry'); assert.equal(g.arcade.score, 0); assert.equal(g.arcade.continues, 0); assert.equal(g.arcade.bestCombo, 0);
  command(g, 'home'); command(g, 'demo'); ticks(g, 1200);
  assert.equal(g.arcade.score, 0); assert.equal(g.arcade.roundTicks, 0); assert.equal(g.mode, 'auto');
});
