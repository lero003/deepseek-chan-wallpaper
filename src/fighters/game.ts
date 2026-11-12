import { advanceWorld, createWorld, SEASIDE, STEP_SECONDS, MAX_DELTA_SECONDS } from '../world/world.ts';
import type { Scene } from '../world/world.ts';
import { ARENA_PHASE_NAMES, BOSSES, HERO, LIMITS, PHASE_NAMES, isFixedArena, studyStage } from './definitions.ts';
import { updateHero, updateProjectiles, inBattle } from './combat.ts';
import { updateEnemies } from './enemy-brain.ts';
import { AREAS } from './definitions.ts';
import { autoIntent, desiredCamera, enterPhase, retrySection, returnHome, routeSections, scheduleRest, startEpisode, startWallpaperBout, updateDirector } from './director.ts';
import { endlessUI, startEndlessBattle } from './endless.ts';
import { clearInputs } from './events.ts';
import { newHero, newStats } from './factory.ts';
import { direction } from './movement.ts';
import { arcadeUI, newArcade, spendArcadeTick } from './arcade.ts';
import { advanceCompanion, callState, cancelCompanion, companionLine, requestCall } from '../companion/companion.ts';
import { advanceVisits, createVisits, setVisitsEnabled } from '../companion/visitors.ts';
import type { Action, FightersGame, Frequency, GameUI } from './types.ts';

export function createGame(seed: number, scene: Scene = SEASIDE): FightersGame {
  const world = createWorld(seed, scene);
  const game: FightersGame = { world, scene, stage: studyStage(scene), tick: 0, combatTick: 0, remainder: 0,
    mode: 'auto', phase: 'rest', phaseAge: 0, focused: false, paused: false, frequency: 'low', effectsLow: true,
    nextEventAt: 0, restReactionAt: 0, eventStartedAt: 0, lastProgressAt: 0, graceUntil: 0, hitstop: 0,
    randomState: (world.seed ^ 0x7fa82b19) >>> 0 || 1, nextId: 1, episode: 'boss',
    route: 'full', section: 0, sectionLocked: false, wave: 0, routeTick: 0, areaIndex: 0, areaBannerUntil: 0, bossSpawned: false,
    roomVariant: 0, runTicks: 0, runStats: newStats(), arcade: newArcade(), endless: null,
    hero: newHero(world.actor.x + 120, world.floorY), enemies: [], projectiles: [], effects: [],
    input: { x: 0, y: 0 }, pendingDodge: false, pendingSpecial: false, cameraX: 120, firstWhiff: true, whiffAttackId: -1,
    message: '', messageUntil: 0, outcome: 'none', stats: newStats(),
    cue: null, cueReadyAt: 0, homeLine: '', homeLineUntil: 0, visits: createVisits(world.seed) };
  scheduleRest(game);
  return game;
}
export function setFocus(game: FightersGame, focused: boolean): void {
  if (game.focused === focused) return;
  game.focused = focused; clearInputs(game);
  if (focused && game.mode === 'manual') { game.graceUntil = game.combatTick + HERO.graceTicks; }
}
export function setMovement(game: FightersGame, x: number, y: number): void {
  game.input = game.mode === 'manual' && game.focused && !game.paused
    && (game.route !== 'arena' || inBattle(game)) ? direction(x, y) : { x: 0, y: 0 };
}
export function requestAction(game: FightersGame, action: Action): void {
  if (game.mode !== 'manual' || !game.focused || game.paused || !inBattle(game)) return;
  if (action === 'attack') { game.hero.attackQueue = Math.min(3, game.hero.attackQueue + 1); game.hero.queueUntil = game.combatTick + HERO.comboWindow; }
  else if (action === 'dodge') game.pendingDodge = true;
  else if (action === 'special') game.pendingSpecial = true;
}
export function command(game: FightersGame, name: string, value?: unknown): void {
  switch (name) {
    case 'endless': startEndlessBattle(game); break;
    case 'play':
      if (game.mode === 'endless') return;
      if (game.mode === 'manual' && !['result', 'retry'].includes(game.phase)) return;
      // A new manual match never inherits wallpaper coordinates, counters or projectiles.
      game.mode = 'manual'; game.paused = false; game.episode = 'boss';
      startEpisode(game, 'arena');
      game.graceUntil = game.combatTick + HERO.graceTicks; clearInputs(game); break;
    case 'home': returnHome(game); break;
    case 'retry':
      if (game.mode !== 'manual' || !['battle', 'boss', 'retry', 'result'].includes(game.phase)) return;
      retrySection(game); game.paused = false; break;
    case 'demo': if (game.mode === 'auto') startWallpaperBout(game); break;
    case 'call': requestCall(game); break;
    case 'cancelCall': cancelCompanion(game); break;
    case 'visitors':
      if (typeof value !== 'boolean') throw new Error('Invalid visitor mode.');
      setVisitsEnabled(game, value); break;
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
  advanceCompanion(game);
  if (game.mode === 'manual' && (!game.focused || game.paused)) return;
  // This is actual active elapsed time, not combatTick (which intentionally omits hitstop).
  if (!['rest', 'result', 'retry'].includes(game.phase)) game.runTicks++;
  if (spendArcadeTick(game)) { updateDirector(game); return; }
  if (game.hitstop > 0) { game.hitstop--; return; }
  game.combatTick++; game.phaseAge++;
  for (const item of game.effects) {
    item.age++;
    if (item.vx || item.vy || item.gravity) {
      item.x += item.vx / 60; item.y += item.vy / 60; item.vy += item.gravity / 60;
    }
  }
  game.effects = game.effects.filter(item => item.age < item.ttl && item.y < 300);
  if (isFixedArena(game.route)) {
    // Both actors and hostile projectiles are frozen outside a live round, not just input.
    // The passive wallpaper bout is auto-piloted; a manual round reads the user's input.
    if (inBattle(game)) {
      if (game.mode !== 'manual') autoIntent(game);
      updateHero(game); updateEnemies(game); updateProjectiles(game);
    } else if (game.phase === 'victory') updateEnemies(game);
  } else if (['intro', 'battle', 'bossIntro', 'boss'].includes(game.phase)) {
    if (game.mode !== 'manual') autoIntent(game);
    if (game.phase !== 'bossIntro') { updateHero(game); updateEnemies(game); updateProjectiles(game); }
  } else if (game.phase === 'victory') updateEnemies(game);
  updateDirector(game);
  advanceVisits(game);
  if (game.phase !== 'rest' && game.phase !== 'result') {
    const target = desiredCamera(game);
    const rate = game.phase === 'return' ? .16 : .08;
    if (isFixedArena(game.route)) game.cameraX = target;
    else game.cameraX += (target - game.cameraX) * rate;
  }
  for (const stats of [game.stats, game.runStats]) {
    stats.maxEnemies = Math.max(stats.maxEnemies, game.enemies.length);
    stats.maxProjectiles = Math.max(stats.maxProjectiles, game.projectiles.length);
    stats.maxEffects = Math.max(stats.maxEffects, game.effects.length);
  }
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
  const arena = isFixedArena(game.route);
  const endless = endlessUI(game);
  const area = AREAS[arena ? 1 : game.areaIndex] ?? AREAS[AREAS.length - 1]!;
  const boss = game.enemies.find(enemy => enemy.kind === 'boss');
  const bossCount = Object.keys(BOSSES).length;
  const round = endless && game.endless
    ? endless.cycle * bossCount - game.endless.bossBag.length : Math.min(total, game.section + 1);
  const roundLabel = endless?.bossName ?? sections[round - 1]?.label ?? '';
  const progress = total <= 1 ? 1 : Math.min(1, (game.section + (game.phase === 'roundClear' ? 1 : game.sectionLocked ? .5 : 0)) / total);
  const ready = game.mode !== 'endless' && (!arena || inBattle(game) && game.focused && !game.paused);
  const phaseLabel = endless?.phaseLabel ?? (arena ? ARENA_PHASE_NAMES[game.phase] : PHASE_NAMES[game.phase]);
  const call = callState(game);
  return { endless, callReady: call.ready, callReason: call.reason, companionLine: companionLine(game),
    mode: game.mode, phase: game.phase, phaseLabel, focused: game.focused, paused: game.paused, hp: game.hero.hp,
    gauge: game.hero.gauge, combo: game.hero.hitCombo, dodgeReady: ready && game.combatTick >= game.hero.dodgeReadyAt,
    specialReady: ready && game.hero.gauge >= 100, outcome: game.outcome, message: game.tick < game.messageUntil ? game.message : '',
    frequency: game.frequency, effectsLow: game.effectsLow, enemies: game.enemies.filter(enemy => enemy.hp > 0).length,
    bossHP: boss?.hp ?? 0, section: game.section, sections: total, locked: game.sectionLocked,
    areaName: endless?.stageLabel ?? area.name, areaSubtitle: endless ? `周回 ${endless.cycle}` : arena ? `ラウンド ${round} / ${total}` : area.subtitle, progress,
    route: game.route, round, rounds: total, roundLabel, elapsedSeconds: game.runTicks / 60, runStats: { ...game.runStats }, arcade: arcadeUI(game) };
}
export { inBattle, enterPhase };
