import type { FightersGame } from '../fighters/types.ts';
import type { DrawCommand } from '../fighters/render-types.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import { BOSSES } from '../fighters/definitions.ts';
import { Painter } from '../fighters/art-kit.ts';
import { drawBoss } from '../fighters/boss-art.ts';
import { drawShadow } from '../fighters/art.ts';
import { VISITS } from './visitors.ts';

/** Quiet room coordinates; never an Enemy, HUD, projectile or battle presentation. */
export function visitorCommands(game: FightersGame, appearance: RenderAppearance): DrawCommand[] {
  const guest = game.visits.guest;
  if (!guest || !game.visits.enabled || game.phase !== 'rest' || game.mode !== 'auto') return [];
  const p = new Painter(), hp = BOSSES[guest.bossId].hp;
  drawShadow(p, guest.x, guest.y, 22, .18);
  drawBoss(p, { bossId: guest.bossId, id: 0, kind: 'boss', variant: 0, x: guest.x, y: guest.y,
    facing: guest.facing, hp, maxHP: hp, state: guest.state === 'pausing' ? 'move' : 'enter',
    age: guest.state === 'pausing' ? 30 : guest.stateAge, readyAt: 0, pattern: 0, hit: false,
    targetX: guest.targetX, vx: 0, vy: 0 }, game.tick, appearance);
  const opacity = Math.min(1, guest.age / 60, (VISITS.maximumTicks - guest.age) / 60);
  const fade = (command: DrawCommand): DrawCommand => ({ ...command, alpha: command.alpha * opacity,
    ...(command.kind === 'sprite' && command.fallback ? { fallback: command.fallback.map(fade) } : {}) });
  return p.commands.map(fade);
}
