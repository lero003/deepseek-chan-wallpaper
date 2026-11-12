import type { FightersGame, VisitGuest } from '../fighters/types.ts';
import type { DrawCommand } from '../fighters/render-types.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { BOSSES } from '../fighters/definitions.ts';
import { Painter } from '../fighters/art-kit.ts';
import { drawBoss } from '../fighters/boss-art.ts';
import type { BossMotion } from '../fighters/boss-art.ts';
import { drawShadow, sparkle } from '../fighters/art.ts';
import { VISITS } from './visitors.ts';

/** Read-only performance constants for the quiet room; no new atlas frames. */
export const VISIT_ART = { bob: 1.4, bowTicks: 54, blinkPeriod: 257, blinkTicks: 6,
  glanceTicks: 90, lean: .02 } as const;

/** Turn the deterministic visit state into a tiny procedural performance. */
export function visitorMotion(guest: VisitGuest): BossMotion {
  const walking = guest.state !== 'pausing';
  const phase = guest.walked / VISITS.stride * Math.PI * 2;
  const pausing = guest.state === 'pausing';
  const pauseAge = pausing ? guest.stateAge : 0;
  const bow = pausing && guest.pauseKind === 'notice' && pauseAge < VISIT_ART.bowTicks
    ? Math.sin(pauseAge / VISIT_ART.bowTicks * Math.PI) : 0;
  const blink = guest.age > 30 && guest.age % VISIT_ART.blinkPeriod < VISIT_ART.blinkTicks;
  // On the greeting and gaze stops she has already turned toward the heroine; fidgeting
  // looks away for a moment, which keeps long pauses from reading as a frozen pose.
  const fidget = pausing && guest.pauseKind === 'fidget' && pauseAge > 60 && pauseAge % VISIT_ART.glanceTicks < 45;
  return {
    walking,
    phase,
    bob: walking ? Math.abs(Math.sin(phase)) * VISIT_ART.bob : 0,
    lean: walking ? Math.sin(phase) * VISIT_ART.lean : 0,
    breath: Math.sin(guest.age * .055),
    bow,
    blink,
    glance: fidget ? -1 : 1,
  };
}

/** Quiet room coordinates; never an Enemy, HUD, projectile or battle presentation. */
export function visitorCommands(game: FightersGame, appearance: RenderAppearance): DrawCommand[] {
  const guest = game.visits.guest;
  if (!guest || !game.visits.enabled || game.phase !== 'rest' || game.mode !== 'auto') return [];
  const p = new Painter(), hp = BOSSES[guest.bossId].hp;
  const motion = visitorMotion(guest);
  drawShadow(p, guest.x, guest.y, 22, .18);
  if (motion.walking) {
    // A two-pixel fleck behind the step is the only effect; it never becomes a projectile
    // or an Effect and therefore cannot be counted by combat systems.
    const step = Math.abs(Math.sin(motion.phase));
    if (step > .78) {
      p.rect(guest.x - guest.facing * 9, guest.y - 2, 2, 1, BOSSES[guest.bossId].palette.paperShade, .18);
      p.rect(guest.x - guest.facing * 13, guest.y - 1, 1, 1, BOSSES[guest.bossId].palette.paperShade, .12);
    }
  }
  drawBoss(p, { bossId: guest.bossId, id: 0, kind: 'boss', variant: 0, x: guest.x, y: guest.y,
    facing: guest.facing, hp, maxHP: hp, state: guest.state === 'pausing' ? 'move' : 'enter',
    age: guest.state === 'pausing' ? 30 : guest.stateAge, readyAt: 0, pattern: 0, hit: false,
    targetX: guest.targetX, vx: 0, vy: 0 }, game.tick, appearance, motion);
  if (!motion.walking && guest.pauseKind === 'gaze' && guest.stateAge > 70) {
    // A still key pose gets one slow amber blink of life beside the guest's hand. It is a
    // draw command only: no Effect, count, resource or gameplay state is created.
    const pulse = Math.sin(guest.stateAge % 150 / 150 * Math.PI);
    if (pulse > .55) sparkle(p, guest.x + guest.facing * 20, guest.y - 58, 1,
      BOSSES[guest.bossId].palette.amberLight, .22 + pulse * .16);
  }
  const opacity = Math.min(1, guest.age / 60, (VISITS.maximumTicks - guest.age) / 60);
  const fade = (command: DrawCommand): DrawCommand => ({ ...command, alpha: command.alpha * opacity,
    ...(command.kind === 'sprite' && command.fallback ? { fallback: command.fallback.map(fade) } : {}) });
  return p.commands.map(fade);
}