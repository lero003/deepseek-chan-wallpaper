import type { Enemy, Hero } from './types.ts';
import { ATTACKS } from './definitions.ts';

export type PoseSheet = 'combat' | 'slime' | 'popup';
export type CombatPose = 'idle' | 'attack1' | 'attack2' | 'attack3' | 'dodge' | 'special' | 'hurt' | 'down';
export type EnemyPose = 'idle' | 'move' | 'windup' | 'strike' | 'hurt' | 'exit';
export const COMBAT_POSES: readonly CombatPose[] = ['idle', 'attack1', 'attack2', 'attack3', 'dodge', 'special', 'hurt', 'down'];
export const ENEMY_POSES: readonly EnemyPose[] = ['idle', 'move', 'windup', 'strike', 'hurt', 'exit'];

/** Independent optional sheets; the approved 16-frame life atlas is never repurposed. */
export interface PoseAtlas {
  readonly version: 1;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly poses: Readonly<Record<string, number>>;
  /** Enemy rows bake normal/fast/tough colors and sizes onto the same integer pixel grid. */
  readonly variantStride?: number;
}

export function parsePoseAtlas(value: unknown, sheet: PoseSheet): PoseAtlas {
  const record = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  const integer = (x: unknown, low: number, high: number): x is number => Number.isSafeInteger(x) && Number(x) >= low && Number(x) <= high;
  if (!record(value) || value.version !== 1 || !integer(value.frameWidth, 16, 256) || !integer(value.frameHeight, 16, 256)
    || !integer(value.columns, 1, 8) || !integer(value.rows, 1, 8) || !record(value.anchor) || !record(value.poses)
    || !integer(value.anchor.x, 0, value.frameWidth) || !integer(value.anchor.y, 0, value.frameHeight)) throw new Error(`Invalid optional ${sheet} atlas.`);
  const combat = sheet === 'combat', keys = combat ? COMBAT_POSES : ENEMY_POSES;
  if (value.columns * value.rows !== (combat ? 8 : 18) || (!combat && value.variantStride !== 6)
    || (combat && value.variantStride !== undefined)) throw new Error(`Invalid optional ${sheet} frame layout.`);
  const seen = new Set<number>();
  for (const key of keys) {
    const index = value.poses[key];
    if (!integer(index, 0, keys.length - 1) || seen.has(index)) throw new Error(`Invalid optional ${sheet} pose: ${key}.`);
    seen.add(index);
  }
  return value as unknown as PoseAtlas;
}

/** Art keys follow existing simulation phases; no hit timing or game state changes. */
export function combatPose(hero: Readonly<Hero>): CombatPose | null {
  if (hero.state === 'walk') return null; // Keep the approved six-frame walk.
  if (hero.state === 'attack') {
    const combo = Math.max(1, Math.min(3, hero.combo));
    const attack = ATTACKS[combo - 1]!;
    return hero.age < attack.windup || hero.age >= attack.windup + attack.active ? 'idle' : `attack${combo}` as CombatPose;
  }
  return hero.state;
}

export function enemyPose(enemy: Readonly<Enemy>): EnemyPose {
  switch (enemy.state) {
    case 'windup': return 'windup';
    case 'strike': return 'strike';
    case 'stunned': return 'hurt';
    case 'exit': return 'exit';
    case 'enter': return 'move';
    default: return enemy.age % 44 < 22 ? 'idle' : 'move';
  }
}
