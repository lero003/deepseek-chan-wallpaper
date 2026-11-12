import type { World, Scene, Facing } from '../world/world.ts';
import type { ArcadeState, ArcadeUI } from './arcade.ts';
import type { CompanionCue } from '../companion/companion.ts';

export type Mode = 'auto' | 'manual' | 'endless';
export type Phase = 'rest' | 'intro' | 'battle' | 'roundClear' | 'bossIntro' | 'boss' | 'interlude' | 'victory' | 'return' | 'result' | 'retry';
export type Route = 'short' | 'skirmish' | 'auto' | 'full' | 'room' | 'arena' | 'endless';
export type BossId = 'lumie' | 'shio' | 'yume';
export type StageId = 'terrace' | 'terrace-night' | 'terrace-rain' | 'pier-dawn';
export interface VisitGuest {
  bossId: BossId; x: number; y: number; facing: Facing; targetX: number; exitX: number;
  state: 'arriving' | 'wandering' | 'pausing' | 'leaving'; age: number; stateAge: number; leaveAt: number; pauseUntil: number;
}
export interface VisitsState {
  enabled: boolean; randomState: number; idleTicks: number; nextAt: number;
  lastId: BossId | null; bag: BossId[]; guest: VisitGuest | null;
}
export interface EndlessState {
  active: boolean; cycle: number; defeated: number; downs: number;
  bossId: BossId | null; stageId: StageId; bossBag: BossId[]; stageBag: StageId[];
  lastBossId: BossId | null; lastStageId: StageId | null;
}
export interface EndlessUI {
  active: boolean; cycle: number; defeated: number; downs: number;
  bossId: BossId; bossName: string; bossTitle: string; bossHP: number; bossMaxHP: number;
  stageId: StageId; stageLabel: string; phaseLabel: string;
}
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
  bossId?: BossId;
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
export interface GameStats { episodes: number; wins: number; losses: number; hits: number; misses: number; dodges: number; specials: number; damageTaken: number; recoveries: number; maxEnemies: number; maxProjectiles: number; maxEffects: number; sections: number }
export interface FightersGame {
  visits: VisitsState;
  world: World; scene: Scene; stage: Stage; tick: number; combatTick: number; remainder: number;
  mode: Mode; phase: Phase; phaseAge: number; focused: boolean; paused: boolean;
  frequency: Frequency; effectsLow: boolean; nextEventAt: number; restReactionAt: number;
  eventStartedAt: number; lastProgressAt: number; graceUntil: number; hitstop: number;
  randomState: number; nextId: number; episode: 'quiet' | 'skirmish' | 'boss';
  route: Route; section: number; sectionLocked: boolean; wave: number; routeTick: number;
  /** Unpaused/focused elapsed steps, including hitstop; retry/result screens do not count. */
  runTicks: number; runStats: GameStats; arcade: ArcadeState; endless: EndlessState | null;
  /** Which ROOM_INCIDENTS composition the current room event picked. Unused on the long routes. */
  roomVariant: number;
  areaIndex: number; areaBannerUntil: number; bossSpawned: boolean;
  hero: Hero; enemies: Enemy[]; projectiles: Projectile[]; effects: Effect[];
  input: Point; pendingDodge: boolean; pendingSpecial: boolean;
  cameraX: number; firstWhiff: boolean; whiffAttackId: number; message: string; messageUntil: number;
  outcome: 'none' | 'win' | 'loss'; stats: GameStats;
  /** Preview-only cosmetic companion layer; never affects world/RNG/battle. */
  cue: CompanionCue | null; cueReadyAt: number; homeLine: string; homeLineUntil: number;
}
export interface GameUI {
  endless: EndlessUI | null;
  mode: Mode; phase: Phase; phaseLabel: string; paused: boolean; focused: boolean; hp: number; gauge: number;
  combo: number; dodgeReady: boolean; specialReady: boolean; outcome: string;
  message: string; frequency: Frequency; effectsLow: boolean; enemies: number; bossHP: number;
  section: number; sections: number; locked: boolean; areaName: string; areaSubtitle: string; progress: number;
  route: Route; round: number; rounds: number; roundLabel: string; elapsedSeconds: number; runStats: GameStats; arcade: ArcadeUI;
  /** B03/B04: preview-only call acceptance and the shared out-of-scene status line. */
  callReady: boolean; callReason: string; companionLine: string;
}
