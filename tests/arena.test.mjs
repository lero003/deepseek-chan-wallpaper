import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceGame, command, createGame, gameUI, requestAction, setFocus, setMovement } from '../src/fighters/game.ts';
import { damageEnemy, damageHero, inBattle } from '../src/fighters/combat.ts';
import { desiredCamera, enterPhase, routeSections, startEpisode } from '../src/fighters/director.ts';
import { spawnEnemy } from '../src/fighters/enemy-brain.ts';
import { newStats } from '../src/fighters/factory.ts';
import { canStand, moveOnFloor } from '../src/fighters/movement.ts';
import { ARENA, ARENA_ROUNDS, BOSS, ENEMIES, HERO, LIMITS, STAGE_WIDTH } from '../src/fighters/definitions.ts';
import { seedFromText } from '../src/world/world.ts';

const ticks = (game, count) => { for (let i = 0; i < count; i++) advanceGame(game, 1 / 60); };
function match(seed = 'terrace-arena') {
  const game = createGame(seedFromText(seed));
  command(game, 'play'); setFocus(game, true);
  return game;
}
function liveRound(round = 0, seed) {
  const game = match(seed);
  while (game.section < round) {
    ticks(game, game.phase === 'bossIntro' ? ARENA.bossIntroTicks : ARENA.introTicks);
    clearRound(game);
    ticks(game, ARENA.roundClearTicks);
  }
  ticks(game, round === 2 ? ARENA.bossIntroTicks : ARENA.introTicks);
  assert.equal(game.phase, round === 2 ? 'boss' : 'battle');
  return game;
}
function clearRound(game) {
  assert.ok(inBattle(game));
  for (const enemy of game.enemies) damageEnemy(game, enemy, enemy.hp, 0);
  game.hitstop = 0;
  ticks(game, 1);
}
function finish(game) {
  for (let guard = 0; guard < 12 && game.phase !== 'victory'; guard++) {
    if (inBattle(game)) clearRound(game);
    else if (game.phase === 'intro') ticks(game, ARENA.introTicks);
    else if (game.phase === 'bossIntro') ticks(game, ARENA.bossIntroTicks);
    else if (game.phase === 'roundClear') ticks(game, ARENA.roundClearTicks);
    else assert.fail(`unexpected phase ${game.phase}`);
  }
  assert.equal(game.phase, 'victory');
  ticks(game, ARENA.victoryTicks + ARENA.returnTicks);
  assert.equal(game.phase, 'result');
}
function manualBot(game) {
  if (!inBattle(game)) return;
  const target = game.enemies.filter(enemy => enemy.hp > 0 && enemy.state !== 'exit').sort((a, b) =>
    Math.hypot(a.x - game.hero.x, (a.y - game.hero.y) * 3) - Math.hypot(b.x - game.hero.x, (b.y - game.hero.y) * 3))[0];
  if (!target) { setMovement(game, 0, 0); return; }
  const dx = target.x - game.hero.x, dy = target.y - game.hero.y;
  setMovement(game, Math.abs(dx) > 42 ? Math.sign(dx) : 0, Math.abs(dy) > 7 ? Math.sign(dy) : 0);
  if (Math.abs(dx) < 70 && Math.abs(dy) < 16 && game.combatTick % 9 === 0) requestAction(game, 'attack');
  if (game.hero.gauge >= 100) requestAction(game, 'special');
  if (target.state === 'windup' && Math.abs(dx) < 80 && game.combatTick >= game.hero.dodgeReadyAt) requestAction(game, 'dodge');
}

// Manual acceptance: an existing normal Safari/Chrome or visible native preview should show
// the same terrace for R1/R2/R3, no GO/travel, harmless start/clear cards, then Lumiere alone.
// Check J/Z (three taps), K/X, L/C, Esc, blur/refocus, current-round retry, result new-match
// retry and return-to-wallpaper. No browser automation or dedicated browser is required.
test('the manual roster is exactly two small-enemy rounds and one original boss slot', () => {
  assert.equal(ARENA_ROUNDS.length, 3);
  for (const round of ARENA_ROUNDS) {
    assert.equal(round.at, ARENA.arenaX); assert.equal(round.arena, ARENA.arenaX);
    assert.equal(round.second, undefined);
  }
  for (const round of ARENA_ROUNDS.slice(0, 2)) {
    assert.ok(round.spawns.length >= 2 && round.spawns.length <= 4);
    assert.ok(round.spawns.every(spawn => spawn.kind === 'slime' || spawn.kind === 'popup'));
  }
  assert.deepEqual(ARENA_ROUNDS[2].spawns, [{ kind: 'boss', variant: 0 }]);
  assert.equal(ARENA_ROUNDS[2].boss, true);
  assert.equal(BOSS.name, '綴星リュミエ'); assert.equal(BOSS.title, '琥珀の思考家');
  assert.equal(BOSS.hp, ENEMIES.boss[0].hp); assert.equal(BOSS.patterns.length, 4);
  assert.equal(ARENA.cameraX, 960); assert.equal(ARENA.arenaX, 1200);
});

test('play begins a fixed terrace introduction and spawns round one without movement', () => {
  const game = match();
  assert.equal(game.route, 'arena'); assert.equal(game.mode, 'manual'); assert.equal(game.phase, 'intro');
  assert.equal(game.section, 0); assert.equal(game.hero.x, ARENA.heroX); assert.equal(game.hero.y, ARENA.heroY);
  assert.equal(game.cameraX, ARENA.cameraX); assert.equal(game.enemies.length, 0);
  assert.equal(game.stage.width, STAGE_WIDTH); assert.equal(game.stage.furniture.length, 0);
  assert.deepEqual(routeSections(game), ARENA_ROUNDS);
  const ui = gameUI(game);
  assert.equal(ui.round, 1); assert.equal(ui.rounds, 3); assert.equal(ui.roundLabel, ARENA_ROUNDS[0].label);
  assert.equal(ui.areaName, '海辺のテラス'); assert.equal(ui.phaseLabel, 'ラウンド開始');
  assert.equal(ui.dodgeReady, false); assert.equal(ui.specialReady, false);
  ticks(game, ARENA.introTicks - 1);
  assert.equal(game.phase, 'intro'); assert.equal(game.hero.x, ARENA.heroX); assert.equal(game.enemies.length, 0);
  ticks(game, 1);
  assert.equal(game.phase, 'battle'); assert.equal(game.sectionLocked, true);
  assert.equal(game.enemies.length, ARENA_ROUNDS[0].spawns.length);
  assert.ok(game.enemies.every(enemy => enemy.x >= ARENA.left && enemy.x <= ARENA.right));
  assert.equal(game.stats.sections, 1); assert.equal(game.runStats.sections, 1);
});

test('intro, bossIntro and roundClear reject actions and freeze both sides of combat', () => {
  for (const phase of ['intro', 'bossIntro', 'roundClear']) {
    const game = match(`safe-${phase}`);
    enterPhase(game, phase); game.graceUntil = 0; game.hero.gauge = 100;
    const enemy = spawnEnemy(game, 'boss', 0, game.hero.x + 30, game.hero.y, -1, false);
    enemy.state = 'strike'; enemy.age = 4; enemy.pattern = 2; enemy.vx = -170;
    game.projectiles = [{ id: game.nextId++, x: game.hero.x, y: game.hero.y, vx: 50, vy: 0, age: 0, ttl: 200, text: '' }];
    for (const action of ['attack', 'dodge', 'special']) { requestAction(game, action); command(game, action); }
    setMovement(game, 1, 1);
    damageHero(game, enemy.x); damageEnemy(game, enemy, 3, 0);
    assert.equal(game.hero.attackQueue, 0); assert.equal(game.pendingDodge, false); assert.equal(game.pendingSpecial, false);
    assert.deepEqual(game.input, { x: 0, y: 0 });
    const x = enemy.x;
    ticks(game, 20);
    assert.equal(game.phase, phase); assert.equal(game.hero.hp, HERO.hp); assert.equal(game.hero.gauge, 100);
    assert.equal(game.hero.state, 'idle'); assert.equal(game.hero.attackId, 0);
    assert.equal(enemy.hp, BOSS.hp); assert.equal(enemy.x, x); assert.equal(enemy.age, 4);
    assert.equal(game.projectiles[0].age, 0); assert.equal(game.runStats.hits, 0); assert.equal(game.runStats.damageTaken, 0);
  }
});

test('start-card taps cannot buffer an attack across the transition into a live round', () => {
  const game = match();
  for (let i = 0; i < ARENA.introTicks; i++) {
    command(game, 'attack'); command(game, 'dodge'); command(game, 'special'); ticks(game, 1);
  }
  assert.equal(game.phase, 'battle'); assert.equal(game.hero.attackQueue, 0); assert.equal(game.hero.attackId, 0);
  assert.equal(game.pendingDodge, false); assert.equal(game.pendingSpecial, false);
  command(game, 'attack'); ticks(game, 1);
  assert.equal(game.hero.state, 'attack'); assert.equal(game.hero.attackId, 1);
});

test('clearing a round removes hostile shots and holds the old round until the next introduction', () => {
  const game = liveRound(); game.hero.hp = 3;
  game.projectiles.push({ id: game.nextId++, x: ARENA.right, y: 224, vx: 0, vy: 0, age: 0, ttl: 200, text: '' });
  clearRound(game);
  assert.equal(game.phase, 'roundClear'); assert.equal(game.phaseAge, 0); assert.equal(game.section, 0);
  assert.equal(game.enemies.length, 0, 'defeated enemies cannot freeze at full opacity behind the card');
  assert.equal(gameUI(game).round, 1); assert.equal(game.hero.hp, 4); assert.equal(game.projectiles.length, 0);
  assert.equal(game.hero.state, 'idle'); assert.equal(game.sectionLocked, false);
  ticks(game, ARENA.roundClearTicks - 1);
  assert.equal(game.phase, 'roundClear'); assert.equal(game.section, 0);
  ticks(game, 1);
  assert.equal(game.phase, 'intro'); assert.equal(game.section, 1); assert.equal(game.hero.x, ARENA.heroX);
  assert.equal(game.enemies.length, 0); assert.equal(game.hero.hp, 4); assert.equal(game.phaseAge, 0);
  ticks(game, ARENA.introTicks);
  assert.equal(game.phase, 'battle'); assert.equal(game.enemies.length, ARENA_ROUNDS[1].spawns.length);
});

test('all three rounds advance automatically on one terrace, then victory returns home before results', () => {
  const game = match(); const phases = [];
  for (let round = 0; round < 3; round++) {
    phases.push(game.phase);
    assert.equal(game.section, round); assert.equal(game.hero.x, ARENA.heroX);
    assert.equal(game.cameraX, ARENA.cameraX); assert.equal(desiredCamera(game), ARENA.cameraX);
    assert.equal(game.enemies.length, 0);
    ticks(game, round === 2 ? ARENA.bossIntroTicks : ARENA.introTicks);
    phases.push(game.phase);
    assert.equal(game.section, round); assert.equal(game.cameraX, ARENA.cameraX);
    if (round === 2) assert.deepEqual(game.enemies.map(enemy => enemy.kind), ['boss']);
    clearRound(game); phases.push(game.phase);
    if (round < 2) { assert.equal(game.section, round); ticks(game, ARENA.roundClearTicks); }
  }
  assert.deepEqual(phases, ['intro', 'battle', 'roundClear', 'intro', 'battle', 'roundClear', 'bossIntro', 'boss', 'victory']);
  assert.equal(game.outcome, 'win'); assert.equal(game.runStats.wins, 1); assert.equal(game.runStats.sections, 3);
  assert.equal(gameUI(game).round, 3); assert.equal(gameUI(game).progress, 1);
  ticks(game, ARENA.victoryTicks);
  assert.equal(game.phase, 'return'); assert.equal(game.cameraX, ARENA.cameraX);
  ticks(game, ARENA.teleportTick - 1); assert.equal(game.cameraX, ARENA.cameraX);
  ticks(game, 1); assert.equal(game.cameraX, 0); assert.equal(game.enemies.length, 0); assert.equal(game.projectiles.length, 0);
  assert.equal(game.hero.x, game.world.actor.x + game.stage.homeOffset);
  assert.equal(game.stage.bounds.left, 40); assert.equal(desiredCamera(game), 0);
  ticks(game, ARENA.returnTicks - ARENA.teleportTick);
  assert.equal(game.phase, 'result'); assert.equal(game.mode, 'manual'); assert.equal(game.cameraX, 0);
  assert.equal(gameUI(game).elapsedSeconds, game.runTicks / 60);
});

test('a manual-input bot completes the real three-round match and sees a strict one-on-one boss', () => {
  const game = match('manual-match'); const phases = new Set(); const rounds = new Set();
  for (let i = 0; i < 180 * 60 && !['retry', 'result'].includes(game.phase); i++) {
    manualBot(game); advanceGame(game, 1 / 60); phases.add(game.phase); rounds.add(gameUI(game).round);
    if (game.phase === 'boss') assert.deepEqual(game.enemies.map(enemy => enemy.kind), ['boss']);
    if (!['return', 'result'].includes(game.phase)) assert.equal(game.cameraX, ARENA.cameraX);
  }
  assert.equal(game.phase, 'result'); assert.equal(game.outcome, 'win');
  assert.deepEqual([...rounds], [1, 2, 3]);
  for (const phase of ['battle', 'roundClear', 'intro', 'bossIntro', 'boss', 'victory', 'return', 'result']) assert.ok(phases.has(phase), phase);
  assert.equal(game.runStats.sections, 3); assert.ok(game.runStats.hits > 10); assert.ok(game.runStats.dodges > 0);
  assert.equal(game.runStats.recoveries, 0); assert.ok(game.runTicks < 180 * 60);
});

test('arena feet, knockback and dodge stay on the fixed floor without camera travel', () => {
  const game = liveRound(); game.hero.invulnerableUntil = 1e9;
  assert.equal(canStand(game.stage, ARENA.left - 1, ARENA.heroY), false);
  assert.equal(canStand(game.stage, ARENA.right + 1, ARENA.heroY), false);
  assert.equal(canStand(game.stage, ARENA.arenaX, ARENA.heroY), true);
  const point = { x: ARENA.heroX, y: ARENA.heroY };
  moveOnFloor(point, -1e6, -1e6, game.stage);
  assert.deepEqual(point, { x: ARENA.left, y: ARENA.top });
  moveOnFloor(point, 1e6, 1e6, game.stage);
  assert.deepEqual(point, { x: ARENA.right, y: ARENA.bottom });
  for (let i = 0; i < 600; i++) {
    setMovement(game, i < 300 ? -1 : 1, i < 300 ? -1 : 1);
    if (i % HERO.dodgeCooldown === 0) requestAction(game, 'dodge');
    ticks(game, 1);
    assert.equal(game.cameraX, ARENA.cameraX);
    for (const actor of [game.hero, ...game.enemies]) {
      assert.ok(actor.x >= ARENA.left && actor.x <= ARENA.right);
      assert.ok(actor.y >= ARENA.top && actor.y <= ARENA.bottom);
    }
  }
});

test('all four boss patterns, including enraged patterns, preserve the arena one-on-one', () => {
  for (const enraged of [false, true]) for (let pattern = 0; pattern < 4; pattern++) {
    const game = liveRound(2, `boss-pattern-${pattern}-${enraged}`);
    const boss = game.enemies[0]; game.graceUntil = 0; game.hero.invulnerableUntil = 1e9;
    if (enraged) boss.hp = boss.maxHP / 2;
    boss.state = 'windup'; boss.age = ENEMIES.boss[0].windup; boss.pattern = pattern;
    ticks(game, 1);
    assert.equal(boss.state, 'strike'); assert.equal(game.enemies.length, 1); assert.equal(game.enemies[0].kind, 'boss');
    if (pattern !== 2) assert.ok(game.projectiles.length >= 3, `pattern ${pattern} must use bounded shots instead of summons`);
    if (pattern === 2) assert.ok(Math.abs(boss.vx) >= 170);
    ticks(game, 40);
    assert.equal(game.enemies.length, 1); assert.equal(game.enemies[0].kind, 'boss');
    assert.ok(game.projectiles.length <= LIMITS.projectiles);
  }
});

test('the final arena roster rejects extra visitors and duplicate bosses defensively', () => {
  const game = liveRound(2);
  assert.equal(spawnEnemy(game, 'slime', 0, ARENA.heroX, ARENA.heroY, 1), null);
  assert.equal(spawnEnemy(game, 'popup', 1, ARENA.heroX, ARENA.heroY, 1), null);
  assert.equal(spawnEnemy(game, 'boss', 0, ARENA.heroX, ARENA.heroY, 1), null);
  assert.equal(game.enemies.length, 1);
});

test('legacy startEpisode boss summoning remains available outside the new arena', () => {
  const game = createGame(seedFromText('legacy-summon')); game.mode = 'manual';
  startEpisode(game, 'full'); setFocus(game, true); enterPhase(game, 'boss'); game.graceUntil = 0;
  const boss = spawnEnemy(game, 'boss', 0, game.hero.x + 50, game.hero.y, -1, false);
  boss.state = 'windup'; boss.age = ENEMIES.boss[0].windup; boss.pattern = 1;
  ticks(game, 1);
  assert.ok(game.enemies.some(enemy => enemy.kind === 'slime'));
  assert.ok(game.enemies.some(enemy => enemy.kind === 'popup'));
});

test('pause and focus loss freeze every active arena phase while the quiet world keeps living', () => {
  const combatSnapshot = game => structuredClone({ combat: game.combatTick, age: game.phaseAge, run: game.runTicks,
    hero: game.hero, enemies: game.enemies, projectiles: game.projectiles, effects: game.effects, camera: game.cameraX });
  for (const phase of ['intro', 'battle', 'roundClear', 'bossIntro', 'boss', 'victory', 'return']) {
    const game = phase === 'battle' ? liveRound(0) : phase === 'boss' ? liveRound(2) : match(`freeze-${phase}`);
    enterPhase(game, phase); game.graceUntil = 0;
    game.hero.state = 'attack'; game.hero.age = 6; game.hero.attackQueue = 2;
    game.projectiles.push({ id: game.nextId++, x: game.hero.x, y: game.hero.y, vx: 90, vy: 0, age: 0, ttl: 200, text: '' });
    if (game.enemies[0]) { game.enemies[0].state = 'windup'; game.enemies[0].age = 42; }
    const worldTick = game.tick;
    command(game, 'pause');
    const before = combatSnapshot(game);
    ticks(game, 120);
    assert.equal(game.tick, worldTick + 120); assert.equal(game.phase, phase);
    assert.deepEqual(combatSnapshot(game), before);
    command(game, 'pause'); setFocus(game, false); ticks(game, 120);
    assert.equal(game.phase, phase); assert.deepEqual(combatSnapshot(game), before);
    setFocus(game, true); assert.equal(game.graceUntil, game.combatTick + HERO.graceTicks);
  }
});

test('run elapsed time includes hitstop but excludes pause, focus loss and stopped result/retry screens', () => {
  const game = match(); ticks(game, 10);
  assert.equal(game.runTicks, 10); assert.equal(gameUI(game).elapsedSeconds, 10 / 60);
  const combatTick = game.combatTick; game.hitstop = 6; ticks(game, 6);
  assert.equal(game.runTicks, 16); assert.equal(game.combatTick, combatTick);
  command(game, 'pause'); ticks(game, 120); assert.equal(game.runTicks, 16);
  command(game, 'pause'); setFocus(game, false); ticks(game, 120); assert.equal(game.runTicks, 16);
  setFocus(game, true); ticks(game, 1); assert.equal(game.runTicks, 17);
  for (const phase of ['retry', 'result']) {
    enterPhase(game, phase); const elapsed = game.runTicks;
    ticks(game, 120); assert.equal(game.runTicks, elapsed);
  }
});

test('defeat and active-round retry restore only the current round introduction, not the whole run', () => {
  for (const round of [0, 1, 2]) {
    const game = liveRound(round, `retry-round-${round}`);
    game.graceUntil = 0; damageHero(game, game.hero.x + 20);
    damageEnemy(game, game.enemies[0], 1, 0); game.hitstop = 0;
    game.hero.hp = 0; ticks(game, 1);
    assert.equal(game.phase, 'retry'); assert.equal(game.outcome, 'loss');
    assert.equal(game.runStats.losses, 1); assert.equal(game.runStats.damageTaken, 1);
    const runTicks = game.runTicks, stats = { ...game.runStats };
    game.hitstop = 5; command(game, 'retry');
    assert.equal(game.phase, round === 2 ? 'bossIntro' : 'intro'); assert.equal(game.phaseAge, 0);
    assert.equal(game.section, round); assert.equal(game.hero.hp, HERO.hp); assert.equal(game.hero.gauge, 0);
    assert.equal(game.hero.x, ARENA.heroX); assert.equal(game.cameraX, ARENA.cameraX); assert.equal(game.enemies.length, 0);
    assert.equal(game.projectiles.length, 0); assert.equal(game.hitstop, 0); assert.equal(game.outcome, 'none');
    assert.equal(game.runTicks, runTicks); assert.deepEqual(game.runStats, stats);
    ticks(game, round === 2 ? ARENA.bossIntroTicks : ARENA.introTicks);
    assert.equal(game.runStats.sections, round + 1, 'retry does not count the same round twice');
    command(game, 'retry');
    assert.equal(game.phase, round === 2 ? 'bossIntro' : 'intro'); assert.equal(game.section, round);
  }
});

test('retry cannot skip start, intermission, victory or return cards or cancel their pause', () => {
  for (const phase of ['intro', 'roundClear', 'bossIntro', 'victory', 'return']) {
    const game = match(); enterPhase(game, phase); command(game, 'pause');
    const before = JSON.stringify(game);
    command(game, 'retry'); assert.equal(JSON.stringify(game), before);
  }
});

test('result retry starts a new match and resets run-only statistics and elapsed time', () => {
  const game = match(); finish(game);
  assert.ok(game.runStats.hits > 0); assert.equal(game.runStats.wins, 1); assert.ok(game.runTicks > 0);
  const lifetimeHits = game.stats.hits, episodes = game.stats.episodes;
  const result = gameUI(game); result.runStats.hits = -10;
  assert.ok(game.runStats.hits > 0, 'UI results cannot mutate simulation statistics');
  command(game, 'retry');
  assert.equal(game.phase, 'intro'); assert.equal(game.section, 0); assert.equal(game.runTicks, 0);
  assert.equal(game.stats.hits, lifetimeHits); assert.equal(game.stats.episodes, episodes + 1);
  assert.deepEqual(game.runStats, { ...newStats(), episodes: 1 });
  assert.equal(gameUI(game).elapsedSeconds, 0); assert.equal(game.hero.hp, HERO.hp); assert.equal(game.enemies.length, 0);
});

test('wallpaper counters cannot leak into arena results and home restores the accepted study contract', () => {
  const game = createGame(seedFromText('new-match-stats'));
  command(game, 'demo');
  for (let i = 0; i < 60 * 60 && game.phase !== 'rest'; i++) ticks(game, 1);
  assert.ok(game.stats.hits > 0);
  command(game, 'frequency', 'off'); command(game, 'effects', false); command(game, 'play');
  assert.equal(game.runStats.hits, 0); assert.equal(game.runStats.wins, 0); assert.equal(game.runTicks, 0);
  setFocus(game, true); ticks(game, ARENA.introTicks); command(game, 'attack'); ticks(game, 2);
  command(game, 'home');
  assert.equal(game.mode, 'auto'); assert.equal(game.phase, 'rest'); assert.equal(game.focused, false); assert.equal(game.paused, false);
  assert.equal(game.cameraX, 0); assert.equal(game.stage.bounds.left, 40); assert.equal(game.stage.width, STAGE_WIDTH);
  assert.equal(game.enemies.length, 0); assert.equal(game.projectiles.length, 0); assert.equal(game.hero.attackQueue, 0);
  assert.equal(game.frequency, 'off'); assert.equal(game.effectsLow, false);
  command(game, 'demo'); assert.equal(game.route, 'arena'); assert.equal(game.phase, 'battle'); assert.equal(game.cameraX, ARENA.cameraX);
});

test('manual play/demo cannot replace a live match, and home can safely leave every match phase', () => {
  const live = liveRound(1); const before = JSON.stringify(live);
  command(live, 'play'); command(live, 'demo');
  assert.equal(JSON.stringify(live), before);
  for (const phase of ['intro', 'battle', 'roundClear', 'bossIntro', 'boss', 'victory', 'return', 'retry', 'result']) {
    const game = liveRound(0); enterPhase(game, phase); command(game, 'frequency', 'off');
    game.hitstop = 4; command(game, 'pause'); command(game, 'home');
    assert.equal(game.mode, 'auto'); assert.equal(game.phase, 'rest'); assert.equal(game.paused, false);
    assert.equal(game.enemies.length, 0); assert.equal(game.projectiles.length, 0); assert.equal(game.effects.length, 0);
    assert.equal(game.hitstop, 0); assert.equal(game.cameraX, 0); assert.equal(game.hero.attackQueue, 0);
    const elapsed = game.runTicks; ticks(game, 120);
    assert.equal(game.phase, 'rest'); assert.equal(game.runTicks, elapsed); assert.equal(game.frequency, 'off');
  }
});

test('the automatic-event watchdog never forces a manual arena to victory; the arcade clock ends the round instead', () => {
  const game = liveRound(); game.hero.invulnerableUntil = 1e9; game.eventStartedAt = -LIMITS.autoSeconds * 60;
  ticks(game, (LIMITS.autoSeconds + 1) * 60);
  // The live bout is bounded by its own 90s clock, not the wallpaper watchdog:
  // it must never become a forced win, and no recovery may be recorded.
  assert.equal(game.phase, 'retry'); assert.equal(game.outcome, 'loss'); assert.equal(game.hero.hp, 0);
  assert.equal(game.arcade.timedOut, true); assert.equal(game.section, 0);
  assert.equal(game.runStats.wins, 0); assert.equal(game.runStats.recoveries, 0);
  assert.equal(game.cameraX, ARENA.cameraX);
});

test('the direction pressed on the same tick turns the opening swing before it starts', () => {
  const game = liveRound();
  game.hero.facing = 1; game.hero.invulnerableUntil = 1e9; game.graceUntil = 0;
  const enemy = spawnEnemy(game, 'slime', 0, game.hero.x - 40, game.hero.y, 1, false);
  enemy.state = 'move'; enemy.readyAt = 1e9;
  setMovement(game, -1, 0); requestAction(game, 'attack'); ticks(game, 1);
  assert.equal(game.hero.facing, -1, 'the same-tick direction must decide the swing facing');
  assert.equal(game.hero.state, 'attack');
  ticks(game, 20);
  assert.equal(enemy.hp, enemy.maxHP - 1);
  assert.equal(game.runStats.hits, 1);
});
test('thirty-minute manual transcripts are deterministic at 15/30/60fps with bounded collections', () => {
  const results = [];
  for (const fps of [15, 30, 60]) {
    const game = match('long-manual-transcript');
    let retries = 0;
    for (let second = 0; second < 1800; second++) {
      if (game.phase === 'retry' || game.phase === 'result') { command(game, 'retry'); retries++; }
      if (second % 30 === 5 || second % 30 === 7) command(game, 'pause');
      if (second % 60 === 11) setFocus(game, false);
      if (second % 60 === 13) setFocus(game, true);
      setMovement(game, Math.floor(second / 4) % 2 ? -1 : 1, second % 3 - 1);
      command(game, 'attack'); command(game, 'attack'); command(game, 'attack');
      if (second % 3 === 0) command(game, 'dodge');
      command(game, 'special');
      for (let frame = 0; frame < fps; frame++) advanceGame(game, 1 / fps);
      assert.ok(game.enemies.length <= LIMITS.enemies); assert.ok(game.projectiles.length <= LIMITS.projectiles);
      assert.ok(game.effects.length <= LIMITS.effects);
    }
    assert.ok(retries > 0, 'long play exercises retry as well as battle');
    assert.ok(game.stats.maxEnemies <= 4); assert.ok(game.stats.maxProjectiles <= LIMITS.projectiles);
    assert.ok(game.stats.maxEffects <= LIMITS.effects); assert.ok(game.runTicks <= game.tick);
    results.push(game);
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
