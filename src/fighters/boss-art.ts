import type { Enemy } from './types.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import type { BossPose } from './render-types.ts';
import { parseBossAtlas } from './render-types.ts';
import { Painter, ellipse } from './art-kit.ts';

/** An original, non-official writing/thought-inspired rival; never a company mascot. */
export const LUMIE_COLORS = {
  ink: '#332b2d', inkLight: '#51403a', hairDark: '#9e6947', hair: '#d7a765', hairLight: '#f1cc8e',
  amber: '#b9762f', amberLight: '#e6b45f', paper: '#f5e3bb', paperShade: '#d3b589',
  skin: '#f3ceb2', cheek: '#d99b81', white: '#fff2d3',
} as const;

/** Poses are keys, not a claim that these generated poses are a validated animation. */
export function bossPose(enemy: Readonly<Enemy>): BossPose {
  if (enemy.state === 'exit') return 'exit';
  if (enemy.state === 'stunned') return 'hurt';
  if (enemy.state === 'windup') return 'windup';
  if (enemy.state === 'strike') return enemy.age >= 24 ? 'recover' : enemy.pattern % 4 === 2 ? 'strike' : 'cast';
  if (enemy.state === 'enter') return 'move';
  if (enemy.pattern > 0 && enemy.age < 12) return 'recover';
  return enemy.age % 60 < 18 ? 'move' : 'idle';
}

function glint(p: Painter, x: number, y: number, alpha: number): void {
  p.rect(x, y - 2, 1, 5, LUMIE_COLORS.amberLight, alpha);
  p.rect(x - 2, y, 5, 1, LUMIE_COLORS.amberLight, alpha);
  p.rect(x, y, 1, 1, LUMIE_COLORS.white, alpha);
}

/** Complete code-only girl fallback: no local images, official marks, or old male boss. */
function drawFallback(p: Painter, enemy: Readonly<Enemy>, pose: BossPose, alpha: number): void {
  const c = LUMIE_COLORS;
  const facing = enemy.facing;
  const hurt = pose === 'hurt', bow = pose === 'exit';
  const crouch = pose === 'strike' || pose === 'move' ? 4 : hurt ? 7 : bow ? 3 : 0;
  const x = Math.round(enemy.x + (hurt ? -facing * 2 : 0));
  const y = Math.round(enemy.y);
  // Local painter coordinates mirror asymmetric hair/ribbon/pen without transforms.
  const rect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch, w, h, color, alpha);
  const oval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch, rx, ry, color, alpha);

  // Long layered flax hair, dark outline and warm highlight locks.
  oval(-6, -57, 23, 38, c.ink);
  oval(-7, -58, 21, 36, c.hairDark);
  oval(-11, -62, 17, 32, c.hair);
  for (let i = 0; i < 4; i++) {
    const hx = -29 + i * 6;
    rect(hx, -59 + i * 2, 4, 23 - i * 2, c.hairLight);
    rect(hx - 1, -34 + i * 2, 7, 5, c.hairDark);
    rect(hx + 1, -35 + i * 2, 4, 3, c.hair);
  }
  // Opaque tights and ankle boots always meet the same ground line.
  rect(-10, -23, 7, 19 - crouch, c.inkLight);
  rect(5, -23, 7, 19 - crouch, c.inkLight);
  p.rect(x + (facing > 0 ? -12 : -1), y - 6, 13, 6, c.ink, alpha);
  p.rect(x + (facing > 0 ? 4 : -17), y - 6, 13, 6, c.ink, alpha);
  p.rect(x - 8, y - 7, 3, 3, c.amberLight, alpha);
  p.rect(x + 7, y - 7, 3, 3, c.amberLight, alpha);

  // Stepped skirt; parchment cape is separate from its black silhouette.
  for (let row = 0; row < 20; row++) {
    const half = 10 + Math.floor(row * .4);
    rect(-half, -42 + row, half * 2, 1, row > 17 ? c.amber : c.ink);
    if (row < 17) rect(-half + 3, -42 + row, 3, 1, c.inkLight);
  }
  rect(-9, -63, 20, 24, c.ink);
  rect(-7, -59, 16, 20, c.amber);
  rect(-3, -64, 10, 5, c.paper);
  rect(-1, -59, 3, 5, c.ink);
  rect(-5, -60, 4, 3, c.ink);
  rect(2, -60, 4, 3, c.ink);
  rect(1, -49, 2, 2, c.amberLight);
  rect(1, -43, 2, 2, c.amberLight);
  for (const side of [-1, 1]) {
    for (let page = 0; page < 3; page++) {
      const px = side < 0 ? -18 - page * 2 : 10 + page * 2;
      rect(px, -65 + page * 9, 11, 13, c.ink);
      rect(px + 1, -65 + page * 9, 9, 11, c.paper);
      rect(px + 2, -59 + page * 9, 7, 1, c.amber);
      rect(px + 2, -56 + page * 9, 5, 1, c.paperShade);
    }
  }
  // Sleeves and a readable pen hand for each broad pose family.
  const thrust = pose === 'strike', cast = pose === 'cast' || pose === 'windup';
  if (thrust) {
    rect(10, -62, 18, 8, c.amber); rect(25, -62, 5, 8, c.paper); rect(29, -61, 7, 6, c.skin);
    rect(31, -60, 18, 3, c.ink); rect(47, -61, 4, 5, c.amberLight);
  } else if (cast) {
    rect(10, -73, 8, 15, c.amber); rect(11, -79, 7, 7, c.paper); rect(11, -83, 6, 6, c.skin);
    rect(13, -96, 3, 22, c.ink); rect(12, -100, 5, 6, c.amberLight);
    rect(-24, -58, 10, 8, c.amber); rect(-29, -56, 7, 6, c.skin);
  } else {
    rect(13, -56, 7, 18, c.amber); rect(13, -39, 7, 5, c.paper); rect(14, -34, 6, 6, c.skin);
    rect(17, bow ? -31 : -60, 3, bow ? 26 : 36, c.ink);
    rect(16, bow ? -5 : -64, 5, 6, c.amberLight);
  }
  rect(-21, -55, 7, 17, c.amber); rect(-21, -39, 7, 5, c.paper); rect(-20, -34, 6, 6, c.skin);
  // Large chibi face and sweeping fringe; deliberately no moustache, hat or monocle.
  oval(3, -79, 16, 17, c.ink);
  oval(4, -78, 14, 15, c.skin);
  oval(0, -87, 18, 13, c.hairDark);
  oval(-1, -89, 16, 10, c.hair);
  rect(-15, -88, 7, 21, c.hair);
  rect(-10, -89, 5, 15, c.hairLight);
  rect(-3, -91, 5, 13, c.hairLight);
  rect(4, -89, 5, 11, c.hair);
  rect(10, -87, 4, 13, c.hairDark);
  if (hurt || bow) {
    rect(0, -76, 4, 1, c.ink); rect(10, -77, 4, 1, c.ink);
  } else {
    rect(0, -78, 4, 6, c.ink); rect(10, -79, 4, 6, c.ink);
    rect(1, -76, 2, 3, c.amberLight); rect(11, -77, 2, 3, c.amberLight);
    rect(1, -78, 1, 2, c.white); rect(11, -79, 1, 2, c.white);
  }
  rect(5, -69, 3, 1, c.cheek);
  // Folded ivory paper ribbon and amber clasp, no official logo.
  rect(-19, -91, 9, 8, c.paper); rect(-21, -89, 4, 4, c.paper);
  rect(-18, -86, 8, 2, c.paperShade); rect(-11, -88, 4, 4, c.amberLight);
}

/** Lead's art.ts wrapper delegates here; appearance never changes world state. */
export function drawBoss(p: Painter, enemy: Readonly<Enemy>, tick: number, appearance: RenderAppearance = {}): void {
  const pose = bossPose(enemy);
  const alpha = enemy.state === 'exit' ? Math.max(0, 1 - enemy.age / 26) : 1;
  if (alpha <= .02) return;
  const fallback = new Painter(p.cameraX);
  drawFallback(fallback, enemy, pose, alpha);
  let atlas;
  try { atlas = appearance.bossAtlas ? parseBossAtlas(appearance.bossAtlas) : null; } catch { atlas = null; }
  if (atlas) p.sprite(enemy.x, enemy.y, atlas.poses[pose], enemy.facing, alpha, 0, 1, 1, 'boss', fallback.commands);
  else p.commands.push(...fallback.commands);

  // Restrained code-only paper/glint tells remain shared on Web and native.
  if (enemy.state === 'windup' || (enemy.state === 'strike' && enemy.pattern % 4 !== 2)) {
    for (let i = 0; i < 3; i++) {
      const x = enemy.x + enemy.facing * (26 + i * 7), y = enemy.y - 62 - i * 10;
      p.rect(x - 3, y - 4, 6, 8, LUMIE_COLORS.paper, alpha * .72, Math.sin(tick * .04 + i) * .16);
      p.rect(x - 2, y - 1, 4, 1, LUMIE_COLORS.amber, alpha * .6);
    }
  }
  if (enemy.hp <= enemy.maxHP / 2 && enemy.state !== 'exit') {
    for (let i = 0; i < 2; i++) {
      const angle = tick * .018 + i * Math.PI;
      glint(p, enemy.x + Math.cos(angle) * 34, enemy.y - 67 + Math.sin(angle) * 15, .65);
    }
  }
  if (enemy.state === 'stunned') glint(p, enemy.x - 14, enemy.y - 104, alpha * .85);
}
