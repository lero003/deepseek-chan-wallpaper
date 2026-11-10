import { advanceWorld, createWorld, SEASIDE, STEP_SECONDS, MAX_DELTA_SECONDS } from '../world/world.ts';
import type { Scene } from '../world/world.ts';
import { HERO, LIMITS, PHASE_NAMES, studyStage } from './definitions.ts';
import { updateHero, updateProjectiles, inBattle } from './combat.ts';
import { updateEnemies } from './enemy-brain.ts';
import { AREAS } from './definitions.ts';
import { autoIntent, desiredCamera, enterPhase, retrySection, returnHome, routeSections, scheduleRest, startEpisode, updateDirector } from './director.ts';
import { clearInputs } from './events.ts';
import { newHero, newStats } from './factory.ts';
import { direction } from './movement.ts';
import type { Action, FightersGame, Frequency, GameUI } from './types.ts';

export function createGame(seed: number, scene: Scene = SEASIDE): FightersGame {
  const world = createWorld(seed, scene);
  const game: FightersGame = { world, scene, stage: studyStage(scene), tick: 0, combatTick: 0, remainder: 0,
    mode: 'auto', phase: 'rest', phaseAge: 0, focused: false, paused: false, frequency: 'low', effectsLow: true,
    nextEventAt: 0, restReactionAt: 0, eventStartedAt: 0, lastProgressAt: 0, graceUntil: 0, hitstop: 0,
    randomState: (world.seed ^ 0x7fa82b19) >>> 0 || 1, nextId: 1, episode: 'boss',
    route: 'full', section: 0, sectionLocked: false, wave: 0, routeTick: 0, areaIndex: 0, areaBannerUntil: 0, bossSpawned: false,
    hero: newHero(world.actor.x + 120, world.floorY), enemies: [], projectiles: [], effects: [],
    input: { x: 0, y: 0 }, pendingDodge: false, pendingSpecial: false, cameraX: 120, firstWhiff: true, whiffAttackId: -1,
    message: '', messageUntil: 0, outcome: 'none', stats: newStats() };
  scheduleRest(game);
  return game;
}
export function setFocus(game: FightersGame, focused: boolean): void {
  if (game.focused === focused) return;
  game.focused = focused; clearInputs(game);
  if (focused && game.mode === 'manual') { game.graceUntil = game.combatTick + HERO.graceTicks; }
}
export function setMovement(game: FightersGame, x: number, y: number): void {
  game.input = game.mode === 'manual' && game.focused && !game.paused ? direction(x, y) : { x: 0, y: 0 };
}
export function requestAction(game: FightersGame, action: Action): void {
  if (game.mode !== 'manual' || !game.focused || game.paused || ['rest', 'result', 'retry', 'victory', 'return'].includes(game.phase)) return;
  if (action === 'attack') { game.hero.attackQueue = Math.min(3, game.hero.attackQueue + 1); game.hero.queueUntil = game.combatTick + HERO.comboWindow; }
  else if (action === 'dodge') game.pendingDodge = true;
  else if (action === 'special') game.pendingSpecial = true;
}
export function command(game: FightersGame, name: string, value?: unknown): void {
  switch (name) {
    case 'play':
      if (game.mode === 'manual' && !['result', 'retry'].includes(game.phase)) return;
      if (['rest', 'result', 'retry', 'victory', 'return'].includes(game.phase)) startEpisode(game, 'full');
      // Taking over a wallpaper episode always continues as the full manual route.
      game.episode = 'boss'; game.route = 'full'; game.section = Math.min(game.section, routeSections(game).length - 1);
      game.sectionLocked = false; game.hero.hp = Math.max(4, game.hero.hp);
      game.mode = 'manual'; game.paused = false;
      game.graceUntil = game.combatTick + HERO.graceTicks; clearInputs(game); break;
    case 'home': returnHome(game); break;
    case 'retry':
      if (game.mode !== 'manual') return;
      retrySection(game); game.paused = false; break;
    case 'demo': if (game.mode === 'auto') startEpisode(game, 'auto'); break;
    case 'pause':
      if (game.mode !== 'manual') return;
      game.paused = !game.paused; clearInputs(game);
      if (!game.paused) game.graceUntil = game.combatTick + HERO.graceTicks;
      break;
    case 'frequency':
      if (!['off', 'low', 'normal'].includes(String(value))) throw new Error('Invalid encounter frequency.');
      game.frequency = value as Frequency;
      if (game.phase === 'rest') scheduleRest(game);
      break;
    case 'effects': game.effectsLow = value !== false; break;
    case 'attack': case 'dodge': case 'special': requestAction(game, name); break;
    default: throw new Error('Unknown game command.');
  }
}
function step(game: FightersGame): void {
  advanceWorld(game.world, STEP_SECONDS);
  game.tick = game.world.tick;
  if (game.mode === 'manual' && (!game.focused || game.paused)) return;
  if (game.hitstop > 0) { game.hitstop--; return; }
  game.combatTick++; game.phaseAge++;
  for (const item of game.effects) {
    item.age++;
    if (item.vx || item.vy || item.gravity) {
      item.x += item.vx / 60; item.y += item.vy / 60; item.vy += item.gravity / 60;
    }
  }
  game.effects = game.effects.filter(item => item.age < item.ttl && item.y < 300);
  if (['intro', 'battle', 'bossIntro', 'boss'].includes(game.phase)) {
    if (game.mode === 'auto') autoIntent(game);
    if (game.phase !== 'bossIntro') { updateHero(game); updateEnemies(game); updateProjectiles(game); }
  } else if (game.phase === 'victory') updateEnemies(game);
  updateDirector(game);
  if (game.phase !== 'rest' && game.phase !== 'result') {
    const target = desiredCamera(game);
    const rate = game.phase === 'return' ? .16 : .08;
    game.cameraX += (target - game.cameraX) * rate;
  }
  game.stats.maxEnemies = Math.max(game.stats.maxEnemies, game.enemies.length);
  game.stats.maxProjectiles = Math.max(game.stats.maxProjectiles, game.projectiles.length);
  game.stats.maxEffects = Math.max(game.stats.maxEffects, game.effects.length);
  if (game.enemies.length > LIMITS.enemies || game.projectiles.length > LIMITS.projectiles || game.effects.length > LIMITS.effects) throw new Error('Bounded scene collection exceeded.');
}
export function advanceGame(game: FightersGame, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  game.remainder += Math.min(deltaSeconds, MAX_DELTA_SECONDS);
  const steps = Math.floor((game.remainder + 1e-9) / STEP_SECONDS);
  game.remainder = Math.max(0, game.remainder - steps * STEP_SECONDS);
  for (let index = 0; index < steps; index++) step(game);
}
export function gameUI(game: FightersGame): GameUI {
  const sections = routeSections(game);
  const total = sections.length;
  const area = AREAS[game.areaIndex] ?? AREAS[AREAS.length - 1]!;
  const boss = game.enemies.find(enemy => enemy.kind === 'boss');
  const progress = total <= 1 ? 1 : Math.min(1, (game.section + (game.sectionLocked ? .5 : 0)) / total);
  return { mode: game.mode, phase: game.phase, phaseLabel: PHASE_NAMES[game.phase], focused: game.focused, paused: game.paused, hp: game.hero.hp,
    gauge: game.hero.gauge, combo: game.hero.hitCombo, dodgeReady: game.combatTick >= game.hero.dodgeReadyAt,
    specialReady: game.hero.gauge >= 100, outcome: game.outcome, message: game.tick < game.messageUntil ? game.message : '',
    frequency: game.frequency, effectsLow: game.effectsLow, enemies: game.enemies.filter(enemy => enemy.hp > 0).length,
    bossHP: boss?.hp ?? 0, section: game.section, sections: total, locked: game.sectionLocked,
    areaName: area.name, areaSubtitle: area.subtitle, progress };
}
export { inBattle, enterPhase };
