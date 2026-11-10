import type { World, Scene, Facing } from '../world/world.ts';

export type Mode = 'auto' | 'manual';
export type Phase = 'rest' | 'intro' | 'battle' | 'bossIntro' | 'boss' | 'victory' | 'return' | 'result' | 'retry';
export type Frequency = 'off' | 'low' | 'normal';
export type EnemyKind = 'slime' | 'popup' | 'boss';
export type Action = 'attack' | 'dodge' | 'special';
export type HeroState = 'idle' | 'walk' | 'attack' | 'dodge' | 'special' | 'hurt' | 'down';
export type EnemyVariant = 0 | 1 | 2;
export type EnemyState = 'enter' | 'move' | 'windup' | 'strike' | 'stunned' | 'exit';
export interface Point { x: number; y: number }
export interface Rect { left: number; right: number; top: number; bottom: number }
export interface Stage {
  id: 'sunset-study'; width: number; homeOffset: number; terraceLeft: number;
  areas: readonly { id: string; left: number; right: number; name: string; subtitle: string }[];
  bounds: Rect; furniture: Rect[];
}
export interface Hero extends Point {
  facing: Facing; hp: number; gauge: number; state: HeroState; age: number;
  combo: number; comboUntil: number; attackQueue: number; queueUntil: number;
  attackId: number; hitIds: number[]; invulnerableUntil: number; dodgeReadyAt: number;
  vx: number; vy: number; hitCombo: number; hitComboUntil: number;
}
export interface Enemy extends Point {
  id: number; kind: EnemyKind; variant: EnemyVariant; facing: Facing; hp: number; maxHP: number;
  state: EnemyState; age: number; readyAt: number; pattern: number; hit: boolean;
  targetX: number; vx: number; vy: number;
}
export interface Projectile extends Point {
  id: number; vx: number; vy: number; age: number; ttl: number; text: string;
}
export type EffectKind = 'hit' | 'spark' | 'ring' | 'shock' | 'bubbles' | 'stars' | 'wave' | 'tea' | 'words'
  | 'dust' | 'confetti' | 'ink' | 'paper';
export interface Effect extends Point {
  id: number; kind: EffectKind; age: number; ttl: number; text: string;
  vx: number; vy: number; gravity: number; spin: number; size: number;
}
export interface GameStats { episodes: number; wins: number; losses: number; hits: number; misses: number; dodges: number; specials: number; recoveries: number; maxEnemies: number; maxProjectiles: number; maxEffects: number; sections: number }
export interface FightersGame {
  world: World; scene: Scene; stage: Stage; tick: number; combatTick: number; remainder: number;
  mode: Mode; phase: Phase; phaseAge: number; focused: boolean; paused: boolean;
  frequency: Frequency; effectsLow: boolean; nextEventAt: number; restReactionAt: number;
  eventStartedAt: number; lastProgressAt: number; graceUntil: number; hitstop: number;
  randomState: number; nextId: number; episode: 'quiet' | 'skirmish' | 'boss';
  route: 'short' | 'skirmish' | 'auto' | 'full'; section: number; sectionLocked: boolean; wave: number; routeTick: number;
  areaIndex: number; areaBannerUntil: number; bossSpawned: boolean;
  hero: Hero; enemies: Enemy[]; projectiles: Projectile[]; effects: Effect[];
  input: Point; pendingDodge: boolean; pendingSpecial: boolean;
  cameraX: number; firstWhiff: boolean; whiffAttackId: number; message: string; messageUntil: number;
  outcome: 'none' | 'win' | 'loss'; stats: GameStats;
}
export interface GameUI {
  mode: Mode; phase: Phase; phaseLabel: string; paused: boolean; focused: boolean; hp: number; gauge: number;
  combo: number; dodgeReady: boolean; specialReady: boolean; outcome: string;
  message: string; frequency: Frequency; effectsLow: boolean; enemies: number; bossHP: number;
  section: number; sections: number; locked: boolean; areaName: string; areaSubtitle: string; progress: number;
}
