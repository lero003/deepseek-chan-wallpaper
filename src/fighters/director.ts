import { AREAS, AUTO_SECTIONS, HERO, LIMITS, RUN_SECTIONS, SHORT_SECTIONS, SKIRMISH_SECTIONS, STAGE_WIDTH } from './definitions.ts';
import type { SectionDefinition } from './definitions.ts';
import { inBattle } from './combat.ts';
import { decision, effect, clearInputs } from './events.ts';
import { spawnEnemy } from './enemy-brain.ts';
import { newHero } from './factory.ts';
import { clamp } from './movement.ts';
import type { FightersGame, Phase } from './types.ts';

export function routeSections(game: FightersGame): readonly SectionDefinition[] {
  if (game.route === 'full') return RUN_SECTIONS;
  if (game.route === 'auto') return AUTO_SECTIONS;
  return game.route === 'skirmish' ? SKIRMISH_SECTIONS : SHORT_SECTIONS;
}

export function enterPhase(game: FightersGame, phase: Phase): void {
  game.phase = phase; game.phaseAge = 0; game.lastProgressAt = game.tick;
}
export function scheduleRest(game: FightersGame): void {
  const minimum = game.frequency === 'normal' ? 80 : 170;
  const variation = game.frequency === 'normal' ? 50 : 110;
  game.nextEventAt = game.frequency === 'off' ? Number.MAX_SAFE_INTEGER : game.tick + Math.round((minimum + decision(game) * variation) * 60);
  game.restReactionAt = game.tick + Math.round((20 + decision(game) * 24) * 60);
}
export function startEpisode(game: FightersGame, route: 'short' | 'skirmish' | 'auto' | 'full'): void {
  clearInputs(game);
  game.hero = newHero(120, game.world.floorY);
  game.enemies = []; game.projectiles = []; game.effects = []; game.hitstop = 0;
  game.route = route; game.section = 0; game.sectionLocked = false; game.wave = 0; game.bossSpawned = false;
  game.eventStartedAt = game.tick; game.outcome = 'none'; game.cameraX = 0;
  game.areaIndex = 0; game.areaBannerUntil = game.tick + 130; game.routeTick = game.tick;
  game.firstWhiff = true; game.whiffAttackId = -1;
  game.stats.episodes++; game.stats.sections = 0;
  enterPhase(game, 'intro');
}
export function returnHome(game: FightersGame): void {
  clearInputs(game); game.projectiles = []; game.enemies = []; game.paused = false; game.mode = 'auto'; game.focused = false;
  game.cameraX = 0; game.hero = newHero(game.world.actor.x + game.stage.homeOffset, game.world.floorY);
  game.sectionLocked = false; game.outcome = 'none';
  enterPhase(game, 'rest'); scheduleRest(game);
}

function spawnEncounter(game: FightersGame, section: SectionDefinition, wave = 0): void {
  const list = wave === 0 ? section.spawns : (section.second ?? []);
  list.forEach((spawn, index) => {
    const camera = Math.round(game.cameraX);
    if (spawn.kind === 'boss') {
      // The ringleader is already waiting at the far end of the pier.
      spawnEnemy(game, spawn.kind, spawn.variant, section.arena + 150, 238, -1, false);
      return;
    }
    const fromLeft = index % 2 === 0;
    const x = fromLeft ? camera - 22 : camera + 502;
    const y = 224 + ((index * 37 + game.section * 13 + wave * 11) % 26);
    spawnEnemy(game, spawn.kind, spawn.variant, x, y, fromLeft ? 1 : -1);
  });
}
function lockSection(game: FightersGame, section: SectionDefinition): void {
  game.sectionLocked = true; game.wave = 0;
  game.cameraX = clamp(section.arena - 240, 0, STAGE_WIDTH - 480);
  game.graceUntil = game.combatTick + 45;
  game.lastProgressAt = game.tick;
  spawnEncounter(game, section, 0);
  game.stats.sections++;
  if (section.boss) {
    game.bossSpawned = true;
    enterPhase(game, 'bossIntro');
  }
}
function victory(game: FightersGame): void {
  if (game.outcome !== 'win') game.stats.wins++;
  game.outcome = 'win'; game.projectiles = [];
  for (const enemy of game.enemies) { enemy.hp = 0; enemy.state = 'exit'; enemy.age = 0; enemy.vx = 30; }
  clearInputs(game); game.hero.state = 'idle'; game.hero.age = 0;
  effect(game, 'stars', game.hero.x, game.hero.y - 55, '', 120);
  effect(game, 'ring', game.hero.x, game.hero.y - 36, '', 40);
  for (let i = 0; i < (game.effectsLow ? 8 : 18); i++) {
    effect(game, 'confetti', game.hero.x + (decision(game) - .5) * 220, game.hero.y - 100 - decision(game) * 40,
      '', 110, { vx: (decision(game) - .5) * 140, vy: -20 - decision(game) * 60, gravity: 95 });
  }
  enterPhase(game, 'victory');
}

function retrySection(game: FightersGame): void {
  clearInputs(game);
  game.enemies = []; game.projectiles = []; game.effects = [];
  const sections = routeSections(game);
  const section = sections[game.section];
  const spawnX = section ? clamp(section.arena - 60, 60, STAGE_WIDTH - 60) : 120;
  game.hero = newHero(spawnX, game.world.floorY);
  game.hero.hp = HERO.hp;
  game.sectionLocked = false; game.bossSpawned = false;
  game.cameraX = clamp(spawnX - 240, 0, STAGE_WIDTH - 480);
  game.outcome = 'none'; game.phaseAge = 0; game.phase = 'battle';
  game.lastProgressAt = game.tick; game.graceUntil = game.combatTick + 70;
}

export function autoIntent(game: FightersGame): void {
  const hero = game.hero;
  game.input = { x: 0, y: 0 };
  if (!inBattle(game) || !['idle', 'walk'].includes(hero.state)) return;
  const target = game.enemies.filter(enemy => enemy.hp > 0 && enemy.state !== 'exit').sort((a, b) =>
    Math.hypot(a.x - hero.x, (a.y - hero.y) * 3) - Math.hypot(b.x - hero.x, (b.y - hero.y) * 3))[0];
  if (!target) {
    // Keep the wallpaper event moving toward the next encounter.
    const sections = routeSections(game);
    const next = sections[game.section];
    if (next && !game.sectionLocked) game.input.x = hero.x < next.at ? 1 : 0;
    return;
  }
  const dx = target.x - hero.x, dy = target.y - hero.y;
  if (Math.abs(dy) > 9) game.input.y = Math.sign(dy);
  if (Math.abs(dx) > 43) game.input.x = Math.sign(dx);
  else if (Math.abs(dy) <= 16) {
    hero.facing = dx < 0 ? -1 : 1;
    if (game.firstWhiff) {
      hero.facing = hero.facing === 1 ? -1 : 1; game.firstWhiff = false; game.whiffAttackId = hero.attackId + 1;
    }
    hero.attackQueue = Math.max(1, hero.attackQueue); hero.queueUntil = game.combatTick + 39;
  }
  if (hero.gauge >= 100 && (game.enemies.filter(enemy => enemy.hp > 0).length >= 2 || target.kind === 'boss' && target.hp <= 12)) game.pendingSpecial = true;
  if (hero.hp <= 3 && target.state === 'windup' && Math.abs(dx) < 70 && game.combatTick >= hero.dodgeReadyAt) game.pendingDodge = true;
}

function clampi(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function updateDirector(game: FightersGame): void {
  if (game.phase === 'rest') {
    if (game.tick >= game.nextEventAt && game.mode === 'auto') {
      const roll = game.stats.episodes === 0 ? 1 : decision(game);
      startEpisode(game, roll < .50 ? 'short' : roll < .85 ? 'skirmish' : 'auto');
    } else if (game.tick >= game.restReactionAt) {
      effect(game, 'spark', 330 + decision(game) * 90, 96 + decision(game) * 30, '', 34);
      game.restReactionAt = game.tick + Math.round((22 + decision(game) * 22) * 60);
    }
    return;
  }
  if (game.phase === 'result' || game.phase === 'retry') return;

  // Watchdogs only run for the automatic wallpaper event.
  if (game.mode === 'auto' && !['return', 'victory'].includes(game.phase)) {
    if (game.tick - game.eventStartedAt > LIMITS.autoSeconds * 60) {
      game.stats.recoveries++; victory(game); return;
    }
    if (game.sectionLocked && game.tick - game.lastProgressAt > LIMITS.stallSeconds * 60) {
      const target = game.enemies.find(enemy => enemy.hp > 0);
      if (target) { target.x = clamp(game.hero.x + 40 * game.hero.facing, 55, STAGE_WIDTH - 55); target.y = game.hero.y; target.state = 'stunned'; target.age = 0; }
      game.hero.gauge = 100; game.lastProgressAt = game.tick; game.stats.recoveries++;
    }
  }
  if (game.hero.hp <= 0 && game.mode === 'manual') {
    game.stats.losses++; game.outcome = 'loss'; clearInputs(game);
    enterPhase(game, 'retry');
    return;
  }

  const sections = routeSections(game);
  const current = sections[game.section];

  switch (game.phase) {
    case 'intro':
      if (game.phaseAge >= 110) enterPhase(game, 'battle');
      break;
    case 'battle': {
      // Area chapter banner on crossing a boundary.
      const area = AREAS.findIndex(item => game.hero.x >= item.left && game.hero.x < item.right);
      const index = area < 0 ? AREAS.length - 1 : area;
      if (index !== game.areaIndex) { game.areaIndex = index; game.areaBannerUntil = game.tick + 150; }
      if (!current) { victory(game); break; }
      if (!game.sectionLocked) {
        if (game.hero.x >= current.at) lockSection(game, current);
      } else {
        // Hold the line inside the arena while enemies remain.
        game.cameraX = clamp(current.arena - 240, 0, STAGE_WIDTH - 480);
        game.hero.x = clampi(game.hero.x, game.cameraX + 18, game.cameraX + 462);
        const alive = game.enemies.some(enemy => enemy.hp > 0);
        if (!alive && game.enemies.every(enemy => enemy.state === 'exit' || enemy.state === 'enter')) {
          if (current.second && game.wave === 0) {
            game.wave = 1;
            spawnEncounter(game, current, 1);
            game.lastProgressAt = game.tick;
            game.graceUntil = game.combatTick + 30;
          } else {
            game.sectionLocked = false;
            game.section++;
            game.lastProgressAt = game.tick;
            if (game.hero.hp < HERO.hp) game.hero.hp++;
            if (game.section >= sections.length) victory(game);
          }
        }
      }
      break;
    }
    case 'bossIntro':
      if (game.phaseAge >= 130) { enterPhase(game, 'boss'); game.graceUntil = game.combatTick + 60; }
      break;
    case 'boss':
      if (!game.enemies.some(enemy => enemy.kind === 'boss' && enemy.hp > 0)) {
        game.sectionLocked = false;
        game.section++;
        victory(game);
      }
      break;
    case 'victory':
      if (game.phaseAge >= 150) { clearInputs(game); enterPhase(game, 'return'); }
      break;
    case 'return': {
      // Fade back home instead of walking 3000px.
      if (game.phaseAge === 70) {
        game.hero = newHero(game.world.actor.x + game.stage.homeOffset, game.world.floorY);
        game.cameraX = 0; game.enemies = []; game.projectiles = []; game.effects = [];
      }
      if (game.phaseAge >= 150) {
        if (game.mode === 'manual') enterPhase(game, 'result');
        else { enterPhase(game, 'rest'); scheduleRest(game); }
      }
      break;
    }
    default: break;
  }
}

/** Where the camera wants to be: locked arenas win, otherwise follow the heroine. */
export function desiredCamera(game: FightersGame): number {
  if (game.phase === 'return') return 120;
  const sections = routeSections(game);
  const current = sections[game.section];
  if (game.sectionLocked && current) return clamp(current.arena - 240, 0, STAGE_WIDTH - 480);
  return clamp(game.hero.x - 240, 0, STAGE_WIDTH - 480);
}

export { retrySection };
