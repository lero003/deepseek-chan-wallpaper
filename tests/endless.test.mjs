import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advanceGame, command, gameUI, setFocus, setMovement, requestAction } from '../src/fighters/game.ts';
import { ARENA, ARENA_STAGES, BOSSES, ENDLESS, HERO, LIMITS } from '../src/fighters/definitions.ts';
import { damageEnemy, damageHero } from '../src/fighters/combat.ts';
import { spawnEnemy } from '../src/fighters/enemy-brain.ts';
import { endlessBossHP, pickBoss, pickStage } from '../src/fighters/endless.ts';
import { newArcade } from '../src/fighters/arcade.ts';

const ticks = (game, count) => { for (let i = 0; i < count; i++) advanceGame(game, 1 / 60); };
const make = (seed = 47) => { const game = createGame(seed); command(game, 'endless'); return game; };
const fight = game => {
  let guard = 200;
  while (game.phase !== 'boss' && guard-- > 0) ticks(game, 1);
  assert.equal(game.phase, 'boss');
};
const defeat = game => {
  fight(game);
  damageEnemy(game, game.enemies[0], 999, 0); game.hitstop = 0; ticks(game, 1);
  assert.equal(game.phase, 'interlude');
};

test('endless starts safely from home/manual/result and repeated start is a strict no-op', () => {
  for (const start of ['home', 'play', 'result']) {
    const game = createGame(7);
    if (start !== 'home') command(game, 'play');
    if (start === 'result') { game.phase = 'result'; game.outcome = 'win'; }
    command(game, 'endless');
    assert.equal(game.mode, 'endless'); assert.equal(game.route, 'endless');
    assert.equal(game.phase, 'bossIntro'); assert.equal(game.outcome, 'none');
    assert.equal(game.enemies.length, 0); assert.equal(game.stats.episodes, start === 'home' ? 1 : 2);
    assert.equal(game.hero.hp, HERO.hp); assert.equal(game.hero.gauge, 0);
    assert.equal(gameUI(game).endless.active, true);
    const state = structuredClone(game);
    command(game, 'endless'); command(game, 'play'); command(game, 'demo'); command(game, 'retry');
    assert.deepEqual(game, state);
  }
});

test('thirty simulated minutes stay endless, boss-only, bounded, fixed and outside arcade', () => {
  const game = make(), starts = [], stages = [], hpByBoss = new Map();
  let previousEnemy = -1, previousStage = game.endless.stageId;
  for (let tick = 0; tick < 108000; tick++) {
    advanceGame(game, 1 / 60);
    assert.ok(['bossIntro', 'boss', 'interlude'].includes(game.phase));
    assert.equal(game.outcome, 'none'); assert.equal(game.mode, 'endless');
    assert.equal(game.enemies.length <= 1, true);
    assert.ok(game.enemies.every(enemy => enemy.kind === 'boss'));
    assert.equal(game.cameraX, ARENA.cameraX);
    assert.ok(game.hero.x >= ARENA.left && game.hero.x <= ARENA.right);
    assert.ok(game.hero.y >= ARENA.top && game.hero.y <= ARENA.bottom);
    assert.ok(game.effects.length <= LIMITS.effects && game.projectiles.length <= LIMITS.projectiles);
    if (game.endless.stageId !== previousStage) {
      assert.equal(game.phase, 'interlude'); previousStage = game.endless.stageId; stages.push(previousStage);
    }
    const enemy = game.enemies[0];
    if (enemy && enemy.id !== previousEnemy) {
      const id = enemy.bossId, previousHP = hpByBoss.get(id) ?? 0;
      assert.ok(enemy.maxHP >= previousHP && enemy.maxHP <= BOSSES[id].hp * 2);
      assert.equal(enemy.maxHP, endlessBossHP(id, game.endless.cycle));
      assert.equal(game.hero.hp, HERO.hp); assert.equal(game.hero.gauge, 0);
      assert.notEqual(starts.at(-1), id);
      hpByBoss.set(id, enemy.maxHP); starts.push(id); previousEnemy = enemy.id;
    }
  }
  assert.ok(game.endless.defeated >= 3); assert.ok(game.endless.cycle > 1);
  assert.equal(new Set(starts).size, 3); assert.equal(new Set(stages).size, 6);
  assert.equal(game.stats.wins, game.endless.defeated);
  assert.ok(game.stats.hits > 0 && game.stats.damageTaken > 0, 'autopilot both attacks and receives damage');
  assert.deepEqual(game.arcade, newArcade());
});

test('seed, boss/stage order, HP scaling and final state reproduce at 15/30/60 fps', () => {
  const run = fps => {
    const game = make(123), order = []; let last = null;
    for (let frame = 0; frame < fps * 1800; frame++) {
      advanceGame(game, 1 / fps);
      const state = game.endless, key = `${state.cycle}:${state.bossId}:${state.stageId}:${state.defeated}:${state.downs}`;
      if (key !== last) { order.push([key, endlessBossHP(state.bossId, state.cycle)]); last = key; }
    }
    return { order, game };
  };
  const expected = run(60);
  assert.deepEqual(run(30), expected); assert.deepEqual(run(15), expected);
  const other = make(124);
  assert.notDeepEqual([other.endless.bossId, other.endless.bossBag, other.endless.stageBag],
    [make(123).endless.bossId, make(123).endless.bossBag, make(123).endless.stageBag]);
});

test('seed 47 has a fixed opening order across three cycles', () => {
  const game = make(47), order = []; let last = -1;
  for (let tick = 0; tick < 20000 && order.length < 9; tick++) {
    ticks(game, 1); const boss = game.enemies[0];
    if (boss && boss.id !== last) { last = boss.id; order.push([boss.bossId, game.endless.stageId, game.endless.cycle, boss.maxHP]); }
  }
  assert.deepEqual(order, [
    ['yume', 'terrace-night', 1, 36], ['shio', 'garden-dawn', 1, 24], ['lumie', 'terrace', 1, 30],
    ['shio', 'terrace-rain', 2, 28], ['yume', 'courtyard-snow', 2, 40], ['lumie', 'pier-dawn', 2, 34],
    ['shio', 'terrace', 3, 32], ['lumie', 'courtyard-snow', 3, 38], ['yume', 'pier-dawn', 3, 44],
  ]);
});

test('shuffle bags cover each roster per bag, avoid adjacent repeats, and support a singleton', () => {
  const game = make();
  game.endless.bossBag = []; game.endless.lastBossId = null; game.endless.cycle = 1;
  game.endless.stageBag = []; game.endless.lastStageId = null;
  let lastBoss = null, lastStage = null;
  for (let bag = 0; bag < 100; bag++) {
    const bosses = [];
    for (let i = 0; i < 3; i++) { const id = pickBoss(game); assert.notEqual(id, lastBoss); bosses.push(id); lastBoss = id; }
    assert.deepEqual([...bosses].sort(), Object.keys(BOSSES).sort()); assert.equal(game.endless.cycle, bag + 1);
    const stages = [];
    for (let i = 0; i < Object.keys(ARENA_STAGES).length; i++) { const id = pickStage(game); assert.notEqual(id, lastStage); stages.push(id); lastStage = id; }
    assert.deepEqual([...stages].sort(), Object.keys(ARENA_STAGES).sort());
  }
  game.endless.bossBag = []; game.endless.stageBag = [];
  for (let i = 0; i < 20; i++) { assert.equal(pickBoss(game, ['lumie']), 'lumie'); assert.equal(pickStage(game, ['terrace']), 'terrace'); }
  for (const id of Object.keys(BOSSES)) {
    assert.equal(endlessBossHP(id, 1), BOSSES[id].hp);
    assert.equal(endlessBossHP(id, 2), BOSSES[id].hp + 4);
    assert.equal(endlessBossHP(id, 10000), BOSSES[id].hp * 2);
  }
});

test('defeat increments wins once, clears the boss, rests 60 ticks and heals for the next introduction', () => {
  const game = make(); fight(game);
  game.hero.hp = 1; game.hero.gauge = 70;
  const previous = game.endless.bossId, stage = game.endless.stageId;
  defeat(game);
  assert.equal(game.endless.defeated, 1); assert.equal(game.stats.wins, 1);
  assert.equal(gameUI(game).endless.bossHP, 0); assert.equal(game.outcome, 'none');
  assert.equal(game.hero.hp, HERO.hp); assert.equal(game.hero.gauge, 0);
  assert.equal(game.enemies.length, 0); assert.equal(game.projectiles.length, 0);
  assert.notEqual(game.endless.stageId, stage);
  ticks(game, ENDLESS.interludeTicks - 1); assert.equal(game.phase, 'interlude');
  ticks(game, 1); assert.equal(game.phase, 'bossIntro'); assert.equal(game.enemies.length, 0);
  assert.notEqual(game.endless.bossId, previous); fight(game);
  assert.equal(game.stats.wins, 1); assert.equal(game.enemies.length, 1);
});

test('a real lethal hit recovers through interlude and a different boss instead of loss/retry', () => {
  const game = make(); fight(game);
  const previous = game.endless.bossId;
  game.hero.hp = 1; game.graceUntil = 0; game.hero.invulnerableUntil = 0;
  damageHero(game, game.hero.x - 30); assert.equal(game.hero.hp, 0);
  ticks(game, 1);
  assert.equal(game.phase, 'interlude'); assert.equal(game.endless.downs, 1);
  assert.equal(game.endless.defeated, 0); assert.equal(game.stats.wins, 0);
  assert.equal(game.outcome, 'none'); assert.equal(game.hero.hp, HERO.hp);
  ticks(game, ENDLESS.interludeTicks); fight(game);
  assert.notEqual(game.endless.bossId, previous); assert.equal(game.endless.downs, 1);
});

test('simultaneous knockout records both facts once and advances only one encounter', () => {
  const game = make(); fight(game); const round = gameUI(game).round;
  game.enemies[0].hp = 0; game.enemies[0].state = 'exit'; game.hero.hp = 0;
  ticks(game, 1);
  assert.equal(game.phase, 'interlude'); assert.equal(game.outcome, 'none');
  assert.equal(game.stats.wins, 1); assert.equal(game.endless.defeated, 1); assert.equal(game.endless.downs, 1);
  assert.equal(gameUI(game).round, round);
  ticks(game, ENDLESS.interludeTicks); fight(game);
  assert.equal(gameUI(game).round, round + 1); assert.equal(game.stats.wins, 1); assert.equal(game.endless.downs, 1);
});

test('intro/interlude freeze actors, damage and projectiles, and reject small enemies/duplicate bosses', () => {
  const game = make();
  assert.equal(spawnEnemy(game, 'boss', 0, ARENA.enemyX, ARENA.heroY, -1, false), null);
  fight(game);
  const boss = game.enemies[0];
  for (const kind of ['slime', 'popup', 'boss']) assert.equal(spawnEnemy(game, kind, 0, ARENA.enemyX, ARENA.heroY, -1), null);
  game.phase = 'interlude'; game.phaseAge = 0;
  game.projectiles = [{ id: 900, x: game.hero.x, y: game.hero.y, vx: 100, vy: 10, age: 1, ttl: 20, text: '' }];
  const before = structuredClone([game.hero, game.enemies, game.projectiles]);
  damageEnemy(game, boss, 999, 100); damageHero(game, game.hero.x);
  ticks(game, 10);
  assert.deepEqual([game.hero, game.enemies, game.projectiles], before);
  game.phase = 'bossIntro'; game.phaseAge = 0; ticks(game, 10);
  assert.deepEqual([game.hero, game.enemies, game.projectiles], before);
});

test('manual input cannot steer endless and home works from every endless phase', () => {
  for (const phase of ['bossIntro', 'boss', 'interlude']) {
    const game = make(); if (phase !== 'bossIntro') fight(game); if (phase === 'interlude') defeat(game);
    assert.equal(game.phase, phase);
    setFocus(game, true); setMovement(game, 1, 1); requestAction(game, 'attack'); command(game, 'pause');
    assert.deepEqual(game.input, { x: 0, y: 0 }); assert.equal(game.hero.attackQueue, 0); assert.equal(game.paused, false);
    command(game, 'home');
    assert.equal(game.endless, null); assert.equal(gameUI(game).endless, null);
    assert.equal(game.phase, 'rest'); assert.equal(game.mode, 'auto'); assert.notEqual(game.route, 'endless');
    assert.equal(game.enemies.length + game.projectiles.length + game.effects.length, 0);
    command(game, 'demo'); assert.equal(game.mode, 'auto'); assert.equal(game.phase, 'battle');
    command(game, 'play'); assert.equal(game.mode, 'manual'); assert.equal(game.phase, 'intro');
  }
});
