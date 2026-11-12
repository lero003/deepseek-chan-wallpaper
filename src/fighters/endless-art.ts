import { ARENA_STAGES } from './definitions.ts';
import type { StageId } from './types.ts';
import type { Quad } from '../render/scene-plan.ts';
import { Painter } from './art-kit.ts';

/** Complete 480×270 stage fallback, requiring no additional image or private import. */
export function arenaStageQuads(id: StageId): Quad[] {
  const stage = ARENA_STAGES[id], p = new Painter();
  p.rect(0, 0, 480, 270, stage.sky);
  p.rect(0, 116, 480, 103, stage.sea);
  p.rect(0, 116, 480, 2, stage.light, .65);
  if (stage.mood === 'night') {
    p.rect(361, 32, 22, 22, stage.light); p.rect(358, 35, 28, 16, stage.light);
    for (let i = 0; i < 22; i++) p.rect(14 + i * 71 % 452, 12 + i * 23 % 88, 1, 1, stage.light, .6);
  } else if (stage.mood === 'dawn' || stage.mood === 'sunset') {
    p.rect(351, 89, 34, 27, stage.light, .85);
    p.rect(0, 111, 480, 5, stage.sky, .6);
  } else {
    for (let i = 0; i < 6; i++) {
      const x = Math.max(0, i * 87 - 10);
      p.rect(x, 24 + i % 3 * 18, Math.min(100, 480 - x), 12, stage.frameColor, .22);
    }
  }
  p.rect(0, 207, 480, 63, stage.floor);
  for (let y = 213; y < 270; y += 14) {
    p.rect(0, y, 480, 1, stage.frameColor, .5);
    for (let x = y % 28 ? 22 : 54; x < 480; x += 64) p.rect(x, y, 1, Math.min(14, 270 - y), stage.light, .18);
  }
  p.rect(0, 170, 480, 5, stage.frameColor);
  p.rect(0, 171, 480, 1, stage.light, .6);
  for (let x = 8; x < 480; x += stage.mood === 'dawn' ? 90 : 56) {
    p.rect(x, 174, 5, 34, stage.frameColor); p.rect(x + 1, 175, 1, 32, stage.light, .35);
    if (stage.mood === 'dawn') {
      p.rect(x - 3, 162, 11, 14, stage.floor); p.rect(x - 2, 162, 9, 2, stage.light, .5);
    }
  }
  return p.commands.filter((command): command is Extract<typeof command, { kind: 'rect' }> => command.kind === 'rect');
}

/** Stage-local atmosphere; fixed arithmetic never reads or advances the simulation RNG. */
export function drawEndlessAmbience(p: Painter, id: StageId, tick: number, low: boolean): void {
  const stage = ARENA_STAGES[id];
  for (let i = 0; i < (low ? 5 : 10); i++) {
    const x = (i * 73 + Math.floor(tick / 24)) % 472;
    p.screen(x, 130 + i * 7, Math.min(480 - x, 5 + i % 4 * 3), 1, stage.light, .15 + Math.sin(tick * .02 + i) * .07);
  }
  if (stage.mood === 'rain') {
    for (let i = 0; i < (low ? 12 : 24); i++) {
      p.screen((i * 47 + Math.floor(tick / 3)) % 480, (i * 31 + tick * 3) % 198, 1, 7, stage.light, .3);
    }
  }
}
