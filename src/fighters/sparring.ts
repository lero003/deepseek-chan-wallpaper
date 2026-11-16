import { ARENA } from './definitions.ts';
import { startEpisode, enterPhase } from './director.ts';
import { spawnEnemy } from './enemy-brain.ts';
import { decision } from './events.ts';
import { clamp, moveOnFloor } from './movement.ts';
import type { FightersGame, SparringMotion, SparringState } from './types.ts';

/** A continuous ambient duet, independent of the arcade and endless boss rush. */
export function startSparring(game: FightersGame): void {
  if (game.mode === 'sparring') return;
  game.mode = 'sparring'; game.paused = false; game.focused = false;
  startEpisode(game, 'arena');
  game.section = 2; game.sectionLocked = true; game.bossSpawned = true;
  game.hero.x = ARENA.heroX; game.hero.y = ARENA.heroY;
  game.cameraX = ARENA.cameraX; game.firstWhiff = false;
  game.hero.comboUntil = game.combatTick + 30;
  enterPhase(game, 'boss');
  const rival = spawnEnemy(game, 'boss', 0, ARENA.enemyX, ARENA.heroY, -1, false, 'lumie');
  if (rival) rival.readyAt = game.combatTick + 150;
  game.sparring = {
    phase: 'rest', startedAt: game.combatTick, until: game.combatTick, cycle: 0,
    hero: { kind: 'walk', fromX: game.hero.x, toX: game.hero.x },
    rival: { kind: 'walk', fromX: ARENA.enemyX, toX: ARENA.enemyX },
  };
  beginMovement(game, 'approach');
}

function beginMovement(game: FightersGame, phase: 'approach' | 'separate'): void {
  const state = game.sparring!, hero = game.hero, rival = game.enemies[0]!;
  const side = hero.x <= rival.x ? -1 : 1;
  const center = clamp((hero.x + rival.x) / 2 + (phase === 'separate' ? (decision(game) - .5) * 130 : 0),
    ARENA.left + 112, ARENA.right - 112);
  const halfGap = phase === 'separate' ? 82 + decision(game) * 18 : 25;
  const kinds: readonly SparringMotion[] = ['hop', 'turn', 'backstep'];
  state.phase = phase; state.startedAt = game.combatTick;
  state.hero = { kind: phase === 'separate' ? kinds[state.cycle % 3]! : 'walk', fromX: hero.x, toX: center + side * halfGap };
  state.rival = { kind: phase === 'separate' ? kinds[(state.cycle + 1) % 3]! : state.cycle % 2 ? 'hop' : 'walk',
    fromX: rival.x, toX: center - side * halfGap };
  const distance = Math.max(Math.abs(state.hero.toX - hero.x), Math.abs(state.rival.toX - rival.x));
  state.until = game.combatTick + Math.max(60, Math.ceil(distance / (phase === 'separate' ? 65 : 40) * 60));
  hero.state = 'walk'; hero.age = 0; hero.attackQueue = 0;
  rival.state = 'move'; rival.age = 0; rival.vx = 0; rival.vy = 0;
  game.input = { x: 0, y: 0 }; game.pendingDodge = false; game.pendingSpecial = false;
}

function transition(game: FightersGame): void {
  const state = game.sparring!, rival = game.enemies[0]!;
  if (state.phase === 'rest') { beginMovement(game, 'approach'); return; }
  if (state.phase === 'exchange') { beginMovement(game, 'separate'); return; }
  state.phase = state.phase === 'approach' ? 'exchange' : 'rest';
  state.startedAt = game.combatTick;
  state.until = game.combatTick + (state.phase === 'exchange' ? 300 + Math.round(decision(game) * 90) : 45 + Math.round(decision(game) * 45));
  game.hero.state = 'idle'; game.hero.age = 0;
  rival.state = 'move'; rival.age = 0;
  if (state.phase === 'exchange') {
    // Land, look at each other, then start trading single swings again.
    game.hero.comboUntil = game.combatTick;
    rival.readyAt = game.combatTick + 80;
  } else state.cycle++;
}

/** True only during the exchange: the normal combat brains must not chase a retreat. */
export function sparringIntent(game: FightersGame): boolean {
  const hero = game.hero, rival = game.enemies[0], state = game.sparring;
  game.input = { x: 0, y: 0 };
  if (!rival || !state) return false;
  // Finish a swing/telegraph before changing the shared rhythm; never cut one off midair.
  if (game.combatTick >= state.until && (state.phase !== 'exchange'
    || ['idle', 'walk'].includes(hero.state) && rival.state === 'move')) transition(game);
  if (state.phase !== 'exchange') {
    const progress = clamp((game.combatTick - state.startedAt) / Math.max(1, state.until - state.startedAt), 0, 1);
    for (const [actor, motion, opponent] of [[hero, state.hero, rival], [rival, state.rival, hero]] as const) {
      if (state.phase !== 'rest') {
        const eased = motion.kind === 'hop' ? progress * progress * (3 - 2 * progress) : progress;
        const x = motion.fromX + (motion.toX - motion.fromX) * eased;
        moveOnFloor(actor, x - actor.x, 0, game.stage);
      }
      const away = motion.toX >= motion.fromX ? 1 : -1;
      actor.facing = state.phase !== 'rest' && motion.kind === 'turn' ? away : opponent.x < actor.x ? -1 : 1;
      actor.age++;
    }
    hero.state = state.phase === 'rest' ? 'idle' : 'walk';
    // Passing projectiles keep moving; regrouping is a quiet, uninterruptible beat.
    hero.invulnerableUntil = game.combatTick + 1;
    return false;
  }
  if (!['idle', 'walk'].includes(hero.state)) return true;
  const dx = rival.x - hero.x, dy = rival.y - hero.y;
  if (Math.abs(dx) > 43) game.input.x = Math.sign(dx) * .55;
  if (Math.abs(dy) > 9) game.input.y = Math.sign(dy) * .55;
  hero.facing = dx < 0 ? -1 : 1;
  if (Math.abs(dx) <= 50 && Math.abs(dy) <= 16 && game.combatTick >= hero.comboUntil + 100) {
    hero.attackQueue = 1; hero.queueUntil = game.combatTick + 39;
  }
  return true;
}

/** Render-only lift: feet/depth/collisions remain on the same floor in Web and AppKit. */
export function sparringLift(game: FightersGame, actor: 'hero' | 'rival'): number {
  const state: SparringState | null = game.mode === 'sparring' ? game.sparring : null;
  if (!state || !['approach', 'separate'].includes(state.phase) || state[actor].kind !== 'hop') return 0;
  const progress = clamp((game.combatTick - state.startedAt) / Math.max(1, state.until - state.startedAt), 0, 1);
  return Math.round(Math.sin(progress * Math.PI) * 19);
}
