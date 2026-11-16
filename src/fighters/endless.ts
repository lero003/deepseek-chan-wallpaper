import { ARENA, ARENA_STAGES, BOSSES, ENDLESS, HERO, arenaStage } from './definitions.ts';
import { newEndlessState, newHero, newStats, recordStat } from './factory.ts';
import { newArcade } from './arcade.ts';
import { clearInputs, decision, effect } from './events.ts';
import { enterPhase } from './director.ts';
import { cancelVisit } from '../companion/visitors.ts';
import { spawnEnemy } from './enemy-brain.ts';
import type { BossId, EndlessUI, FightersGame, StageId } from './types.ts';

/** Each roster is a permutation, with no repetition at the boundary between bags. */
export function shuffleBag<T>(game: FightersGame, ids: readonly T[], previous: T | null): T[] {
  const bag = [...ids];
  for (let index = bag.length - 1; index > 0; index--) {
    const other = Math.floor(decision(game) * (index + 1));
    [bag[index], bag[other]] = [bag[other]!, bag[index]!];
  }
  if (bag.length > 1 && bag[0] === previous) [bag[0], bag[1]] = [bag[1]!, bag[0]!];
  return bag;
}
export function pickBoss(game: FightersGame, ids = Object.keys(BOSSES) as BossId[]): BossId {
  const state = game.endless;
  if (!state) throw new Error('Endless mode is inactive.');
  if (!state.bossBag.length) {
    if (state.lastBossId !== null) state.cycle++;
    state.bossBag = shuffleBag(game, ids.length ? ids : ['lumie'], state.lastBossId);
  }
  const id = state.bossBag.shift()!;
  state.bossId = id; state.lastBossId = id;
  return id;
}
export function pickStage(game: FightersGame, ids = Object.keys(ARENA_STAGES) as StageId[]): StageId {
  const state = game.endless;
  if (!state) throw new Error('Endless mode is inactive.');
  if (!state.stageBag.length) state.stageBag = shuffleBag(game, ids.length ? ids : ['terrace'], state.lastStageId);
  const id = state.stageBag.shift()!;
  state.stageId = id; state.lastStageId = id;
  return id;
}
export function endlessBossHP(id: BossId, cycle: number): number {
  const base = BOSSES[id].hp;
  return Math.min(base * ENDLESS.hpCapMultiplier, base + Math.max(0, cycle - 1) * ENDLESS.hpPerCycle);
}
function prepareBoss(game: FightersGame): void {
  pickBoss(game);
  clearInputs(game);
  game.hero = newHero(ARENA.heroX, ARENA.heroY);
  game.enemies = []; game.projectiles = []; game.effects = []; game.hitstop = 0;
  game.sectionLocked = false; game.bossSpawned = false;
  enterPhase(game, 'bossIntro');
}
export function startEndlessBattle(game: FightersGame): void {
  if (game.mode === 'endless' && game.endless?.active) return;
  cancelVisit(game);
  clearInputs(game);
  game.mode = 'endless'; game.route = 'endless'; game.paused = false; game.focused = false;
  game.sparring = null;
  game.stage = arenaStage(game.scene); game.cameraX = ARENA.cameraX;
  game.endless = newEndlessState(); game.outcome = 'none'; game.cue = null;
  game.runTicks = 0; game.runStats = newStats(); game.arcade = newArcade();
  game.section = 0; game.wave = 0; game.areaIndex = 1; game.areaBannerUntil = 0;
  game.eventStartedAt = game.tick; game.routeTick = game.tick; game.episode = 'boss';
  game.firstWhiff = true; game.whiffAttackId = -1; game.message = ''; game.messageUntil = 0;
  recordStat(game, 'episodes');
  pickStage(game); prepareBoss(game);
}
export function spawnEndlessBoss(game: FightersGame): void {
  const state = game.endless;
  if (!state?.bossId || game.bossSpawned) return;
  const enemy = spawnEnemy(game, 'boss', 0, ARENA.enemyX, ARENA.heroY, -1, false, state.bossId);
  if (!enemy) return;
  enemy.hp = enemy.maxHP = endlessBossHP(state.bossId, state.cycle);
  enemy.pattern = BOSSES[state.bossId].patterns[0] ?? 0;
  game.bossSpawned = true; game.sectionLocked = true;
  game.graceUntil = game.combatTick + HERO.graceTicks;
}
function interlude(game: FightersGame): void {
  clearInputs(game);
  game.enemies = []; game.projectiles = []; game.hitstop = 0;
  game.hero = newHero(ARENA.heroX, ARENA.heroY);
  game.sectionLocked = false; game.bossSpawned = false;
  effect(game, 'ring', game.hero.x, game.hero.y - 36, '', ENDLESS.interludeTicks);
  effect(game, 'confetti', game.hero.x + 20, game.hero.y - 65, '', ENDLESS.interludeTicks,
    { vx: 20, vy: -30, gravity: 80 });
  enterPhase(game, 'interlude');
  pickStage(game);
}
/** Separate from every victory/watchdog/retry/arcade path in the existing director. */
export function updateEndless(game: FightersGame): void {
  const state = game.endless;
  if (!state?.active || !state.bossId) return;
  if (game.phase === 'bossIntro' && game.phaseAge >= BOSSES[state.bossId].introTicks) {
    enterPhase(game, 'boss'); spawnEndlessBoss(game);
  } else if (game.phase === 'boss') {
    // A projectile may land on the same tick as the final hit: retain both facts.
    const defeated = game.bossSpawned && !game.enemies.some(enemy => enemy.hp > 0 && enemy.state !== 'exit');
    const down = game.hero.hp <= 0;
    if (defeated) { state.defeated++; recordStat(game, 'wins'); }
    if (down) state.downs++;
    if (defeated || down) interlude(game);
  } else if (game.phase === 'interlude' && game.phaseAge >= ENDLESS.interludeTicks) prepareBoss(game);
}
export function endlessUI(game: FightersGame): EndlessUI | null {
  const state = game.endless;
  if (!state?.active || !state.bossId) return null;
  const definition = BOSSES[state.bossId], enemy = game.enemies.find(enemy => enemy.kind === 'boss');
  return { active: true, cycle: state.cycle, defeated: state.defeated, downs: state.downs,
    bossId: state.bossId, bossName: definition.name, bossTitle: definition.title,
    bossHP: enemy?.hp ?? (game.phase === 'bossIntro' ? endlessBossHP(state.bossId, state.cycle) : 0),
    bossMaxHP: enemy?.maxHP ?? endlessBossHP(state.bossId, state.cycle),
    stageId: state.stageId, stageLabel: ARENA_STAGES[state.stageId].label,
    phaseLabel: game.phase === 'interlude' ? 'ひと息・次の相手へ' : game.phase === 'bossIntro' ? 'ボス対面' : '無限対戦中' };
}
