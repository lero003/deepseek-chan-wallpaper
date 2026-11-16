import {
  AREAS, ARENA, ARENA_ROUNDS, AUTO_SECTIONS, HERO, LIMITS, ROOM_INCIDENTS, ROOM_PADDING, ROOM_SECTIONS, RUN_SECTIONS,
  SHORT_SECTIONS, SKIRMISH_SECTIONS, STAGE_WIDTH, arenaStage, studyStage, isFixedArena,
} from './definitions.ts';
import type { RoomIncident, SectionDefinition } from './definitions.ts';
import { inBattle } from './combat.ts';
import { decision, effect, clearInputs } from './events.ts';
import { spawnEnemy } from './enemy-brain.ts';
import { newHero, newStats, recordStat } from './factory.ts';
import { clearArcadeRound, newArcade, startArcadeRound } from './arcade.ts';
import { HOME_CAPTION, REST_CAPTION, settleHome } from '../companion/companion.ts';
import { startEndlessBattle, updateEndless } from './endless.ts';
import { cancelVisit } from '../companion/visitors.ts';
import { clamp } from './movement.ts';
import type { FightersGame, Phase, Route } from './types.ts';

/**
 * Room incidents are short by design: a small wave of visitors, a brief celebration and the
 * wallpaper fade home. Total non-fighting time is ~5s so the whole event stays 10–25 seconds.
 */
const ROOM_TICKS = { intro: 90, victory: 180, teleport: 70, return: 150 } as const;

export function routeSections(game: FightersGame): readonly SectionDefinition[] {
  if (game.route === 'endless') return [];
  if (game.route === 'arena') return ARENA_ROUNDS;
  if (game.route === 'full') return RUN_SECTIONS;
  if (game.route === 'auto') return AUTO_SECTIONS;
  if (game.route === 'room') return ROOM_SECTIONS;
  return game.route === 'skirmish' ? SKIRMISH_SECTIONS : SHORT_SECTIONS;
}
export function isRoomRoute(game: FightersGame): boolean { return game.route === 'room'; }

export function enterPhase(game: FightersGame, phase: Phase): void {
  game.phase = phase; game.phaseAge = 0; game.lastProgressAt = game.tick;
  if (isFixedArena(game.route) && !inBattle(game)) {
    clearInputs(game);
    if (phase !== 'retry') { game.hero.state = 'idle'; game.hero.age = 0; }
  }
}
export function scheduleRest(game: FightersGame): void {
  const minimum = game.frequency === 'normal' ? 80 : 170;
  const variation = game.frequency === 'normal' ? 50 : 110;
  game.nextEventAt = game.frequency === 'off' ? Number.MAX_SAFE_INTEGER : game.tick + Math.round((minimum + decision(game) * variation) * 60);
  game.restReactionAt = game.tick + Math.round((20 + decision(game) * 24) * 60);
}
export function startEpisode(game: FightersGame, route: Route): void {
  if (route === 'endless') { startEndlessBattle(game); return; }
  game.endless = null;
  game.sparring = null;
  cancelVisit(game);
  clearInputs(game);
  const room = route === 'room';
  game.stage = route === 'arena' ? arenaStage(game.scene) : studyStage(game.scene);
  // The room incident begins wherever the quiet heroine already stands, in the room's own
  // art coordinates; the long routes keep the hero at the start of the 3600px stage.
  if (room) game.roomVariant = Math.floor(decision(game) * ROOM_INCIDENTS.length) % ROOM_INCIDENTS.length;
  game.hero = newHero(room ? game.world.actor.x : 120, game.world.floorY);
  // Continue the quiet heroine's pose into the incident instead of snapping to a new facing.
  if (room) game.hero.facing = game.world.actor.facing;
  game.enemies = []; game.projectiles = []; game.effects = []; game.hitstop = 0;
  game.route = route; game.section = 0; game.sectionLocked = false; game.wave = 0; game.bossSpawned = false;
  game.eventStartedAt = game.tick; game.outcome = 'none'; game.cameraX = 0;
  game.areaIndex = 0; game.areaBannerUntil = room ? 0 : game.tick + 130; game.routeTick = game.tick;
  game.firstWhiff = true; game.whiffAttackId = -1;
  game.cue = null;
  game.runTicks = 0; game.runStats = newStats(); game.arcade = newArcade();
  recordStat(game, 'episodes'); game.stats.sections = 0;
  game.message = ''; game.messageUntil = 0;
  if (route === 'arena') prepareArenaRound(game);
  else enterPhase(game, 'intro');
}
export function returnHome(game: FightersGame): void {
  cancelVisit(game);
  const won = game.outcome === 'win';
  clearInputs(game); game.projectiles = []; game.enemies = []; game.paused = false; game.mode = 'auto'; game.focused = false;
  if (isFixedArena(game.route)) { game.effects = []; game.hitstop = 0; }
  if (game.route === 'endless') game.route = 'full';
  game.endless = null;
  game.sparring = null;
  const homeOffset = game.route === 'room' ? 0 : game.stage.homeOffset;
  game.stage = studyStage(game.scene);
  game.cameraX = 0; game.hero = newHero(game.world.actor.x + homeOffset, game.world.floorY);
  game.sectionLocked = false; game.outcome = 'none';
  enterPhase(game, 'rest'); scheduleRest(game);
  settleHome(game, won ? HOME_CAPTION : REST_CAPTION);
}

/** Each round has a safe, empty introduction. No traversal unlocks the fight. */
function prepareArenaRound(game: FightersGame, retry = false): void {
  startArcadeRound(game, retry);
  const hp = game.hero.hp, gauge = game.hero.gauge;
  clearInputs(game);
  game.stage = arenaStage(game.scene);
  game.hero = newHero(ARENA.heroX, ARENA.heroY);
  game.hero.hp = hp; game.hero.gauge = gauge;
  game.enemies = []; game.projectiles = []; game.effects = []; game.hitstop = 0;
  game.sectionLocked = false; game.wave = 0; game.bossSpawned = false;
  game.cameraX = ARENA.cameraX; game.areaIndex = 1; game.areaBannerUntil = 0;
  enterPhase(game, ARENA_ROUNDS[game.section]?.boss ? 'bossIntro' : 'intro');
}
/**
 * The wallpaper bout is a watchable skirmish, not the 90-second arcade match: one small
 * enemy arrives at a time, so a glance at the desktop always catches a live exchange.
 * `wave` counts arrivals in this bout; the arena path has no second-wave logic of its own.
 */
const SHOWCASE = { quota: 30, maxAlive: 3, gapTicks: 52, limitTicks: 80 * 60 } as const;

/** The passive wallpaper's automatic scene: a terrace skirmish already in progress. */
export function startWallpaperBout(game: FightersGame): void {
  startEpisode(game, 'arena');
  // Skip the READY card: the wallpaper cuts into an exchange that has already begun.
  enterPhase(game, 'battle');
  game.sectionLocked = true;
  game.hero.hp = Math.max(2, HERO.hp - 2);
  game.hero.gauge = 62;
  game.hero.x = ARENA.heroX + 26;
  game.hero.facing = 1;
  game.hero.state = 'attack'; game.hero.age = 4; game.hero.combo = 2;
  spawnBoutEnemy(game, 0);
  spawnBoutEnemy(game, 1);
  game.wave = 2;
  game.enemies.forEach((enemy, index) => {
    enemy.hp = index === 0 ? 2 : 1;
    enemy.state = 'move'; enemy.age = 10 + index * 7;
    enemy.targetX = game.hero.x;
  });
  game.graceUntil = game.combatTick + 24;
  for (let index = 0; index < 3; index++) {
    effect(game, 'spark', ARENA.enemyX - 16 + index * 17, ARENA.heroY - 28 - index * 8, '', 16);
  }
}

/** One arrival from the terrace's right edge; both approved small species, all variants. */
function spawnBoutEnemy(game: FightersGame, index: number): void {
  const kind = index % 2 === 0 ? 'slime' : 'popup';
  const variant = index % 5 === 3 ? 2 : index % 3 === 2 ? 1 : 0;
  const span = ARENA.bottom - ARENA.top - 8;
  const y = ARENA.top + 4 + (index * 13) % span;
  const enemy = spawnEnemy(game, kind, variant, ARENA.right - 16, y, -1, true);
  if (!enemy) return;
  enemy.readyAt = game.combatTick + 24;
  enemy.targetX = ARENA.heroX + 70;
  enemy.age = 6;
}

function beginArenaBattle(game: FightersGame): void {
  const round = ARENA_ROUNDS[game.section];
  if (!round) { victory(game); return; }
  clearInputs(game);
  game.sectionLocked = true;
  round.spawns.forEach((spawn, index) => {
    const x = round.boss ? ARENA.enemyX : ARENA.enemyX + (index % 2) * 44;
    const y = round.boss ? ARENA.heroY : ARENA.heroY + (index === 0 ? 0 : index % 2 ? -8 : 8);
    spawnEnemy(game, spawn.kind, spawn.variant, x, y, -1, false);
  });
  game.bossSpawned = Boolean(round.boss);
  // A replayed round is still the same round, not another completed/visited section.
  game.stats.sections = Math.max(game.stats.sections, game.section + 1);
  game.runStats.sections = Math.max(game.runStats.sections, game.section + 1);
  enterPhase(game, round.boss ? 'boss' : 'battle');
  game.graceUntil = game.combatTick + HERO.graceTicks;
}
/** Keep actors readable in the fixed terrace even after knockback, dodge or a lunge. */
function constrainArenaActors(game: FightersGame): void {
  game.cameraX = ARENA.cameraX;
  for (const actor of [game.hero, ...game.enemies]) {
    actor.x = clamp(actor.x, ARENA.left, ARENA.right);
    actor.y = clamp(actor.y, ARENA.top, ARENA.bottom);
  }
  for (const enemy of game.enemies) enemy.targetX = clamp(enemy.targetX, ARENA.left, ARENA.right);
}
function updateArenaRound(game: FightersGame): void {
  constrainArenaActors(game);
  switch (game.phase) {
    case 'intro':
      if (game.phaseAge >= ARENA.introTicks) beginArenaBattle(game);
      break;
    case 'bossIntro':
      if (game.phaseAge >= ARENA.bossIntroTicks) beginArenaBattle(game);
      break;
    case 'battle':
    case 'boss':
      if (game.mode === 'auto' && game.phase === 'battle') { updateWallpaperBout(game); break; }
      if (!game.enemies.some(enemy => enemy.hp > 0 && enemy.state !== 'exit')) {
        game.projectiles = []; game.hitstop = 0; game.sectionLocked = false;
        clearArcadeRound(game);
        if (game.phase === 'boss') { game.section = ARENA_ROUNDS.length; victory(game); }
        else {
          // Leave the defeat particles, not frozen exit-pose bodies, behind the clear card.
          game.enemies = [];
          game.hero.hp = Math.min(HERO.hp, game.hero.hp + 1);
          enterPhase(game, 'roundClear');
        }
      }
      break;
    case 'roundClear':
      if (game.phaseAge >= ARENA.roundClearTicks) { game.section++; prepareArenaRound(game); }
      break;
    default: break;
  }
}

/** Reinforcements keep the wallpaper skirmish moving, then everyone goes home. */
function updateWallpaperBout(game: FightersGame): void {
  const elapsed = game.tick - game.eventStartedAt;
  const alive = game.enemies.filter(enemy => enemy.hp > 0 && enemy.state !== 'exit').length;
  // An empty terrace refills at once; otherwise arrivals follow the pacing schedule.
  if (game.wave < SHOWCASE.quota && alive < SHOWCASE.maxAlive
    && elapsed >= game.wave * SHOWCASE.gapTicks) {
    spawnBoutEnemy(game, game.wave);
    game.wave++;
  }
  if (alive === 0 && game.wave >= SHOWCASE.quota) { game.enemies = []; victory(game); }
  else if (elapsed > SHOWCASE.limitTicks) { game.enemies = []; victory(game); }
}

function roomIncident(game: FightersGame): RoomIncident {
  return ROOM_INCIDENTS[game.roomVariant % ROOM_INCIDENTS.length] ?? ROOM_INCIDENTS[0]!;
}
/** Room visitors pop up at the window-side edges of the accepted room, not outside the camera. */
function spawnRoomEncounter(game: FightersGame, wave: number): void {
  const incident = roomIncident(game);
  const list = wave === 0 ? incident.spawns : (incident.second ?? []);
  const range = game.world.range;
  const firstLeft = decision(game) < .5;
  list.forEach((spawn, index) => {
    const fromLeft = index % 2 === 0 ? firstLeft : !firstLeft;
    const base = fromLeft ? range.left + 24 : range.right - 24;
    const x = clamp(base + (decision(game) - .5) * 26, range.left + ROOM_PADDING, range.right - ROOM_PADDING);
    const y = 224 + ((index * 11 + wave * 7 + game.roomVariant * 5) % 23);
    const enemy = spawnEnemy(game, spawn.kind, spawn.variant, x, y, fromLeft ? 1 : -1, true);
    if (!enemy) return;
    // The visitor appears inside the room, takes a couple of steps in, then joins the scuffle.
    enemy.targetX = clamp(x + (fromLeft ? 34 : -34) + (decision(game) - .5) * 14,
      range.left - ROOM_PADDING, range.right + ROOM_PADDING);
    enemy.readyAt = game.combatTick + 26;
  });
}
function spawnEncounter(game: FightersGame, section: SectionDefinition, wave = 0): void {
  if (game.route === 'room') { spawnRoomEncounter(game, wave); return; }
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
function hasSecondWave(game: FightersGame, section: SectionDefinition): boolean {
  return game.route === 'room' ? Boolean(roomIncident(game).second) : Boolean(section.second);
}
/** Keep a room incident inside the accepted room without scrolling the camera. */
function constrainRoomActors(game: FightersGame): void {
  const range = game.world.range;
  game.cameraX = 0;
  game.hero.x = clamp(game.hero.x, range.left, range.right);
  for (const enemy of game.enemies) {
    enemy.x = clamp(enemy.x, range.left - ROOM_PADDING, range.right + ROOM_PADDING);
    enemy.targetX = clamp(enemy.targetX, range.left - ROOM_PADDING, range.right + ROOM_PADDING);
  }
}
function lockSection(game: FightersGame, section: SectionDefinition): void {
  game.sectionLocked = true; game.wave = 0;
  game.cameraX = clamp(section.arena - 240, 0, STAGE_WIDTH - 480);
  game.graceUntil = game.combatTick + 45;
  game.lastProgressAt = game.tick;
  spawnEncounter(game, section, 0);
  recordStat(game, 'sections');
  if (section.boss) {
    game.bossSpawned = true;
    enterPhase(game, 'bossIntro');
  }
}
function victory(game: FightersGame): void {
  if (game.outcome !== 'win') recordStat(game, 'wins');
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
  // The room incident ends quietly: a breath and a cup of tea, not a stage-clear fanfare.
  if (game.route === 'room') {
    effect(game, 'tea', clamp(game.hero.x + 18, 24, 456), game.hero.y - 34, '', 60);
  }
}

function retrySection(game: FightersGame): void {
  if (game.phase === 'result') { startEpisode(game, game.route); return; }
  if (game.phase !== 'retry' && !inBattle(game)) return;
  clearInputs(game);
  if (game.route === 'arena') {
    game.hero.hp = HERO.hp; game.hero.gauge = 0;
    game.outcome = 'none';
    prepareArenaRound(game, true);
    return;
  }
  game.enemies = []; game.projectiles = []; game.effects = []; game.hitstop = 0;
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
  if (game.mode === 'sparring') { constrainArenaActors(game); return; }
  if (game.route === 'endless') { constrainArenaActors(game); updateEndless(game); return; }
  if (game.phase === 'rest') {
    if (game.frequency !== 'off' && game.tick >= game.nextEventAt && game.mode === 'auto') {
      // The wallpaper's periodic action is a short auto-piloted terrace bout, not a
      // study-room incident: the user asked to see fighting while the desktop is idle.
      startWallpaperBout(game);
    } else if (game.tick >= game.restReactionAt) {
      effect(game, 'spark', 330 + decision(game) * 90, 96 + decision(game) * 30, '', 34);
      game.restReactionAt = game.tick + Math.round((22 + decision(game) * 22) * 60);
    }
    return;
  }
  if (game.phase === 'result' || game.phase === 'retry') return;
  if (game.route === 'room') constrainRoomActors(game);

  // Watchdogs only run for the automatic wallpaper event.
  if (game.mode === 'auto' && !['return', 'victory'].includes(game.phase)) {
    if (game.tick - game.eventStartedAt > LIMITS.autoSeconds * 60) {
      recordStat(game, 'recoveries'); victory(game); return;
    }
    if (game.sectionLocked && game.tick - game.lastProgressAt > LIMITS.stallSeconds * 60) {
      const target = game.enemies.find(enemy => enemy.hp > 0);
      if (target) { target.x = clamp(game.hero.x + 40 * game.hero.facing, 55, STAGE_WIDTH - 55); target.y = game.hero.y; target.state = 'stunned'; target.age = 0; }
      game.hero.gauge = 100; game.lastProgressAt = game.tick; recordStat(game, 'recoveries');
    }
  }
  if (game.hero.hp <= 0 && game.mode === 'manual') {
    recordStat(game, 'losses'); game.outcome = 'loss'; clearInputs(game);
    game.projectiles = []; game.hitstop = 0;
    enterPhase(game, 'retry');
    return;
  }
  if (game.route === 'arena' && !['victory', 'return'].includes(game.phase)) {
    updateArenaRound(game);
    return;
  }

  const sections = routeSections(game);
  const current = sections[game.section];

  switch (game.phase) {
    case 'intro':
      if (game.phaseAge >= (game.route === 'room' ? ROOM_TICKS.intro : 110)) enterPhase(game, 'battle');
      break;
    case 'battle': {
      // Area chapter banner on crossing a boundary. Room incidents never leave the study.
      if (game.route !== 'room') {
        const area = AREAS.findIndex(item => game.hero.x >= item.left && game.hero.x < item.right);
        const index = area < 0 ? AREAS.length - 1 : area;
        if (index !== game.areaIndex) { game.areaIndex = index; game.areaBannerUntil = game.tick + 150; }
      }
      if (!current) { victory(game); break; }
      if (!game.sectionLocked) {
        if (game.hero.x >= current.at) lockSection(game, current);
      } else {
        if (game.route === 'room') constrainRoomActors(game);
        else {
          // Hold the line inside the arena while enemies remain.
          game.cameraX = clamp(current.arena - 240, 0, STAGE_WIDTH - 480);
          game.hero.x = clampi(game.hero.x, game.cameraX + 18, game.cameraX + 462);
        }
        const alive = game.enemies.some(enemy => enemy.hp > 0);
        if (!alive && game.enemies.every(enemy => enemy.state === 'exit' || enemy.state === 'enter')) {
          if (game.wave === 0 && hasSecondWave(game, current)) {
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
      if (game.phaseAge >= (game.route === 'room' ? ROOM_TICKS.victory : ARENA.victoryTicks)) { clearInputs(game); enterPhase(game, 'return'); }
      break;
    case 'return': {
      // Fade back home instead of walking 3000px.
      const teleportTick = game.route === 'arena' ? ARENA.teleportTick : ROOM_TICKS.teleport;
      const returnTicks = game.route === 'arena' ? ARENA.returnTicks : ROOM_TICKS.return;
      if (game.phaseAge === teleportTick) {
        const homeOffset = game.route === 'room' ? 0 : game.stage.homeOffset;
        game.stage = studyStage(game.scene);
        game.hero = newHero(game.world.actor.x + homeOffset, game.world.floorY);
        game.cameraX = 0; game.enemies = []; game.projectiles = []; game.effects = [];
      }
      if (game.phaseAge >= returnTicks) {
        if (game.mode === 'manual') enterPhase(game, 'result');
        else { enterPhase(game, 'rest'); scheduleRest(game); settleHome(game, HOME_CAPTION); }
      }
      break;
    }
    default: break;
  }
}

/** Where the camera wants to be: locked arenas win, otherwise follow the heroine. */
export function desiredCamera(game: FightersGame): number {
  // Room incidents use the room's own art coordinates and never scroll.
  if (game.route === 'endless') return ARENA.cameraX;
  if (game.route === 'room') return 0;
  if (game.route === 'arena') return ['rest', 'result'].includes(game.phase)
    || game.phase === 'return' && game.phaseAge >= ARENA.teleportTick ? 0 : ARENA.cameraX;
  if (game.phase === 'return') return 120;
  const sections = routeSections(game);
  const current = sections[game.section];
  if (game.sectionLocked && current) return clamp(current.arena - 240, 0, STAGE_WIDTH - 480);
  return clamp(game.hero.x - 240, 0, STAGE_WIDTH - 480);
}

export { retrySection };
