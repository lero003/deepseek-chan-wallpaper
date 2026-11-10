import type { Scene } from '../world/world.ts';
import type { EnemyKind, EnemyVariant, Rect, Stage } from './types.ts';

export const LIMITS = { enemies: 7, projectiles: 24, effects: 36, autoSeconds: 210, stallSeconds: 12 } as const;
export const HERO = { hp: 5, walkSpeed: 74, depthSpeed: 46, dodgeSpeed: 200, dodgeTicks: 18, dodgeCooldown: 66, graceTicks: 60, comboWindow: 39 } as const;
export const ATTACKS = [
  { name: 'ぺしっ！', windup: 6, active: 5, recovery: 11, range: 58, damage: 1, knockback: 70 },
  { name: 'つんつんっ！', windup: 4, active: 6, recovery: 10, range: 70, damage: 2, knockback: 90 },
  { name: 'くるりスピン！', windup: 7, active: 7, recovery: 13, range: 88, damage: 3, knockback: 150 },
] as const;

export interface EnemyStats { hp: number; speed: number; windup: number; cooldown: number; scale: number; tint: 'normal' | 'fast' | 'tough' }
export const ENEMIES: Record<EnemyKind, Record<EnemyVariant, EnemyStats>> = {
  slime: {
    0: { hp: 3, speed: 22, windup: 19, cooldown: 62, scale: 1, tint: 'normal' },
    1: { hp: 3, speed: 36, windup: 15, cooldown: 52, scale: .92, tint: 'fast' },
    2: { hp: 5, speed: 15, windup: 26, cooldown: 82, scale: 1.22, tint: 'tough' },
  },
  popup: {
    0: { hp: 3, speed: 16, windup: 32, cooldown: 88, scale: 1, tint: 'normal' },
    1: { hp: 4, speed: 22, windup: 24, cooldown: 66, scale: 1, tint: 'fast' },
    2: { hp: 5, speed: 12, windup: 38, cooldown: 100, scale: 1.16, tint: 'tough' },
  },
  boss: {
    0: { hp: 30, speed: 16, windup: 42, cooldown: 78, scale: 1, tint: 'normal' },
    1: { hp: 30, speed: 16, windup: 42, cooldown: 78, scale: 1, tint: 'normal' },
    2: { hp: 26, speed: 16, windup: 42, cooldown: 78, scale: 1, tint: 'normal' },
  },
};
export const bossHP = ENEMIES.boss[0].hp;

export interface AreaDefinition { id: 'study' | 'terrace' | 'promenade' | 'pier'; left: number; right: number; name: string; subtitle: string }
export const AREAS: readonly AreaDefinition[] = [
  { id: 'study', left: 0, right: 720, name: '夕凪の書斎', subtitle: '第一幕' },
  { id: 'terrace', left: 720, right: 1620, name: '海辺のテラス', subtitle: '第二幕' },
  { id: 'promenade', left: 1620, right: 2520, name: '潮風の遊歩道', subtitle: '第三幕' },
  { id: 'pier', left: 2520, right: 3600, name: '夕凪の桟橋', subtitle: '最終幕' },
] as const;
export const STAGE_WIDTH = 3600;

export interface SectionSpawn { kind: EnemyKind; variant: EnemyVariant }
export interface SectionDefinition { at: number; arena: number; spawns: readonly SectionSpawn[]; second?: readonly SectionSpawn[]; boss?: boolean; label: string }

/** Eight encounters spread across the three outdoor stretches. */
export const RUN_SECTIONS: readonly SectionDefinition[] = [
  { at: 250, arena: 390, spawns: [ { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 0 } ], label: '最初の一団' },
  { at: 520, arena: 660, spawns: [ { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 1 }, { kind: 'slime', variant: 0 } ], second: [ { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 0 } ], label: '横からわらわら' },
  { at: 800, arena: 940, spawns: [ { kind: 'slime', variant: 1 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 0 } ], second: [ { kind: 'slime', variant: 1 }, { kind: 'popup', variant: 0 } ], label: 'すばやい影' },
  { at: 1080, arena: 1220, spawns: [ { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 1 }, { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 0 } ], label: 'テラスの待ち伏せ' },
  { at: 1360, arena: 1500, spawns: [ { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 0 } ], second: [ { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 } ], label: 'かたまり' },
  { at: 1640, arena: 1780, spawns: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 1 }, { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 0 } ], label: '遊歩道の入口' },
  { at: 1920, arena: 2060, spawns: [ { kind: 'slime', variant: 2 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 1 } ], second: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 } ], label: '遊歩道の待ち伏せ' },
  { at: 2200, arena: 2340, spawns: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 0 } ], second: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 } ], label: '花壇の攻防' },
  { at: 2480, arena: 2620, spawns: [ { kind: 'slime', variant: 2 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 1 } ], second: [ { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 } ], label: '桟橋の手前' },
  { at: 2760, arena: 2900, spawns: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 }, { kind: 'slime', variant: 1 }, { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 2 } ], second: [ { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 } ], label: '桟橋の番人' },
  { at: 3060, arena: 3180, spawns: [ { kind: 'slime', variant: 2 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 2 }, { kind: 'popup', variant: 2 }, { kind: 'slime', variant: 2 } ], second: [ { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 2 } ], label: '最後の壁' },
  { at: 3360, arena: 3360, spawns: [ { kind: 'boss', variant: 0 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 2 } ], boss: true, label: '桟橋の主' },
] as const;

/** Short route for wallpaper events; the full route is ~3 minutes for manual play. */
export const SHORT_SECTIONS: readonly SectionDefinition[] = RUN_SECTIONS.slice(0, 2);
export const SKIRMISH_SECTIONS: readonly SectionDefinition[] = RUN_SECTIONS.slice(0, 5);
/** Compact route used by the wallpaper's automatic events. */
export const AUTO_SECTIONS: readonly SectionDefinition[] = [RUN_SECTIONS[0]!, RUN_SECTIONS[3]!, RUN_SECTIONS[6]!, RUN_SECTIONS[11]!];

export function studyStage(scene: Scene): Stage {
  return { id: 'sunset-study', width: STAGE_WIDTH, homeOffset: 120, terraceLeft: 720, areas: AREAS,
    bounds: { left: 40, right: STAGE_WIDTH - 40, top: 218, bottom: 254 },
    furniture: scene.obstacles.map(obstacle => ({ left: 120 + obstacle.left, right: 120 + obstacle.right, top: 190, bottom: 218 })) as Rect[],
  };
}
export const PHASE_NAMES = {
  rest: '夕凪の書斎', intro: '出発', battle: '道中', bossIntro: '桟橋の主', boss: '最後の相手',
  victory: '帰り道', return: '帰宅', result: 'おしまい', retry: 'もう一度',
} as const;
