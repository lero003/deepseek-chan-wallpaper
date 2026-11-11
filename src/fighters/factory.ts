import { HERO } from './definitions.ts';
import type { FightersGame, Hero, GameStats } from './types.ts';

export function newHero(x: number, y = 236): Hero {
  return { x, y, facing: 1, hp: HERO.hp, gauge: 0, state: 'idle', age: 0, combo: 0, comboUntil: 0,
    attackQueue: 0, queueUntil: 0, attackId: 0, hitIds: [], invulnerableUntil: 0, dodgeReadyAt: 0,
    vx: 0, vy: 0, hitCombo: 0, hitComboUntil: 0 };
}
export function newStats(): GameStats {
  return { episodes: 0, wins: 0, losses: 0, hits: 0, misses: 0, dodges: 0, specials: 0, damageTaken: 0, recoveries: 0,
    maxEnemies: 0, maxProjectiles: 0, maxEffects: 0, sections: 0 };
}
/** Keep lifetime diagnostics separate from the current run's result sheet. */
export function recordStat(game: FightersGame, key: keyof GameStats, amount = 1): void {
  game.stats[key] += amount;
  game.runStats[key] += amount;
}
