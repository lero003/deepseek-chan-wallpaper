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
/** One original fictional opponent; visual assets remain local-preview only. */
export const BOSS = { name: '綴星リュミエ', title: '琥珀の思考家', hp: bossHP,
  patterns: ['星屑の栞', '琥珀の連句', '思索のステップ', '綴星の余白'] } as const;

/** The manual fight never travels outside this single terrace camera. */
export const ARENA = { cameraX: 960, arenaX: 1200, left: 978, right: 1422, top: 218, bottom: 254,
  heroX: 1140, heroY: 238, enemyX: 1294, introTicks: 100, bossIntroTicks: 130, roundClearTicks: 100,
  victoryTicks: 150, returnTicks: 150, teleportTick: 70 } as const;

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

/** Two small-enemy rounds, then the existing single boss slot in a strict one-on-one. */
export const ARENA_ROUNDS: readonly SectionDefinition[] = [
  { at: ARENA.arenaX, arena: ARENA.arenaX, label: '潮風の腕ならし', spawns: [
    { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 1 },
  ] },
  { at: ARENA.arenaX, arena: ARENA.arenaX, label: 'テラスの挑戦者', spawns: [
    { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 1 },
  ] },
  { at: ARENA.arenaX, arena: ARENA.arenaX, label: BOSS.name, boss: true, spawns: [{ kind: 'boss', variant: 0 }] },
];

/** Twelve legacy encounters spread across the three outdoor stretches. */
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

/** Legacy route lengths stay available to startEpisode; play/demo trigger arena/room instead. */
export const SHORT_SECTIONS: readonly SectionDefinition[] = RUN_SECTIONS.slice(0, 2);
export const SKIRMISH_SECTIONS: readonly SectionDefinition[] = RUN_SECTIONS.slice(0, 5);
/** Compact four-area route (legacy preview length); the demo and the wallpaper now use ROOM_SECTIONS. */
export const AUTO_SECTIONS: readonly SectionDefinition[] = [RUN_SECTIONS[0]!, RUN_SECTIONS[3]!, RUN_SECTIONS[6]!, RUN_SECTIONS[11]!];

/**
 * A wallpaper incident is a small visitor or two appearing inside the accepted 480×270 study,
 * never a march along the 3600px route. Actors use the room's own art coordinates here, so
 * `x` is also the on-screen x when the camera stays at 0.
 */
export interface RoomIncident { spawns: readonly SectionSpawn[]; second?: readonly SectionSpawn[]; label: string }
/** Varied two-to-three visitor incidents; several bring a second little wave. No boss. */
export const ROOM_INCIDENTS: readonly RoomIncident[] = [
  { label: '窓辺のお客さん', spawns: [ { kind: 'slime', variant: 0 }, { kind: 'slime', variant: 1 }, { kind: 'slime', variant: 0 } ] },
  { label: 'ふたつの気配', spawns: [ { kind: 'slime', variant: 1 }, { kind: 'popup', variant: 1 } ], second: [ { kind: 'popup', variant: 0 } ] },
  { label: 'おおきな影', spawns: [ { kind: 'slime', variant: 2 }, { kind: 'popup', variant: 1 } ] },
  { label: '本棚のざわめき', spawns: [ { kind: 'popup', variant: 0 }, { kind: 'slime', variant: 1 }, { kind: 'slime', variant: 0 } ], second: [ { kind: 'slime', variant: 1 } ] },
  { label: '夕暮れのかくれんぼ', spawns: [ { kind: 'slime', variant: 0 }, { kind: 'popup', variant: 1 }, { kind: 'slime', variant: 0 } ], second: [ { kind: 'popup', variant: 1 } ] },
  { label: 'ふたりの追いかけっこ', spawns: [ { kind: 'slime', variant: 1 }, { kind: 'popup', variant: 1 } ], second: [ { kind: 'slime', variant: 0 }, { kind: 'slime', variant: 0 } ] },
];
/** The one room-local arena: `arena - 240 = 0`, so the screen never scrolls during an incident. */
export const ROOM_SECTIONS: readonly SectionDefinition[] = [
  { at: 0, arena: 240, spawns: ROOM_INCIDENTS[0]!.spawns, label: '書斎の小さな事件' },
];
/** The room incident keeps the heroine and visitors inside the accepted room's playable span. */
export const ROOM_PADDING = 10;

export function studyStage(scene: Scene): Stage {
  return { id: 'sunset-study', width: STAGE_WIDTH, homeOffset: 120, terraceLeft: 720, areas: AREAS,
    bounds: { left: 40, right: STAGE_WIDTH - 40, top: 218, bottom: 254 },
    furniture: scene.obstacles.map(obstacle => ({ left: 120 + obstacle.left, right: 120 + obstacle.right, top: 190, bottom: 218 })) as Rect[],
  };
}
export function arenaStage(scene: Scene): Stage {
  return { ...studyStage(scene), bounds: { left: ARENA.left, right: ARENA.right, top: ARENA.top, bottom: ARENA.bottom }, furniture: [] };
}
export const PHASE_NAMES = {
  rest: '夕凪の書斎', intro: '出発', battle: '道中', roundClear: 'ラウンドクリア', bossIntro: BOSS.name, boss: '最後の相手',
  victory: '帰り道', return: '帰宅', result: 'おしまい', retry: 'もう一度',
} as const;
export const ARENA_PHASE_NAMES = {
  rest: '夕凪の書斎', intro: 'ラウンド開始', battle: '対戦中', roundClear: 'ラウンドクリア',
  bossIntro: `${BOSS.title}・${BOSS.name}`, boss: '最終ラウンド', victory: '対戦勝利', return: '帰宅', result: '対戦結果', retry: '再挑戦',
} as const;
