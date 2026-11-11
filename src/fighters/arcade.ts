import type { Enemy, FightersGame } from './types.ts';

/** A short arcade bout, not a persistent economy or a leaderboard. */
export const ARCADE = { roundTicks: 90 * 60, hitPoints: 25, visitorPoints: 100, bossPoints: 1000,
  clearPoints: 300, secondPoints: 10, healthPoints: 50, perfectPoints: 250 } as const;

export interface ArcadeState {
  score: number; checkpointScore: number; bestCombo: number; checkpointCombo: number;
  roundTicks: number; roundDamage: number; continues: number;
  lastRoundBonus: number; lastRoundPerfect: boolean; timedOut: boolean;
}
export interface ArcadeUI {
  score: number; secondsLeft: number; multiplier: number; bestCombo: number; continues: number;
  lastRoundBonus: number; perfect: boolean; timedOut: boolean; rank: '-' | 'S' | 'A' | 'B' | 'C';
}
export function newArcade(): ArcadeState {
  return { score: 0, checkpointScore: 0, bestCombo: 0, checkpointCombo: 0, roundTicks: 0,
    roundDamage: 0, continues: 0, lastRoundBonus: 0, lastRoundPerfect: false, timedOut: false };
}
const active = (game: FightersGame): boolean => game.route === 'arena' && game.mode === 'manual';
export function scoreMultiplier(combo: number): number { return Math.min(4, 1 + Math.floor(Math.max(0, combo - 1) / 5)); }

export function startArcadeRound(game: FightersGame, retry = false): void {
  if (!active(game)) return;
  const a = game.arcade;
  if (retry) {
    // A continue may replay a round, never farm it for extra points or an inflated combo.
    a.score = a.checkpointScore; a.bestCombo = a.checkpointCombo; a.continues++;
  } else { a.checkpointScore = a.score; a.checkpointCombo = a.bestCombo; }
  a.roundTicks = 0; a.roundDamage = 0; a.lastRoundBonus = 0; a.lastRoundPerfect = false; a.timedOut = false;
}
export function scoreHit(game: FightersGame, enemy: Readonly<Enemy>, damage: number): void {
  if (!active(game) || damage <= 0) return;
  const a = game.arcade;
  a.bestCombo = Math.max(a.bestCombo, game.hero.hitCombo);
  a.score += Math.round(damage) * ARCADE.hitPoints * scoreMultiplier(game.hero.hitCombo);
  if (enemy.hp === 0) a.score += enemy.kind === 'boss' ? ARCADE.bossPoints : ARCADE.visitorPoints;
}
export function arcadeDamage(game: FightersGame): void { if (active(game)) game.arcade.roundDamage++; }
export function clearArcadeRound(game: FightersGame): void {
  if (!active(game)) return;
  const a = game.arcade, left = Math.max(0, Math.ceil((ARCADE.roundTicks - a.roundTicks) / 60));
  a.lastRoundPerfect = a.roundDamage === 0;
  a.lastRoundBonus = ARCADE.clearPoints + left * ARCADE.secondPoints + game.hero.hp * ARCADE.healthPoints
    + (a.lastRoundPerfect ? ARCADE.perfectPoints : 0);
  a.score += a.lastRoundBonus;
}
/** Called once per active fixed step, before hitstop. Start cards and pauses never spend time. */
export function spendArcadeTick(game: FightersGame): boolean {
  if (!active(game) || !['battle', 'boss'].includes(game.phase)) return false;
  game.arcade.roundTicks = Math.min(ARCADE.roundTicks, game.arcade.roundTicks + 1);
  if (game.arcade.roundTicks < ARCADE.roundTicks) return false;
  game.arcade.timedOut = true;
  game.hero.hp = 0; game.hero.state = 'down'; game.hero.age = 0;
  game.hitstop = 0;
  return true;
}
export function arcadeUI(game: FightersGame): ArcadeUI {
  const a = game.arcade;
  const rank = game.outcome !== 'win' ? '-' : a.continues > 1 ? 'C' : a.continues === 1 ? 'B'
    : game.runStats.damageTaken === 0 ? 'S' : game.runStats.damageTaken <= 3 ? 'A' : 'B';
  return { score: a.score, secondsLeft: Math.max(0, Math.ceil((ARCADE.roundTicks - a.roundTicks) / 60)),
    multiplier: scoreMultiplier(game.combatTick <= game.hero.hitComboUntil ? game.hero.hitCombo : 0),
    bestCombo: a.bestCombo, continues: a.continues, lastRoundBonus: a.lastRoundBonus,
    perfect: a.lastRoundPerfect, timedOut: a.timedOut, rank };
}
