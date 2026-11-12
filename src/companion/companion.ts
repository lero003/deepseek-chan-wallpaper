import type { FightersGame } from '../fighters/types.ts';
import type { Behavior, Mood } from '../world/world.ts';
import { BOSSES } from '../fighters/definitions.ts';

/**
 * Preview-only companion reactions (B03) and quiet-life captions (B04).
 *
 * This is a cosmetic layer: it never touches the world, its seeded RNG, movement,
 * sleep timing or the battle schedule. The cue is a finite render override that the
 * fixed 60Hz update ages out; the passive wallpaper presentation ignores it entirely.
 */

/** Front-facing "notices you" pose lasts ~1.2s. */
export const CALL_POSE_TICKS = 72;
/** The spoken line stays in the out-of-scene status row ~3s. */
export const CALL_LINE_TICKS = 180;
/** One call per 20s of active ticks; no countdown UI, no queue. */
export const CALL_COOLDOWN_TICKS = 1200;
/** A homecoming line lingers ~3s after the bout actually ends. */
export const HOME_LINE_TICKS = 180;

export const CALL_CAPTION = 'ん、呼んだ？';
export const HOME_CAPTION = 'ふう。書斎がいちばん。';
export const REST_CAPTION = 'ひと休みしよう。';

export interface CompanionCue {
  readonly startedTick: number;
  readonly untilTick: number;
  readonly caption: string;
}

/**
 * A deterministic observation of the quiet life, keyed only by state + mood.
 * `turn` is folded into `idle` so the half-second turn never flickers the caption.
 * These describe the character's observable state, never the user's presence/mood.
 */
export function lifeCaption(state: Behavior, mood: Mood): string {
  if (state === 'sleep') return mood === 'night' ? '月夜に、すやすや。' : '少しだけ、うとうと。';
  if (state === 'walk') return '海辺の書斎を、ひと歩き。';
  if (mood === 'night') return '月夜を、ぼんやり。';
  if (mood === 'rain') return '雨音を、聞いている。';
  return 'ただ、ここにいる。';
}

/** Whether a call can be accepted right now, and a short reason when it cannot. */
export function callState(game: FightersGame): { ready: boolean; reason: string } {
  if (game.mode !== 'auto' || game.phase !== 'rest') return { ready: false, reason: '対戦が終わったら呼べます' };
  if (game.cue) return { ready: false, reason: '' };
  if (game.tick < game.cueReadyAt) return { ready: false, reason: '少し待ってね' };
  const state = game.world.actor.state;
  if (state === 'sleep') return { ready: false, reason: 'いまはお昼寝中' };
  if (state === 'walk') return { ready: false, reason: 'いまはお散歩中' };
  if (state === 'turn') return { ready: false, reason: 'いまは振り向き中' };
  return { ready: true, reason: '' };
}

/**
 * The single out-of-scene status line shared by Web and Mac so both read identically.
 * Priority: call response > homecoming > auto-bout > quiet life. Hosts overlay their
 * own error/stop reason on top of this when the preview is not running.
 */
export function companionLine(game: FightersGame): string {
  if (game.mode === 'manual') return '';
  if (game.cue && game.tick < game.cue.untilTick) return game.cue.caption;
  if (game.homeLine && game.tick < game.homeLineUntil) return game.homeLine;
  if (game.phase !== 'rest') return 'テラスで自動対戦。';
  if (game.visits.guest) return `${BOSSES[game.visits.guest.bossId].name}が遊びに来ています。`;
  return lifeCaption(game.world.actor.state, game.world.mood);
}

/** Accept one call if idle in the quiet study; otherwise a no-op. Never consumes RNG. */
export function requestCall(game: FightersGame): boolean {
  if (!callState(game).ready) return false;
  game.cue = { startedTick: game.tick, untilTick: game.tick + CALL_LINE_TICKS, caption: CALL_CAPTION };
  game.cueReadyAt = game.tick + CALL_COOLDOWN_TICKS;
  return true;
}

/** Age out / cancel the cosmetic cue. Called from the fixed update, never from render. */
export function advanceCompanion(game: FightersGame): void {
  if (game.cue && (game.tick >= game.cue.untilTick || game.mode !== 'auto' || game.phase !== 'rest'
    || game.world.actor.state !== 'idle')) game.cue = null;
}

/** Discard the cue when the preview stops, closes, loses focus or switches background. */
export function cancelCompanion(game: FightersGame): void {
  game.cue = null;
}

/** Set the transient homecoming line and drop any active call. */
export function settleHome(game: FightersGame, line: string): void {
  game.cue = null;
  game.homeLine = line;
  game.homeLineUntil = game.tick + HOME_LINE_TICKS;
}
