import { BOSSES, BOSS_PALETTES } from './definitions.ts';
import type { BossPalette } from './definitions.ts';
import type { Enemy } from './types.ts';
import type { RenderAppearance } from '../app-web/art-profile.ts';
import type { BossPose } from './render-types.ts';
import { parseBossAtlas } from './render-types.ts';
import { Painter, ellipse } from './art-kit.ts';

/** An original, non-official writing/thought-inspired rival; never a company mascot. */
export const LUMIE_COLORS = BOSS_PALETTES.lumie;

/**
 * Optional procedural motion for a character rendered from a still key pose.
 * Visitors use it to step, breathe and bow without new image frames; combat leaves it
 * undefined, preserving the existing command stream exactly.
 */
export interface BossMotion {
  readonly walking: boolean;
  /** Accumulated stride phase in radians (0 at foot contact, PI at the opposite step). */
  readonly phase: number;
  /** Whole-body lift in pixels; feet leave the ground by at most one pixel. */
  readonly bob: number;
  /** Whole-body lean in radians, layered under a greeting bow. */
  readonly lean: number;
  /** Gentle idle shoulder/head rise, -1..1. */
  readonly breath: number;
  /** 0..1 greeting bow; used as a short nod at the first stop. */
  readonly bow: number;
  readonly blink: boolean;
  /** -1 looks away, 0 centre, 1 toward the facing direction. */
  readonly glance: number;
}

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

function glint(p: Painter, x: number, y: number, alpha: number, palette: BossPalette = LUMIE_COLORS): void {
  const c = palette;
  p.rect(x, y - 2, 1, 5, c.amberLight, alpha);
  p.rect(x - 2, y, 5, 1, c.amberLight, alpha);
  p.rect(x, y, 1, 1, c.white, alpha);
}

/** Shared sampling of the optional visitor motion; combat passes none. */
function motionOf(motion?: BossMotion): { walking: boolean; phase: number; swing: number; bob: number;
  blink: boolean; glance: number; bow: number; breath: number } {
  const walking = motion?.walking === true;
  const phase = motion?.phase ?? 0;
  return { walking, phase, swing: walking ? Math.sin(phase) : 0, bob: motion ? Math.round(motion.bob) : 0,
    blink: motion?.blink === true, glance: motion?.glance ?? 0, bow: motion?.bow ?? 0, breath: motion?.breath ?? 0 };
}

/** Complete code-only girl fallback: no local images, official marks, or old male boss. */
function drawLumie(p: Painter, enemy: Readonly<Enemy>, pose: BossPose, alpha: number, motion?: BossMotion): void {
  const c = LUMIE_COLORS;
  const facing = enemy.facing;
  const { walking, phase, swing, bob, blink, glance, bow } = motionOf(motion);
  const hurt = pose === 'hurt', exit = pose === 'exit';
  const crouch = pose === 'strike' || pose === 'move' ? (motion ? 0 : 4) : hurt ? 7 : exit ? 3 : 0;
  const x = Math.round(enemy.x + (hurt ? -facing * 2 : 0));
  const y = Math.round(enemy.y - bob);
  const dip = Math.round(bow * 2);
  const legA = Math.round(swing * 2), legB = -legA, liftA = Math.round(Math.max(0, swing) * 2), liftB = Math.round(Math.max(0, -swing) * 2);
  const arm = walking ? -Math.round(swing * 2) : 0;
  const hairSway = walking ? Math.round(Math.sin(phase * .8)) : 0;
  // Local painter coordinates mirror asymmetric hair/ribbon/pen without transforms.
  const rect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch, w, h, color, alpha);
  const gRect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy, w, h, color, alpha);
  const oval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch, rx, ry, color, alpha);
  const headRect = (dx: number, dy: number, w: number, h: number, color: string) => rect(dx, dy + dip, w, h, color);
  const headOval = (dx: number, dy: number, rx: number, ry: number, color: string) => oval(dx, dy + dip, rx, ry, color);

  // Long layered flax hair, dark outline and warm highlight locks.
  oval(-6, -57, 23, 38, c.ink);
  oval(-7, -58, 21, 36, c.hairDark);
  oval(-11, -62, 17, 32, c.hair);
  for (let i = 0; i < 4; i++) {
    const hx = -29 + i * 6 + hairSway;
    rect(hx, -59 + i * 2, 4, 23 - i * 2, c.hairLight);
    rect(hx - 1, -34 + i * 2, 7, 5, c.hairDark);
    rect(hx + 1, -35 + i * 2, 4, 3, c.hair);
  }
  // Opaque tights and ankle boots always meet the same ground line.
  rect(-10 + legA, -23, 7, 19 - crouch, c.inkLight);
  rect(5 + legB, -23, 7, 19 - crouch, c.inkLight);
  gRect(-12 + legA, -6 - liftA, 13, 6, c.ink);
  gRect(4 + legB, -6 - liftB, 13, 6, c.ink);
  gRect(-8 + legA, -7 - liftA, 3, 3, c.amberLight);
  gRect(8 + legB, -7 - liftB, 3, 3, c.amberLight);

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
    rect(13 + arm, -56, 7, 18, c.amber); rect(13 + arm, -39, 7, 5, c.paper); rect(14 + arm, -34, 6, 6, c.skin);
    rect(17 + arm, exit ? -31 : -60, 3, exit ? 26 : 36, c.ink);
    rect(16 + arm, exit ? -5 : -64, 5, 6, c.amberLight);
  }
  rect(-21 - arm, -55, 7, 17, c.amber); rect(-21 - arm, -39, 7, 5, c.paper); rect(-20 - arm, -34, 6, 6, c.skin);
  // Large chibi face and sweeping fringe; deliberately no moustache, hat or monocle.
  headOval(3, -79, 16, 17, c.ink);
  headOval(4, -78, 14, 15, c.skin);
  headOval(0, -87, 18, 13, c.hairDark);
  headOval(-1, -89, 16, 10, c.hair);
  headRect(-15, -88, 7, 21, c.hair);
  headRect(-10, -89, 5, 15, c.hairLight);
  headRect(-3, -91, 5, 13, c.hairLight);
  headRect(4, -89, 5, 11, c.hair);
  headRect(10, -87, 4, 13, c.hairDark);
  if (hurt || exit || blink || bow > .55) {
    headRect(0, -76, 4, 1, c.ink); headRect(10, -77, 4, 1, c.ink);
  } else {
    headRect(0, -78, 4, 6, c.ink); headRect(10, -79, 4, 6, c.ink);
    headRect(1 + glance, -76, 2, 3, c.amberLight); headRect(11 + glance, -77, 2, 3, c.amberLight);
    headRect(1 + glance, -78, 1, 2, c.white); headRect(11 + glance, -79, 1, 2, c.white);
  }
  headRect(5, -69, 3, 1, c.cheek);
  // Folded ivory paper ribbon and amber clasp, no official logo.
  headRect(-19, -91, 9, 8, c.paper); headRect(-21, -89, 4, 4, c.paper);
  headRect(-18, -86, 8, 2, c.paperShade); headRect(-11, -88, 4, 4, c.amberLight);
}

/**
 * 汐見のリツカ: a short tide-cut bob and high tail instead of the writer's long locks.
 * The silhouette is a swordswoman's layered haori, sash and sheathed short blade, so her
 * palette is not the only difference from Lumie.
 */
function drawShio(p: Painter, enemy: Readonly<Enemy>, pose: BossPose, alpha: number, motion?: BossMotion): void {
  const c = BOSS_PALETTES.shio;
  const facing = enemy.facing;
  const { walking, phase, swing, bob, blink, glance, bow } = motionOf(motion);
  const hurt = pose === 'hurt', exit = pose === 'exit';
  const crouch = pose === 'strike' || pose === 'move' ? (motion ? 0 : 4) : hurt ? 7 : exit ? 3 : 0;
  const x = Math.round(enemy.x + (hurt ? -facing * 2 : 0));
  const y = Math.round(enemy.y - bob);
  const dip = Math.round(bow * 2);
  const legA = Math.round(swing * 2), legB = -legA, liftA = Math.round(Math.max(0, swing) * 2), liftB = Math.round(Math.max(0, -swing) * 2);
  const arm = walking ? -Math.round(swing * 2) : 0;
  const tail = walking ? Math.round(-swing * 2 + Math.sin(phase * .8)) : 0;
  const flow = walking ? Math.round(Math.sin(phase) * 2) : 0;
  // Local painter coordinates mirror asymmetric hair/ribbon/blade without transforms.
  const rect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch, w, h, color, alpha);
  const gRect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy, w, h, color, alpha);
  const oval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch, rx, ry, color, alpha);
  const headRect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch + dip, w, h, color, alpha);
  const headOval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch + dip, rx, ry, color, alpha);

  // Short bob with a high segmented tide-tail, outlined one lock at a time.
  oval(-2, -82, 18, 17, c.ink);
  oval(-4, -84, 16, 15, c.hairDark);
  oval(-6, -87, 13, 11, c.hair);
  oval(-15 + tail, -94, 6, 5, c.ink); oval(-15 + tail, -94, 5, 4, c.hairDark);
  oval(-21 + tail, -88, 6, 6, c.ink); oval(-21 + tail, -88, 5, 5, c.hair);
  oval(-26 + tail, -81, 5, 6, c.ink); oval(-26 + tail, -81, 4, 5, c.hairLight);
  oval(-29 + tail, -75, 3, 5, c.ink); oval(-29 + tail, -75, 2, 4, c.hair);
  rect(-18 + tail, -98, 5, 4, c.amberLight); rect(-20 + tail, -97, 3, 2, c.paper);
  // Flowing tide scarf and the sheathed blade behind the body.
  rect(-19, -54, 3, 6, c.amber); rect(-18, -57, 4, 4, c.inkLight);
  rect(-9, -67, 10, 4, c.paper); rect(-11, -65, 4, 4, c.amberLight); rect(-6, -64, 3, 3, c.paperShade);
  rect(-22, -49, 7, 3, c.amberLight);
  rect(-25, -46, 7, 3, c.inkLight); rect(-28, -43, 7, 3, c.ink);
  rect(-31, -40, 7, 3, c.inkLight); rect(-33, -37, 5, 2, c.amberLight);
  rect(-27, -41, 5, 2, c.paperShade);

  // Leggings and low tide boots share the room floor even mid-step.
  rect(-9 + legA, -24, 7, 20 - crouch, c.inkLight);
  rect(4 + legB, -24, 7, 20 - crouch, c.inkLight);
  gRect(-10 + legA, -8 - liftA, 10, 8, c.ink);
  gRect(2 + legB, -8 - liftB, 10, 8, c.ink);
  gRect(-10 + legA, -3 - liftA, 10, 3, c.inkLight);
  gRect(2 + legB, -3 - liftB, 10, 3, c.inkLight);
  gRect(-7 + legA, -6 - liftA, 3, 2, c.amberLight);
  gRect(5 + legB, -6 - liftB, 3, 2, c.amberLight);

  // Split haori skirt with a pale wave hem; it covers the hip instead of a bare centre.
  for (let row = 0; row < 18; row++) {
    const half = 10 + Math.floor(row * .28);
    rect(-half, -42 + row, half * 2, 1, row > 14 ? c.amber : c.ink);
    if (row < 14) rect(-half + 3, -42 + row, 3, 1, c.inkLight);
  }
  rect(-19, -44, 8, 20, c.ink); rect(-19, -26, 8, 2, c.amberLight);
  rect(11, -44, 8, 20, c.ink); rect(11, -26, 8, 2, c.paper);
  rect(-13, -27, 4, 1, c.paper); rect(-3, -27, 5, 1, c.amberLight); rect(7, -27, 3, 1, c.paperShade);
  rect(-1, -39, 1, 13, c.inkLight);

  // Paper shirt, crossed haori collar, amber sash and a tide-chart scroll.
  rect(-3, -69, 6, 7, c.skin);
  rect(-12, -64, 24, 24, c.ink);
  rect(-8, -62, 16, 20, c.paper);
  rect(-5, -64, 10, 4, c.white);
  rect(-2, -59, 4, 12, c.paperShade);
  rect(-11, -47, 22, 5, c.amber);
  rect(-13, -48, 4, 7, c.amberLight); rect(-13, -42, 3, 8, c.amber);
  rect(6, -45, 8, 5, c.paper); rect(8, -45, 2, 5, c.amberLight); rect(6, -45, 8, 1, c.paperShade);
  // The tide scarf leaves the neck and overlaps the haori, so its steps read as cloth.
  rect(-10 + flow, -66, 8, 4, c.paper); rect(-15 + flow, -63, 8, 4, c.amberLight);
  rect(-21 + flow, -60, 8, 3, c.paper); rect(-26 + flow, -57, 7, 3, c.amberLight);
  rect(-30 + flow, -54, 5, 2, c.paper);

  // Back arm on the far side, then the near arm with the pose-specific short blade.
  rect(-16 - arm, -62, 6, 12, c.ink);
  rect(-16 - arm, -50, 5, 8, c.paperShade);
  rect(-15 - arm, -42, 4, 4, c.skin);
  const thrust = pose === 'strike', cast = pose === 'cast' || pose === 'windup';
  if (thrust) {
    rect(9, -62, 13, 7, c.ink); rect(19, -61, 7, 5, c.skin);
    rect(24, -64, 4, 9, c.amberLight); rect(28, -61, 16, 4, c.white);
    rect(28, -58, 12, 1, c.inkLight); rect(44, -60, 4, 3, c.paper);
  } else if (cast) {
    rect(9, -74, 7, 14, c.ink); rect(10, -81, 6, 6, c.skin);
    rect(8, -85, 9, 3, c.amberLight);
    rect(11, -91, 5, 7, c.white); rect(14, -96, 5, 7, c.white);
    rect(17, -101, 4, 6, c.white); rect(20, -105, 3, 4, c.paper);
    rect(15, -95, 1, 5, c.inkLight); rect(18, -100, 1, 4, c.inkLight);
  } else {
    rect(9 + arm, -62, 6, 12, c.ink); rect(10 + arm, -51, 5, 8, c.paperShade); rect(11 + arm, -45, 5, 4, c.skin);
  }

  // Face first, then the tide-cut fringe above the calm narrowed eyes.
  headOval(2, -81, 16, 16, c.ink);
  headOval(3, -80, 14, 15, c.skin);
  headOval(0, -93, 17, 9, c.ink);
  headOval(-1, -95, 15, 7, c.hairDark);
  headOval(-2, -97, 13, 5, c.hair);
  headRect(-15, -92, 6, 7, c.hairDark);
  headRect(-9, -93, 7, 8, c.hair);
  headRect(-2, -94, 7, 9, c.hairLight);
  headRect(5, -93, 6, 8, c.hair);
  headRect(11, -91, 4, 6, c.hairDark);
  headRect(-18, -85, 4, 15, c.ink); headRect(-17, -84, 3, 13, c.hairDark);
  headRect(14, -84, 4, 13, c.ink); headRect(14, -83, 3, 11, c.hair);
  headRect(12, -89, 5, 2, c.amberLight); headRect(14, -87, 3, 2, c.paper);
  headRect(-6, -92, 2, 1, c.white);
  if (hurt || exit || blink || bow > .55) {
    headRect(0, -82, 5, 1, c.ink); headRect(9, -83, 5, 1, c.ink);
  } else {
    headRect(0, -82, 5, 4, c.ink); headRect(9, -83, 5, 4, c.ink);
    headRect(1 + glance, -81, 2, 2, c.amberLight); headRect(10 + glance, -82, 2, 2, c.amberLight);
    headRect(10, -83, 1, 1, c.white);
  }
  headRect(-1, -86, 5, 1, c.inkLight); headRect(8, -87, 5, 1, c.inkLight);
  headRect(6, -72, 3, 1, c.ink);
  headRect(10, -75, 2, 1, c.cheek);
  headRect(-11, -67, 4, 3, c.paper);
}

/**
 * 紙灯のユメ: a bookbinder with twin paper-tagged braids, a work apron and a travelling
 * paper lantern. Long twin tails and the lantern read as a different visitor even in one frame.
 */
function drawYume(p: Painter, enemy: Readonly<Enemy>, pose: BossPose, alpha: number, motion?: BossMotion): void {
  const c = BOSS_PALETTES.yume;
  const facing = enemy.facing;
  const { walking, phase, swing, bob, blink, glance, bow, breath } = motionOf(motion);
  const hurt = pose === 'hurt', exit = pose === 'exit';
  const crouch = pose === 'strike' || pose === 'move' ? (motion ? 0 : 4) : hurt ? 7 : exit ? 3 : 0;
  const x = Math.round(enemy.x + (hurt ? -facing * 2 : 0));
  const y = Math.round(enemy.y - bob);
  const dip = Math.round(bow * 2);
  const legA = Math.round(swing * 2), legB = -legA, liftA = Math.round(Math.max(0, swing) * 2), liftB = Math.round(Math.max(0, -swing) * 2);
  const arm = walking ? -Math.round(swing * 2) : 0;
  const braid = walking ? Math.round(-swing * 2 + Math.sin(phase * .6)) : Math.round(breath);
  const lantern = (walking ? Math.round(swing * 3) : Math.round(breath * 2)) + arm;
  // Local painter coordinates mirror asymmetric hair/ribbon/lantern without transforms.
  const rect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch, w, h, color, alpha);
  const gRect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy, w, h, color, alpha);
  const oval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch, rx, ry, color, alpha);
  const headRect = (dx: number, dy: number, w: number, h: number, color: string) =>
    p.rect(x + (facing > 0 ? dx : -dx - w), y + dy + crouch + dip, w, h, color, alpha);
  const headOval = (dx: number, dy: number, rx: number, ry: number, color: string) =>
    ellipse(p, x + facing * dx, y + dy + crouch + dip, rx, ry, color, alpha);

  // Long night-ink hair, far braid with a paper tag, and a folded-paper bow.
  oval(-3, -75, 21, 28, c.ink);
  oval(-4, -78, 19, 26, c.hairDark);
  oval(-6, -82, 16, 21, c.hair);
  oval(-18 + braid, -70, 7, 7, c.ink); oval(-18 + braid, -70, 6, 6, c.hairDark);
  oval(-21 + braid, -62, 6, 6, c.ink); oval(-21 + braid, -62, 5, 5, c.hair);
  oval(-23 + braid, -54, 5, 6, c.ink); oval(-23 + braid, -54, 4, 5, c.hairLight);
  oval(-24 + braid, -46, 4, 5, c.ink); oval(-24 + braid, -46, 3, 4, c.hair);
  rect(-25 + braid, -42, 4, 4, c.amberLight);
  rect(-21, -97, 10, 8, c.ink); rect(-20, -96, 9, 7, c.paper);
  rect(-24, -94, 5, 5, c.paperShade); rect(-13, -95, 5, 5, c.paper);
  rect(-19, -92, 7, 3, c.amber); rect(-12, -93, 4, 4, c.amberLight);

  // Opaque tights and warm work boots.
  rect(-9 + legA, -24, 7, 20 - crouch, c.inkLight);
  rect(4 + legB, -24, 7, 20 - crouch, c.inkLight);
  gRect(-11 + legA, -8 - liftA, 11, 8, c.ink);
  gRect(1 + legB, -8 - liftB, 11, 8, c.ink);
  gRect(-11 + legA, -2 - liftA, 11, 2, c.amber);
  gRect(1 + legB, -2 - liftB, 11, 2, c.amber);

  // Long plum skirt with a folded paper-scrap hem.
  for (let row = 0; row < 23; row++) {
    const half = 11 + Math.floor(row * .36);
    rect(-half, -41 + row, half * 2, 1, row > 20 ? c.amber : c.ink);
    if (row < 19) rect(-half + 3, -41 + row, 3, 1, c.inkLight);
  }
  rect(-14, -20, 5, 2, c.paper); rect(7, -19, 5, 1, c.amberLight); rect(-3, -18, 3, 1, c.paperShade);

  // Cream blouse under a plum binder's apron, tool belt and pockets.
  rect(-3, -69, 6, 7, c.skin);
  rect(-12, -64, 24, 26, c.paper);
  oval(-14, -60, 6, 7, c.paper); oval(14, -60, 6, 7, c.paper);
  rect(-4, -64, 8, 4, c.white);
  rect(-8, -60, 16, 19, c.hairDark);
  rect(-8, -60, 16, 2, c.paperShade);
  rect(-8, -64, 4, 7, c.inkLight);
  rect(4, -64, 4, 7, c.inkLight);
  rect(-10, -45, 20, 4, c.inkLight);
  rect(-10, -45, 20, 1, c.amberLight);
  rect(-8, -38, 8, 7, c.inkLight);
  rect(-7, -37, 6, 5, c.paperShade);
  rect(-9, -49, 2, 5, c.paper); rect(-5, -48, 2, 4, c.amberLight);
  rect(6, -49, 2, 5, c.paper); rect(8, -47, 2, 3, c.amberLight);

  // Back arm carries a bound book at the far hip.
  rect(-16 - arm, -61, 6, 12, c.paper);
  rect(-17 - arm, -50, 5, 8, c.paperShade);
  rect(-18 - arm, -42, 5, 4, c.skin);
  rect(-25 - arm, -54, 9, 15, c.ink);
  rect(-24 - arm, -52, 7, 11, c.paper);
  rect(-22 - arm, -53, 2, 12, c.amberLight);
  rect(-23 - arm, -49, 5, 1, c.paperShade);

  // The near braid falls over the shoulder, then the front arm holds the lantern.
  oval(11 + braid, -78, 5, 6, c.ink); oval(11 + braid, -78, 4, 5, c.hairDark);
  oval(13 + braid, -70, 4, 6, c.ink); oval(13 + braid, -70, 3, 5, c.hair);
  oval(14 + braid, -61, 4, 6, c.ink); oval(14 + braid, -61, 3, 5, c.hairLight);
  oval(14 + braid, -52, 3, 5, c.ink); oval(14 + braid, -52, 2, 4, c.hair);
  rect(11 + braid, -48, 6, 7, c.paper); rect(12 + braid, -45, 4, 2, c.amberLight);

  const thrust = pose === 'strike', cast = pose === 'cast' || pose === 'windup';
  if (thrust) {
    rect(9, -62, 13, 7, c.paper); rect(19, -61, 7, 5, c.skin);
    rect(25, -39, 2, 23, c.inkLight);
    rect(18, -22, 16, 4, c.ink); rect(20, -20, 12, 3, c.inkLight);
    rect(20, -19, 10, 13, c.ink); rect(21, -18, 8, 11, c.amber);
    rect(22, -17, 6, 9, c.amberLight); rect(24, -17, 1, 9, c.paper);
    rect(21, -6, 8, 2, c.ink); rect(24, -4, 2, 5, c.amberLight);
  } else if (cast) {
    rect(9, -74, 7, 14, c.paper); rect(10, -81, 6, 6, c.skin);
    rect(11, -98, 2, 18, c.inkLight);
    rect(5, -101, 15, 4, c.ink); rect(7, -99, 11, 3, c.inkLight);
    rect(6, -97, 13, 15, c.ink); rect(7, -96, 11, 13, c.amber);
    rect(8, -95, 9, 11, c.amberLight);
    rect(11, -96, 1, 12, c.paper); rect(14, -96, 1, 12, c.paperShade);
    rect(7, -83, 11, 2, c.ink); rect(12, -81, 3, 5, c.amberLight);
  } else {
    rect(9 + arm, -61, 6, 13, c.paper); rect(10 + arm, -50, 5, 8, c.paperShade); rect(11 + arm, -43, 5, 4, c.skin);
    rect(14 + lantern, -40, 1, 7, c.inkLight);
    rect(7 + lantern, -33, 15, 3, c.ink);
    rect(6 + lantern, -31, 17, 16, c.ink);
    rect(7 + lantern, -30, 15, 14, c.amber);
    rect(8 + lantern, -29, 13, 12, c.amberLight);
    rect(11 + lantern, -29, 1, 12, c.paper); rect(16 + lantern, -29, 1, 12, c.paperShade);
    rect(8 + lantern, -18, 13, 2, c.ink); rect(14 + lantern, -16, 3, 6, c.amberLight);
    rect(12 + lantern, -25, 3, 3, c.white);
  }

  // Sleepy face first, then the lavender fringe and one visibly different closed eye.
  headOval(2, -81, 16, 16, c.ink);
  headOval(3, -80, 14, 15, c.skin);
  headOval(0, -93, 17, 9, c.ink);
  headOval(-1, -95, 15, 7, c.hairDark);
  headOval(-2, -97, 13, 5, c.hair);
  headRect(-15, -92, 6, 7, c.hairDark);
  headRect(-9, -93, 7, 8, c.hair);
  headRect(-2, -94, 7, 9, c.hairLight);
  headRect(5, -93, 6, 8, c.hair);
  headRect(11, -91, 4, 7, c.hairDark);
  headRect(-18, -85, 4, 16, c.ink); headRect(-17, -84, 3, 14, c.hairDark);
  headRect(14, -84, 4, 14, c.ink); headRect(14, -83, 3, 12, c.hair);
  headRect(12, -89, 5, 4, c.paper); headRect(13, -88, 3, 2, c.amberLight);
  headRect(-6, -92, 2, 1, c.white);
  if (hurt || exit || blink || bow > .55) {
    headRect(0, -82, 5, 1, c.ink); headRect(9, -83, 5, 1, c.ink);
  } else {
    headRect(0, -82, 5, 2, c.ink); headRect(1 + glance, -82, 2, 2, c.amberLight);
    headRect(9, -84, 5, 4, c.ink); headRect(10 + glance, -83, 2, 2, c.amberLight);
    headRect(10, -84, 1, 1, c.white);
  }
  headRect(-1, -86, 5, 1, c.inkLight); headRect(8, -88, 5, 1, c.inkLight);
  headRect(6, -72, 3, 1, c.ink);
  headRect(10, -75, 2, 1, c.cheek);
  headRect(-11, -67, 4, 3, c.paper);
}

function drawFallback(p: Painter, enemy: Readonly<Enemy>, pose: BossPose, alpha: number, motion?: BossMotion): void {
  const id = enemy.bossId ?? 'lumie';
  if (id === 'shio') drawShio(p, enemy, pose, alpha, motion);
  else if (id === 'yume') drawYume(p, enemy, pose, alpha, motion);
  else drawLumie(p, enemy, pose, alpha, motion);
}

/**
 * A generated key-pose atlas can also walk: alternate the guarded step and follow-through
 * poses at the stride frequency, and use the bow pose for the first-stop greeting.
 * Fallback frames keep the combat pose so the code drawing never flickers between stances.
 */
function visitorAtlasPose(pose: BossPose, motion: BossMotion): BossPose {
  if (motion.bow > .3) return 'exit';
  if (motion.walking) return Math.sin(motion.phase) >= 0 ? 'move' : 'recover';
  return pose === 'idle' ? 'idle' : pose;
}

/** Lead's art.ts wrapper delegates here; appearance never changes world state. */
export function drawBoss(p: Painter, enemy: Readonly<Enemy>, tick: number, appearance: RenderAppearance = {},
  motion?: BossMotion): void {
  const definition = BOSSES[enemy.bossId ?? 'lumie'];
  const c = definition.palette;
  const key = definition.atlasKey ?? definition.id;
  const pose = bossPose(enemy);
  const atlasPose = motion ? visitorAtlasPose(pose, motion) : pose;
  const alpha = enemy.state === 'exit' ? Math.max(0, 1 - enemy.age / 26) : 1;
  if (alpha <= .02) return;
  const fallback = new Painter(p.cameraX);
  drawFallback(fallback, enemy, pose, alpha, motion);
  let atlas;
  const candidate = appearance.bossAtlases?.[key] ?? (key === 'lumie' ? appearance.bossAtlas : undefined);
  try { atlas = candidate ? parseBossAtlas(candidate) : null; } catch { atlas = null; }
  if (atlas) {
    // A still key pose gains its life from a one-pixel step bob, a gentle lean and a nod;
    // the feet stay anchored to the measured ground line while the body moves.
    const lift = motion ? Math.round(motion.bob) : 0;
    const rotation = motion ? motion.lean + motion.bow * .13 : 0;
    p.sprite(enemy.x, enemy.y - lift, atlas.poses[atlasPose], enemy.facing, alpha, rotation, 1, 1, 'boss', fallback.commands, enemy.bossId);
  } else p.commands.push(...fallback.commands);

  // Restrained code-only paper/glint tells remain shared on Web and native.
  if (enemy.state === 'windup' || (enemy.state === 'strike' && enemy.pattern % 4 !== 2)) {
    for (let i = 0; i < 3; i++) {
      const x = enemy.x + enemy.facing * (26 + i * 7), y = enemy.y - 62 - i * 10;
      p.rect(x - 3, y - 4, 6, 8, c.paper, alpha * .72, Math.sin(tick * .04 + i) * .16);
      p.rect(x - 2, y - 1, 4, 1, c.amber, alpha * .6);
    }
  }
  if (enemy.hp <= enemy.maxHP / 2 && enemy.state !== 'exit') {
    for (let i = 0; i < 2; i++) {
      const angle = tick * .018 + i * Math.PI;
      glint(p, enemy.x + Math.cos(angle) * 34, enemy.y - 67 + Math.sin(angle) * 15, .65, c);
    }
  }
  if (enemy.state === 'stunned') glint(p, enemy.x - 14, enemy.y - 104, alpha * .85, c);
}
