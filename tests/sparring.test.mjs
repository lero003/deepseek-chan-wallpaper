import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, advanceGame, command, setFocus, setMovement } from '../src/fighters/game.ts';
import { damageEnemy, damageHero } from '../src/fighters/combat.ts';
import { spawnEnemy } from '../src/fighters/enemy-brain.ts';
import { gamePlan } from '../src/fighters/render-plan.ts';
import { create } from '../src/app-mac/native-bridge.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { PLACEHOLDER_LAYOUT } from '../src/art/scene-profiles.ts';
import { ARENA, HERO, LIMITS } from '../src/fighters/definitions.ts';
import { sparringLift } from '../src/fighters/sparring.ts';

const atlas = parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json', import.meta.url), 'utf8')));
const make = () => { const game = createGame(8573); command(game, 'frequency', 'off'); command(game, 'sparring'); return game; };

test('both actors repeatedly open the gap, turn away, backstep and hop before re-engaging', () => {
  for (const seed of [17, 8573, 31981]) {
    const g = createGame(seed); command(g, 'sparring');
    const seen = { hero: new Set(), rival: new Set() };
    let near = 0, far = 0, cycles = 0, wasFar = false;
    for (let tick = 0; tick < 180 * 60; tick++) {
      const previous = [g.hero.x, g.enemies[0].x];
      advanceGame(g, 1 / 60);
      const state = g.sparring, rival = g.enemies[0], gap = Math.abs(rival.x - g.hero.x);
      if (gap > 150) { far++; wasFar = true; }
      if (gap < 65) { near++; if (wasFar) { cycles++; wasFar = false; } }
      for (const [id, actor, opponent, before] of [['hero', g.hero, rival, previous[0]], ['rival', rival, g.hero, previous[1]]]) {
        assert.ok(actor.x >= ARENA.left && actor.x <= ARENA.right);
        assert.ok(Math.abs(actor.x - before) < 12, 'movement must not teleport at phase boundaries');
        assert.equal(actor.y, ARENA.heroY, 'hops keep the simulation floor stable');
        const motion = state[id], away = (actor.x - before) * (opponent.x - actor.x) < 0;
        if (state.phase === 'separate' && away && Math.abs(actor.x - before) > .01) {
          if (motion.kind === 'turn') {
            assert.ok(actor.facing * (actor.x - before) > 0, 'turn-away walks face the travel direction');
            seen[id].add('turn');
          }
          if (motion.kind === 'backstep') {
            assert.ok(actor.facing * (opponent.x - actor.x) > 0, 'backsteps keep watching the opponent');
            seen[id].add('backstep');
          }
          if (motion.kind === 'hop' && sparringLift(g, id) >= 10) seen[id].add('hop');
        }
      }
    }
    assert.ok(near > 300 && far > 300, 'time must be spent both exchanging and apart');
    assert.ok(cycles >= 8, 'both characters must re-engage repeatedly');
    assert.deepEqual([...seen.hero].sort(), ['backstep', 'hop', 'turn']);
    assert.deepEqual([...seen.rival].sort(), ['backstep', 'hop', 'turn']);
  }
});

test('half-hour ambient duet stays live, bounded and deterministic at 15/30/60fps', () => {
  const replays = [];
  for (const fps of [15, 30, 60]) {
    const g = make();
    for (let frame = 0; frame < 1800 * fps; frame++) {
      advanceGame(g, 1 / fps);
      assert.equal(g.phase, 'boss');
      assert.equal(g.outcome, 'none');
      assert.equal(g.hero.hp, HERO.hp);
      assert.equal(g.enemies.length, 1);
      assert.equal(g.enemies[0].bossId, 'lumie');
      assert.equal(g.enemies[0].hp, g.enemies[0].maxHP);
      assert.equal(g.cameraX, ARENA.cameraX);
      assert.ok(g.projectiles.length <= LIMITS.projectiles && g.effects.length <= LIMITS.effects);
    }
    assert.ok(g.stats.hits > 20, 'the duet must actually exchange hits');
    assert.ok(g.stats.damageTaken > 20, 'Lumie must also keep acting');
    assert.equal(g.stats.wins + g.stats.losses, 0);
    assert.equal(g.arcade.score, 0);
    assert.equal(g.visits.guest, null);
    assert.ok(g.hero.attackId < 1800 / 2, 'single swings leave at least two seconds between attacks');
    replays.push(g);
  }
  assert.deepEqual(replays[0], replays[1]);
  assert.deepEqual(replays[1], replays[2]);
});

test('lethal hits in either direction cannot cause a KO or an enrage phase', () => {
  const g = make(), rival = g.enemies[0];
  for (let i = 0; i < 100; i++) {
    damageEnemy(g, rival, 1000, 50);
    g.hero.invulnerableUntil = 0;
    damageHero(g, rival.x);
  }
  assert.equal(rival.hp, rival.maxHP);
  assert.equal(g.hero.hp, HERO.hp);
  assert.notEqual(rival.state, 'exit');
  assert.notEqual(g.hero.state, 'down');
  assert.equal(g.arcade.score, 0);
});

test('ambient roster refuses all extra actors and ignores manual input', () => {
  const g = make();
  for (const kind of ['slime', 'popup', 'boss']) {
    assert.equal(spawnEnemy(g, kind, 0, ARENA.enemyX, ARENA.heroY, -1, false, 'shio'), null);
  }
  assert.equal(spawnEnemy(g, 'boss', 0, ARENA.enemyX, ARENA.heroY, -1, false, 'lumie'), null);
  setFocus(g, true); setMovement(g, 1, 1);
  command(g, 'attack'); command(g, 'dodge'); command(g, 'special');
  assert.deepEqual(g.input, { x: 0, y: 0 });
  assert.equal(g.hero.attackQueue, 0);
  assert.equal(g.pendingSpecial || g.pendingDodge, false);
});

test('ambient preview and wallpaper render the arena without text, bars or banners', () => {
  const g = make();
  for (let i = 0; i < 600; i++) {
    advanceGame(g, .1);
    const preview = gamePlan(g, atlas, PLACEHOLDER_LAYOUT);
    const wallpaper = gamePlan(g, atlas, PLACEHOLDER_LAYOUT, true, 'wallpaper');
    assert.deepEqual(preview.battle, wallpaper.battle);
    assert.equal(preview.battle.arena, true);
    assert.equal(preview.battle.commands.some(item => item.kind === 'text'), false);
    assert.equal(preview.overlay?.length ?? 0, 0);
  }
});

test('switching to a manual match starts fresh and returning home restores quiet life', () => {
  const g = make(); advanceGame(g, .25);
  command(g, 'play'); setFocus(g, true);
  assert.equal(g.mode, 'manual'); assert.equal(g.section, 0); assert.equal(g.phase, 'intro');
  assert.equal(g.enemies.length, 0); assert.equal(g.arcade.score, 0);
  command(g, 'home');
  assert.equal(g.mode, 'auto'); assert.equal(g.phase, 'rest');
  assert.equal(g.frequency, 'off'); assert.equal(g.enemies.length, 0);
});

test('native host blocks manual combat while wallpaper is ON and permits it after OFF', () => {
  const engine = create(JSON.stringify({ atlas, layout: PLACEHOLDER_LAYOUT }));
  engine.commandJSON('play'); engine.focusJSON(true);
  engine.wallpaperJSON(true);
  for (const name of ['play', 'retry', 'attack', 'dodge', 'special']) engine.commandJSON(name);
  assert.equal(JSON.parse(engine.gameJSON()).mode, 'auto');
  engine.commandJSON('sparring');
  assert.ok(JSON.parse(engine.gameSnapshotJSON(true, 'wallpaper')).battle);
  engine.commandJSON('play');
  assert.equal(JSON.parse(engine.gameJSON()).mode, 'sparring');
  engine.wallpaperJSON(false); engine.commandJSON('play');
  assert.equal(JSON.parse(engine.gameJSON()).mode, 'manual');
});
